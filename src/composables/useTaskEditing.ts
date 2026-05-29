import { ref, computed, nextTick } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { Recurrence, TaskColor, Task, RecurringTaskDefinition, DayKey, WeekData, CustomColumn, RecurringDeleteMode } from '../types'
import { ALL_KEYS } from '../types'
import { getWeekDates, toDateStr } from '../utils/dateUtils'
import { randomId } from '../utils/randomId'

export interface TaskEditingDeps {
	currentYear: Ref<number>
	currentWeek: Ref<number>
	weekData: Ref<WeekData>
	weekDates: ComputedRef<Date[]>
	recurringTasks: Ref<RecurringTaskDefinition[]>
	customColumns: Ref<CustomColumn[]>
	debouncedSave: () => void
	debouncedSaveCustomColumns: () => void
	saveWeekNow: () => Promise<void>
	saveCustomColumnsNow: () => Promise<void>
	flushSaveTimeout: () => void
	flushCustomSaveTimeout: () => void
	deleteCustomTask: (columnId: string, taskId: string) => void
	materializeRecurringTasks: () => void
	handleDragChange: () => boolean
}

export function useTaskEditing(deps: TaskEditingDeps) {
	const {
		currentYear, currentWeek, weekData, weekDates, recurringTasks, customColumns,
		debouncedSave, debouncedSaveCustomColumns, saveWeekNow, saveCustomColumnsNow,
		flushSaveTimeout, flushCustomSaveTimeout, deleteCustomTask, materializeRecurringTasks,
		handleDragChange,
	} = deps
	const editingTask = ref<{ day: DayKey | string; taskId: string } | null>(null)
	const editTitle = ref('')
	const editNotes = ref('')
	const editRecurrence = ref<Recurrence>('')
	const editColor = ref<TaskColor>('')
	const editTitleInput = ref<HTMLInputElement | null>(null)

	const newTasks = ref<Record<DayKey, string>>({
		monday: '',
		tuesday: '',
		wednesday: '',
		thursday: '',
		friday: '',
		saturday: '',
		sunday: '',
	})

	function isCustomColumn(key: string): boolean {
		return key.startsWith('custom_')
	}

	function openEdit(day: DayKey | string, task: Task) {
		editingTask.value = { day, taskId: task.id }
		editTitle.value = task.title
		editNotes.value = task.notes || ''
		editRecurrence.value = task.recurrence || ''
		editColor.value = task.color || ''
		nextTick(() => {
			editTitleInput.value?.focus()
		})
	}

	function getTaskDate(day: DayKey): string {
		const idx = ALL_KEYS.indexOf(day)
		const dates = getWeekDates(currentYear.value, currentWeek.value)
		return toDateStr(dates[idx])
	}

	function handleRecurrenceChange(task: Task, day: DayKey) {
		const newRecurrence = editRecurrence.value
		const oldSourceId = task.recurringSourceId

		if (newRecurrence && !oldSourceId) {
			// Setting recurrence for the first time: create a definition
			const defId = randomId()
			const dateStr = getTaskDate(day)
			const date = weekDates.value[ALL_KEYS.indexOf(day)]
			recurringTasks.value.push({
				id: defId,
				title: editTitle.value.trim() || task.title,
				notes: editNotes.value,
				recurrence: newRecurrence as 'daily' | 'weekly' | 'monthly',
				startDate: dateStr,
				endDate: '',
				dayOfWeek: ALL_KEYS.indexOf(day),
				dayOfMonth: date.getDate(),
				exceptionDates: [],
			})
			task.recurringSourceId = defId
			task.recurrence = newRecurrence
			debouncedSaveCustomColumns()
			materializeRecurringTasks()
		} else if (newRecurrence && oldSourceId) {
			// Updating or re-enabling an existing recurrence definition
			const def = recurringTasks.value.find((d) => d.id === oldSourceId)
			if (def) {
				def.title = editTitle.value.trim() || task.title
				def.notes = editNotes.value
				def.recurrence = newRecurrence as 'daily' | 'weekly' | 'monthly'
				def.endDate = ''
				task.recurrence = newRecurrence
				debouncedSaveCustomColumns()
				materializeRecurringTasks()
			}
		} else if (!newRecurrence && oldSourceId) {
			// Removing recurrence: set endDate and clean up future instances
			const def = recurringTasks.value.find((d) => d.id === oldSourceId)
			const dateStr = getTaskDate(day)
			if (def) {
				def.endDate = dateStr
			}
			task.recurrence = ''
			// Remove instances from days after endDate in this week
			const dates = getWeekDates(currentYear.value, currentWeek.value)
			for (let i = 0; i < ALL_KEYS.length; i++) {
				const dStr = toDateStr(dates[i])
				if (dStr > dateStr) {
					weekData.value.days[ALL_KEYS[i]] = weekData.value.days[ALL_KEYS[i]].filter(
						(t) => t.recurringSourceId !== oldSourceId,
					)
				}
			}
			debouncedSaveCustomColumns()
		}
	}

	function saveEdit() {
		if (!editingTask.value) return
		const { day, taskId } = editingTask.value
		if (isCustomColumn(day)) {
			const col = customColumns.value.find((c) => c.id === day)
			if (col) {
				const task = col.tasks.find((t) => t.id === taskId)
				if (task) {
					task.title = editTitle.value.trim() || task.title
					task.notes = editNotes.value
					task.recurrence = editRecurrence.value
					task.color = editColor.value
					debouncedSaveCustomColumns()
				}
			}
		} else {
			const task = weekData.value.days[day as DayKey].find((t) => t.id === taskId)
			if (task) {
				const oldRecurrence = task.recurrence || ''
				task.title = editTitle.value.trim() || task.title
				task.notes = editNotes.value
				task.color = editColor.value
				// Handle recurrence changes
				if (editRecurrence.value !== oldRecurrence) {
					handleRecurrenceChange(task, day as DayKey)
				} else if (task.recurringSourceId) {
					// Update definition title/notes even if recurrence didn't change
					const def = recurringTasks.value.find((d) => d.id === task.recurringSourceId)
					if (def) {
						def.title = task.title
						def.notes = task.notes
						debouncedSaveCustomColumns()
					}
				}
				debouncedSave()
			}
		}
		editingTask.value = null
	}

	function deleteEditingTask(mode?: RecurringDeleteMode) {
		if (!editingTask.value) return
		const { day, taskId } = editingTask.value
		if (isCustomColumn(day)) {
			deleteCustomTask(day, taskId)
		} else {
			const task = weekData.value.days[day as DayKey].find((t) => t.id === taskId)
			if (task?.recurringSourceId && mode) {
				const sourceId = task.recurringSourceId
				const dateStr = getTaskDate(day as DayKey)
				const def = recurringTasks.value.find((d) => d.id === sourceId)

				if (mode === 'this') {
					// Delete only this occurrence: add to exception dates
					if (def) {
						const exceptionDate = task.recurringOriginalDate || dateStr
						if (!def.exceptionDates.includes(exceptionDate)) {
							def.exceptionDates.push(exceptionDate)
						}
					}
					weekData.value.days[day as DayKey] = weekData.value.days[day as DayKey].filter((t) => t.id !== taskId)
					flushSaveTimeout()
					flushCustomSaveTimeout()
					saveCustomColumnsNow()
					saveWeekNow()
				} else if (mode === 'this-and-future') {
					// Delete this and all future occurrences: set endDate to day before
					if (def) {
						const prev = new Date(dateStr + 'T00:00:00')
						prev.setDate(prev.getDate() - 1)
						def.endDate = toDateStr(prev)
					}
					const dates = getWeekDates(currentYear.value, currentWeek.value)
					for (let i = 0; i < ALL_KEYS.length; i++) {
						const dStr = toDateStr(dates[i])
						if (dStr >= dateStr) {
							weekData.value.days[ALL_KEYS[i]] = weekData.value.days[ALL_KEYS[i]].filter(
								(t) => t.recurringSourceId !== sourceId,
							)
						}
					}
					flushSaveTimeout()
					flushCustomSaveTimeout()
					saveCustomColumnsNow()
					saveWeekNow()
				} else if (mode === 'all') {
					// Delete all occurrences: remove definition and all instances
					recurringTasks.value = recurringTasks.value.filter((d) => d.id !== sourceId)
					for (const key of ALL_KEYS) {
						weekData.value.days[key] = weekData.value.days[key].filter(
							(t) => t.recurringSourceId !== sourceId,
						)
					}
					flushSaveTimeout()
					flushCustomSaveTimeout()
					saveCustomColumnsNow()
					saveWeekNow()
				}
			} else {
				weekData.value.days[day as DayKey] = weekData.value.days[day as DayKey].filter((t) => t.id !== taskId)
				debouncedSave()
			}
		}
		editingTask.value = null
	}

	function addTask(day: DayKey) {
		const title = newTasks.value[day].trim()
		if (!title) return
		weekData.value.days[day].push({
			id: randomId(),
			title,
			done: false,
			notes: '',
			recurrence: '',
			color: '',
		})
		newTasks.value[day] = ''
		debouncedSave()
	}

	function toggleDone(day: DayKey, taskId: string) {
		const task = weekData.value.days[day].find((t) => t.id === taskId)
		if (task) {
			task.done = !task.done
			debouncedSave()
		}
	}

	// Picker-driven move from the edit dialog.
	//
	// For a recurring task moved between two day slots we intentionally diverge
	// from drag semantics: drag adds an exception so future weeks keep the old
	// pattern, but picker users explicitly chose "Sunday" — they expect the
	// recurrence to follow. So we update the definition's startDate / dayOfWeek
	// / dayOfMonth and drop now-stale exceptions before startDate.
	//
	// All other paths (non-recurring, or recurring involving a custom column)
	// reuse handleDragChange so cross-list bookkeeping (originalDate, exception
	// dates for moved instances) stays consistent with the drag flow.
	function moveEditingTask(target: DayKey | string) {
		if (!editingTask.value) return
		const { day: sourceDay, taskId } = editingTask.value
		if (target === sourceDay) {
			editingTask.value = null
			return
		}

		let task: Task | undefined
		if (isCustomColumn(sourceDay)) {
			const col = customColumns.value.find((c) => c.id === sourceDay)
			if (col) {
				const idx = col.tasks.findIndex((t) => t.id === taskId)
				if (idx !== -1) task = col.tasks.splice(idx, 1)[0]
			}
		} else {
			const arr = weekData.value.days[sourceDay as DayKey]
			const idx = arr.findIndex((t) => t.id === taskId)
			if (idx !== -1) task = arr.splice(idx, 1)[0]
		}
		if (!task) {
			editingTask.value = null
			return
		}

		const sourceIsDay = !isCustomColumn(sourceDay)
		const targetIsDay = !isCustomColumn(target)
		const isRecurringDayToDay = !!task.recurringSourceId && sourceIsDay && targetIsDay

		if (isRecurringDayToDay) {
			const def = recurringTasks.value.find((d) => d.id === task!.recurringSourceId)
			if (def) {
				const targetIdx = ALL_KEYS.indexOf(target as DayKey)
				const targetDateStr = toDateStr(weekDates.value[targetIdx])
				const targetDate = weekDates.value[targetIdx]
				def.startDate = targetDateStr
				def.dayOfWeek = targetIdx
				def.dayOfMonth = targetDate.getDate()
				def.exceptionDates = def.exceptionDates.filter((d) => d >= targetDateStr)
				task.recurringOriginalDate = targetDateStr
			}
		}

		if (targetIsDay) {
			const targetArr = weekData.value.days[target as DayKey]
			const duplicate = task.recurringSourceId
				? targetArr.find((t) => t.recurringSourceId === task!.recurringSourceId)
				: undefined
			if (!duplicate) {
				targetArr.push(task)
			}
		} else {
			const col = customColumns.value.find((c) => c.id === target)
			if (col) col.tasks.push(task)
		}

		if (!isRecurringDayToDay) {
			handleDragChange()
		}
		materializeRecurringTasks()
		debouncedSave()
		debouncedSaveCustomColumns()
		editingTask.value = null
	}

	const editingTaskIsRecurring = computed(() => {
		if (!editingTask.value) return false
		const { day, taskId } = editingTask.value
		if (isCustomColumn(day)) {
			const col = customColumns.value.find((c) => c.id === day)
			const task = col?.tasks.find((t) => t.id === taskId)
			return !!task?.recurringSourceId
		}
		const task = weekData.value.days[day as DayKey]?.find((t) => t.id === taskId)
		return !!task?.recurringSourceId
	})

	return {
		editingTask,
		editingTaskIsRecurring,
		editTitle,
		editNotes,
		editRecurrence,
		editColor,
		editTitleInput,
		newTasks,
		openEdit,
		saveEdit,
		deleteEditingTask,
		addTask,
		toggleDone,
		moveEditingTask,
	}
}
