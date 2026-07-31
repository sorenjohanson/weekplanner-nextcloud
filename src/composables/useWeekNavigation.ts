import type { DayKey } from '../types'

import { getLocale } from '@nextcloud/l10n'
import { computed, ref } from 'vue'
import { getFirstDayOfWeek, getOrderedKeys } from '../types'
import { getISOWeek, getViewBuckets, getViewDates, getViewStart } from '../utils/dateUtils'

function getValidLocale(): string {
	const locale = getLocale().replace(/_/g, '-')
	try {
		new Intl.DateTimeFormat(locale)
		return locale
	} catch {
		return 'en-US'
	}
}

export function useWeekNavigation() {
	// Source of truth for the visible window: the first day shown, at local midnight.
	const viewStart = ref<Date>(getViewStart(new Date(), getFirstDayOfWeek()))

	const weekDates = computed(() => getViewDates(viewStart.value))

	// Buckets the visible window draws from. 1 when firstDay = Monday (window
	// aligns with ISO week), 2 otherwise.
	const bucketKeys = computed(() => getViewBuckets(viewStart.value))

	// Best-effort single ISO-week label for the visible window. We pick the ISO
	// week of the date closest to mid-window (day 3) so a Sunday-start view of
	// e.g. Sun Jun 21 – Sat Jun 27 still labels as the Mon-anchored ISO week
	// rather than the trailing one.
	const labelISOWeek = computed(() => getISOWeek(weekDates.value[3]))

	// Kept for backward compatibility with code/tests that destructure these.
	// They reflect the labelISOWeek; mutating them (as legacy tests do) snaps
	// the view to that ISO week's first-day-aligned window.
	const currentYear = computed({
		get: () => labelISOWeek.value.year,
		set: (year: number) => {
			snapToISOWeek(year, labelISOWeek.value.week)
		},
	})
	const currentWeek = computed({
		get: () => labelISOWeek.value.week,
		set: (week: number) => {
			snapToISOWeek(labelISOWeek.value.year, week)
		},
	})

	const weekLabel = computed(() => {
		const dates = weekDates.value
		if (dates.length === 0) {
			return ''
		}
		const start = dates[0]
		const end = dates[6]
		const fmt = (d: Date) => d.toLocaleDateString(getValidLocale(), { month: 'short', day: 'numeric' })
		return `Week ${labelISOWeek.value.week} \u00B7 ${fmt(start)} \u2013 ${fmt(end)}, ${end.getFullYear()}`
	})

	function dayIndex(day: DayKey): number {
		return getOrderedKeys().indexOf(day)
	}

	function isToday(day: DayKey): boolean {
		const date = weekDates.value[dayIndex(day)]
		if (!date) {
			return false
		}
		const today = new Date()
		return (
			date.getFullYear() === today.getFullYear()
			&& date.getMonth() === today.getMonth()
			&& date.getDate() === today.getDate()
		)
	}

	function formatDate(day: DayKey): string {
		const date = weekDates.value[dayIndex(day)]
		if (!date) {
			return ''
		}
		return date.toLocaleDateString(getValidLocale(), { month: 'short', day: 'numeric' })
	}

	function formatLongDate(day: DayKey): string {
		const date = weekDates.value[dayIndex(day)]
		if (!date) {
			return ''
		}
		return date.toLocaleDateString(getValidLocale(), { month: 'long', day: 'numeric' })
	}

	function shiftDays(days: number) {
		const next = new Date(viewStart.value)
		next.setDate(next.getDate() + days)
		viewStart.value = next
	}

	function prevWeek() {
		shiftDays(-7)
	}

	function nextWeek() {
		shiftDays(7)
	}

	function goToday() {
		viewStart.value = getViewStart(new Date(), getFirstDayOfWeek())
	}

	function snapToISOWeek(year: number, week: number) {
		// Anchor to the Monday of the requested ISO week, then back up to the
		// preferred first day. Keeps user-visible navigation by ISO week-number
		// consistent regardless of firstDayOfWeek.
		const monday = new Date(year, 0, 4)
		const dow = monday.getDay() || 7
		monday.setDate(monday.getDate() - dow + 1 + (week - 1) * 7)
		viewStart.value = getViewStart(monday, getFirstDayOfWeek())
	}

	return {
		viewStart,
		currentYear,
		currentWeek,
		weekDates,
		weekLabel,
		bucketKeys,
		dayIndex,
		isToday,
		formatDate,
		formatLongDate,
		prevWeek,
		nextWeek,
		goToday,
	}
}
