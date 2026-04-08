import { ref } from 'vue'
import type { Ref } from 'vue'
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import type { Task, CustomColumn, RecurringTaskDefinition } from '../types'
import { normalizeTask } from '../utils/weekData'
import { createDebouncedSave } from '../utils/debounce'

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

	let knownCustomUpdatedAt = 0

	async function saveCustomColumnsNow() {
		save.setInProgress(true)
		try {
			const url = generateUrl('/apps/weekplanner/custom-columns')
			const response = await axios.put(url, { columns: customColumns.value, recurringTasks: recurringTasks.value })
			if (typeof response.data?.updatedAt === 'number') {
				knownCustomUpdatedAt = response.data.updatedAt
			}
		} catch {
			// Save failed silently
		} finally {
			save.setInProgress(false)
		}
	}

	const save = createDebouncedSave(saveCustomColumnsNow)

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
					tasks: (col.tasks || []).map(normalizeTask),
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
		save.trigger()
	}

	function toggleCustomDone(columnId: string, taskId: string) {
		const col = customColumns.value.find((c) => c.id === columnId)
		if (!col) return
		const task = col.tasks.find((t: Task) => t.id === taskId)
		if (task) {
			task.done = !task.done
			save.trigger()
		}
	}

	function deleteCustomTask(columnId: string, taskId: string) {
		const col = customColumns.value.find((c) => c.id === columnId)
		if (!col) return
		col.tasks = col.tasks.filter((t: Task) => t.id !== taskId)
		save.trigger()
	}

	function updateColumnTitle(columnId: string, title: string) {
		const col = customColumns.value.find((c) => c.id === columnId)
		if (col) {
			col.title = title
			save.trigger()
		}
	}

	function applyCustomColumnsData(data: unknown) {
		if (!data || typeof data !== 'object' || !('columns' in data)) return
		const typed = data as { columns?: CustomColumn[]; recurringTasks?: RecurringTaskDefinition[] }
		const cols = typed.columns
		if (!Array.isArray(cols)) return
		customColumns.value = cols.map((col) => ({
			...col,
			tasks: (col.tasks || []).map(normalizeTask),
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

	return {
		customColumns,
		newCustomTasks,
		loadCustomColumns,
		saveCustomColumnsNow,
		debouncedSaveCustomColumns: save.trigger,
		addCustomTask,
		toggleCustomDone,
		deleteCustomTask,
		updateColumnTitle,
		applyCustomColumnsData,
		flushCustomSaveTimeout: save.flush,
		getKnownUpdatedAt: () => knownCustomUpdatedAt,
		setKnownUpdatedAt: (val: number) => { knownCustomUpdatedAt = val },
		isSaveIdle: save.isIdle,
	}
}
