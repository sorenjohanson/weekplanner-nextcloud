<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcContent from '@nextcloud/vue/components/NcContent'
import NcButton from '@nextcloud/vue/components/NcButton'
import draggable from 'vuedraggable'
import type { Task, RecurringTaskDefinition, WeekData } from './types'
import { WEEKDAY_KEYS, WEEKEND_KEYS, DAY_LABELS } from './types'
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
	() => recurring.materializeRecurringTasks(),
)

const columns = useCustomColumns(recurringTasks)
const { customColumns, newCustomTasks, addCustomTask, toggleCustomDone, updateColumnTitle } = columns

const recurring = useRecurringTasks(
	currentYear, currentWeek, weekData, recurringTasks,
	weekPersistence.debouncedSave,
)

const {
	editingTask, editTitle, editNotes, editRecurrence, editTitleInput,
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
						<div class="day-tasks">
							<draggable
								v-model="weekData.days[day]"
								group="weekGroup"
								item-key="id"
								class="task-list"
								@change="onDragChange">
								<template #item="{ element }: { element: Task }">
									<div class="task-item" :class="{ done: element.done }">
										<span class="task-title" @click="openEdit(day, element)">
											{{ element.title }}
										</span>
										<svg v-if="element.notes"
											class="task-notes-icon"
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											width="20"
											height="20"
											fill="currentColor">
											<path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M14,18H6V16H14V18M18,14H6V12H18V14M13,9V3.5L18.5,9H13Z" />
										</svg>
										<svg v-if="element.recurrence"
											class="task-recurrence-icon"
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											width="16"
											height="16"
											fill="currentColor">
											<path d="M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z" />
										</svg>
										<button
											class="task-check"
											:class="{ checked: element.done }"
											@click.stop="toggleDone(day, element.id)">
											<svg v-if="element.done"
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												width="20"
												height="20">
												<circle cx="12"
													cy="12"
													r="10"
													fill="var(--color-primary-element)"
													stroke="var(--color-primary-element)"
													stroke-width="1.5" />
												<path d="M8 12l2.5 2.5L16 9"
													fill="none"
													stroke="white"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round" />
											</svg>
											<template v-else>
												<svg class="check-idle"
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													width="20"
													height="20">
													<circle cx="12"
														cy="12"
														r="10"
														fill="none"
														stroke="currentColor"
														stroke-width="1.5" />
												</svg>
												<svg class="check-hover"
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													width="20"
													height="20">
													<circle cx="12"
														cy="12"
														r="10"
														fill="var(--color-primary-element)"
														stroke="var(--color-primary-element)"
														stroke-width="1.5" />
													<path d="M8 12l2.5 2.5L16 9"
														fill="none"
														stroke="white"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round" />
												</svg>
											</template>
										</button>
									</div>
								</template>
							</draggable>
							<div class="task-add">
								<input
									v-model="newTasks[day]"
									class="task-input"
									placeholder="Add task…"
									@keydown.enter="addTask(day)">
								<button class="task-add-btn" @click="addTask(day)">
									+
								</button>
							</div>
						</div>
					</div>

					<div class="weekend-column">
						<div
							v-for="day in WEEKEND_KEYS"
							:key="day"
							class="weekend-half">
							<div class="day-header" :class="{ 'is-today': isToday(day) }">
								<span class="day-name">{{ DAY_LABELS[day] }}</span>
								<span class="day-date">{{ formatDate(day) }}</span>
							</div>
							<div class="day-tasks">
								<draggable
									v-model="weekData.days[day]"
									group="weekGroup"
									item-key="id"
									class="task-list"
									@change="onDragChange">
									<template #item="{ element }: { element: Task }">
										<div class="task-item" :class="{ done: element.done }">
											<span class="task-title" @click="openEdit(day, element)">
												{{ element.title }}
											</span>
											<svg v-if="element.notes"
												class="task-notes-icon"
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												width="20"
												height="20"
												fill="currentColor">
												<path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M14,18H6V16H14V18M18,14H6V12H18V14M13,9V3.5L18.5,9H13Z" />
											</svg>
											<svg v-if="element.recurrence"
												class="task-recurrence-icon"
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												width="16"
												height="16"
												fill="currentColor">
												<path d="M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z" />
											</svg>
											<button
												class="task-check"
												:class="{ checked: element.done }"
												@click.stop="toggleDone(day, element.id)">
												<svg v-if="element.done"
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													width="20"
													height="20">
													<circle cx="12"
														cy="12"
														r="10"
														fill="var(--color-primary-element)"
														stroke="var(--color-primary-element)"
														stroke-width="1.5" />
													<path d="M8 12l2.5 2.5L16 9"
														fill="none"
														stroke="white"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round" />
												</svg>
												<template v-else>
													<svg class="check-idle"
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 24 24"
														width="20"
														height="20">
														<circle cx="12"
															cy="12"
															r="10"
															fill="none"
															stroke="currentColor"
															stroke-width="1.5" />
													</svg>
													<svg class="check-hover"
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 24 24"
														width="20"
														height="20">
														<circle cx="12"
															cy="12"
															r="10"
															fill="var(--color-primary-element)"
															stroke="var(--color-primary-element)"
															stroke-width="1.5" />
														<path d="M8 12l2.5 2.5L16 9"
															fill="none"
															stroke="white"
															stroke-width="2"
															stroke-linecap="round"
															stroke-linejoin="round" />
													</svg>
												</template>
											</button>
										</div>
									</template>
								</draggable>
								<div class="task-add">
									<input
										v-model="newTasks[day]"
										class="task-input"
										placeholder="Add task…"
										@keydown.enter="addTask(day)">
									<button class="task-add-btn" @click="addTask(day)">
										+
									</button>
								</div>
							</div>
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
						<div class="day-tasks">
							<draggable
								v-model="col.tasks"
								group="weekGroup"
								item-key="id"
								class="task-list"
								@change="onDragChange">
								<template #item="{ element }: { element: Task }">
									<div class="task-item" :class="{ done: element.done }">
										<span class="task-title" @click="openEdit(col.id, element)">
											{{ element.title }}
										</span>
										<svg v-if="element.notes"
											class="task-notes-icon"
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											width="20"
											height="20"
											fill="currentColor">
											<path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M14,18H6V16H14V18M18,14H6V12H18V14M13,9V3.5L18.5,9H13Z" />
										</svg>
										<svg v-if="element.recurrence"
											class="task-recurrence-icon"
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											width="16"
											height="16"
											fill="currentColor">
											<path d="M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z" />
										</svg>
										<button
											class="task-check"
											:class="{ checked: element.done }"
											@click.stop="toggleCustomDone(col.id, element.id)">
											<svg v-if="element.done"
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												width="20"
												height="20">
												<circle cx="12"
													cy="12"
													r="10"
													fill="var(--color-primary-element)"
													stroke="var(--color-primary-element)"
													stroke-width="1.5" />
												<path d="M8 12l2.5 2.5L16 9"
													fill="none"
													stroke="white"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round" />
											</svg>
											<template v-else>
												<svg class="check-idle"
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													width="20"
													height="20">
													<circle cx="12"
														cy="12"
														r="10"
														fill="none"
														stroke="currentColor"
														stroke-width="1.5" />
												</svg>
												<svg class="check-hover"
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													width="20"
													height="20">
													<circle cx="12"
														cy="12"
														r="10"
														fill="var(--color-primary-element)"
														stroke="var(--color-primary-element)"
														stroke-width="1.5" />
													<path d="M8 12l2.5 2.5L16 9"
														fill="none"
														stroke="white"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round" />
												</svg>
											</template>
										</button>
									</div>
								</template>
							</draggable>
							<div class="task-add">
								<input
									v-model="newCustomTasks[col.id]"
									class="task-input"
									placeholder="Add task…"
									@keydown.enter="addCustomTask(col.id)">
								<button class="task-add-btn" @click="addCustomTask(col.id)">
									+
								</button>
							</div>
						</div>
					</div>
				</div>

				<!-- Edit Task Dialog -->
				<div v-if="editingTask" class="edit-overlay" @click.self="saveEdit">
					<div class="edit-dialog" @keydown.escape="saveEdit">
						<div class="edit-dialog-header">
							<h3>Edit Task</h3>
							<button class="edit-dialog-close" @click="saveEdit">
								<svg xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									width="20"
									height="20"
									fill="currentColor">
									<path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
								</svg>
							</button>
						</div>
						<div class="edit-dialog-body">
							<label class="edit-label" for="edit-title">Title</label>
							<input
								id="edit-title"
								ref="editTitleInput"
								v-model="editTitle"
								class="edit-title-input"
								@keydown.enter="saveEdit">
							<label class="edit-label edit-label-notes" for="edit-notes">Notes</label>
							<textarea
								id="edit-notes"
								v-model="editNotes"
								class="edit-notes-input"
								placeholder="Add notes…"
								rows="3" />
							<label class="edit-label edit-label-recurrence" for="edit-recurrence">Repeat</label>
							<select
								id="edit-recurrence"
								v-model="editRecurrence"
								class="edit-recurrence-select">
								<option value="">
									None
								</option>
								<option value="daily">
									Daily
								</option>
								<option value="weekly">
									Weekly
								</option>
								<option value="monthly">
									Monthly
								</option>
							</select>
						</div>
						<div class="edit-dialog-footer">
							<NcButton type="primary" @click="saveEdit">
								Save
							</NcButton>
							<button class="edit-delete-btn" @click="deleteEditingTask">
								Delete
							</button>
						</div>
					</div>
				</div>
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
	flex: 1;
	min-height: 0;
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
	padding: 8px 12px;
	border-bottom: 1px solid var(--color-border);
	flex-shrink: 0;
}

