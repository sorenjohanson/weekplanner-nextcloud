import { ref, computed } from 'vue'
import type { DayKey } from '../types'
import { ALL_KEYS } from '../types'
import { getISOWeek, getWeekMonday, getWeekDates } from '../utils/dateUtils'

export function useWeekNavigation() {
	const { year: _initYear, week: _initWeek } = getISOWeek(new Date())
	const currentYear = ref(_initYear)
	const currentWeek = ref(_initWeek)

	const weekDates = computed(() => getWeekDates(currentYear.value, currentWeek.value))

	const weekLabel = computed(() => {
		const dates = weekDates.value
		if (dates.length === 0) return ''
		const mon = dates[0]
		const sun = dates[6]
		const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
		const yearStr = sun.getFullYear()
		return `Week ${currentWeek.value} \u00B7 ${fmt(mon)} \u2013 ${fmt(sun)}, ${yearStr}`
	})

	function dayIndex(day: DayKey): number {
		return ALL_KEYS.indexOf(day)
	}

	function isToday(day: DayKey): boolean {
		const date = weekDates.value[dayIndex(day)]
		if (!date) return false
		const today = new Date()
		return (
			date.getFullYear() === today.getFullYear()
			&& date.getMonth() === today.getMonth()
			&& date.getDate() === today.getDate()
		)
	}

	function formatDate(day: DayKey): string {
		const date = weekDates.value[dayIndex(day)]
		if (!date) return ''
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
	}

	function prevWeek() {
		const monday = getWeekMonday(currentYear.value, currentWeek.value)
		monday.setDate(monday.getDate() - 7)
		const { year, week } = getISOWeek(monday)
		currentYear.value = year
		currentWeek.value = week
	}

	function nextWeek() {
		const monday = getWeekMonday(currentYear.value, currentWeek.value)
		monday.setDate(monday.getDate() + 7)
		const { year, week } = getISOWeek(monday)
		currentYear.value = year
		currentWeek.value = week
	}

	function goToday() {
		const { year, week } = getISOWeek(new Date())
		currentYear.value = year
		currentWeek.value = week
	}

	return {
		currentYear,
		currentWeek,
		weekDates,
		weekLabel,
		dayIndex,
		isToday,
		formatDate,
		prevWeek,
		nextWeek,
		goToday,
	}
}
