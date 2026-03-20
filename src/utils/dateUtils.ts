export function getISOWeek(date: Date): { year: number; week: number } {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
	d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
	const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
	return { year: d.getUTCFullYear(), week: weekNo }
}

export function getWeekMonday(year: number, week: number): Date {
	const jan4 = new Date(year, 0, 4)
	const dayOfWeek = jan4.getDay() || 7
	const mondayWeek1 = new Date(jan4)
	mondayWeek1.setDate(jan4.getDate() - dayOfWeek + 1)
	const monday = new Date(mondayWeek1)
	monday.setDate(mondayWeek1.getDate() + (week - 1) * 7)
	return monday
}

export function getWeekDates(year: number, week: number): Date[] {
	const monday = getWeekMonday(year, week)
	const dates: Date[] = []
	for (let i = 0; i < 7; i++) {
		const date = new Date(monday)
		date.setDate(monday.getDate() + i)
		dates.push(date)
	}
	return dates
}

export function toDateStr(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
