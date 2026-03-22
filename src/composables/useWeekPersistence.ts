import type { Ref } from 'vue'
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import type { WeekData } from '../types'
import { normalizeWeekData } from '../utils/weekData'

export function useWeekPersistence(
	currentYear: Ref<number>,
	currentWeek: Ref<number>,
	weekData: Ref<WeekData>,
	onLoaded: () => void,
) {
	let saveTimeout: ReturnType<typeof setTimeout> | null = null
	let isSaving = false
	let isLoading = false
	let knownWeekUpdatedAt = 0
	let loadAbortController: AbortController | null = null

	async function loadWeek() {
		loadAbortController?.abort()
		const controller = new AbortController()
		loadAbortController = controller
		isLoading = true
		try {
			const url = generateUrl('/apps/weekplanner/week/{year}/{week}', {
				year: String(currentYear.value),
				week: String(currentWeek.value),
			})
			const response = await axios.get(url, { signal: controller.signal })
			if (controller.signal.aborted) return
			// Skip applying if a save is already queued — the pending save is newer
			if (saveTimeout !== null || isSaving) return
			weekData.value = normalizeWeekData(response.data)
			if (typeof response.data?.updatedAt === 'number') {
				knownWeekUpdatedAt = response.data.updatedAt
			}
		} catch {
			if (controller.signal.aborted) return
			// Network/server error: keep existing weekData rather than blanking it
		} finally {
			if (!controller.signal.aborted) isLoading = false
		}
		onLoaded()
	}

	async function saveWeekNow() {
		isSaving = true
		try {
			const url = generateUrl('/apps/weekplanner/week/{year}/{week}', {
				year: String(currentYear.value),
				week: String(currentWeek.value),
			})
			const response = await axios.put(url, weekData.value)
			if (typeof response.data?.updatedAt === 'number') {
				knownWeekUpdatedAt = response.data.updatedAt
			}
		} catch {
			// Save failed silently
		} finally {
			isSaving = false
		}
	}

	function debouncedSave() {
		if (saveTimeout) clearTimeout(saveTimeout)
		saveTimeout = setTimeout(() => {
			saveTimeout = null
			saveWeekNow()
		}, 300)
	}

	function flushSaveTimeout() {
		if (saveTimeout) {
			clearTimeout(saveTimeout)
			saveTimeout = null
		}
	}

	function getKnownUpdatedAt() {
		return knownWeekUpdatedAt
	}

	function setKnownUpdatedAt(val: number) {
		knownWeekUpdatedAt = val
	}

	function isSaveIdle() {
		return saveTimeout === null && !isSaving
	}

	function isLoadIdle() {
		return !isLoading
	}

	return {
		loadWeek,
		saveWeekNow,
		debouncedSave,
		flushSaveTimeout,
		getKnownUpdatedAt,
		setKnownUpdatedAt,
		isSaveIdle,
		isLoadIdle,
	}
}