.day-header.is-today {
	background-color: var(--color-primary-element-light);
}

.day-name {
	display: block;
	font-size: 14px;
	font-weight: 600;
	color: var(--color-main-text);
}

.day-header.is-today .day-name {
	color: var(--color-primary-element);
	font-weight: 700;
}

.day-date {
	display: block;
	font-size: 12px;
	color: var(--color-text-maxcontrast);
}

.day-tasks {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-height: 0;
}

.task-list {
	flex: 1;
	min-height: 0;
	padding: 4px;
	overflow-y: auto;
}

.task-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 12px;
	margin: 0;
	border-radius: 4px;
	cursor: grab;
	background-color: var(--color-main-background);
	transition: background-color 0.15s;
	border-bottom: 1px solid var(--color-border);
}

.task-item:last-child {
	border-bottom: none;
}

.task-item:hover {
	background-color: var(--color-background-hover);
}

.task-title {
	flex: 1;
	cursor: pointer;
	font-size: 13px;
	overflow-wrap: break-word;
}

.task-item.done .task-title {
	text-decoration: line-through;
	color: var(--color-text-maxcontrast);
}

.task-notes-icon {
	flex-shrink: 0;
	margin-left: 8px;
	margin-right: 4px;
	color: var(--color-primary-element);
	opacity: 0.5;
}

