<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcContent from '@nextcloud/vue/components/NcContent'
import NcButton from '@nextcloud/vue/components/NcButton'
import draggable from 'vuedraggable'
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

interface Task {
	id: string
	title: string
	done: boolean
	notes: string
}

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

interface WeekData {
	days: Record<DayKey, Task[]>
}

const WEEKDAY_KEYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const WEEKEND_KEYS: DayKey[] = ['saturday', 'sunday']
const DAY_LABELS: Record<DayKey, string> = {
	monday: 'Monday',
	tuesday: 'Tuesday',
	wednesday: 'Wednesday',
	thursday: 'Thursday',
	friday: 'Friday',
	saturday: 'Saturday',
	sunday: 'Sunday',
}
const ALL_KEYS: DayKey[] = [...WEEKDAY_KEYS, ...WEEKEND_KEYS]

const currentYear = ref(0)
const currentWeek = ref(0)
const weekData = ref<WeekData>(emptyWeek())
const newTasks = ref<Record<DayKey, string>>({
	monday: '',
	tuesday: '',
	wednesday: '',
	thursday: '',
	friday: '',
	saturday: '',
	sunday: '',
})

// Edit dialog state
const editingTask = ref<{ day: DayKey; taskId: string } | null>(null)
const editTitle = ref('')
const editNotes = ref('')
const editTitleInput = ref<HTMLInputElement | null>(null)

function emptyWeek(): WeekData {
	return {
		days: {
			monday: [],
			tuesday: [],
			wednesday: [],
			thursday: [],
			friday: [],
			saturday: [],
			sunday: [],
		},
	}
}

function getISOWeek(date: Date): { year: number; week: number } {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
	d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
	const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
	return { year: d.getUTCFullYear(), week: weekNo }
}

function getWeekMonday(year: number, week: number): Date {
	const jan4 = new Date(year, 0, 4)
	const dayOfWeek = jan4.getDay() || 7
	const mondayWeek1 = new Date(jan4)
	mondayWeek1.setDate(jan4.getDate() - dayOfWeek + 1)
	const monday = new Date(mondayWeek1)
	monday.setDate(mondayWeek1.getDate() + (week - 1) * 7)
	return monday
}

function getWeekDates(year: number, week: number): Date[] {
	const monday = getWeekMonday(year, week)
	const dates: Date[] = []
	for (let i = 0; i < 7; i++) {
		const date = new Date(monday)
		date.setDate(monday.getDate() + i)
		dates.push(date)
	}
	return dates
}

const weekDates = computed(() => getWeekDates(currentYear.value, currentWeek.value))

const weekLabel = computed(() => {
	const dates = weekDates.value
	if (dates.length === 0) return ''
	const mon = dates[0]
	const sun = dates[6]
	const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
	const yearStr = sun.getFullYear()
	return `Week ${currentWeek.value} \u00B7 ${fmt(mon)} \u2013 ${fmt(sun)}, ${yearStr}`
})

function dayIndex(day: DayKey): number {
	return ALL_KEYS.indexOf(day)
}

function isToday(day: DayKey): boolean {
	const date = weekDates.value[dayIndex(day)]
	if (!date) return false
	const today = new Date()
	return (
		date.getFullYear() === today.getFullYear()
		&& date.getMonth() === today.getMonth()
		&& date.getDate() === today.getDate()
	)
}

