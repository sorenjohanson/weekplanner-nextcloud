import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useRecurringTasks } from '../useRecurringTasks'
import { emptyWeek } from '../../utils/weekData'
import type { RecurringTaskDefinition, WeekData } from '../../types'

// Week 12 of 2026: Monday Mar 16 - Sunday Mar 22
const TEST_YEAR = 2026
const TEST_WEEK = 12

function setup(defs: RecurringTaskDefinition[] = [], weekOverride?: WeekData) {
	const currentYear = ref(TEST_YEAR)
	const currentWeek = ref(TEST_WEEK)
	const weekData = ref(weekOverride ?? emptyWeek())
	const recurringTasks = ref(defs)
	const debouncedSave = vi.fn()
	const { materializeRecurringTasks } = useRecurringTasks(
		currentYear, currentWeek, weekData, recurringTasks, debouncedSave,
	)
	return { currentYear, currentWeek, weekData, recurringTasks, debouncedSave, materializeRecurringTasks }
}

describe('useRecurringTasks', () => {
	beforeEach(() => {
		vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 8) })
	})

	describe('daily recurrence', () => {
		it('materializes a task on every day of the week', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-1',
				title: 'Standup',
				notes: '',
				recurrence: 'daily',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 0,
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const { weekData, debouncedSave, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()

			for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const) {
				expect(weekData.value.days[day]).toHaveLength(1)
				expect(weekData.value.days[day][0].title).toBe('Standup')
				expect(weekData.value.days[day][0].recurringSourceId).toBe('def-1')
			}
			expect(debouncedSave).toHaveBeenCalled()
		})

		it('does not duplicate tasks on second call', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-1',
				title: 'Standup',
				notes: '',
				recurrence: 'daily',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 0,
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const { weekData, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()
			materializeRecurringTasks()

			for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const) {
				expect(weekData.value.days[day]).toHaveLength(1)
			}
		})
	})

	describe('weekly recurrence', () => {
		it('materializes only on the specified day of week', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-2',
				title: 'Weekly review',
				notes: 'notes here',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 4, // friday
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const { weekData, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()

			expect(weekData.value.days.friday).toHaveLength(1)
			expect(weekData.value.days.friday[0].title).toBe('Weekly review')
			expect(weekData.value.days.friday[0].notes).toBe('notes here')
			// Other days should be empty
			expect(weekData.value.days.monday).toHaveLength(0)
			expect(weekData.value.days.wednesday).toHaveLength(0)
			expect(weekData.value.days.sunday).toHaveLength(0)
		})
	})

	describe('monthly recurrence', () => {
		it('materializes only on the matching day of month', () => {
			// Mar 18 is a Wednesday in week 12 of 2026
			const def: RecurringTaskDefinition = {
				id: 'def-3',
				title: 'Monthly report',
				notes: '',
				recurrence: 'monthly',
				startDate: '2026-01-18',
				endDate: '',
				dayOfWeek: 0,
				dayOfMonth: 18,
				exceptionDates: [],
			}
			const { weekData, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()

			expect(weekData.value.days.wednesday).toHaveLength(1)
			expect(weekData.value.days.wednesday[0].title).toBe('Monthly report')
			// Other days should be empty
			expect(weekData.value.days.monday).toHaveLength(0)
			expect(weekData.value.days.friday).toHaveLength(0)
		})

		it('does not materialize if no date in week matches dayOfMonth', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-4',
				title: 'Monthly report',
				notes: '',
				recurrence: 'monthly',
				startDate: '2026-01-01',
				endDate: '',
				dayOfWeek: 0,
				dayOfMonth: 5, // not in Mar 16-22
				exceptionDates: [],
			}
			const { weekData, debouncedSave, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()

			for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const) {
				expect(weekData.value.days[day]).toHaveLength(0)
			}
			expect(debouncedSave).not.toHaveBeenCalled()
		})
	})

	describe('date range filtering', () => {
		it('does not materialize before startDate', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-5',
				title: 'Future task',
				notes: '',
				recurrence: 'daily',
				startDate: '2026-03-25', // after this week
				endDate: '',
				dayOfWeek: 0,
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const { weekData, debouncedSave, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()

			for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const) {
				expect(weekData.value.days[day]).toHaveLength(0)
			}
			expect(debouncedSave).not.toHaveBeenCalled()
		})

		it('does not materialize after endDate', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-6',
				title: 'Ended task',
				notes: '',
				recurrence: 'daily',
				startDate: '2026-03-01',
				endDate: '2026-03-15', // before this week
				dayOfWeek: 0,
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const { weekData, debouncedSave, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()

			for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const) {
				expect(weekData.value.days[day]).toHaveLength(0)
			}
			expect(debouncedSave).not.toHaveBeenCalled()
		})

		it('materializes only within start/end range when partially overlapping', () => {
			// startDate in the middle of the week
			const def: RecurringTaskDefinition = {
				id: 'def-7',
				title: 'Mid-week start',
				notes: '',
				recurrence: 'daily',
				startDate: '2026-03-19', // Thursday
				endDate: '',
				dayOfWeek: 0,
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const { weekData, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()

			expect(weekData.value.days.monday).toHaveLength(0)
			expect(weekData.value.days.tuesday).toHaveLength(0)
			expect(weekData.value.days.wednesday).toHaveLength(0)
			expect(weekData.value.days.thursday).toHaveLength(1)
			expect(weekData.value.days.friday).toHaveLength(1)
			expect(weekData.value.days.saturday).toHaveLength(1)
			expect(weekData.value.days.sunday).toHaveLength(1)
		})
	})

	describe('cleanup of stale instances', () => {
		it('removes instances whose definition was deleted', () => {
			const week = emptyWeek()
			week.days.monday.push({
				id: 'inst-1',
				title: 'Ghost',
				done: false,
				notes: '',
				recurrence: 'daily',
				color: '',
				recurringSourceId: 'deleted-def',
			})
			const { weekData, debouncedSave, materializeRecurringTasks } = setup([], week)
			materializeRecurringTasks()

			expect(weekData.value.days.monday).toHaveLength(0)
			expect(debouncedSave).toHaveBeenCalled()
		})

		it('removes instances past the endDate', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-8',
				title: 'Ended',
				notes: '',
				recurrence: 'daily',
				startDate: '2026-03-01',
				endDate: '2026-03-17', // only covers Monday & Tuesday
				dayOfWeek: 0,
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const week = emptyWeek()
			// Manually place instances on all days
			for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const) {
				week.days[day].push({
					id: `inst-${day}`,
					title: 'Ended',
					done: false,
					notes: '',
					recurrence: 'daily',
					color: '',
					recurringSourceId: 'def-8',
				})
			}
			const { weekData, materializeRecurringTasks } = setup([def], week)
			materializeRecurringTasks()

			expect(weekData.value.days.monday).toHaveLength(1)
			expect(weekData.value.days.tuesday).toHaveLength(1)
			expect(weekData.value.days.wednesday).toHaveLength(0)
			expect(weekData.value.days.thursday).toHaveLength(0)
			expect(weekData.value.days.friday).toHaveLength(0)
		})

		it('removes weekly instances on wrong day after recurrence pattern change', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-9',
				title: 'Changed',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 4, // Friday
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const week = emptyWeek()
			// Instance was on Monday (old pattern)
			week.days.monday.push({
				id: 'inst-old',
				title: 'Changed',
				done: false,
				notes: '',
				recurrence: 'weekly',
				color: '',
				recurringSourceId: 'def-9',
			})
			const { weekData, materializeRecurringTasks } = setup([def], week)
			materializeRecurringTasks()

			expect(weekData.value.days.monday).toHaveLength(0) // cleaned up
			expect(weekData.value.days.friday).toHaveLength(1) // newly materialized
		})

		it('removes instances on exception dates', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-exc-1',
				title: 'Daily with exception',
				notes: '',
				recurrence: 'daily',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 0,
				dayOfMonth: 1,
				exceptionDates: ['2026-03-18'], // Wednesday
			}
			const week = emptyWeek()
			// Pre-populate an instance on the excepted day
			week.days.wednesday.push({
				id: 'inst-exc',
				title: 'Daily with exception',
				done: false,
				notes: '',
				recurrence: 'daily',
				color: '',
				recurringSourceId: 'def-exc-1',
			})
			const { weekData, materializeRecurringTasks } = setup([def], week)
			materializeRecurringTasks()

			expect(weekData.value.days.wednesday).toHaveLength(0) // cleaned up
			expect(weekData.value.days.monday).toHaveLength(1) // still materialized
			expect(weekData.value.days.friday).toHaveLength(1) // still materialized
		})
	})

	describe('exception dates', () => {
		it('skips materialization on exception dates for daily recurrence', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-exc-2',
				title: 'Daily except Wed',
				notes: '',
				recurrence: 'daily',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 0,
				dayOfMonth: 1,
				exceptionDates: ['2026-03-18'], // Wednesday
			}
			const { weekData, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()

			expect(weekData.value.days.monday).toHaveLength(1)
			expect(weekData.value.days.tuesday).toHaveLength(1)
			expect(weekData.value.days.wednesday).toHaveLength(0) // skipped
			expect(weekData.value.days.thursday).toHaveLength(1)
			expect(weekData.value.days.friday).toHaveLength(1)
			expect(weekData.value.days.saturday).toHaveLength(1)
			expect(weekData.value.days.sunday).toHaveLength(1)
		})

		it('skips materialization on exception dates for weekly recurrence', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-exc-3',
				title: 'Weekly except this Friday',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 4, // Friday
				dayOfMonth: 1,
				exceptionDates: ['2026-03-20'], // this Friday
			}
			const { weekData, debouncedSave, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()

			expect(weekData.value.days.friday).toHaveLength(0)
			expect(debouncedSave).not.toHaveBeenCalled()
		})

		it('handles missing exceptionDates gracefully (backward compat)', () => {
			// Simulate a definition from before exceptionDates was added
			const def = {
				id: 'def-exc-4',
				title: 'Old definition',
				notes: '',
				recurrence: 'daily' as const,
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 0,
				dayOfMonth: 1,
			} as RecurringTaskDefinition
			// @ts-expect-error - testing backward compat with missing field
			delete def.exceptionDates
			const { weekData, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()

			// Should still work without crashing
			expect(weekData.value.days.monday).toHaveLength(1)
			expect(weekData.value.days.friday).toHaveLength(1)
		})

		it('sets recurringOriginalDate on materialized instances', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-exc-5',
				title: 'Weekly Friday',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 4, // Friday
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const { weekData, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()

			expect(weekData.value.days.friday).toHaveLength(1)
			expect(weekData.value.days.friday[0].recurringOriginalDate).toBe('2026-03-20')
		})

		it('supports multiple exception dates', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-exc-6',
				title: 'Daily with multiple exceptions',
				notes: '',
				recurrence: 'daily',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 0,
				dayOfMonth: 1,
				exceptionDates: ['2026-03-16', '2026-03-18', '2026-03-20'], // Mon, Wed, Fri
			}
			const { weekData, materializeRecurringTasks } = setup([def])
			materializeRecurringTasks()

			expect(weekData.value.days.monday).toHaveLength(0)
			expect(weekData.value.days.tuesday).toHaveLength(1)
			expect(weekData.value.days.wednesday).toHaveLength(0)
			expect(weekData.value.days.thursday).toHaveLength(1)
			expect(weekData.value.days.friday).toHaveLength(0)
			expect(weekData.value.days.saturday).toHaveLength(1)
			expect(weekData.value.days.sunday).toHaveLength(1)
		})
	})
})
