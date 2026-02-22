<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
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
					result.days[key] = days[key] as Task[]
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
										<span class="task-title" @click="toggleDone(day, element.id)">
											{{ element.title }}
										</span>
										<span class="task-delete" role="button" tabindex="0" @click="deleteTask(day, element.id)" @keydown.enter="deleteTask(day, element.id)">
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M9,8H11V17H9V8M13,8H15V17H13V8Z" /></svg>
										</span>
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
											<span class="task-title" @click="toggleDone(day, element.id)">
												{{ element.title }}
											</span>
											<button class="task-delete" @click="deleteTask(day, element.id)">
												&times;
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
	padding: 6px 8px;
	margin: 2px 0;
	border-radius: 4px;
	cursor: grab;
	background-color: var(--color-main-background);
	transition: background-color 0.15s;
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

.task-delete {
	visibility: hidden;
	cursor: pointer;
	color: var(--color-text-maxcontrast);
	padding: 0 4px;
	line-height: 0;
	flex-shrink: 0;
	display: flex;
	align-items: center;
}

.task-delete:hover {
	color: var(--color-error);
}

.task-item:hover .task-delete {
	visibility: visible;
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
</style>
