import type { ComputedRef, Ref } from 'vue'
import type { CustomColumn, DayKey, RecurringTaskDefinition, Task, WeekData } from '../types'

import { dayOfWeekMonFirst, getDayKeyOfDate, toDateStr } from '../utils/dateUtils'
import { randomId } from '../utils/randomId'

/**
 * First date within `dates` that matches a definition's recurrence pattern and
 * falls inside its start/end range. For weekly/monthly definitions this is the
 * single day the instance should have been generated on; it is used to recover
 * an instance's home date when `recurringOriginalDate` is missing.
 *
 * @param def the recurrence definition to match
 * @param dates the dates to search, in chronological order
 */
function findHomeDate(def: RecurringTaskDefinition, dates: Date[]): string | undefined {
	for (const date of dates) {
		const ds = toDateStr(date)
		if (ds < def.startDate) {
			continue
		}
		if (def.endDate && ds > def.endDate) {
			continue
		}
		let matches = false
		if (def.recurrence === 'daily') {
			matches = true
		} else if (def.recurrence === 'weekly') {
			matches = dayOfWeekMonFirst(date) === def.dayOfWeek
		} else if (def.recurrence === 'monthly') {
			matches = date.getDate() === def.dayOfMonth
		}
		if (matches) {
			return ds
		}
	}
	return undefined
}

function dedupeRecurringInstances(tasks: Task[]): { tasks: Task[], changed: boolean } {
	const seen = new Set<string>()
	const deduped: Task[] = []
	for (let i = tasks.length - 1; i >= 0; i -= 1) {
		const task = tasks[i]
		if (task.recurringSourceId) {
			if (seen.has(task.recurringSourceId)) {
				continue
			}
			seen.add(task.recurringSourceId)
		}
		deduped.unshift(task)
	}
	return { tasks: deduped, changed: deduped.length !== tasks.length }
}

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
			const deduped = dedupeRecurringInstances(weekData.value.days[day])
			if (deduped.changed) {
				weekData.value.days[day] = deduped.tasks
			}
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
						task.recurringOriginalDate = findHomeDate(def, dates)
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
			const deduped = dedupeRecurringInstances(weekData.value.days[day])
			if (deduped.changed) {
				weekData.value.days[day] = deduped.tasks
				definitionsChanged = true
			}
			for (const task of weekData.value.days[day]) {
				if (!task.recurringSourceId) {
					continue
				}
				const def = recurringTasks.value.find((d) => d.id === task.recurringSourceId)
				if (!def) {
					continue
				}
				if (!task.recurringOriginalDate) {
					task.recurringOriginalDate = findHomeDate(def, dates) ?? dateStr
				}
				if (task.recurringOriginalDate !== dateStr) {
					if (!def.exceptionDates.includes(task.recurringOriginalDate)) {
						def.exceptionDates.push(task.recurringOriginalDate)
						definitionsChanged = true
					}
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

	/**
	 * Re-anchor a recurring definition so the whole series follows a task that
	 * was just dragged to `targetDay`. Mirrors the edit-dialog picker's "all
	 * occurrences" move: update startDate / dayOfWeek / dayOfMonth, drop stale
	 * exceptions before the new anchor, and stamp the moved instance with its
	 * new home date.
	 *
	 * @param task the moved recurring instance
	 * @param targetDay the day key the instance was dropped onto
	 */
	function handleDragChangeAll(task: Task, targetDay: DayKey) {
		const def = recurringTasks.value.find((d) => d.id === task.recurringSourceId)
		if (!def) {
			return
		}
		const targetDate = viewDates.value.find((d) => getDayKeyOfDate(d) === targetDay)
		if (!targetDate) {
			return
		}
		const targetDateStr = toDateStr(targetDate)
		def.startDate = targetDateStr
		def.dayOfWeek = dayOfWeekMonFirst(targetDate)
		def.dayOfMonth = targetDate.getDate()
		def.exceptionDates = def.exceptionDates.filter((d) => d > targetDateStr)
		task.recurringOriginalDate = targetDateStr
	}

	return {
		materializeRecurringTasks,
		handleDragChange,
		handleDragChangeAll,
	}
}
