import { loadState } from '@nextcloud/initial-state'
import { createApp } from 'vue'
import App from './App.vue'
import { setFirstDayOfWeek } from './types'

// Pull the user's preferred first day of week before the root component mounts
// so reactive computeds inside App.vue see the correct value on first render.
try {
	const firstDay = loadState<number>('weekplanner', 'firstDayOfWeek', 1)
	setFirstDayOfWeek(Number(firstDay))
} catch {
	// Backend not exposing initial state (e.g. legacy install) — default to Monday.
}

const app = createApp(App)
app.mount('#weekplanner')
