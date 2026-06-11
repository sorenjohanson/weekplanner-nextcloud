<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcContent from '@nextcloud/vue/components/NcContent'
import NcButton from '@nextcloud/vue/components/NcButton'
import type { RecurringTaskDefinition, WeekData } from './types'
import { WEEKDAY_KEYS, WEEKEND_KEYS, ALL_KEYS, DAY_LABELS } from './types'
import TaskList from './components/TaskList.vue'
import EditDialog from './components/EditDialog.vue'
import { emptyWeek } from './utils/weekData'
import { useWeekNavigation } from './composables/useWeekNavigation'
import { useWeekPersistence } from './composables/useWeekPersistence'
import { useCustomColumns } from './composables/useCustomColumns'
import { useRecurringTasks } from './composables/useRecurringTasks'
import { useTaskEditing } from './composables/useTaskEditing'
import { usePolling } from './composables/usePolling'
import { useDragHandler } from './composables/useDragHandler'
import { getISOWeek, getWeekMonday, getWeekDates } from './utils/dateUtils'
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { normalizeWeekData } from './utils/weekData'
import type { DayKey, Task } from './types'

// --- Shared state ---
const weekData = ref<WeekData>(emptyWeek())
const recurringTasks = ref<RecurringTaskDefinition[]>([])

// --- Composables ---
const {
	currentYear, currentWeek, weekDates, weekLabel,
	isToday, formatDate, prevWeek, nextWeek, goToday,
} = useWeekNavigation()

const weekPersistence = useWeekPersistence(
	currentYear, currentWeek, weekData,
	() => { if (initialLoadDone) recurring.materializeRecurringTasks() },
)

const columns = useCustomColumns(recurringTasks)
const { customColumns, newCustomTasks, addCustomTask, toggleCustomDone, updateColumnTitle } = columns

const recurring = useRecurringTasks(
	currentYear, currentWeek, weekData, recurringTasks,
	weekPersistence.debouncedSave, columns.customColumns,
)

// Stash a task into a future week's server-side data.
// We do a GET for that week, append the task, then PUT it back.
async function stashTaskForNextWeek(task: Task, targetDay: DayKey, year: number, week: number) {
	try {
		const url = generateUrl('/apps/weekplanner/week/{year}/{week}', {
			year: String(year),
			week: String(week),
		})
		const response = await axios.get(url)
		const data = normalizeWeekData(response.data)
		data.days[targetDay].push(task)
		await axios.put(url, data)
	} catch {
		// If the fetch fails we fall back to a silent no-op.
		// The user can navigate to the next week and add the task manually.
	}
}

const {
	editingTask, editingTaskIsRecurring, editTitle, editNotes, editRecurrence, editColor,
	newTasks, openEdit, saveEdit, deleteEditingTask, addTask, toggleDone, moveEditingTask,
	moveEditingTaskToNextWeek,
} = useTaskEditing({
	currentYear,
	currentWeek,
	weekData,
	weekDates,
	recurringTasks,
	customColumns: columns.customColumns,
	debouncedSave: weekPersistence.debouncedSave,
	debouncedSaveCustomColumns: columns.debouncedSaveCustomColumns,
	saveWeekNow: weekPersistence.saveWeekNow,
	saveCustomColumnsNow: columns.saveCustomColumnsNow,
	flushSaveTimeout: weekPersistence.flushSaveTimeout,
	flushCustomSaveTimeout: columns.flushCustomSaveTimeout,
	deleteCustomTask: columns.deleteCustomTask,
	materializeRecurringTasks: recurring.materializeRecurringTasks,
	handleDragChange: recurring.handleDragChange,
	stashTaskForNextWeek,
})

const moveDayOptions = computed(() => ALL_KEYS.map((key) => ({
	key,
	label: DAY_LABELS[key],
	date: formatDate(key),
	isToday: isToday(key),
})))

const moveNextWeekDayOptions = computed(() => {
	const monday = getWeekMonday(currentYear.value, currentWeek.value)
	monday.setDate(monday.getDate() + 7)
	const nextDates = getWeekDates(getISOWeek(monday).year, getISOWeek(monday).week)
	return ALL_KEYS.map((key, idx) => {
		const date = nextDates[idx]
		return {
			key,
			label: DAY_LABELS[key],
			date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
		}
	})
})

const moveColumnOptions = computed(() => customColumns.value.map((c) => ({
	id: c.id,
	title: c.title,
})))

const polling = usePolling({
	currentYear,
	currentWeek,
	weekData,
	editingTask,
	loadWeek: weekPersistence.loadWeek,
	loadCustomColumns: columns.loadCustomColumns,
	materializeRecurringTasks: recurring.materializeRecurringTasks,
	applyCustomColumnsData: columns.applyCustomColumnsData,
	isWeekSaveIdle: weekPersistence.isSaveIdle,
	isWeekLoadIdle: weekPersistence.isLoadIdle,
	isCustomSaveIdle: columns.isSaveIdle,
	getWeekKnownUpdatedAt: weekPersistence.getKnownUpdatedAt,
	setWeekKnownUpdatedAt: weekPersistence.setKnownUpdatedAt,
	getCustomKnownUpdatedAt: columns.getKnownUpdatedAt,
	setCustomKnownUpdatedAt: columns.setKnownUpdatedAt,
})