function formatDate(day: DayKey): string {
	const date = weekDates.value[dayIndex(day)]
	if (!date) return ''
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function normalizeWeekData(data: unknown): WeekData {
	const result = emptyWeek()
	if (data && typeof data === 'object' && 'days' in data) {
		const days = (data as { days: Record<string, unknown> }).days
		if (days && typeof days === 'object') {
			for (const key of ALL_KEYS) {
				if (Array.isArray(days[key])) {
					result.days[key] = (days[key] as Task[]).map((t) => ({
						...t,
						notes: t.notes || '',
					}))
				}
			}
		}
	}
	return result
}

async function loadWeek() {
	try {
		const url = generateUrl('/apps/weekplanner/week/{year}/{week}', {
			year: String(currentYear.value),
			week: String(currentWeek.value),
		})
		const response = await axios.get(url)
		weekData.value = normalizeWeekData(response.data)
	} catch {
		weekData.value = emptyWeek()
	}
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null

function debouncedSave() {
	if (saveTimeout) clearTimeout(saveTimeout)
	saveTimeout = setTimeout(async () => {
		try {
			const url = generateUrl('/apps/weekplanner/week/{year}/{week}', {
				year: String(currentYear.value),
				week: String(currentWeek.value),
			})
			await axios.put(url, weekData.value)
		} catch {
			// Save failed silently
		}
	}, 300)
}

function addTask(day: DayKey) {
	const title = newTasks.value[day].trim()
	if (!title) return
	weekData.value.days[day].push({
		id: crypto.randomUUID(),
		title,
		done: false,
		notes: '',
	})
	newTasks.value[day] = ''
	debouncedSave()
}

function toggleDone(day: DayKey, taskId: string) {
	const task = weekData.value.days[day].find((t) => t.id === taskId)
	if (task) {
		task.done = !task.done
		debouncedSave()
	}
}

function deleteTask(day: DayKey, taskId: string) {
	weekData.value.days[day] = weekData.value.days[day].filter((t) => t.id !== taskId)
	debouncedSave()
}

function openEdit(day: DayKey, task: Task) {
	editingTask.value = { day, taskId: task.id }
	editTitle.value = task.title
	editNotes.value = task.notes || ''
	nextTick(() => {
		editTitleInput.value?.focus()
	})
}

function saveEdit() {
	if (!editingTask.value) return
	const { day, taskId } = editingTask.value
	const task = weekData.value.days[day].find((t) => t.id === taskId)
	if (task) {
		task.title = editTitle.value.trim() || task.title
		task.notes = editNotes.value
		debouncedSave()
	}
	editingTask.value = null
}

function deleteEditingTask() {
	if (!editingTask.value) return
	const { day, taskId } = editingTask.value
	deleteTask(day, taskId)
	editingTask.value = null
}

function onDragChange() {
	debouncedSave()
}

function prevWeek() {
	const monday = getWeekMonday(currentYear.value, currentWeek.value)
	monday.setDate(monday.getDate() - 7)
	const { year, week } = getISOWeek(monday)
	currentYear.value = year
	currentWeek.value = week
}

function nextWeek() {
	const monday = getWeekMonday(currentYear.value, currentWeek.value)
	monday.setDate(monday.getDate() + 7)
	const { year, week } = getISOWeek(monday)
	currentYear.value = year
	currentWeek.value = week
}

function goToday() {
	const { year, week } = getISOWeek(new Date())
	currentYear.value = year
	currentWeek.value = week
}

watch([currentYear, currentWeek], () => {
	loadWeek()
})

onMounted(() => {
	const { year, week } = getISOWeek(new Date())
	currentYear.value = year
	currentWeek.value = week
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
						class="day-column"
					>
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
								@change="onDragChange"
							>
								<template #item="{ element }: { element: Task }">
									<div class="task-item" :class="{ done: element.done }">
										<span class="task-title" @click="openEdit(day, element)">
											{{ element.title }}
										</span>
										<svg v-if="element.notes" class="task-notes-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
											<path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M14,18H6V16H14V18M18,14H6V12H18V14M13,9V3.5L18.5,9H13Z" />
										</svg>
										<button
											class="task-check"
											:class="{ checked: element.done }"
											@click.stop="toggleDone(day, element.id)"
										>
											<svg v-if="!element.done" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
												<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5" />
											</svg>
											<svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
												<circle cx="12" cy="12" r="10" fill="var(--color-primary-element)" stroke="var(--color-primary-element)" stroke-width="1.5" />
												<path d="M8 12l2.5 2.5L16 9" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
											</svg>
										</button>
									</div>
								</template>
							</draggable>
							<div class="task-add">
								<input
									v-model="newTasks[day]"
									class="task-input"
									placeholder="Add task…"
									@keydown.enter="addTask(day)"
								>
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
							class="weekend-half"
						>
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
									@change="onDragChange"
								>
									<template #item="{ element }: { element: Task }">
										<div class="task-item" :class="{ done: element.done }">
											<span class="task-title" @click="openEdit(day, element)">
												{{ element.title }}
											</span>
											<svg v-if="element.notes" class="task-notes-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
												<path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M14,18H6V16H14V18M18,14H6V12H18V14M13,9V3.5L18.5,9H13Z" />
											</svg>
											<button
												class="task-check"
												:class="{ checked: element.done }"
												@click.stop="toggleDone(day, element.id)"
											>
												<svg v-if="!element.done" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
													<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5" />
												</svg>
												<svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
													<circle cx="12" cy="12" r="10" fill="var(--color-primary-element)" stroke="var(--color-primary-element)" stroke-width="1.5" />
													<path d="M8 12l2.5 2.5L16 9" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
												</svg>
											</button>
										</div>
									</template>
								</draggable>
								<div class="task-add">
									<input
										v-model="newTasks[day]"
										class="task-input"
										placeholder="Add task…"
										@keydown.enter="addTask(day)"
									>
									<button class="task-add-btn" @click="addTask(day)">
										+
									</button>
								</div>
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
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
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
								@keydown.enter="saveEdit"
							>
							<label class="edit-label edit-label-notes" for="edit-notes">Notes</label>
							<textarea
								id="edit-notes"
								v-model="editNotes"
								class="edit-notes-input"
								placeholder="Add notes…"
								rows="3"
							/>
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
	border-radius: 8px;
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

.day-header.is-today .day-name {
	color: var(--color-primary-element);
	font-weight: 700;
}

.day-name {
	display: block;
	font-size: 14px;
	font-weight: 600;
	color: var(--color-main-text);
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
	overflow-y: auto;
}

.task-list {
	flex: 1;
	min-height: 40px;
	padding: 4px;
}

.task-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 12px;
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

.task-item.done .task-title {
	text-decoration: line-through;
	color: var(--color-text-maxcontrast);
}

.task-title {
	flex: 1;
	cursor: pointer;
	font-size: 13px;
	word-break: break-word;
}

.task-notes-icon {
	flex-shrink: 0;
	margin-left: 6px;
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
	transition: color 0.15s;
	-webkit-appearance: none;
	-moz-appearance: none;
	appearance: none;
}

.task-check:hover,
.task-check:focus {
	color: var(--color-primary-element);
	background-color: transparent !important;
}

.task-check.checked {
	color: var(--color-primary-element);
}

.task-add {
	display: flex;
	padding: 4px;
	gap: 4px;
	flex-shrink: 0;
	border-top: 1px solid var(--color-border-dark);
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

.edit-label-notes {
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
	.weekplanner-header {
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}

	.week-grid {
		grid-template-columns: 1fr;
		overflow: visible;
	}

	.day-column,
	.weekend-column,
	.weekend-half {
		min-height: unset;
	}

	.day-tasks {
		overflow-y: visible;
	}

	.edit-dialog {
		width: 95vw;
	}
}
</style>
