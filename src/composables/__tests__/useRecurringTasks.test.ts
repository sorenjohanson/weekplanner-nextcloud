import type { RecurringTaskDefinition, WeekData } from '../../types'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { getViewDates } from '../../utils/dateUtils'
import { emptyWeek } from '../../utils/weekData'
import { useRecurringTasks } from '../useRecurringTasks'

// Week 12 of 2026: Monday Mar 16 - Sunday Mar 22
const VIEW_START = new Date(2026, 2, 16)

function setup(defs: RecurringTaskDefinition[] = [], weekOverride?: WeekData) {
	const viewStart = ref(new Date(VIEW_START))
	const viewDates = computed(() => getViewDates(viewStart.value))
	const weekData = ref(weekOverride ?? emptyWeek())
	const recurringTasks = ref(defs)
	const debouncedSave = vi.fn()
	const { materializeRecurringTasks, handleDragChange, handleDragChangeAll } = useRecurringTasks(
		viewDates,
		weekData,
		recurringTasks,
		debouncedSave,
	)
	return { viewStart, weekData, recurringTasks, debouncedSave, materializeRecurringTasks, handleDragChange, handleDragChangeAll }
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

		it('does not clean up instances intentionally moved to a different day', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-moved-1',
				title: 'Weekly Friday',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 4, // Friday
				dayOfMonth: 1,
				exceptionDates: ['2026-03-20'], // Friday excepted (task was moved)
			}
			const week = emptyWeek()
			// Instance was moved from Friday to Wednesday by the user
			week.days.wednesday.push({
				id: 'inst-moved',
				title: 'Weekly Friday',
				done: false,
				notes: '',
				recurrence: 'weekly',
				color: '',
				recurringSourceId: 'def-moved-1',
				recurringOriginalDate: '2026-03-20', // originally Friday
			})
			const { weekData, materializeRecurringTasks } = setup([def], week)
			materializeRecurringTasks()

			// The moved instance should be kept on Wednesday
			expect(weekData.value.days.wednesday).toHaveLength(1)
			expect(weekData.value.days.wednesday[0].id).toBe('inst-moved')
			// Friday should remain empty (exception date)
			expect(weekData.value.days.friday).toHaveLength(0)
		})

		it('keeps recurringOriginalDate when a recurring task is dragged to another day', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-drag-1',
				title: 'Weekly Tuesday',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 1, // Tuesday
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const { weekData, recurringTasks, materializeRecurringTasks, handleDragChange } = setup([def])
			materializeRecurringTasks()

			expect(weekData.value.days.tuesday).toHaveLength(1)
			const task = weekData.value.days.tuesday[0]
			expect(task.recurringOriginalDate).toBe('2026-03-17')

			// vuedraggable has already moved the instance before handleDragChange runs
			weekData.value.days.wednesday.push(task)
			weekData.value.days.tuesday = []

			handleDragChange()

			// Exception targets the original Tuesday, not the new Wednesday
			expect(recurringTasks.value[0].exceptionDates).toContain('2026-03-17')
			// The moved instance keeps its original date so materialization can
			// tell it apart from a stale pattern-mismatched instance.
			expect(weekData.value.days.wednesday[0].recurringOriginalDate).toBe('2026-03-17')

			// Re-materializing (e.g. navigating away and back) must not drop it
			materializeRecurringTasks()
			expect(weekData.value.days.wednesday).toHaveLength(1)
		})

		it('recovers the home date when a freshly-created recurring instance is dragged', () => {
			// A task that was just set to repeat has a recurringSourceId but no
			// recurringOriginalDate yet (the field is only stamped on newly
			// materialized instances). Dragging it must not backfill the wrong
			// (post-move) date, or the instance is removed on the next load.
			const def: RecurringTaskDefinition = {
				id: 'def-drag-2',
				title: 'Weekly Tuesday',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 1, // Tuesday
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const week = emptyWeek()
			week.days.tuesday.push({
				id: 'inst-fresh',
				title: 'Weekly Tuesday',
				done: false,
				notes: '',
				recurrence: 'weekly',
				color: '',
				recurringSourceId: 'def-drag-2',
			})
			const { weekData, recurringTasks, materializeRecurringTasks, handleDragChange } = setup([def], week)

			// vuedraggable has already moved the instance before handleDragChange runs
			const task = weekData.value.days.tuesday[0]
			weekData.value.days.wednesday.push(task)
			weekData.value.days.tuesday = []

			handleDragChange()

			expect(weekData.value.days.wednesday[0].recurringOriginalDate).toBe('2026-03-17')
			expect(recurringTasks.value[0].exceptionDates).toContain('2026-03-17')

			materializeRecurringTasks()
			expect(weekData.value.days.wednesday).toHaveLength(1)
			expect(weekData.value.days.tuesday).toHaveLength(0)
		})

		it('re-anchors the definition when a recurring task is dragged with "all" scope', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-drag-all',
				title: 'Weekly Tuesday',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 1, // Tuesday
				dayOfMonth: 1,
				exceptionDates: ['2026-03-10'],
			}
			const { weekData, recurringTasks, materializeRecurringTasks, handleDragChangeAll } = setup([def])
			materializeRecurringTasks()

			// vuedraggable already moved the instance before the handler runs
			const task = weekData.value.days.tuesday[0]
			weekData.value.days.wednesday.push(task)
			weekData.value.days.tuesday = []

			handleDragChangeAll(task, 'wednesday')

			expect(recurringTasks.value[0].dayOfWeek).toBe(2) // Wednesday
			expect(recurringTasks.value[0].startDate).toBe('2026-03-18')
			// Stale exception before the new anchor is pruned
			expect(recurringTasks.value[0].exceptionDates).toEqual([])
			expect(task.recurringOriginalDate).toBe('2026-03-18')

			materializeRecurringTasks()
			expect(weekData.value.days.wednesday).toHaveLength(1)
			expect(weekData.value.days.tuesday).toHaveLength(0)
		})

		it('survives being dragged a second time', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-drag-3',
				title: 'Weekly Tuesday',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 1, // Tuesday
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const { weekData, recurringTasks, materializeRecurringTasks, handleDragChange } = setup([def])
			materializeRecurringTasks()
			expect(weekData.value.days.tuesday).toHaveLength(1)

			// First drag: Tuesday -> Wednesday
			const first = weekData.value.days.tuesday[0]
			weekData.value.days.wednesday.push(first)
			weekData.value.days.tuesday = []
			handleDragChange()
			expect(recurringTasks.value[0].exceptionDates).toContain('2026-03-17')

			// Navigate away and back (re-materialize the persisted state)
			materializeRecurringTasks()
			expect(weekData.value.days.wednesday).toHaveLength(1)

			// Second drag: Wednesday -> Thursday
			const second = weekData.value.days.wednesday[0]
			weekData.value.days.thursday.push(second)
			weekData.value.days.wednesday = []
			handleDragChange()

			// The original home date and its exception survive the second move
			expect(weekData.value.days.thursday[0].recurringOriginalDate).toBe('2026-03-17')
			expect(recurringTasks.value[0].exceptionDates).toContain('2026-03-17')

			materializeRecurringTasks()
			expect(weekData.value.days.thursday).toHaveLength(1)
			expect(weekData.value.days.tuesday).toHaveLength(0)
		})

		it('survives being dragged back to its original date in the same week', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-drag-back',
				title: 'Weekly Wednesday',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 2, // Wednesday
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const { weekData, recurringTasks, materializeRecurringTasks, handleDragChange } = setup([def])
			materializeRecurringTasks()
			expect(weekData.value.days.wednesday).toHaveLength(1)

			// First drag: Wednesday -> Thursday. This records an exception for
			// the recurring instance's Wednesday home date.
			const first = weekData.value.days.wednesday[0]
			weekData.value.days.thursday.push(first)
			weekData.value.days.wednesday = []
			handleDragChange()
			expect(recurringTasks.value[0].exceptionDates).toContain('2026-03-18')
			expect(weekData.value.days.thursday[0].recurringOriginalDate).toBe('2026-03-18')

			// Second drag: Thursday -> Wednesday in the same week. The exception
			// is now stale and must be removed, or the instance is deleted on the
			// next materialization pass.
			const second = weekData.value.days.thursday[0]
			weekData.value.days.wednesday.push(second)
			weekData.value.days.thursday = []
			handleDragChange()

			expect(recurringTasks.value[0].exceptionDates).not.toContain('2026-03-18')
			materializeRecurringTasks()
			expect(weekData.value.days.wednesday).toHaveLength(1)
			expect(weekData.value.days.wednesday[0].id).toBe(first.id)
			expect(weekData.value.days.thursday).toHaveLength(0)
		})

		it('removes an anchor-date exception when dragged back with "all" scope', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-drag-back-all',
				title: 'Weekly Wednesday',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 2, // Wednesday
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const { weekData, recurringTasks, materializeRecurringTasks, handleDragChange, handleDragChangeAll } = setup([def])
			materializeRecurringTasks()

			// First drag: Wednesday -> Thursday as a single occurrence, creating
			// an exception on the original Wednesday.
			const task = weekData.value.days.wednesday[0]
			weekData.value.days.thursday.push(task)
			weekData.value.days.wednesday = []
			handleDragChange()
			expect(recurringTasks.value[0].exceptionDates).toContain('2026-03-18')

			// Second drag: Thursday -> Wednesday as all occurrences. Re-anchoring
			// to the excepted date must clear that exception, otherwise the
			// materialization pass deletes the task immediately.
			weekData.value.days.wednesday.push(task)
			weekData.value.days.thursday = []
			handleDragChangeAll(task, 'wednesday')

			expect(recurringTasks.value[0].startDate).toBe('2026-03-18')
			expect(recurringTasks.value[0].dayOfWeek).toBe(2)
			expect(recurringTasks.value[0].exceptionDates).not.toContain('2026-03-18')

			materializeRecurringTasks()
			expect(weekData.value.days.wednesday).toHaveLength(1)
			expect(weekData.value.days.wednesday[0].id).toBe(task.id)
			expect(weekData.value.days.thursday).toHaveLength(0)
		})

		it('dedupes when a moved instance is dragged back onto an already materialized original day', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-drag-back-duplicate',
				title: 'Weekly Wednesday',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 2, // Wednesday
				dayOfMonth: 1,
				exceptionDates: ['2026-03-18'],
			}
			const week = emptyWeek()
			week.days.wednesday.push({
				id: 'materialized-original',
				title: 'Weekly Wednesday',
				done: false,
				notes: '',
				recurrence: 'weekly',
				color: '',
				recurringSourceId: 'def-drag-back-duplicate',
				recurringOriginalDate: '2026-03-18',
			})
			week.days.thursday.push({
				id: 'moved-instance',
				title: 'Weekly Wednesday',
				done: true,
				notes: 'keep this one',
				recurrence: 'weekly',
				color: '',
				recurringSourceId: 'def-drag-back-duplicate',
				recurringOriginalDate: '2026-03-18',
			})
			const { weekData, recurringTasks, materializeRecurringTasks, handleDragChange } = setup([def], week)

			const moved = weekData.value.days.thursday[0]
			weekData.value.days.wednesday.push(moved)
			weekData.value.days.thursday = []
			handleDragChange()

			expect(recurringTasks.value[0].exceptionDates).not.toContain('2026-03-18')
			expect(weekData.value.days.wednesday).toHaveLength(1)
			expect(weekData.value.days.wednesday[0].id).toBe('moved-instance')
			expect(weekData.value.days.wednesday[0].done).toBe(true)

			materializeRecurringTasks()
			expect(weekData.value.days.wednesday).toHaveLength(1)
			expect(weekData.value.days.wednesday[0].id).toBe('moved-instance')
		})

		it('still cleans up pattern-mismatched instances that were NOT moved', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-pattern',
				title: 'Changed pattern',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 4, // Friday (changed from Monday)
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const week = emptyWeek()
			// Instance on Monday without recurringOriginalDate (old pattern, not moved)
			week.days.monday.push({
				id: 'inst-stale',
				title: 'Changed pattern',
				done: false,
				notes: '',
				recurrence: 'weekly',
				color: '',
				recurringSourceId: 'def-pattern',
			})
			const { weekData, materializeRecurringTasks } = setup([def], week)
			materializeRecurringTasks()

			// Stale instance should be cleaned up
			expect(weekData.value.days.monday).toHaveLength(0)
			// New instance should appear on Friday
			expect(weekData.value.days.friday).toHaveLength(1)
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
