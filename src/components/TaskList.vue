<script setup lang="ts">
import draggable from 'vuedraggable'
import type { Task } from '../types'
import TaskItem from './TaskItem.vue'

defineProps<{
	tasks: Task[]
	newTaskText: string
}>()

defineEmits<{
	'update:tasks': [tasks: Task[]]
	'update:newTaskText': [text: string]
	change: []
	edit: [task: Task]
	toggleDone: [taskId: string]
	addTask: []
}>()
</script>

<template>
	<div class="day-tasks">
		<draggable
			:model-value="tasks"
			group="weekGroup"
			item-key="id"
			class="task-list"
			@update:model-value="$emit('update:tasks', $event)"
			@change="$emit('change')">
			<template #item="{ element }: { element: Task }">
				<TaskItem
					:task="element"
					@edit="$emit('edit', $event)"
					@toggle-done="$emit('toggleDone', $event)" />
			</template>
		</draggable>
		<div class="task-add">
			<input
				:value="newTaskText"
				class="task-input"
				placeholder="Add task…"
				@input="$emit('update:newTaskText', ($event.target as HTMLInputElement).value)"
				@keydown.enter="$emit('addTask')">
			<button class="task-add-btn" @click="$emit('addTask')">
				+
			</button>
		</div>
	</div>
</template>

<style scoped>
.day-tasks {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-height: 0;
}

.task-list {
	flex: 1;
	min-height: 0;
	padding: 2px;
	overflow-y: auto;
}

.task-add {
	display: flex;
	padding: 2px 4px;
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
	padding: 4px 8px;
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

@media (max-width: 768px) {
	.task-list {
		overflow-y: visible;
		min-height: 20px;
	}

	.task-add {
		border-bottom: 1px solid var(--color-border);
	}
}
</style>