.task-recurrence-icon {
	flex-shrink: 0;
	margin-left: 4px;
	margin-right: 4px;
	color: var(--color-primary-element);
	opacity: 0.5;
}

.task-check {
	background: none;
	border: none;
	outline: none;
	cursor: pointer;
	padding: 0;
	margin-left: 8px;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	border-radius: 50%;
	color: var(--color-text-maxcontrast);
	-webkit-appearance: none;
	-moz-appearance: none;
	appearance: none;
}

.task-check:hover,
.task-check:focus {
	background-color: transparent !important;
}

.task-check.checked {
	color: var(--color-primary-element);
}

.task-check .check-hover {
	display: none;
	opacity: 0.5;
}

.task-check .check-idle {
	display: block;
}

.task-check:hover .check-idle {
	display: none;
}

.task-check:hover .check-hover {
	display: block;
}

.task-add {
	display: flex;
	padding: 4px;
	gap: 4px;
	flex-shrink: 0;
	border-top: 1px solid var(--color-border-dark);
	position: relative;
	z-index: 1;
	background-color: var(--color-main-background);
}

.task-input {
	flex: 1;
	border: none;
	background: transparent;
	padding: 6px 8px;
	font-size: 13px;
	color: var(--color-main-text);
	outline: none;
}

.task-input::placeholder {
	color: var(--color-text-maxcontrast);
}

