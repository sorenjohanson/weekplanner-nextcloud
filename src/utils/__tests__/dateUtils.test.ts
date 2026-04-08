import { describe, it, expect } from 'vitest'
import { getISOWeek, getWeekMonday, getWeekDates, toDateStr } from '../dateUtils'

describe('getISOWeek', () => {
	it('returns correct week for a mid-year date', () => {
		const result = getISOWeek(new Date(2026, 2, 18)) // March 18, 2026 (Wednesday)
		expect(result).toEqual({ year: 2026, week: 12 })
	})

	it('returns week 1 for early January belonging to previous year week 53', () => {
		// Jan 1, 2027 is a Friday — belongs to ISO week 53 of 2026
		const result = getISOWeek(new Date(2027, 0, 1))
		expect(result).toEqual({ year: 2026, week: 53 })
	})

	it('returns correct week for last day of year', () => {
		// Dec 31, 2026 is a Thursday — belongs to ISO week 53 of 2026
		const result = getISOWeek(new Date(2026, 11, 31))
		expect(result).toEqual({ year: 2026, week: 53 })
	})

	it('handles week 1 of a new year', () => {
		// Jan 5, 2026 is a Monday — week 2 of 2026
		const result = getISOWeek(new Date(2026, 0, 5))
		expect(result).toEqual({ year: 2026, week: 2 })
	})
})

describe('getWeekMonday', () => {
	it('returns Monday for the given ISO week', () => {
		const monday = getWeekMonday(2026, 12)
		expect(toDateStr(monday)).toBe('2026-03-16')
		expect(monday.getDay()).toBe(1) // Monday
	})

	it('returns Monday for week 1', () => {
		const monday = getWeekMonday(2026, 1)
		expect(toDateStr(monday)).toBe('2025-12-29')
		expect(monday.getDay()).toBe(1)
	})
})

describe('getWeekDates', () => {
	it('returns 7 dates starting from Monday', () => {
		const dates = getWeekDates(2026, 12)
		expect(dates).toHaveLength(7)
		expect(toDateStr(dates[0])).toBe('2026-03-16') // Monday
		expect(toDateStr(dates[6])).toBe('2026-03-22') // Sunday
	})

	it('returns consecutive dates', () => {
		const dates = getWeekDates(2026, 12)
		for (let i = 1; i < dates.length; i++) {
			const diff = dates[i].getTime() - dates[i - 1].getTime()
			expect(diff).toBe(86400000) // 1 day in ms
		}
	})
})

describe('toDateStr', () => {
	it('formats date as YYYY-MM-DD', () => {
		expect(toDateStr(new Date(2026, 2, 18))).toBe('2026-03-18')
	})

	it('zero-pads single-digit months and days', () => {
		expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
	})
})
