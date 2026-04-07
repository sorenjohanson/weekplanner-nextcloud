import { ref } from 'vue'
import type { Ref } from 'vue'
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import type { Task, CustomColumn, RecurringTaskDefinition } from '../types'

export function useCustomColumns(recurringTasks: Ref<RecurringTaskDefinition[]>) {
	const customColumns = ref<CustomColumn[]>([
		{ id: 'custom_1', title: 'Someday', tasks: [] },
		{ id: 'custom_2', title: '', tasks: [] },
		{ id: 'custom_3', title: '', tasks: [] },
	])
	const newCustomTasks = ref<Record<string, string>>({
		custom_1: '',
		custom_2: '',
		custom_3: '',
	})

	let customSaveTimeout: ReturnType<typeof setTimeout> | null = null
	let customSaveInProgress = false
	let knownCustomUpdatedAt = 0

	async function loadCustomColumns() {
		try {
			const url = generateUrl('/apps/weekplanner/custom-columns')
			const response = await axios.get(url)
			if (typeof response.data?.updatedAt === 'number') {
				knownCustomUpdatedAt = response.data.updatedAt
			}
			const data = response.data as { columns?: CustomColumn[]; recurringTasks?: RecurringTaskDefinition[] }
			if (data.columns && Array.isArray(data.columns)) {
				customColumns.value = data.columns.map((col) => ({
					...col,
					tasks: (col.tasks || []).map((t) => ({ ...t, notes: t.notes || '', recurrence: t.recurrence || '' })),
				}))
				const newObj: Record<string, string> = {}
				for (const col of customColumns.value) {
					newObj[col.id] = newCustomTasks.value[col.id] || ''
				}
				newCustomTasks.value = newObj
			}
			if (Array.isArray(data.recurringTasks)) {
				recurringTasks.value = data.recurringTasks.map((d) => ({
					...d,
					exceptionDates: d.exceptionDates ?? [],
				}))
			}
		} catch {
			// Keep defaults
		}
	}

	async function saveCustomColumnsNow() {
		customSaveInProgress = true
		try {
			const url = generateUrl('/apps/weekplanner/custom-columns')
			const response = await axios.put(url, { columns: customColumns.value, recurringTasks: recurringTasks.value })
			if (typeof response.data?.updatedAt === 'number') {
				knownCustomUpdatedAt = response.data.updatedAt
			}
		} catch {
			// Save failed silently
		} finally {
			customSaveInProgress = false
		}
	}

	function debouncedSaveCustomColumns() {
		if (customSaveTimeout) clearTimeout(customSaveTimeout)
		customSaveTimeout = setTimeout(() => {
			customSaveTimeout = null
			saveCustomColumnsNow()
		}, 300)
	}

	function addCustomTask(columnId: string) {
		const title = newCustomTasks.value[columnId]?.trim()
		if (!title) return
		const col = customColumns.value.find((c) => c.id === columnId)
		if (!col) return
		col.tasks.push({
			id: crypto.randomUUID(),
			title,
			done: false,
			notes: '',
			recurrence: '',
			color: '',
		})
		newCustomTasks.value[columnId] = ''
		debouncedSaveCustomColumns()
	}

	function toggleCustomDone(columnId: string, taskId: string) {
		const col = customColumns.value.find((c) => c.id === columnId)
		if (!col) return
		const task = col.tasks.find((t: Task) => t.id === taskId)
		if (task) {
			task.done = !task.done
			debouncedSaveCustomColumns()
		}
	}

	function deleteCustomTask(columnId: string, taskId: string) {
		const col = customColumns.value.find((c) => c.id === columnId)
		if (!col) return
		col.tasks = col.tasks.filter((t: Task) => t.id !== taskId)
		debouncedSaveCustomColumns()
	}

	function updateColumnTitle(columnId: string, title: string) {
		const col = customColumns.value.find((c) => c.id === columnId)
		if (col) {
			col.title = title
			debouncedSaveCustomColumns()
		}
	}

	function applyCustomColumnsData(data: unknown) {
		if (!data || typeof data !== 'object' || !('columns' in data)) return
		const typed = data as { columns?: CustomColumn[]; recurringTasks?: RecurringTaskDefinition[] }
		const cols = typed.columns
		if (!Array.isArray(cols)) return
		customColumns.value = cols.map((col) => ({
			...col,
			tasks: (col.tasks || []).map((t) => ({ ...t, notes: t.notes || '', recurrence: t.recurrence || '' })),
		}))
		const newObj: Record<string, string> = {}
		for (const col of customColumns.value) {
			newObj[col.id] = newCustomTasks.value[col.id] || ''
		}
		newCustomTasks.value = newObj
		if (Array.isArray(typed.recurringTasks)) {
			recurringTasks.value = typed.recurringTasks.map((d) => ({
				...d,
				exceptionDates: d.exceptionDates ?? [],
			}))
		}
	}

	function flushCustomSaveTimeout() {
		if (customSaveTimeout) {
			clearTimeout(customSaveTimeout)
			customSaveTimeout = null
		}
	}

	function getKnownUpdatedAt() {
		return knownCustomUpdatedAt
	}

	function setKnownUpdatedAt(val: number) {
		knownCustomUpdatedAt = val
	}

	function isSaveIdle() {
		return customSaveTimeout === null && !customSaveInProgress
	}

	return {
		customColumns,
		newCustomTasks,
		loadCustomColumns,
		saveCustomColumnsNow,
		debouncedSaveCustomColumns,
		addCustomTask,
		toggleCustomDone,
		deleteCustomTask,
		updateColumnTitle,
		applyCustomColumnsData,
		flushCustomSaveTimeout,
		getKnownUpdatedAt,
		setKnownUpdatedAt,
		isSaveIdle,
	}
}
