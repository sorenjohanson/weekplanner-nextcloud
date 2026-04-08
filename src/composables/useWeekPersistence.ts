import type { Ref } from 'vue'
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import type { WeekData } from '../types'
import { normalizeWeekData } from '../utils/weekData'
import { createDebouncedSave } from '../utils/debounce'

export function useWeekPersistence(
	currentYear: Ref<number>,
	currentWeek: Ref<number>,
	weekData: Ref<WeekData>,
	onLoaded: () => void,
) {
	let isLoading = false
	let knownWeekUpdatedAt = 0
	let loadAbortController: AbortController | null = null

	async function saveWeekNow() {
		save.setInProgress(true)
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
			save.setInProgress(false)
		}
	}

	const save = createDebouncedSave(saveWeekNow)

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
			if (!save.isIdle()) return
			weekData.value = normalizeWeekData(response.data)
			if (typeof response.data?.updatedAt === 'number') {
				knownWeekUpdatedAt = response.data.updatedAt
			}
		} catch {
			if (controller.signal.aborted) return
		} finally {
			if (!controller.signal.aborted) isLoading = false
		}
		onLoaded()
	}

	return {
		loadWeek,
		saveWeekNow,
		debouncedSave: save.trigger,
		flushSaveTimeout: save.flush,
		getKnownUpdatedAt: () => knownWeekUpdatedAt,
		setKnownUpdatedAt: (val: number) => { knownWeekUpdatedAt = val },
		isSaveIdle: save.isIdle,
		isLoadIdle: () => !isLoading,
	}
}
