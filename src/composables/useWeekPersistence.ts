import type { ComputedRef, Ref } from 'vue'
import type { WeekData } from '../types'
import type { ViewBucket } from '../utils/dateUtils'

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { createDebouncedSave } from '../utils/debounce'
import { emptyWeek, normalizeWeekData } from '../utils/weekData'

export function useWeekPersistence(
	bucketKeys: ComputedRef<ViewBucket[]>,
	weekData: Ref<WeekData>,
	onLoaded: () => void,
) {
	// Raw per-ISO-week data, keyed by `${year}-${week}`. We retain the full Mon-Sun
	// shape (not just the visible slice) so that when we save we can preserve the
	// day keys that aren't visible in the current view — without this, a save
	// triggered by editing one day in bucket A would wipe the other days in
	// bucket A that the user can't see.
	const bucketCache = new Map<string, WeekData>()
	const knownUpdatedAt = new Map<string, number>()

	let isLoading = false
	let loadAbortController: AbortController | null = null
	let setSaveInProgress: (val: boolean) => void = () => {
		/* assigned after save is created */
	}

	function urlFor(year: number, week: number): string {
		return generateUrl('/apps/weekplanner/week/{year}/{week}', {
			year: String(year),
			week: String(week),
		})
	}

	function buildPayload(bucket: ViewBucket): WeekData {
		const cached = bucketCache.get(bucket.weekKey) ?? emptyWeek()
		const merged: WeekData = { days: { ...cached.days } }
		// Overwrite in-view day keys with the current merged-view values. Days
		// outside the visible window stay as their cached values.
		for (const dayKey of bucket.dayKeys) {
			merged.days[dayKey] = weekData.value.days[dayKey]
		}
		return merged
	}

	async function saveWeekNow() {
		setSaveInProgress(true)
		try {
			await Promise.all(bucketKeys.value.map(async (bucket) => {
				const payload = buildPayload(bucket)
				try {
					const response = await axios.put(urlFor(bucket.year, bucket.week), payload)
					bucketCache.set(bucket.weekKey, payload)
					if (typeof response.data?.updatedAt === 'number') {
						knownUpdatedAt.set(bucket.weekKey, response.data.updatedAt)
					}
				} catch {
					// Save failed for this bucket; leave its cache untouched.
				}
			}))
		} finally {
			setSaveInProgress(false)
		}
	}

	const save = createDebouncedSave(saveWeekNow)
	setSaveInProgress = save.setInProgress

	function assembleWeekData() {
		const next = emptyWeek()
		for (const bucket of bucketKeys.value) {
			const cached = bucketCache.get(bucket.weekKey)
			if (!cached) {
				continue
			}
			for (const dayKey of bucket.dayKeys) {
				next.days[dayKey] = cached.days[dayKey]
			}
		}
		weekData.value = next
	}

	async function loadWeek() {
		loadAbortController?.abort()
		const controller = new AbortController()
		loadAbortController = controller
		isLoading = true
		try {
			const buckets = bucketKeys.value
			const responses = await Promise.all(buckets.map((bucket) => axios
				.get(urlFor(bucket.year, bucket.week), { signal: controller.signal })
				.then((response) => ({ bucket, response }))
				.catch(() => null)))
			if (controller.signal.aborted) {
				return
			}

			// Apply only when a save isn't pending (it would overwrite the
			// user's unsaved local edits) and at least one fetch succeeded.
			// If every fetch failed we still call onLoaded below so dependent
			// initial setup runs, but we leave the existing in-memory weekData
			// alone — likely a transient network blip.
			const anySucceeded = responses.some((r) => r !== null)
			if (save.isIdle() && anySucceeded) {
				// Reset cache to only the buckets currently in view so navigating
				// elsewhere doesn't leak stale data into a later save merge.
				const visibleKeys = new Set(buckets.map((b) => b.weekKey))
				for (const key of [...bucketCache.keys()]) {
					if (!visibleKeys.has(key)) {
						bucketCache.delete(key)
						knownUpdatedAt.delete(key)
					}
				}

				for (const entry of responses) {
					if (!entry) {
						continue
					}
					const { bucket, response } = entry
					bucketCache.set(bucket.weekKey, normalizeWeekData(response.data))
					if (typeof response.data?.updatedAt === 'number') {
						knownUpdatedAt.set(bucket.weekKey, response.data.updatedAt)
					}
				}
				assembleWeekData()
			}
			onLoaded()
		} finally {
			if (!controller.signal.aborted) {
				isLoading = false
			}
		}
	}

	function getKnownUpdatedAt(weekKey: string): number {
		return knownUpdatedAt.get(weekKey) ?? 0
	}

	function setKnownUpdatedAt(weekKey: string, val: number) {
		knownUpdatedAt.set(weekKey, val)
	}

	/**
	 * Replace an entire bucket's cached data with `data` and re-assemble the
	 * merged view. Used by polling / notify_push to apply external updates.
	 *
	 * @param weekKey
	 * @param data
	 */
	function applyBucketData(weekKey: string, data: WeekData) {
		bucketCache.set(weekKey, normalizeWeekData(data))
		assembleWeekData()
	}

	return {
		loadWeek,
		saveWeekNow,
		debouncedSave: save.trigger,
		flushSaveTimeout: save.flush,
		getKnownUpdatedAt,
		setKnownUpdatedAt,
		applyBucketData,
		isSaveIdle: save.isIdle,
		isLoadIdle: () => !isLoading,
	}
}
