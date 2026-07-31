export type Recurrence = '' | 'daily' | 'weekly' | 'monthly'

export type RecurringDeleteMode = 'this' | 'this-and-future' | 'all'

export type TaskColor = '' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'

export const TASK_COLORS: { value: TaskColor, label: string, hex: string }[] = [
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
	/** 0=Monday..6=Sunday — canonical day of week, independent of the user's firstDayOfWeek display preference. */
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

// Canonical Monday-first key list. Used for iteration where order is irrelevant
// (e.g. clearing all days, normalising backend payloads).
export const ALL_KEYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export const DAY_LABELS: Record<DayKey, string> = {
	monday: 'Monday',
	tuesday: 'Tuesday',
	wednesday: 'Wednesday',
	thursday: 'Thursday',
	friday: 'Friday',
	saturday: 'Saturday',
	sunday: 'Sunday',
}

// User's preferred first day of week as 0=Sunday..6=Saturday (Nextcloud convention).
// Mutable module singleton: set once from initial state at app boot, read by
// composables thereafter. A reload picks up changes — there is no reactivity
// because Personal info preference changes already require a page reload.
let firstDayOfWeekValue = 1

export function setFirstDayOfWeek(value: number): void {
	const normalized = ((value % 7) + 7) % 7
	firstDayOfWeekValue = normalized
}

export function getFirstDayOfWeek(): number {
	return firstDayOfWeekValue
}

// JS getDay() convention (0=Sun..6=Sat) → canonical DayKey (Mon-Sun list index).
const KEY_FOR_JS_DAY: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Day keys in the user's preferred display order, starting at firstDayOfWeek.
 * For firstDay=1 (Mon, default): ['monday'..'sunday']. For firstDay=0 (Sun):
 * ['sunday', 'monday'..'saturday']. Used for rendering and for paired iteration
 * with the visible week's chronological dates.
 */
export function getOrderedKeys(): DayKey[] {
	const start = firstDayOfWeekValue
	const result: DayKey[] = []
	for (let i = 0; i < 7; i++) {
		result.push(KEY_FOR_JS_DAY[(start + i) % 7])
	}
	return result
}
