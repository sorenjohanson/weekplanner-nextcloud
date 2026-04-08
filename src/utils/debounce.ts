export function createDebouncedSave(fn: () => Promise<void>, delay = 300) {
	let timeout: ReturnType<typeof setTimeout> | null = null
	let inProgress = false

	function trigger() {
		if (timeout) clearTimeout(timeout)
		timeout = setTimeout(() => {
			timeout = null
			fn()
		}, delay)
	}

	function flush() {
		if (timeout) {
			clearTimeout(timeout)
			timeout = null
		}
	}

	function isIdle() {
		return timeout === null && !inProgress
	}

	function setInProgress(val: boolean) {
		inProgress = val
	}

	return { trigger, flush, isIdle, setInProgress }
}
