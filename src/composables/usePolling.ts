import type { Ref } from 'vue'
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import type { WeekData } from '../types'
import { normalizeWeekData } from '../utils/weekData'

interface PollDeps {
	currentYear: Ref<number>
	currentWeek: Ref<number>
	weekData: Ref<WeekData>
	editingTask: Ref<{ day: string; taskId: string } | null>
	loadWeek: () => Promise<void>
	loadCustomColumns: () => Promise<void>
	materializeRecurringTasks: () => void
	applyCustomColumnsData: (data: unknown) => void
	isWeekSaveIdle: () => boolean
	isWeekLoadIdle: () => boolean
	isCustomSaveIdle: () => boolean
	getWeekKnownUpdatedAt: () => number
	setWeekKnownUpdatedAt: (val: number) => void
	getCustomKnownUpdatedAt: () => number
	setCustomKnownUpdatedAt: (val: number) => void
}

export function usePolling(deps: PollDeps) {
	let weekPollAbortController: AbortController | null = null
	let shouldPollWeek = false
	let customPollAbortController: AbortController | null = null
	let shouldPollCustom = false
	let usingNotifyPush = false

	// --- Week polling ---

	function stopWeekPoll() {
		shouldPollWeek = false
		weekPollAbortController?.abort()
		weekPollAbortController = null
	}

	async function longPollWeek() {
		if (!shouldPollWeek) return
		const controller = new AbortController()
		weekPollAbortController = controller
		try {
			const url = generateUrl('/apps/weekplanner/week/{year}/{week}/poll', {
				year: String(deps.currentYear.value),
				week: String(deps.currentWeek.value),
			})
			const response = await axios.get<{ changed: boolean; updatedAt: number; data?: unknown }>(
				`${url}?since=${deps.getWeekKnownUpdatedAt()}`,
				{ signal: controller.signal, timeout: 35_000 },
			)
			if (response.data.changed) {
				if (deps.isWeekSaveIdle() && !deps.editingTask.value) {
					deps.setWeekKnownUpdatedAt(response.data.updatedAt)
					deps.weekData.value = normalizeWeekData(response.data.data)
					deps.materializeRecurringTasks()
				}
			}
		} catch {
			if (controller.signal.aborted) return
			await new Promise((resolve) => setTimeout(resolve, 5_000))
		}
		longPollWeek()
	}

	// --- Custom columns polling ---

	function stopCustomPoll() {
		shouldPollCustom = false
		customPollAbortController?.abort()
		customPollAbortController = null
	}

	async function longPollCustom() {
		if (!shouldPollCustom) return
		const controller = new AbortController()
		customPollAbortController = controller
		try {
			const url = generateUrl('/apps/weekplanner/custom-columns/poll')
			const response = await axios.get<{ changed: boolean; updatedAt: number; data?: unknown }>(
				`${url}?since=${deps.getCustomKnownUpdatedAt()}`,
				{ signal: controller.signal, timeout: 35_000 },
			)
			if (response.data.changed) {
				if (deps.isCustomSaveIdle() && !deps.editingTask.value) {
					deps.setCustomKnownUpdatedAt(response.data.updatedAt)
					deps.applyCustomColumnsData(response.data.data)
				}
			}
		} catch {
			if (controller.signal.aborted) return
			await new Promise((resolve) => setTimeout(resolve, 5_000))
		}
		longPollCustom()
	}

	// --- Lifecycle helpers ---

	function startLongPolling() {
		shouldPollWeek = true
		longPollWeek()
		shouldPollCustom = true
		longPollCustom()
	}

	function stopAllPolling() {
		stopWeekPoll()
		stopCustomPoll()
	}

	// --- Notify push ---

	async function trySetupNotifyPush(): Promise<boolean> {
		try {
			const mod = await import('@nextcloud/notify_push')

			const available = mod.listen('weekplanner_week_update', (_type, body) => {
				if (!body) return
				if (Number(body.year) === deps.currentYear.value && Number(body.week) === deps.currentWeek.value) {
					if (deps.isWeekSaveIdle() && deps.isWeekLoadIdle() && !deps.editingTask.value) {
						deps.loadWeek()
					}
				}
			})

			if (!available) {
				return false
			}

			mod.listen('weekplanner_customcolumns_update', () => {
				if (deps.isCustomSaveIdle() && !deps.editingTask.value) {
					deps.loadCustomColumns()
				}
			})

			return true
		} catch {
			return false
		}
	}

	function isUsingNotifyPush() {
		return usingNotifyPush
	}

	function setUsingNotifyPush(val: boolean) {
		usingNotifyPush = val
	}

	return {
		stopWeekPoll,
		startLongPolling,
		stopAllPolling,
		trySetupNotifyPush,
		isUsingNotifyPush,
		setUsingNotifyPush,
		longPollWeek,
	}
}
