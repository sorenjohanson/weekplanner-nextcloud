import { describe, it, expect } from 'vitest'
import { emptyWeek, normalizeTask, normalizeWeekData } from '../weekData'

describe('emptyWeek', () => {
	it('returns a WeekData with empty arrays for all 7 days', () => {
		const week = emptyWeek()
		const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
		for (const day of days) {
			expect(week.days[day]).toEqual([])
		}
	})

	it('returns a fresh object each time', () => {
		const a = emptyWeek()
		const b = emptyWeek()
		expect(a).not.toBe(b)
		a.days.monday.push({ id: '1', title: 'test', done: false, notes: '', recurrence: '', color: '' })
		expect(b.days.monday).toHaveLength(0)
	})
})

describe('normalizeTask', () => {
	it('fills in missing optional fields with defaults', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const task = normalizeTask({ id: '1', title: 'Test', done: false } as any)
		expect(task.notes).toBe('')
		expect(task.recurrence).toBe('')
		expect(task.color).toBe('')
		expect(task.recurringSourceId).toBeUndefined()
		expect(task.recurringOriginalDate).toBeUndefined()
	})

	it('preserves existing field values', () => {
		const task = normalizeTask({
			id: '1',
			title: 'Test',
			done: true,
			notes: 'some notes',
			recurrence: 'weekly',
			color: 'red',
			recurringSourceId: 'def-1',
			recurringOriginalDate: '2026-03-18',
		})
		expect(task.notes).toBe('some notes')
		expect(task.recurrence).toBe('weekly')
		expect(task.color).toBe('red')
		expect(task.recurringSourceId).toBe('def-1')
		expect(task.recurringOriginalDate).toBe('2026-03-18')
	})
})

describe('normalizeWeekData', () => {
	it('returns empty week for null input', () => {
		const result = normalizeWeekData(null)
		expect(result.days.monday).toEqual([])
	})

	it('returns empty week for non-object input', () => {
		const result = normalizeWeekData('invalid')
		expect(result.days.monday).toEqual([])
	})

	it('normalizes valid week data', () => {
		const input = {
			days: {
				monday: [{ id: '1', title: 'Task', done: false }],
				tuesday: [],
				wednesday: [],
				thursday: [],
				friday: [],
				saturday: [],
				sunday: [],
			},
		}
		const result = normalizeWeekData(input)
		expect(result.days.monday).toHaveLength(1)
		expect(result.days.monday[0].notes).toBe('')
		expect(result.days.monday[0].recurrence).toBe('')
		expect(result.days.monday[0].color).toBe('')
	})

	it('ignores unknown day keys', () => {
		const input = {
			days: {
				monday: [],
				fakeday: [{ id: '1', title: 'Ghost', done: false }],
			},
		}
		const result = normalizeWeekData(input)
		expect(result.days.monday).toEqual([])
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((result.days as any).fakeday).toBeUndefined()
	})
})