// --- Drag handlers ---
// Always persist both week and custom columns: vuedraggable doesn't tell us
// which list was involved, and saving only one side desyncs the other on
// reload (duplicates / disappearing tasks for custom-column drags).
const { onDragChange } = useDragHandler({
	handleDragChange: recurring.handleDragChange,
	debouncedSave: weekPersistence.debouncedSave,
	debouncedSaveCustomColumns: columns.debouncedSaveCustomColumns,
})

// --- Lifecycle ---
let mounted = false
let initialLoadDone = false

watch([currentYear, currentWeek], async () => {
	if (!polling.isUsingNotifyPush()) {
		polling.stopWeekPoll()
	}
	weekPersistence.setKnownUpdatedAt(0)
	await weekPersistence.loadWeek()
	if (!polling.isUsingNotifyPush() && mounted) {
		polling.longPollWeek()
	}
})

onMounted(async () => {
	await Promise.all([weekPersistence.loadWeek(), columns.loadCustomColumns()])
	initialLoadDone = true
	recurring.materializeRecurringTasks()
	polling.setUsingNotifyPush(await polling.trySetupNotifyPush())
	mounted = true
	if (!polling.isUsingNotifyPush()) {
		polling.startLongPolling()
	}
})

onUnmounted(() => {
	polling.stopAllPolling()
	weekPersistence.flushSaveTimeout()
	columns.flushCustomSaveTimeout()
})
</script>

<template>
	<NcContent app-name="weekplanner">
		<NcAppContent>
			<div class="weekplanner">
				<div class="weekplanner-header">
					<div class="weekplanner-nav">
						<NcButton type="tertiary" @click="prevWeek">
							&larr; Prev
						</NcButton>
						<NcButton type="secondary" @click="goToday">
							Today
						</NcButton>
						<NcButton type="tertiary" @click="nextWeek">
							Next &rarr;
						</NcButton>
					</div>
					<h2 class="weekplanner-title">
						{{ weekLabel }}
					</h2>
				</div>

				<div class="week-grid">
					<div
						v-for="day in WEEKDAY_KEYS"
						:key="day"
						class="day-column">
						<div class="day-header" :class="{ 'is-today': isToday(day) }">
							<span class="day-name">{{ DAY_LABELS[day] }}</span>
							<span class="day-date">{{ formatDate(day) }}</span>
						</div>
						<TaskList
							:tasks="weekData.days[day]"
							:new-task-text="newTasks[day]"
							@update:tasks="weekData.days[day] = $event"
							@update:new-task-text="newTasks[day] = $event"
							@change="onDragChange"
							@edit="openEdit(day, $event)"
							@toggle-done="toggleDone(day, $event)"
							@add-task="addTask(day)" />
					</div>

					<div class="weekend-column">
						<div
							v-for="day in WEEKEND_KEYS"
							:key="day"
							class="weekend-half">
							<div class="day-header day-header-inline" :class="{ 'is-today': isToday(day) }">
								<span class="day-name">{{ DAY_LABELS[day] }}</span>
								<span class="day-date">{{ formatDate(day) }}</span>
							</div>
							<TaskList
								:tasks="weekData.days[day]"
								:new-task-text="newTasks[day]"
								@update:tasks="weekData.days[day] = $event"
								@update:new-task-text="newTasks[day] = $event"
								@change="onDragChange"
								@edit="openEdit(day, $event)"
								@toggle-done="toggleDone(day, $event)"
								@add-task="addTask(day)" />
						</div>
					</div>
				</div>

				<div class="custom-columns-grid">
					<div
						v-for="col in customColumns"
						:key="col.id"
						class="day-column custom-column">
						<div class="day-header custom-column-header">
							<input
								class="custom-column-title"
								:value="col.title"
								placeholder="Column title…"
								@input="updateColumnTitle(col.id, ($event.target as HTMLInputElement).value)"
								@keydown.enter="($event.target as HTMLInputElement).blur()">
						</div>
						<TaskList
							:tasks="col.tasks"
							:new-task-text="newCustomTasks[col.id]"
							@update:tasks="col.tasks = $event"
							@update:new-task-text="newCustomTasks[col.id] = $event"
							@change="onDragChange"
							@edit="openEdit(col.id, $event)"
							@toggle-done="toggleCustomDone(col.id, $event)"
							@add-task="addCustomTask(col.id)" />
					</div>
				</div>

				<EditDialog
					v-if="editingTask"
					:title="editTitle"
					:notes="editNotes"
					:recurrence="editRecurrence"
					:color="editColor"
					:is-recurring="editingTaskIsRecurring"
					:current-location="editingTask.day"
					:move-day-options="moveDayOptions"
					:move-next-week-day-options="moveNextWeekDayOptions"
					:move-column-options="moveColumnOptions"
					@update:title="editTitle = $event"
					@update:notes="editNotes = $event"
					@update:recurrence="editRecurrence = $event"
					@update:color="editColor = $event"
					@save="saveEdit"
					@delete="deleteEditingTask($event)"
					@move="moveEditingTask($event)"
					@move-to-next-week="moveEditingTaskToNextWeek($event)" />
			</div>
		</NcAppContent>
	</NcContent>
