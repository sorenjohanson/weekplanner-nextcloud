<script setup lang="ts">
import type { DayKey, RecurringTaskDefinition, Task, WeekData } from './types'

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcContent from '@nextcloud/vue/components/NcContent'
import EditDialog from './components/EditDialog.vue'
import TaskList from './components/TaskList.vue'
import TaskOverflowMenu from './components/TaskOverflowMenu.vue'
import { useCustomColumns } from './composables/useCustomColumns'
import { useDragHandler } from './composables/useDragHandler'
import { usePolling } from './composables/usePolling'
import { useRecurringTasks } from './composables/useRecurringTasks'
import { useTaskEditing } from './composables/useTaskEditing'
import { useWeekNavigation } from './composables/useWeekNavigation'
import { useWeekPersistence } from './composables/useWeekPersistence'
import { DAY_LABELS, getOrderedKeys } from './types'
import { getViewDates } from './utils/dateUtils'
import { emptyWeek, normalizeWeekData } from './utils/weekData'

// --- Shared state ---
const weekData = ref<WeekData>(emptyWeek())
const recurringTasks = ref<RecurringTaskDefinition[]>([])
let initialLoadDone = false
let onWeekLoaded = () => {
	/* assigned after recurring is created */
}

// --- Composables ---
const {
	viewStart,
	currentYear,
	currentWeek,
	weekDates,
	weekLabel,
	bucketKeys,
	isToday,
	formatDate,
	formatLongDate,
	prevWeek,
	nextWeek,
	goToday,
} = useWeekNavigation()

const weekPersistence = useWeekPersistence(
	bucketKeys,
	weekData,
	() => onWeekLoaded(),
)

const columns = useCustomColumns(recurringTasks)
const { customColumns, newCustomTasks, addCustomTask, toggleCustomDone, updateColumnTitle } = columns

const recurring = useRecurringTasks(
	weekDates,
	weekData,
	recurringTasks,
	weekPersistence.debouncedSave,
	columns.customColumns,
)

onWeekLoaded = () => {
	if (initialLoadDone) {
		recurring.materializeRecurringTasks()
	}
}

// Day key in chronological order, computed so it picks up the user's
// firstDayOfWeek preference (resolved at boot in main.ts).
const orderedKeys = computed<DayKey[]>(() => getOrderedKeys())
// The first five visible days render as standalone columns; the last two are
// stacked into a single half-width column to give the other days more space.
// With firstDay=Mon this reproduces the classic five-weekday + Sat/Sun stack
// layout; for other start days the stacking simply moves to whichever two
// days fall at the end of the visible window.
const primaryKeys = computed<DayKey[]>(() => orderedKeys.value.slice(0, 5))
const stackedKeys = computed<DayKey[]>(() => orderedKeys.value.slice(5, 7))

// Stash a task into a specific (year, week, day) on the server. Used when
// moving a task to the following week — the target bucket isn't necessarily
// loaded, so we GET, mutate, PUT.
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
		// If the fetch fails we fall back to a silent no-op. The user can
		// navigate forwards and add the task manually.
	}
}

