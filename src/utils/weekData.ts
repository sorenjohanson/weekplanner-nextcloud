import type { Task, WeekData } from '../types'
import { ALL_KEYS } from '../types'

export function emptyWeek(): WeekData {
	return {
		days: {
			monday: [],
			tuesday: [],
			wednesday: [],
			thursday: [],
			friday: [],
			saturday: [],
			sunday: [],
		},
	}
}

export function normalizeWeekData(data: unknown): WeekData {
	const result = emptyWeek()
	if (data && typeof data === 'object' && 'days' in data) {
		const days = (data as { days: Record<string, unknown> }).days
		if (days && typeof days === 'object') {
			for (const key of ALL_KEYS) {
				if (Array.isArray(days[key])) {
					result.days[key] = (days[key] as Task[]).map((t) => {
						const task: Task = {
							...t,
							notes: t.notes || '',
							recurrence: t.recurrence || '',
							color: t.color || '',
						}
						if (t.recurringSourceId) {
							task.recurringSourceId = t.recurringSourceId
						}
						return task
					})
				}
			}
		}
	}
	return result
}
