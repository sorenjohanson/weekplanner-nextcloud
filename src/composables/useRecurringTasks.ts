import type { Ref } from 'vue'
import type { WeekData, RecurringTaskDefinition, CustomColumn } from '../types'
import { ALL_KEYS } from '../types'
import { getWeekDates, toDateStr } from '../utils/dateUtils'

export function useRecurringTasks(
	currentYear: Ref<number>,
	currentWeek: Ref<number>,
	weekData: Ref<WeekData>,
	recurringTasks: Ref<RecurringTaskDefinition[]>,
	debouncedSave: () => void,
	customColumns?: Ref<CustomColumn[]>,
) {
	function materializeRecurringTasks() {
		const dates = getWeekDates(currentYear.value, currentWeek.value)
		let changed = false

		// Clean up stale recurring instances (definition ended, deleted, or no longer matching pattern)
		for (let i = 0; i < ALL_KEYS.length; i++) {
			const day = ALL_KEYS[i]
			const dateStr = toDateStr(dates[i])
			const before = weekData.value.days[day].length
			weekData.value.days[day] = weekData.value.days[day].filter((t) => {
				if (!t.recurringSourceId) return true
				const def = recurringTasks.value.find((d) => d.id === t.recurringSourceId)
				if (!def) return false
				if (def.endDate && dateStr > def.endDate) return false
				// If this instance was intentionally moved here by the user, keep it
				const wasMovedHere = t.recurringOriginalDate && t.recurringOriginalDate !== dateStr
				// Remove instances that no longer match the current recurrence pattern
				// (e.g. after changing from weekly to monthly) — but not moved instances
				if (!wasMovedHere && def.recurrence === 'weekly' && i !== def.dayOfWeek) return false
				if (!wasMovedHere && def.recurrence === 'monthly' && dates[i].getDate() !== def.dayOfMonth) return false
				if (!wasMovedHere && def.exceptionDates?.includes(dateStr)) return false
				return true
			})
			if (weekData.value.days[day].length !== before) changed = true
		}

		// Materialize new instances
		for (let i = 0; i < ALL_KEYS.length; i++) {
			const day = ALL_KEYS[i]
			const date = dates[i]
			const dateStr = toDateStr(date)
			for (const def of recurringTasks.value) {
				if (dateStr < def.startDate) continue
				if (def.endDate && dateStr > def.endDate) continue
				let matches = false
				if (def.recurrence === 'daily') {
					matches = true
				} else if (def.recurrence === 'weekly') {
					matches = i === def.dayOfWeek
				} else if (def.recurrence === 'monthly') {
					matches = date.getDate() === def.dayOfMonth
				}
				if (!matches) continue
				if (def.exceptionDates?.includes(dateStr)) continue
				const alreadyExists = weekData.value.days[day].some(
					(t) => t.recurringSourceId === def.id,
				)
				if (!alreadyExists) {
					weekData.value.days[day].push({
						id: crypto.randomUUID(),
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
		const dates = getWeekDates(currentYear.value, currentWeek.value)
		let definitionsChanged = false

		// Check custom columns: recurring tasks moved here need an exception on their original date
		if (customColumns) {
			for (const col of customColumns.value) {
				for (const task of col.tasks) {
					if (!task.recurringSourceId) continue
					const def = recurringTasks.value.find((d) => d.id === task.recurringSourceId)
					if (!def) continue
					if (!task.recurringOriginalDate) {
						for (let i = 0; i < ALL_KEYS.length; i++) {
							const ds = toDateStr(dates[i])
							let matches = false
							if (def.recurrence === 'daily') matches = true
							else if (def.recurrence === 'weekly') matches = i === def.dayOfWeek
							else if (def.recurrence === 'monthly') matches = dates[i].getDate() === def.dayOfMonth
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
		for (let i = 0; i < ALL_KEYS.length; i++) {
			const day = ALL_KEYS[i]
			const dateStr = toDateStr(dates[i])
			for (const task of weekData.value.days[day]) {
				if (!task.recurringSourceId) continue
				const def = recurringTasks.value.find((d) => d.id === task.recurringSourceId)
				if (!def) continue
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