const {
	editingTask,
	editingTaskIsRecurring,
	editTitle,
	editNotes,
	editRecurrence,
	editColor,
	newTasks,
	openEdit,
	saveEdit,
	deleteEditingTask,
	addTask,
	toggleDone,
	moveEditingTask,
	moveEditingTaskToNextWeek,
} = useTaskEditing({
	viewStart,
	viewDates: weekDates,
	weekData,
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

const moveDayOptions = computed(() => orderedKeys.value.map((key) => ({
	key,
	label: DAY_LABELS[key],
	date: formatDate(key),
	isToday: isToday(key),
})))

const moveNextWeekDayOptions = computed(() => {
	const nextStart = new Date(viewStart.value)
	nextStart.setDate(nextStart.getDate() + 7)
	const nextDates = getViewDates(nextStart)
	return orderedKeys.value.map((key, idx) => ({
		key,
		label: DAY_LABELS[key],
		date: nextDates[idx].toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
	}))
})

const moveColumnOptions = computed(() => customColumns.value.map((c) => ({
	id: c.id,
	title: c.title,
})))

const polling = usePolling({
	bucketKeys,
	weekData,
	editingTask,
	loadWeek: weekPersistence.loadWeek,
	loadCustomColumns: columns.loadCustomColumns,
	materializeRecurringTasks: recurring.materializeRecurringTasks,
	applyCustomColumnsData: columns.applyCustomColumnsData,
	applyBucketData: weekPersistence.applyBucketData,
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

watch(viewStart, async () => {
	if (!polling.isUsingNotifyPush()) {
		polling.stopWeekPoll()
	}
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

// `currentYear` / `currentWeek` are still destructured for callers (and
// remain part of the navigation composable's public surface) but are not
// referenced from this component directly any more.
void currentYear
void currentWeek
</script>

<template>
	<NcContent appName="weekplanner">
		<NcAppContent>
			<div class="weekplanner">
				<div class="weekplanner-header">
					<div class="weekplanner-nav">
						<NcButton variant="tertiary" @click="prevWeek">
							&larr; Prev
						</NcButton>
						<NcButton variant="secondary" @click="goToday">
							Today
						</NcButton>
						<NcButton variant="tertiary" @click="nextWeek">
							Next &rarr;
						</NcButton>
					</div>
					<h2 class="weekplanner-title">
						{{ weekLabel }}
					</h2>
				</div>

				<div class="week-grid">
					<div
						v-for="day in primaryKeys"
						:key="day"
						class="day-column">
						<div class="day-header" :class="{ 'is-today': isToday(day) }">
							<span class="day-name">{{ DAY_LABELS[day] }}</span>
							<span class="day-date">{{ formatDate(day) }}</span>
							<TaskOverflowMenu :tasks="weekData.days[day]" :label="formatLongDate(day)" />
						</div>
						<TaskList
							:tasks="weekData.days[day]"
							:newTaskText="newTasks[day]"
							@update:tasks="weekData.days[day] = $event"
							@update:newTaskText="newTasks[day] = $event"
							@change="onDragChange"
							@edit="openEdit(day, $event)"
							@toggleDone="toggleDone(day, $event)"
							@addTask="addTask(day)" />
					</div>

					<div class="stacked-column">
						<div
							v-for="day in stackedKeys"
							:key="day"
							class="stacked-half">
							<div class="day-header day-header-inline" :class="{ 'is-today': isToday(day) }">
								<span class="day-name">{{ DAY_LABELS[day] }}</span>
								<span class="day-date">{{ formatDate(day) }}</span>
								<TaskOverflowMenu :tasks="weekData.days[day]" :label="formatLongDate(day)" />
							</div>
							<TaskList
								:tasks="weekData.days[day]"
								:newTaskText="newTasks[day]"
								@update:tasks="weekData.days[day] = $event"
								@update:newTaskText="newTasks[day] = $event"
								@change="onDragChange"
								@edit="openEdit(day, $event)"
								@toggleDone="toggleDone(day, $event)"
								@addTask="addTask(day)" />
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
							<TaskOverflowMenu :tasks="col.tasks" :label="col.title || 'this column'" />
						</div>
						<TaskList
							:tasks="col.tasks"
							:newTaskText="newCustomTasks[col.id]"
							@update:tasks="col.tasks = $event"
							@update:newTaskText="newCustomTasks[col.id] = $event"
							@change="onDragChange"
							@edit="openEdit(col.id, $event)"
							@toggleDone="toggleCustomDone(col.id, $event)"
							@addTask="addCustomTask(col.id)" />
					</div>
				</div>

				<Teleport to="body">
					<EditDialog
						v-if="editingTask"
						:title="editTitle"
						:notes="editNotes"
						:recurrence="editRecurrence"
						:color="editColor"
						:isRecurring="editingTaskIsRecurring"
						:currentLocation="editingTask.day"
						:moveDayOptions="moveDayOptions"
						:moveNextWeekDayOptions="moveNextWeekDayOptions"
						:moveColumnOptions="moveColumnOptions"
						@update:title="editTitle = $event"
						@update:notes="editNotes = $event"
						@update:recurrence="editRecurrence = $event"
						@update:color="editColor = $event"
						@save="saveEdit"
						@delete="deleteEditingTask($event)"
						@move="moveEditingTask($event)"
						@moveToNextWeek="moveEditingTaskToNextWeek($event)" />
				</Teleport>
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
	/* Reserve enough vertical space for the weekday columns regardless of how
	   tall the custom columns grow. ~400px covers the Nextcloud top bar (~50),
	   our own padding (32), the planner header (~60), and the custom-columns
	   minimum (260). */
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

.stacked-column {
	display: flex;
	flex-direction: column;
	gap: 1px;
	background-color: var(--color-border);
}

.stacked-half {
	display: flex;
	flex-direction: column;
	/* Use auto basis so each half sizes to its content first and only shares
	   extra space evenly. With `flex: 1` (basis 0) the halves split the parent
	   50/50 regardless of content, so the first stacked day's tasks would
	   overflow behind the second once they exceed half the row height. The
	   min-height keeps the lighter half at a baseline size when the other
	   half's tasks push the column taller — without it that half would shrink
	   to just the input field. ~half of the week-grid min-height of 240px. */
	flex: 1 1 auto;
	min-height: 120px;
	background-color: var(--color-main-background);
}

.day-header {
	position: relative;
	display: flex;
	align-items: baseline;
	padding: 4px 8px 4px 12px;
	border-bottom: 1px solid var(--color-border);
	flex-shrink: 0;
}

.day-header-inline {
	flex-direction: row;
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
	margin-left: auto;
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
	flex: 1;
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

	.week-grid .stacked-column {
		gap: 0;
	}

	.week-grid .day-column,
	.week-grid .stacked-half {
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
