import type { ComputedRef, Ref } from 'vue'
import type { CustomColumn, DayKey, RecurringTaskDefinition, WeekData } from '../types'

import { dayOfWeekMonFirst, getDayKeyOfDate, toDateStr } from '../utils/dateUtils'
import { randomId } from '../utils/randomId'

export function useRecurringTasks(
	viewDates: ComputedRef<Date[]>,
	weekData: Ref<WeekData>,
	recurringTasks: Ref<RecurringTaskDefinition[]>,
	debouncedSave: () => void,
	customColumns?: Ref<CustomColumn[]>,
) {
	function materializeRecurringTasks() {
		const dates = viewDates.value
		let changed = false

		// Clean up stale recurring instances (definition ended, deleted, or no
		// longer matching pattern). We iterate the visible window by date and
		// look up each date's storage slot via its day-of-week key.
		for (const date of dates) {
			const day: DayKey = getDayKeyOfDate(date)
			const dateStr = toDateStr(date)
			const canonicalDow = dayOfWeekMonFirst(date)
			const before = weekData.value.days[day].length
			weekData.value.days[day] = weekData.value.days[day].filter((t) => {
				if (!t.recurringSourceId) {
					return true
				}
				const def = recurringTasks.value.find((d) => d.id === t.recurringSourceId)
				if (!def) {
					return false
				}
				if (def.endDate && dateStr > def.endDate) {
					return false
				}
				// If this instance was intentionally moved here by the user, keep it
				const wasMovedHere = t.recurringOriginalDate && t.recurringOriginalDate !== dateStr
				// Remove instances that no longer match the current recurrence pattern
				// (e.g. after changing from weekly to monthly) — but not moved instances
				if (!wasMovedHere && def.recurrence === 'weekly' && canonicalDow !== def.dayOfWeek) {
					return false
				}
				if (!wasMovedHere && def.recurrence === 'monthly' && date.getDate() !== def.dayOfMonth) {
					return false
				}
				if (!wasMovedHere && def.exceptionDates?.includes(dateStr)) {
					return false
				}
				return true
			})
			if (weekData.value.days[day].length !== before) {
				changed = true
			}
		}

		// Materialize new instances
		for (const date of dates) {
			const day: DayKey = getDayKeyOfDate(date)
			const dateStr = toDateStr(date)
			const canonicalDow = dayOfWeekMonFirst(date)
			for (const def of recurringTasks.value) {
				if (dateStr < def.startDate) {
					continue
				}
				if (def.endDate && dateStr > def.endDate) {
					continue
				}
				let matches = false
				if (def.recurrence === 'daily') {
					matches = true
				} else if (def.recurrence === 'weekly') {
					matches = canonicalDow === def.dayOfWeek
				} else if (def.recurrence === 'monthly') {
					matches = date.getDate() === def.dayOfMonth
				}
				if (!matches) {
					continue
				}
				if (def.exceptionDates?.includes(dateStr)) {
					continue
				}
				const alreadyExists = weekData.value.days[day].some((t) => t.recurringSourceId === def.id)
				if (!alreadyExists) {
					weekData.value.days[day].push({
						id: randomId(),
						title: def.title,
						done: false,
						notes: def.notes,
						recurrence: def.recurrence,
						color: '',
						recurringSourceId: def.id,
						recurringOriginalDate: dateStr,
					})
					changed = true
				}
			}
		}
		if (changed) {
			debouncedSave()
		}
	}

	function handleDragChange(): boolean {
		const dates = viewDates.value
		let definitionsChanged = false

		// Check custom columns: recurring tasks moved here need an exception on their original date
		if (customColumns) {
			for (const col of customColumns.value) {
				for (const task of col.tasks) {
					if (!task.recurringSourceId) {
						continue
					}
					const def = recurringTasks.value.find((d) => d.id === task.recurringSourceId)
					if (!def) {
						continue
					}
					if (!task.recurringOriginalDate) {
						for (const date of dates) {
							const ds = toDateStr(date)
							const canonicalDow = dayOfWeekMonFirst(date)
							let matches = false
							if (def.recurrence === 'daily') {
								matches = true
							} else if (def.recurrence === 'weekly') {
								matches = canonicalDow === def.dayOfWeek
							} else if (def.recurrence === 'monthly') {
								matches = date.getDate() === def.dayOfMonth
							}
							if (matches && ds >= def.startDate && (!def.endDate || ds <= def.endDate)) {
								task.recurringOriginalDate = ds
								break
							}
						}
					}
					if (task.recurringOriginalDate && !def.exceptionDates.includes(task.recurringOriginalDate)) {
						def.exceptionDates.push(task.recurringOriginalDate)
						definitionsChanged = true
					}
				}
			}
		}

		// Check day slots: recurring tasks moved to a different day need an exception on original date
		for (const date of dates) {
			const day: DayKey = getDayKeyOfDate(date)
			const dateStr = toDateStr(date)
			for (const task of weekData.value.days[day]) {
				if (!task.recurringSourceId) {
					continue
				}
				const def = recurringTasks.value.find((d) => d.id === task.recurringSourceId)
				if (!def) {
					continue
				}
				if (!task.recurringOriginalDate) {
					task.recurringOriginalDate = dateStr
				}
				if (task.recurringOriginalDate !== dateStr) {
					if (!def.exceptionDates.includes(task.recurringOriginalDate)) {
						def.exceptionDates.push(task.recurringOriginalDate)
						definitionsChanged = true
					}
					task.recurringOriginalDate = dateStr
				} else {
					const idx = def.exceptionDates.indexOf(dateStr)
					if (idx !== -1) {
						def.exceptionDates.splice(idx, 1)
						definitionsChanged = true
					}
				}
			}
		}

		return definitionsChanged
	}

	return {
		materializeRecurringTasks,
		handleDragChange,
	}
}
