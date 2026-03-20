import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWeekNavigation } from '../useWeekNavigation'

describe('useWeekNavigation', () => {
	beforeEach(() => {
		// Fix "today" to Wednesday 2026-03-18, which is ISO week 12
		vi.useFakeTimers()
		vi.setSystemTime(new Date(2026, 2, 18))
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('initializes to the current ISO week', () => {
		const { currentYear, currentWeek } = useWeekNavigation()
		expect(currentYear.value).toBe(2026)
		expect(currentWeek.value).toBe(12)
	})

	it('computes 7 weekDates starting on Monday', () => {
		const { weekDates } = useWeekNavigation()
		const dates = weekDates.value
		expect(dates).toHaveLength(7)
		// Monday 2026-03-16
		expect(dates[0].getDay()).toBe(1) // Monday
		expect(dates[0].getDate()).toBe(16)
		// Sunday 2026-03-22
		expect(dates[6].getDay()).toBe(0) // Sunday
		expect(dates[6].getDate()).toBe(22)
	})

	it('formats weekLabel correctly', () => {
		const { weekLabel } = useWeekNavigation()
		expect(weekLabel.value).toMatch(/Week 12/)
		expect(weekLabel.value).toContain('Mar 16')
		expect(weekLabel.value).toContain('Mar 22')
		expect(weekLabel.value).toContain('2026')
	})

	it('dayIndex returns correct indices', () => {
		const { dayIndex } = useWeekNavigation()
		expect(dayIndex('monday')).toBe(0)
		expect(dayIndex('wednesday')).toBe(2)
		expect(dayIndex('friday')).toBe(4)
		expect(dayIndex('sunday')).toBe(6)
	})

	it('isToday returns true for the correct day', () => {
		const { isToday } = useWeekNavigation()
		// 2026-03-18 is a Wednesday
		expect(isToday('wednesday')).toBe(true)
		expect(isToday('monday')).toBe(false)
		expect(isToday('friday')).toBe(false)
	})

	it('formatDate returns short date string', () => {
		const { formatDate } = useWeekNavigation()
		expect(formatDate('monday')).toBe('Mar 16')
		expect(formatDate('sunday')).toBe('Mar 22')
	})

	it('prevWeek goes back one week', () => {
		const { currentYear, currentWeek, prevWeek } = useWeekNavigation()
		prevWeek()
		expect(currentYear.value).toBe(2026)
		expect(currentWeek.value).toBe(11)
	})

	it('nextWeek advances one week', () => {
		const { currentYear, currentWeek, nextWeek } = useWeekNavigation()
		nextWeek()
		expect(currentYear.value).toBe(2026)
		expect(currentWeek.value).toBe(13)
	})

	it('prevWeek crosses year boundary', () => {
		const { currentYear, currentWeek, prevWeek } = useWeekNavigation()
		// Go to week 1 of 2026
		currentYear.value = 2026
		currentWeek.value = 1
		prevWeek()
		expect(currentYear.value).toBe(2025)
		expect(currentWeek.value).toBe(52)
	})

	it('goToday returns to the current week', () => {
		const { currentYear, currentWeek, nextWeek, goToday } = useWeekNavigation()
		nextWeek()
		nextWeek()
		expect(currentWeek.value).toBe(14)
		goToday()
		expect(currentYear.value).toBe(2026)
		expect(currentWeek.value).toBe(12)
	})

	it('weekDates updates reactively when week changes', () => {
		const { currentYear, currentWeek, weekDates } = useWeekNavigation()
		currentYear.value = 2026
		currentWeek.value = 1
		const dates = weekDates.value
		// Week 1 of 2026: Monday Dec 29 2025
		expect(dates[0].getFullYear()).toBe(2025)
		expect(dates[0].getMonth()).toBe(11) // December
		expect(dates[0].getDate()).toBe(29)
	})
})