.task-add-btn {
	background: none;
	border: none;
	cursor: pointer;
	color: var(--color-primary-element);
	font-size: 20px;
	padding: 0 8px;
	line-height: 1;
}

.task-add-btn:hover {
	color: var(--color-primary-element-hover);
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

/* Edit dialog */
.edit-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 9999;
}

.edit-dialog {
	background-color: var(--color-main-background);
	border-radius: 12px;
	width: 380px;
	max-width: 90vw;
	box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.edit-dialog-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 20px;
	border-bottom: 1px solid var(--color-border);
}

.edit-dialog-header h3 {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: var(--color-main-text);
}

.edit-dialog-close {
	background: none;
	border: none;
	cursor: pointer;
	color: var(--color-text-maxcontrast);
	padding: 4px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
}

.edit-dialog-close:hover {
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
}

.edit-dialog-body {
	padding: 16px 20px;
	overflow: hidden;
}

.edit-label {
	display: block;
	font-size: 13px;
	font-weight: 600;
	color: var(--color-main-text);
	margin-bottom: 6px;
}

.edit-label-notes,
.edit-label-recurrence {
	margin-top: 16px;
}

.edit-title-input {
	width: 100%;
	padding: 8px 12px;
	border: 2px solid var(--color-border-dark);
	border-radius: 6px;
	font-size: 14px;
	color: var(--color-main-text);
	background-color: var(--color-main-background);
	outline: none;
	box-sizing: border-box;
}

.edit-title-input:focus {
	border-color: var(--color-primary-element);
}

.edit-notes-input {
	width: 100%;
	padding: 8px 12px;
	border: 2px solid var(--color-border-dark);
	border-radius: 6px;
	font-size: 14px;
	color: var(--color-main-text);
	background-color: var(--color-main-background);
	outline: none;
	resize: vertical;
	font-family: inherit;
	box-sizing: border-box;
}

.edit-notes-input:focus {
	border-color: var(--color-primary-element);
}

.edit-notes-input::placeholder {
	color: var(--color-text-maxcontrast);
}

.edit-recurrence-select {
	width: 100%;
	padding: 8px 12px;
	border: 2px solid var(--color-border-dark);
	border-radius: 6px;
	font-size: 14px;
	color: var(--color-main-text);
	background-color: var(--color-main-background);
	outline: none;
	box-sizing: border-box;
	font-family: inherit;
}

.edit-recurrence-select:focus {
	border-color: var(--color-primary-element);
}

.edit-dialog-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 20px;
	border-top: 1px solid var(--color-border);
}

.edit-delete-btn {
	background: none;
	border: none;
	cursor: pointer;
	color: #c00;
	font-size: 14px;
	padding: 8px 16px;
	border-radius: 6px;
}

.edit-delete-btn:hover {
	background-color: rgba(200, 0, 0, 0.1);
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
		overflow: visible;
		border-radius: 8px 8px 0 0;
	}

	.week-grid .day-column {
		min-height: auto;
	}

	.week-grid .weekend-column {
		gap: 0;
	}

	.week-grid .task-list {
		overflow-y: visible;
		min-height: 20px;
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

	.task-check {
		width: 32px;
		height: 32px;
		min-width: 32px;
		min-height: 32px;
	}

	.task-add {
		border-bottom: 1px solid var(--color-border);
	}

	.task-item {
		padding: 6px 12px;
	}

	.edit-dialog {
		width: 95vw;
	}
}
</style>
