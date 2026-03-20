export type Recurrence = '' | 'daily' | 'weekly' | 'monthly'

export interface Task {
	id: string
	title: string
	done: boolean
	notes: string
	recurrence: Recurrence
	recurringSourceId?: string
}

export interface RecurringTaskDefinition {
	id: string
	title: string
	notes: string
	recurrence: 'daily' | 'weekly' | 'monthly'
	startDate: string
	endDate: string
	dayOfWeek: number
	dayOfMonth: number
}

export type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export interface WeekData {
	days: Record<DayKey, Task[]>
}

export interface CustomColumn {
	id: string
	title: string
	tasks: Task[]
}

export const WEEKDAY_KEYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
export const WEEKEND_KEYS: DayKey[] = ['saturday', 'sunday']
export const DAY_LABELS: Record<DayKey, string> = {
	monday: 'Monday',
	tuesday: 'Tuesday',
	wednesday: 'Wednesday',
	thursday: 'Thursday',
	friday: 'Friday',
	saturday: 'Saturday',
	sunday: 'Sunday',
}
export const ALL_KEYS: DayKey[] = [...WEEKDAY_KEYS, ...WEEKEND_KEYS]
