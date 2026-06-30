import type { Task } from '../types'

function formatText(label: string, tasks: Task[], includeOutstanding: boolean): string {
	const completed = tasks.filter((t) => t.done)
	const outstanding = tasks.filter((t) => !t.done)

	const lines: string[] = []
	if (completed.length > 0) {
		lines.push(`Completed tasks on ${label}: ${completed.map((t) => t.title).join(', ')}`)
	} else {
		lines.push(`Completed tasks on ${label}: None`)
	}
	if (includeOutstanding) {
		if (outstanding.length > 0) {
			lines.push(`Outstanding tasks: ${outstanding.map((t) => t.title).join(', ')}`)
		} else {
			lines.push('Outstanding tasks: None')
		}
	}
	return lines.join('\n')
}

export function useCopyTasks() {
	async function copyAllTasks(tasks: Task[], label: string) {
		const text = formatText(label, tasks, true)
		await navigator.clipboard.writeText(text)
	}

	async function copyCompletedTasks(tasks: Task[], label: string) {
		const text = formatText(label, tasks, false)
		await navigator.clipboard.writeText(text)
	}

	return { copyAllTasks, copyCompletedTasks }
}
