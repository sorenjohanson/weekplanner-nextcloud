import type { RecurringTaskDefinition } from '../types'

import { dayOfWeekMonFirst } from './dateUtils'

function parseDateStr(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
	if (!match) {
		return null
	}
	return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function daysBetween(from: Date, to: Date): number {
	const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
	const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
	return Math.round((toUtc - fromUtc) / 86400000)
}

function startOfWeek(date: Date): Date {
	const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
	result.setDate(result.getDate() - dayOfWeekMonFirst(result))
	return result
}

/**
 * Whether `date` falls on a definition's recurrence pattern. Range and
 * exception filtering are handled by the caller.
 *
 * @param def the recurrence definition to match
 * @param date the date to test
 */
export function matchesRecurrencePattern(def: RecurringTaskDefinition, date: Date): boolean {
	if (def.recurrence === 'daily') {
		return true
	}
	if (def.recurrence === 'weekly') {
		return dayOfWeekMonFirst(date) === def.dayOfWeek
	}
	if (def.recurrence === 'monthly') {
		return date.getDate() === def.dayOfMonth
	}
	if (def.recurrence !== 'custom') {
		return false
	}

	const start = parseDateStr(def.startDate)
	if (!start) {
		return false
	}
	const interval = Math.max(1, def.repeatInterval ?? 1)
	const unit = def.repeatUnit ?? 'week'

	if (unit === 'day') {
		const diff = daysBetween(start, date)
		return diff >= 0 && diff % interval === 0
	}

	if (unit === 'week') {
		const diffWeeks = Math.round(daysBetween(startOfWeek(start), startOfWeek(date)) / 7)
		if (diffWeeks < 0 || diffWeeks % interval !== 0) {
			return false
		}
		const weekdays = def.repeatWeekdays?.length ? def.repeatWeekdays : [def.dayOfWeek]
		return weekdays.includes(dayOfWeekMonFirst(date))
	}

	if (unit === 'month') {
		const diffMonths = (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth())
		if (diffMonths < 0 || diffMonths % interval !== 0) {
			return false
		}
		const dayOfMonth = def.dayOfMonth || start.getDate()
		return date.getDate() === dayOfMonth
	}

	const diffYears = date.getFullYear() - start.getFullYear()
	if (diffYears < 0 || diffYears % interval !== 0) {
		return false
	}
	return date.getMonth() === start.getMonth() && date.getDate() === start.getDate()
}

/**
 * Shift a custom weekly repeat's selected weekdays when the whole series is
 * re-anchored to another day of the week.
 *
 * @param def the definition being re-anchored
 * @param fromDow previous canonical day of week (0=Monday..6=Sunday)
 * @param toDow new canonical day of week (0=Monday..6=Sunday)
 */
export function shiftCustomRepeatWeekdays(def: RecurringTaskDefinition, fromDow: number, toDow: number): void {
	if (def.recurrence !== 'custom' || def.repeatUnit !== 'week' || !def.repeatWeekdays?.length) {
		return
	}
	const delta = ((toDow - fromDow) % 7 + 7) % 7
	if (delta === 0) {
		return
	}
	def.repeatWeekdays = Array.from(new Set(def.repeatWeekdays.map((dow) => (dow + delta) % 7))).sort((a, b) => a - b)
}