</template>

<style scoped>
.weekplanner {
	display: flex;
	flex-direction: column;
	min-height: 100%;
	padding: 16px;
}

.weekplanner-header {
	display: flex;
	align-items: center;
	gap: 16px;
	margin-bottom: 16px;
	flex-shrink: 0;
}

.weekplanner-nav {
	display: flex;
	gap: 4px;
}

.weekplanner-title {
	margin: 0;
	font-size: 18px;
	font-weight: 600;
	color: var(--color-main-text);
}

.week-grid {
	display: grid;
	grid-template-columns: repeat(5, 1fr) 0.8fr;
	gap: 1px;
	flex: 1 0 auto;
	/* Pin the weekdays' height so custom-columns can never steal
	   space from them: as soon as custom grows beyond its minimum,
	   it pushes the page taller instead of shrinking week-grid.
	   Reserved (~400px) ≈ NC top bar (~50) + weekplanner padding
	   (32) + weekplanner-header (~60) + custom-columns minimum
	   (260). Falls back to 240px on very short viewports. */
	min-height: max(240px, calc(100vh - 400px));
	background-color: var(--color-border);
	border: 1px solid var(--color-border);
	border-radius: 8px 8px 0 0;
}

.day-column {
	display: flex;
	flex-direction: column;
	background-color: var(--color-main-background);
	min-height: 0;
}

.weekend-column {
	display: flex;
	flex-direction: column;
	gap: 1px;
	background-color: var(--color-border);
}

.weekend-half {
	display: flex;
	flex-direction: column;
	/* Use auto basis so each half sizes to its content first and only shares
	   extra space evenly. With `flex: 1` (basis 0) the halves split the parent
	   50/50 regardless of content, so Saturday's tasks overflow behind Sunday
	   once they exceed half the row height. The min-height keeps the lighter
	   half (typically Sunday) at a baseline size when the other half's tasks
	   push the column taller — without it Sunday would shrink to just the
	   input field. ~half of the week-grid min-height of 240px. */
	flex: 1 1 auto;
	min-height: 120px;
	background-color: var(--color-main-background);
}

.day-header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	padding: 4px 12px;
	border-bottom: 1px solid var(--color-border);
	flex-shrink: 0;
}

.day-header.is-today {
	background-color: var(--color-primary-element-light);
}

.day-name {
	font-size: 13px;
	font-weight: 600;
	color: var(--color-main-text);
}

.day-header.is-today .day-name {
	color: var(--color-primary-element);
	font-weight: 700;
}

.day-date {
	font-size: 11px;
	color: var(--color-text-maxcontrast);
}

.day-header-inline {
	flex-direction: row;
}

/* Custom columns */
.custom-columns-grid {
	display: grid;
	grid-template-columns: repeat(5, 1fr) 0.8fr;
	grid-template-rows: minmax(260px, auto);
	gap: 1px;
	flex: 0 0 auto;
	background-color: var(--color-border);
	border: 1px solid var(--color-border);
	border-top: none;
	border-radius: 0 0 8px 8px;
	overflow: hidden;
}

.custom-columns-grid .custom-column {
	grid-column: span 2;
}

.custom-column-header {
	display: flex;
	align-items: center;
}

.custom-column-title {
	width: 100%;
	border: none;
	background: transparent;
	font-size: 14px;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	outline: none;
	padding: 0;
	font-family: inherit;
}

.custom-column-title::placeholder {
	color: var(--color-text-maxcontrast);
	opacity: 0.6;
}

.custom-column-title:focus {
	color: var(--color-main-text);
}

@media (max-width: 768px) {
	.weekplanner {
		min-height: 100%;
		padding: 8px;
	}

	.weekplanner-header {
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}

	/* Stack everything vertically. We give every column the same
	   min-height so they look equal on first paint; columns grow
	   independently as tasks are added, and total overflow scrolls
	   the page (NcAppContent), never an individual column. */
	.week-grid {
		display: flex;
		flex-direction: column;
		gap: 0;
		flex: none;
		min-height: 0;
		border-radius: 8px 8px 0 0;
	}

	.week-grid .weekend-column {
		gap: 0;
	}

	.week-grid .day-column,
	.week-grid .weekend-half {
		min-height: 200px;
	}

	.custom-columns-grid {
		display: flex;
		flex-direction: column;
		gap: 0;
		flex: none;
		border-top: 1px solid var(--color-border);
		border-radius: 0 0 8px 8px;
	}

	.custom-columns-grid .custom-column {
		grid-column: span 1;
		min-height: 200px;
	}
}
</style>
