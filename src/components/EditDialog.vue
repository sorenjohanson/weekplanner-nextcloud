<script setup lang="ts">
import { ref, onMounted } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import type { Recurrence, TaskColor, RecurringDeleteMode } from '../types'
import { TASK_COLORS } from '../types'

defineProps<{
	title: string
	notes: string
	recurrence: Recurrence
	color: TaskColor
	isRecurring: boolean
}>()

const emit = defineEmits<{
	'update:title': [value: string]
	'update:notes': [value: string]
	'update:recurrence': [value: Recurrence]
	'update:color': [value: TaskColor]
	save: []
	delete: [mode?: RecurringDeleteMode]
}>()

const titleInput = ref<HTMLInputElement | null>(null)
const showRecurringDeleteOptions = ref(false)

function handleDelete() {
	showRecurringDeleteOptions.value = true
}

function deleteWithMode(mode: RecurringDeleteMode) {
	showRecurringDeleteOptions.value = false
	emit('delete', mode)
}

onMounted(() => {
	const isMobile = window.matchMedia('(max-width: 768px)').matches
	if (!isMobile) {
		titleInput.value?.focus()
	}
})
</script>

<template>
	<div class="edit-overlay" @click.self="$emit('save')">
		<div class="edit-dialog" @keydown.escape="$emit('save')">
			<div class="edit-dialog-header">
				<h3>Edit Task</h3>
				<button class="edit-dialog-close" @click="$emit('save')">
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
					ref="titleInput"
					:value="title"
					class="edit-title-input"
					@input="$emit('update:title', ($event.target as HTMLInputElement).value)"
					@keydown.enter="$emit('save')">
				<label class="edit-label edit-label-notes" for="edit-notes">Notes</label>
				<textarea
					id="edit-notes"
					:value="notes"
					class="edit-notes-input"
					placeholder="Add notes…"
					rows="3"
					@input="$emit('update:notes', ($event.target as HTMLTextAreaElement).value)" />
				<label class="edit-label edit-label-recurrence" for="edit-recurrence">Repeat</label>
				<select
					id="edit-recurrence"
					:value="recurrence"
					class="edit-recurrence-select"
					@change="$emit('update:recurrence', ($event.target as HTMLSelectElement).value as Recurrence)">
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
				<label class="edit-label edit-label-color">Color</label>
				<div class="edit-color-picker">
					<button
						class="edit-color-swatch edit-color-none"
						:class="{ selected: !color }"
						title="No color"
						@click="$emit('update:color', '')">
						<svg xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							width="14"
							height="14"
							fill="currentColor">
							<path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
						</svg>
					</button>
					<button
						v-for="c in TASK_COLORS"
						:key="c.value"
						class="edit-color-swatch"
						:class="{ selected: color === c.value }"
						:style="{ backgroundColor: c.hex }"
						:title="c.label"
						@click="$emit('update:color', c.value)" />
				</div>
			</div>
			<div class="edit-dialog-footer">
				<button class="edit-delete-btn" @click="isRecurring ? handleDelete() : $emit('delete')">
					Delete
				</button>
				<NcButton type="primary" @click="$emit('save')">
					Save
				</NcButton>
			</div>
		</div>
		<div v-if="showRecurringDeleteOptions" class="recurring-delete-overlay" @click.self="showRecurringDeleteOptions = false">
			<div class="recurring-delete-dialog" @keydown.escape="showRecurringDeleteOptions = false">
				<div class="recurring-delete-header">
					<h3>Delete recurring task</h3>
				</div>
				<div class="recurring-delete-options">
					<button class="recurring-delete-option" @click="deleteWithMode('this')">
						This occurrence
					</button>
					<button class="recurring-delete-option" @click="deleteWithMode('this-and-future')">
						This and following occurrences
					</button>
					<button class="recurring-delete-option" @click="deleteWithMode('all')">
						All occurrences
					</button>
				</div>
				<div class="recurring-delete-footer">
					<button class="recurring-delete-cancel" @click="showRecurringDeleteOptions = false">
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
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

.edit-title-input:hover,
.edit-title-input:focus {
	border-color: var(--color-primary-element) !important;
	box-shadow: none !important;
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

.edit-notes-input:hover,
.edit-notes-input:focus {
	border-color: var(--color-primary-element) !important;
	box-shadow: none !important;
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

.edit-recurrence-select:hover,
.edit-recurrence-select:focus {
	border-color: var(--color-primary-element) !important;
	box-shadow: none !important;
}

.edit-label-color {
	margin-top: 16px;
}

.edit-color-picker {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.edit-color-swatch {
	width: 28px;
	height: 28px;
	min-width: 28px;
	min-height: 28px;
	border-radius: 50%;
	border: 2px solid var(--color-border-dark);
	cursor: pointer;
	padding: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: none;
	transition: border-color 0.15s, transform 0.15s;
	box-sizing: content-box;
	flex-shrink: 0;
}

.edit-color-swatch:hover {
	transform: scale(1.15);
	border-color: var(--color-primary-element) !important;
}

.edit-color-swatch.selected {
	border-color: var(--color-primary-element) !important;
}

.edit-color-none {
	background-color: var(--color-main-background);
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

.recurring-delete-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 10000;
}

.recurring-delete-dialog {
	background-color: var(--color-main-background);
	border-radius: 12px;
	width: 320px;
	max-width: 90vw;
	box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
	overflow: hidden;
}

.recurring-delete-header {
	padding: 16px 20px;
	border-bottom: 1px solid var(--color-border);
}

.recurring-delete-header h3 {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: var(--color-main-text);
}

.recurring-delete-options {
	display: flex;
	flex-direction: column;
}

.recurring-delete-option {
	background: none;
	border: none;
	border-bottom: 1px solid var(--color-border);
	cursor: pointer;
	padding: 14px 20px;
	font-size: 14px;
	color: var(--color-main-text);
	text-align: left;
	font-family: inherit;
}

.recurring-delete-option:hover {
	background-color: var(--color-background-hover);
}

.recurring-delete-option:last-child {
	border-bottom: none;
}

.recurring-delete-footer {
	padding: 12px 20px;
	border-top: 1px solid var(--color-border);
	display: flex;
	justify-content: flex-end;
}

.recurring-delete-cancel {
	background: none;
	border: none;
	cursor: pointer;
	color: var(--color-text-maxcontrast);
	font-size: 14px;
	padding: 8px 16px;
	border-radius: 6px;
	font-family: inherit;
}

.recurring-delete-cancel:hover {
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
}

@media (max-width: 768px) {
	.edit-dialog {
		width: 95vw;
	}
}
</style>
