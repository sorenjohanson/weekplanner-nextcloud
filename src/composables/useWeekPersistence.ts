import type { Ref } from 'vue'
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import type { WeekData } from '../types'
import { emptyWeek, normalizeWeekData } from '../utils/weekData'

export function useWeekPersistence(
	currentYear: Ref<number>,
	currentWeek: Ref<number>,
	weekData: Ref<WeekData>,
	onLoaded: () => void,
) {
	let saveTimeout: ReturnType<typeof setTimeout> | null = null
	let isSaving = false
	let knownWeekUpdatedAt = 0

	async function loadWeek() {
		try {
			const url = generateUrl('/apps/weekplanner/week/{year}/{week}', {
				year: String(currentYear.value),
				week: String(currentWeek.value),
			})
			const response = await axios.get(url)
			weekData.value = normalizeWeekData(response.data)
			if (typeof response.data?.updatedAt === 'number') {
				knownWeekUpdatedAt = response.data.updatedAt
			}
		} catch {
			weekData.value = emptyWeek()
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

	return {
		loadWeek,
		saveWeekNow,
		debouncedSave,
		flushSaveTimeout,
		getKnownUpdatedAt,
		setKnownUpdatedAt,
		isSaveIdle,
	}
}
