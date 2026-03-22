<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcContent from '@nextcloud/vue/components/NcContent'
import NcButton from '@nextcloud/vue/components/NcButton'
import type { RecurringTaskDefinition, WeekData } from './types'
import { WEEKDAY_KEYS, WEEKEND_KEYS, DAY_LABELS } from './types'
import TaskList from './components/TaskList.vue'
import EditDialog from './components/EditDialog.vue'
import { emptyWeek } from './utils/weekData'
import { useWeekNavigation } from './composables/useWeekNavigation'
import { useWeekPersistence } from './composables/useWeekPersistence'
import { useCustomColumns } from './composables/useCustomColumns'
import { useRecurringTasks } from './composables/useRecurringTasks'
import { useTaskEditing } from './composables/useTaskEditing'
import { usePolling } from './composables/usePolling'

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
	weekPersistence.debouncedSave,
)

const {
	editingTask, editTitle, editNotes, editRecurrence, editColor,
	newTasks, openEdit, saveEdit, deleteEditingTask, addTask, toggleDone,
} = useTaskEditing(
	currentYear, currentWeek, weekData, weekDates, recurringTasks,
	columns.customColumns, weekPersistence.debouncedSave,
	columns.debouncedSaveCustomColumns, weekPersistence.saveWeekNow,
	columns.saveCustomColumnsNow, weekPersistence.flushSaveTimeout,
	columns.flushCustomSaveTimeout, columns.deleteCustomTask,
	recurring.materializeRecurringTasks,
)

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
function onDragChange() {
	weekPersistence.debouncedSave()
	columns.debouncedSaveCustomColumns()
}

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
					@update:title="editTitle = $event"
					@update:notes="editNotes = $event"
					@update:recurrence="editRecurrence = $event"
					@update:color="editColor = $event"
					@save="saveEdit"
					@delete="deleteEditingTask" />
			</div>
		</NcAppContent>
	</NcContent>
</template>

<style scoped>
.weekplanner {
	display: flex;
	flex-direction: column;
	height: 100%;
	padding: 16px;
	overflow-y: auto;
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
	height: 70vh;
	min-height: 400px;
	flex-shrink: 0;
	background-color: var(--color-border);
	border: 1px solid var(--color-border);
	border-radius: 8px 8px 0 0;
	overflow: hidden;
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
	flex: 1;
	background-color: var(--color-main-background);
	min-height: 0;
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
	gap: 1px;
	height: 30vh;
	min-height: 200px;
	flex-shrink: 0;
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
		height: auto;
		min-height: 100%;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	.weekplanner-header {
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}

	.week-grid {
		display: flex;
		flex-direction: column;
		gap: 0;
		flex: none;
		height: auto;
		min-height: unset;
		overflow: visible;
		border-radius: 8px 8px 0 0;
	}

	.week-grid .day-column,
	.week-grid .weekend-half {
		min-height: 80px;
	}

	.week-grid .weekend-column {
		gap: 0;
	}

	.custom-columns-grid {
		display: flex;
		flex-direction: column;
		gap: 0;
		border-top: 1px solid var(--color-border);
		border-radius: 0 0 8px 8px;
		height: auto;
		min-height: unset;
	}

	.custom-columns-grid .custom-column {
		grid-column: span 1;
		min-height: auto;
	}
}
</style>
