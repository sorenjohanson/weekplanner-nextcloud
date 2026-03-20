<script setup lang="ts">
import type { Task } from '../types'

defineProps<{
	task: Task
}>()

defineEmits<{
	edit: [task: Task]
	toggleDone: [taskId: string]
}>()
</script>

<template>
	<div class="task-item" :class="{ done: task.done }">
		<span class="task-title" @click="$emit('edit', task)">
			{{ task.title }}
		</span>
		<svg v-if="task.notes"
			class="task-notes-icon"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width="20"
			height="20"
			fill="currentColor">
			<path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M14,18H6V16H14V18M18,14H6V12H18V14M13,9V3.5L18.5,9H13Z" />
		</svg>
		<svg v-if="task.recurrence"
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
			:class="{ checked: task.done }"
			@click.stop="$emit('toggleDone', task.id)">
			<svg v-if="task.done"
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

<style scoped>
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

@media (max-width: 768px) {
	.task-check {
		width: 32px;
		height: 32px;
		min-width: 32px;
		min-height: 32px;
	}

	.task-item {
		padding: 6px 12px;
	}
}
</style>
