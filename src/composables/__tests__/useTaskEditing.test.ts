import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { useTaskEditing } from '../useTaskEditing'
import { emptyWeek } from '../../utils/weekData'
import { getWeekDates } from '../../utils/dateUtils'
import type { RecurringTaskDefinition, CustomColumn, Task } from '../../types'

const TEST_YEAR = 2026
const TEST_WEEK = 12

function setup(options: {
	weekOverride?: ReturnType<typeof emptyWeek>
	recurringDefs?: RecurringTaskDefinition[]
	columns?: CustomColumn[]
} = {}) {
	const currentYear = ref(TEST_YEAR)
	const currentWeek = ref(TEST_WEEK)
	const weekData = ref(options.weekOverride ?? emptyWeek())
	const weekDates = computed(() => getWeekDates(currentYear.value, currentWeek.value))
	const recurringTasks = ref<RecurringTaskDefinition[]>(options.recurringDefs ?? [])
	const customColumns = ref<CustomColumn[]>(options.columns ?? [])
	const debouncedSave = vi.fn()
	const debouncedSaveCustomColumns = vi.fn()
	const saveWeekNow = vi.fn().mockResolvedValue(undefined)
	const saveCustomColumnsNow = vi.fn().mockResolvedValue(undefined)
	const flushSaveTimeout = vi.fn()
	const flushCustomSaveTimeout = vi.fn()
	const deleteCustomTask = vi.fn()
	const materializeRecurringTasks = vi.fn()

	const editing = useTaskEditing(
		currentYear, currentWeek, weekData, weekDates, recurringTasks,
		customColumns, debouncedSave, debouncedSaveCustomColumns,
		saveWeekNow, saveCustomColumnsNow, flushSaveTimeout,
		flushCustomSaveTimeout, deleteCustomTask, materializeRecurringTasks,
	)

	return {
		...editing,
		weekData,
		recurringTasks,
		customColumns,
		debouncedSave,
		debouncedSaveCustomColumns,
		saveWeekNow,
		saveCustomColumnsNow,
		flushSaveTimeout,
		flushCustomSaveTimeout,
		deleteCustomTask,
		materializeRecurringTasks,
	}
}

