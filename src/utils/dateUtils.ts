import type { DayKey } from '../types'

// Canonical day-of-week order, Monday=0..Sunday=6. This matches ISO 8601 and is
// the storage convention for both backend buckets (day keys) and recurring
// definitions' `dayOfWeek` field — independent of the user's preferred
// firstDayOfWeek display order.
const DAY_KEYS_MON_FIRST: DayKey[] = [
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
	'sunday',
]

export function getISOWeek(date: Date): { year: number, week: number } {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
	d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
	const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
	return { year: d.getUTCFullYear(), week: weekNo }
}

export function getWeekMonday(year: number, week: number): Date {
	const jan4 = new Date(year, 0, 4)
	const dayOfWeek = jan4.getDay() || 7
	const mondayWeek1 = new Date(jan4)
	mondayWeek1.setDate(jan4.getDate() - dayOfWeek + 1)
	const monday = new Date(mondayWeek1)
	monday.setDate(mondayWeek1.getDate() + (week - 1) * 7)
	return monday
}

export function getWeekDates(year: number, week: number): Date[] {
	const monday = getWeekMonday(year, week)
	const dates: Date[] = []
	for (let i = 0; i < 7; i++) {
		const date = new Date(monday)
		date.setDate(monday.getDate() + i)
		dates.push(date)
	}
	return dates
}

export function toDateStr(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 0=Monday..6=Sunday — canonical storage index for day-of-week, decoupled from
 * the user's firstDayOfWeek display order. Used by recurring task definitions.
 *
 * @param date
 */
export function dayOfWeekMonFirst(date: Date): number {
	// JS getDay() returns 0=Sunday..6=Saturday.
	const js = date.getDay()
	return (js + 6) % 7
}

/**
 * DayKey corresponding to the actual day of week of the given date. Used to
 * locate a date's task list inside an ISO-week-keyed bucket.
 *
 * @param date
 */
export function getDayKeyOfDate(date: Date): DayKey {
	return DAY_KEYS_MON_FIRST[dayOfWeekMonFirst(date)]
}

/**
 * Latest occurrence of `firstDay` (0=Sun..6=Sat in JS convention, matching
 * Nextcloud's stored preference) on or before `date`, at local midnight.
 *
 * @param date
 * @param firstDay
 */
export function getViewStart(date: Date, firstDay: number): Date {
	const normalized = ((firstDay % 7) + 7) % 7
	const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
	const diff = (result.getDay() - normalized + 7) % 7
	result.setDate(result.getDate() - diff)
	return result
}

/**
 * 7 consecutive dates starting at `viewStart`.
 *
 * @param viewStart
 */
export function getViewDates(viewStart: Date): Date[] {
	const dates: Date[] = []
	for (let i = 0; i < 7; i++) {
		const d = new Date(viewStart)
		d.setDate(viewStart.getDate() + i)
		dates.push(d)
	}
	return dates
}

export interface ViewBucket {
	year: number
	week: number
	weekKey: string
	/** Day keys from this bucket that appear in the visible view, in chronological order. */
	dayKeys: DayKey[]
	/** Chronological dates matching `dayKeys` 1:1. */
	dates: Date[]
}

/**
 * Group the 7 visible dates by ISO week. Returns 1 or 2 buckets in
 * chronological order — 1 when the view aligns with an ISO week (firstDay
 * = Monday), 2 otherwise.
 *
 * @param viewStart
 */
export function getViewBuckets(viewStart: Date): ViewBucket[] {
	const dates = getViewDates(viewStart)
	const buckets = new Map<string, ViewBucket>()
	const order: string[] = []
	for (const date of dates) {
		const { year, week } = getISOWeek(date)
		const weekKey = bucketKey(year, week)
		let bucket = buckets.get(weekKey)
		if (!bucket) {
			bucket = { year, week, weekKey, dayKeys: [], dates: [] }
			buckets.set(weekKey, bucket)
			order.push(weekKey)
		}
		bucket.dayKeys.push(getDayKeyOfDate(date))
		bucket.dates.push(date)
	}
	return order.map((k) => buckets.get(k)!)
}

export function bucketKey(year: number, week: number): string {
	return `${year}-${week}`
}
