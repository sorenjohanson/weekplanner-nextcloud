import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import axios from '@nextcloud/axios'
import { useCustomColumns } from '../useCustomColumns'
import type { RecurringTaskDefinition } from '../../types'

vi.mock('@nextcloud/axios', () => ({
	default: {
		get: vi.fn(),
		put: vi.fn(),
	},
}))

vi.mock('@nextcloud/router', () => ({
	generateUrl: (url: string) => url,
}))

function setup(defs: RecurringTaskDefinition[] = []) {
	const recurringTasks = ref<RecurringTaskDefinition[]>(defs)
	const columns = useCustomColumns(recurringTasks)
	return { ...columns, recurringTasks }
}

describe('useCustomColumns', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 8) })
	})

	it('initializes with 3 default columns', () => {
		const { customColumns } = setup()
		expect(customColumns.value).toHaveLength(3)
		expect(customColumns.value[0].title).toBe('Someday')
		expect(customColumns.value[1].title).toBe('')
		expect(customColumns.value[2].title).toBe('')
	})

	describe('addCustomTask', () => {
		it('adds a task to the specified column', () => {
			const { addCustomTask, customColumns, newCustomTasks } = setup()
			newCustomTasks.value.custom_1 = 'New task'
			addCustomTask('custom_1')

			expect(customColumns.value[0].tasks).toHaveLength(1)
			expect(customColumns.value[0].tasks[0].title).toBe('New task')
			expect(customColumns.value[0].tasks[0].done).toBe(false)
			expect(newCustomTasks.value.custom_1).toBe('')
		})

		it('does not add empty tasks', () => {
			const { addCustomTask, customColumns, newCustomTasks } = setup()
			newCustomTasks.value.custom_1 = '   '
			addCustomTask('custom_1')

			expect(customColumns.value[0].tasks).toHaveLength(0)
		})

		it('does nothing for unknown column', () => {
			const { addCustomTask, customColumns, newCustomTasks } = setup()
			newCustomTasks.value.custom_99 = 'Test'
			addCustomTask('custom_99')

			for (const col of customColumns.value) {
				expect(col.tasks).toHaveLength(0)
			}
		})
	})

	describe('toggleCustomDone', () => {
		it('toggles task done state', () => {
			const { addCustomTask, toggleCustomDone, customColumns, newCustomTasks } = setup()
			newCustomTasks.value.custom_1 = 'Task'
			addCustomTask('custom_1')
			const taskId = customColumns.value[0].tasks[0].id

			toggleCustomDone('custom_1', taskId)
			expect(customColumns.value[0].tasks[0].done).toBe(true)

			toggleCustomDone('custom_1', taskId)
			expect(customColumns.value[0].tasks[0].done).toBe(false)
		})
	})

	describe('deleteCustomTask', () => {
		it('removes the task from the column', () => {
			const { addCustomTask, deleteCustomTask, customColumns, newCustomTasks } = setup()
			newCustomTasks.value.custom_1 = 'Task'
			addCustomTask('custom_1')
			const taskId = customColumns.value[0].tasks[0].id

			deleteCustomTask('custom_1', taskId)
			expect(customColumns.value[0].tasks).toHaveLength(0)
		})
	})

	describe('updateColumnTitle', () => {
		it('updates the title of a column', () => {
			const { updateColumnTitle, customColumns } = setup()
			updateColumnTitle('custom_2', 'Backlog')
			expect(customColumns.value[1].title).toBe('Backlog')
		})

		it('does nothing for unknown column', () => {
			const { updateColumnTitle, customColumns } = setup()
			updateColumnTitle('custom_99', 'Backlog')
			expect(customColumns.value.map((c) => c.title)).toEqual(['Someday', '', ''])
		})
	})

	describe('loadCustomColumns', () => {
		it('loads columns and recurring tasks from API', async () => {
			const { loadCustomColumns, customColumns, recurringTasks } = setup()
			vi.mocked(axios.get).mockResolvedValueOnce({
				data: {
					updatedAt: 12345,
					columns: [
						{ id: 'custom_1', title: 'Loaded', tasks: [{ id: 't1', title: 'A', done: false }] },
					],
					recurringTasks: [
						{ id: 'd1', title: 'Daily', notes: '', recurrence: 'daily', startDate: '2026-01-01', endDate: '', dayOfWeek: 0, dayOfMonth: 1 },
					],
				},
			})

			await loadCustomColumns()

			expect(customColumns.value).toHaveLength(1)
			expect(customColumns.value[0].title).toBe('Loaded')
			expect(customColumns.value[0].tasks[0].notes).toBe('')
			expect(recurringTasks.value).toHaveLength(1)
			expect(recurringTasks.value[0].exceptionDates).toEqual([])
		})

		it('keeps defaults on network error', async () => {
			const { loadCustomColumns, customColumns } = setup()
			vi.mocked(axios.get).mockRejectedValueOnce(new Error('Network error'))

			await loadCustomColumns()

			expect(customColumns.value).toHaveLength(3)
			expect(customColumns.value[0].title).toBe('Someday')
		})
	})

	describe('applyCustomColumnsData', () => {
		it('applies valid column data', () => {
			const { applyCustomColumnsData, customColumns } = setup()
			applyCustomColumnsData({
				columns: [
					{ id: 'custom_1', title: 'Applied', tasks: [{ id: 't1', title: 'Task', done: false }] },
				],
			})

			expect(customColumns.value).toHaveLength(1)
			expect(customColumns.value[0].title).toBe('Applied')
			expect(customColumns.value[0].tasks[0].notes).toBe('')
		})

		it('ignores invalid data', () => {
			const { applyCustomColumnsData, customColumns } = setup()
			applyCustomColumnsData(null)
			expect(customColumns.value).toHaveLength(3)

			applyCustomColumnsData('invalid')
			expect(customColumns.value).toHaveLength(3)

			applyCustomColumnsData({ noColumns: true })
			expect(customColumns.value).toHaveLength(3)
		})

		it('applies recurring tasks if present', () => {
			const { applyCustomColumnsData, recurringTasks } = setup()
			applyCustomColumnsData({
				columns: [],
				recurringTasks: [
					{ id: 'd1', title: 'Daily', notes: '', recurrence: 'daily', startDate: '2026-01-01', endDate: '', dayOfWeek: 0, dayOfMonth: 1 },
				],
			})

			expect(recurringTasks.value).toHaveLength(1)
			expect(recurringTasks.value[0].exceptionDates).toEqual([])
		})
	})
})