describe('useTaskEditing', () => {
	beforeEach(() => {
		vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 8) })
	})

	describe('addTask', () => {
		it('adds a task to the specified day', () => {
			const { addTask, weekData, newTasks, debouncedSave } = setup()
			newTasks.value.monday = 'New task'
			addTask('monday')

			expect(weekData.value.days.monday).toHaveLength(1)
			expect(weekData.value.days.monday[0].title).toBe('New task')
			expect(weekData.value.days.monday[0].done).toBe(false)
			expect(newTasks.value.monday).toBe('')
			expect(debouncedSave).toHaveBeenCalled()
		})

		it('does not add empty tasks', () => {
			const { addTask, weekData, newTasks, debouncedSave } = setup()
			newTasks.value.monday = '  '
			addTask('monday')

			expect(weekData.value.days.monday).toHaveLength(0)
			expect(debouncedSave).not.toHaveBeenCalled()
		})

		it('trims task title', () => {
			const { addTask, weekData, newTasks } = setup()
			newTasks.value.tuesday = '  Trimmed  '
			addTask('tuesday')

			expect(weekData.value.days.tuesday[0].title).toBe('Trimmed')
		})
	})

	describe('toggleDone', () => {
		it('toggles the done state of a task', () => {
			const week = emptyWeek()
			const task: Task = { id: 't1', title: 'Test', done: false, notes: '', recurrence: '', color: '' }
			week.days.monday.push(task)
			const { toggleDone, weekData, debouncedSave } = setup({ weekOverride: week })

			toggleDone('monday', 't1')
			expect(weekData.value.days.monday[0].done).toBe(true)

			toggleDone('monday', 't1')
			expect(weekData.value.days.monday[0].done).toBe(false)

			expect(debouncedSave).toHaveBeenCalledTimes(2)
		})
	})

	describe('openEdit / saveEdit', () => {
		it('opens edit dialog with task data', () => {
			const week = emptyWeek()
			const task: Task = { id: 't1', title: 'Hello', done: false, notes: 'some notes', recurrence: 'weekly', color: '' }
			week.days.wednesday.push(task)
			const { openEdit, editingTask, editTitle, editNotes, editRecurrence } = setup({ weekOverride: week })

			openEdit('wednesday', task)

			expect(editingTask.value).toEqual({ day: 'wednesday', taskId: 't1' })
			expect(editTitle.value).toBe('Hello')
			expect(editNotes.value).toBe('some notes')
			expect(editRecurrence.value).toBe('weekly')
		})

		it('saves edited title and notes', () => {
			const week = emptyWeek()
			const task: Task = { id: 't1', title: 'Old', done: false, notes: '', recurrence: '', color: '' }
			week.days.friday.push(task)
			const { openEdit, saveEdit, editTitle, editNotes, weekData, editingTask, debouncedSave } = setup({ weekOverride: week })

			openEdit('friday', task)
			editTitle.value = 'New title'
			editNotes.value = 'New notes'
			saveEdit()

			expect(weekData.value.days.friday[0].title).toBe('New title')
			expect(weekData.value.days.friday[0].notes).toBe('New notes')
			expect(editingTask.value).toBeNull()
			expect(debouncedSave).toHaveBeenCalled()
		})

		it('does not save empty title — keeps original', () => {
			const week = emptyWeek()
			const task: Task = { id: 't1', title: 'Original', done: false, notes: '', recurrence: '', color: '' }
			week.days.monday.push(task)
			const { openEdit, saveEdit, editTitle, weekData } = setup({ weekOverride: week })

			openEdit('monday', task)
			editTitle.value = '   '
			saveEdit()

			expect(weekData.value.days.monday[0].title).toBe('Original')
		})
	})

	describe('saveEdit with recurrence changes', () => {
		it('creates a recurring definition when setting recurrence', () => {
			const week = emptyWeek()
			const task: Task = { id: 't1', title: 'Standup', done: false, notes: '', recurrence: '', color: '' }
			week.days.wednesday.push(task)
			const {
				openEdit, saveEdit, editRecurrence, recurringTasks,
				weekData, debouncedSaveCustomColumns, materializeRecurringTasks,
			} = setup({ weekOverride: week })

			openEdit('wednesday', task)
			editRecurrence.value = 'daily'
			saveEdit()

			expect(recurringTasks.value).toHaveLength(1)
			expect(recurringTasks.value[0].title).toBe('Standup')
			expect(recurringTasks.value[0].recurrence).toBe('daily')
			expect(recurringTasks.value[0].startDate).toBe('2026-03-18')
			expect(weekData.value.days.wednesday[0].recurringSourceId).toBe(recurringTasks.value[0].id)
			expect(debouncedSaveCustomColumns).toHaveBeenCalled()
			expect(materializeRecurringTasks).toHaveBeenCalled()
		})

		it('removes recurrence by setting endDate', () => {
			const defId = 'existing-def'
			const week = emptyWeek()
			const task: Task = {
				id: 't1',
				title: 'Standup',
				done: false,
				notes: '',
				recurrence: 'daily',
				color: '',
				recurringSourceId: defId,
			}
			week.days.wednesday.push(task)
			// Also have instances on later days
			week.days.thursday.push({
				id: 't2',
				title: 'Standup',
				done: false,
				notes: '',
				recurrence: 'daily',
				color: '',
				recurringSourceId: defId,
			})
			week.days.friday.push({
				id: 't3',
				title: 'Standup',
				done: false,
				notes: '',
				recurrence: 'daily',
				color: '',
				recurringSourceId: defId,
			})
			const defs: RecurringTaskDefinition[] = [{
				id: defId,
				title: 'Standup',
				notes: '',
				recurrence: 'daily',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 2,
				dayOfMonth: 18,
			}]
			const { openEdit, saveEdit, editRecurrence, recurringTasks, weekData } = setup({
				weekOverride: week, recurringDefs: defs,
			})

			openEdit('wednesday', task)
			editRecurrence.value = ''
			saveEdit()

			expect(recurringTasks.value[0].endDate).toBe('2026-03-18')
			// Wednesday instance stays (endDate = its own date), later ones removed
			expect(weekData.value.days.thursday).toHaveLength(0)
			expect(weekData.value.days.friday).toHaveLength(0)
		})

		it('updates existing definition when changing recurrence type', () => {
			const defId = 'existing-def'
			const week = emptyWeek()
			const task: Task = {
				id: 't1',
				title: 'Standup',
				done: false,
				notes: '',
				recurrence: 'daily',
				color: '',
				recurringSourceId: defId,
			}
			week.days.wednesday.push(task)
			const defs: RecurringTaskDefinition[] = [{
				id: defId,
				title: 'Standup',
				notes: '',
				recurrence: 'daily',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 2,
				dayOfMonth: 18,
			}]
			const { openEdit, saveEdit, editRecurrence, recurringTasks, materializeRecurringTasks } = setup({
				weekOverride: week, recurringDefs: defs,
			})

			openEdit('wednesday', task)
			editRecurrence.value = 'weekly'
			saveEdit()

			expect(recurringTasks.value[0].recurrence).toBe('weekly')
			expect(recurringTasks.value[0].endDate).toBe('')
			expect(materializeRecurringTasks).toHaveBeenCalled()
		})

		it('updates definition title/notes even without recurrence change', () => {
			const defId = 'existing-def'
			const week = emptyWeek()
			const task: Task = {
				id: 't1',
				title: 'Old title',
				done: false,
				notes: 'old notes',
				recurrence: 'weekly',
				color: '',
				recurringSourceId: defId,
			}
			week.days.friday.push(task)
			const defs: RecurringTaskDefinition[] = [{
				id: defId,
				title: 'Old title',
				notes: 'old notes',
				recurrence: 'weekly',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 4,
				dayOfMonth: 20,
			}]
			const { openEdit, saveEdit, editTitle, editNotes, recurringTasks, debouncedSaveCustomColumns } = setup({
				weekOverride: week, recurringDefs: defs,
			})

			openEdit('friday', task)
			editTitle.value = 'New title'
			editNotes.value = 'new notes'
			saveEdit()

			expect(recurringTasks.value[0].title).toBe('New title')
			expect(recurringTasks.value[0].notes).toBe('new notes')
			expect(debouncedSaveCustomColumns).toHaveBeenCalled()
		})
	})

	describe('saveEdit for custom columns', () => {
		it('edits a task in a custom column', () => {
			const columns: CustomColumn[] = [{
				id: 'custom_1',
				title: 'Someday',
				tasks: [{ id: 't1', title: 'Old', done: false, notes: '', recurrence: '', color: '' }],
			}]
			const { openEdit, saveEdit, editTitle, editNotes, customColumns, debouncedSaveCustomColumns } = setup({ columns })

			openEdit('custom_1', columns[0].tasks[0])
			editTitle.value = 'Updated'
			editNotes.value = 'notes'
			saveEdit()

			expect(customColumns.value[0].tasks[0].title).toBe('Updated')
			expect(customColumns.value[0].tasks[0].notes).toBe('notes')
			expect(debouncedSaveCustomColumns).toHaveBeenCalled()
		})
	})

	describe('deleteEditingTask', () => {
		it('deletes a regular task', () => {
			const week = emptyWeek()
			const task: Task = { id: 't1', title: 'Delete me', done: false, notes: '', recurrence: '', color: '' }
			week.days.tuesday.push(task)
			const { openEdit, deleteEditingTask, weekData, editingTask, debouncedSave } = setup({ weekOverride: week })

			openEdit('tuesday', task)
			deleteEditingTask()

			expect(weekData.value.days.tuesday).toHaveLength(0)
			expect(editingTask.value).toBeNull()
			expect(debouncedSave).toHaveBeenCalled()
		})

		it('deletes a recurring task and sets endDate on definition', () => {
			const defId = 'def-1'
			const week = emptyWeek()
			const task: Task = {
				id: 't1',
				title: 'Recurring',
				done: false,
				notes: '',
				recurrence: 'daily',
				color: '',
				recurringSourceId: defId,
			}
			week.days.wednesday.push(task)
			week.days.thursday.push({
				id: 't2',
				title: 'Recurring',
				done: false,
				notes: '',
				recurrence: 'daily',
				color: '',
				recurringSourceId: defId,
			})
			week.days.friday.push({
				id: 't3',
				title: 'Recurring',
				done: false,
				notes: '',
				recurrence: 'daily',
				color: '',
				recurringSourceId: defId,
			})
			// Monday and Tuesday have instances too
			week.days.monday.push({
				id: 't4',
				title: 'Recurring',
				done: false,
				notes: '',
				recurrence: 'daily',
				color: '',
				recurringSourceId: defId,
			})
			const defs: RecurringTaskDefinition[] = [{
				id: defId,
				title: 'Recurring',
				notes: '',
				recurrence: 'daily',
				startDate: '2026-03-01',
				endDate: '',
				dayOfWeek: 0,
				dayOfMonth: 1,
			}]
			const {
				openEdit, deleteEditingTask, weekData, recurringTasks,
				flushSaveTimeout, flushCustomSaveTimeout, saveWeekNow, saveCustomColumnsNow,
			} = setup({ weekOverride: week, recurringDefs: defs })

			openEdit('wednesday', task)
			deleteEditingTask()

			// endDate set to day before wednesday (tuesday = 2026-03-17)
			expect(recurringTasks.value[0].endDate).toBe('2026-03-17')
			// Wednesday and later removed
			expect(weekData.value.days.wednesday).toHaveLength(0)
			expect(weekData.value.days.thursday).toHaveLength(0)
			expect(weekData.value.days.friday).toHaveLength(0)
			// Monday stays (before the deletion date)
			expect(weekData.value.days.monday).toHaveLength(1)
			// Immediate save triggered
			expect(flushSaveTimeout).toHaveBeenCalled()
			expect(flushCustomSaveTimeout).toHaveBeenCalled()
			expect(saveWeekNow).toHaveBeenCalled()
			expect(saveCustomColumnsNow).toHaveBeenCalled()
		})

		it('deletes a custom column task via deleteCustomTask', () => {
			const columns: CustomColumn[] = [{
				id: 'custom_1',
				title: 'Someday',
				tasks: [{ id: 't1', title: 'Custom task', done: false, notes: '', recurrence: '', color: '' }],
			}]
			const { openEdit, deleteEditingTask, deleteCustomTask, editingTask } = setup({ columns })

			openEdit('custom_1', columns[0].tasks[0])
			deleteEditingTask()

			expect(deleteCustomTask).toHaveBeenCalledWith('custom_1', 't1')
			expect(editingTask.value).toBeNull()
		})
	})
})
