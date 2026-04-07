export type Recurrence = '' | 'daily' | 'weekly' | 'monthly'

export type TaskColor = '' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'

export const TASK_COLORS: { value: TaskColor; label: string; hex: string }[] = [
	{ value: 'red', label: 'Red', hex: '#FFD4D4' },
	{ value: 'orange', label: 'Orange', hex: '#FFE4C8' },
	{ value: 'yellow', label: 'Yellow', hex: '#FFF3C4' },
	{ value: 'green', label: 'Green', hex: '#D4F5D4' },
	{ value: 'blue', label: 'Blue', hex: '#D4E8FF' },
	{ value: 'purple', label: 'Purple', hex: '#E8D4FF' },
]

export interface Task {
	id: string
	title: string
	done: boolean
	notes: string
	recurrence: Recurrence
	color: TaskColor
	recurringSourceId?: string
	recurringOriginalDate?: string
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
	exceptionDates: string[]
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
