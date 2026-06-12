import type { RecurringTaskDefinition, Task, WeekData } from '../../types'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { emptyWeek } from '../../utils/weekData'
import { useCustomColumns } from '../useCustomColumns'
import { useDragHandler } from '../useDragHandler'
import { useRecurringTasks } from '../useRecurringTasks'

vi.mock('@nextcloud/axios', () => ({
	default: {
		get: vi.fn(),
		put: vi.fn(),
	},
}))

vi.mock('@nextcloud/router', () => ({
	generateUrl: (url: string) => url,
}))

// Week 12 of 2026: Mon Mar 16 – Sun Mar 22
const TEST_YEAR = 2026
const TEST_WEEK = 12

function makeTask(title: string): Task {
	return {
		id: 'task-' + Math.random().toString(36).slice(2, 8),
		title,
		done: false,
		notes: '',
		recurrence: '',
		color: '',
	}
}

function setup(weekOverride?: WeekData) {
	const currentYear = ref(TEST_YEAR)
	const currentWeek = ref(TEST_WEEK)
	const weekData = ref<WeekData>(weekOverride ?? emptyWeek())
	const recurringTasks = ref<RecurringTaskDefinition[]>([])
	const debouncedSave = vi.fn()

	const columns = useCustomColumns(recurringTasks)
	// Spy on the real debounced save so we can assert it gets triggered
	const debouncedSaveCustomColumnsSpy = vi.spyOn(columns, 'debouncedSaveCustomColumns')

	const { handleDragChange } = useRecurringTasks(
		currentYear,
		currentWeek,
		weekData,
		recurringTasks,
		debouncedSave,
		columns.customColumns,
	)

	const { onDragChange } = useDragHandler({
		handleDragChange,
		debouncedSave,
		debouncedSaveCustomColumns: columns.debouncedSaveCustomColumns,
	})

	return {
		weekData,
		recurringTasks,
		customColumns: columns.customColumns,
		debouncedSave,
		debouncedSaveCustomColumnsSpy,
		onDragChange,
	}
}

describe('useDragHandler', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 8) })
	})

	describe('persistence on drag (regression: duplicate/delete on custom-column moves)', () => {
		it('saves custom columns when a regular task is dragged from day column to custom column', () => {
			// Simulate the post-drag DOM state: task already moved by vuedraggable
			const week = emptyWeek()
			const { customColumns, debouncedSave, debouncedSaveCustomColumnsSpy, onDragChange } = setup(week)
			const task = makeTask('Buy groceries')
			// vuedraggable has already updated both lists by the time @change fires
			customColumns.value[0].tasks.push(task)

			onDragChange()

			expect(debouncedSave).toHaveBeenCalled()
			// Bug: custom columns must be saved here, otherwise on reload the
			// task would disappear (server has stale empty custom column).
			expect(debouncedSaveCustomColumnsSpy).toHaveBeenCalled()
		})

		it('saves custom columns when a regular task is dragged from custom column to day column', () => {
			const week = emptyWeek()
			const task = makeTask('Mow the lawn')
			week.days.monday.push(task)
			const { debouncedSave, debouncedSaveCustomColumnsSpy, onDragChange } = setup(week)

			onDragChange()

			expect(debouncedSave).toHaveBeenCalled()
			// Bug: without saving custom columns, server keeps the stale copy
			// and the task duplicates on reload (one in week, one in custom).
			expect(debouncedSaveCustomColumnsSpy).toHaveBeenCalled()
		})

		it('saves custom columns when a regular task is dragged between two custom columns', () => {
			const { customColumns, debouncedSaveCustomColumnsSpy, onDragChange } = setup()
			const task = makeTask('Read book')
			customColumns.value[1].tasks.push(task)

			onDragChange()

			// Bug: without this save, the move reverts on reload because the
			// week save is the only thing scheduled and it doesn't carry custom
			// column state.
			expect(debouncedSaveCustomColumnsSpy).toHaveBeenCalled()
		})

		it('saves custom columns even when no recurring definitions changed', () => {
			// This is the core bug: previously the custom-columns save was
			// gated on `definitionsChanged`, which is only true when a recurring
			// task was moved. Regular tasks never triggered it.
			const { debouncedSave, debouncedSaveCustomColumnsSpy, recurringTasks, onDragChange } = setup()
			expect(recurringTasks.value).toHaveLength(0)

			onDragChange()

			expect(debouncedSave).toHaveBeenCalled()
			expect(debouncedSaveCustomColumnsSpy).toHaveBeenCalled()
		})
	})

	describe('recurring task interaction (existing behaviour still works)', () => {
		it('saves both when a recurring task is dragged into a custom column', () => {
			const def: RecurringTaskDefinition = {
				id: 'def-1',
				title: 'Weekly review',
				notes: '',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 4, // Friday
				dayOfMonth: 1,
				exceptionDates: [],
			}
			const week = emptyWeek()
			const { customColumns, recurringTasks, debouncedSave, debouncedSaveCustomColumnsSpy, onDragChange } = setup(week)
			recurringTasks.value.push(def)
			// User dragged the materialized recurring instance from Friday into a custom column
			customColumns.value[0].tasks.push({
				id: 'inst-1',
				title: 'Weekly review',
				done: false,
				notes: '',
				recurrence: 'weekly',
				color: '',
				recurringSourceId: 'def-1',
				recurringOriginalDate: '2026-03-20',
			})

			onDragChange()

			// handleDragChange records the exception so it doesn't re-materialize
			expect(recurringTasks.value[0].exceptionDates).toContain('2026-03-20')
			expect(debouncedSave).toHaveBeenCalled()
			expect(debouncedSaveCustomColumnsSpy).toHaveBeenCalled()
		})
	})
})
