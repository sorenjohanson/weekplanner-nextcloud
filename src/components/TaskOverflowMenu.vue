<script setup lang="ts">
import type { Task } from '../types'

import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useCopyTasks } from '../composables/useCopyTasks'

const props = defineProps<{
	tasks: Task[]
	label: string
}>()

const { copyAllTasks, copyCompletedTasks } = useCopyTasks()

const open = ref(false)
const btnRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)

function onClickOutside(e: MouseEvent) {
	if (!open.value) {
		return
	}
	const target = e.target as Node
	if (btnRef.value?.contains(target) || dropdownRef.value?.contains(target)) {
		return
	}
	open.value = false
}

onMounted(() => document.addEventListener('click', onClickOutside, true))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside, true))

function onAction(fn: (tasks: Task[], label: string) => Promise<void>) {
	open.value = false
	fn(props.tasks, props.label)
}
</script>

<template>
	<button
		ref="btnRef"
		class="overflow-btn"
		@click="open = !open">
		&#x22EF;
	</button>
	<div
		v-if="open"
		ref="dropdownRef"
		class="overflow-dropdown">
		<button class="dropdown-item" @click="onAction(copyAllTasks)">
			Copy all tasks
		</button>
		<button class="dropdown-item" @click="onAction(copyCompletedTasks)">
			Copy all completed tasks
		</button>
	</div>
</template>

<style scoped>
.overflow-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	margin: 0 0 0 12px !important;
	border: none;
	background: none;
	font-size: 13px;
	line-height: 1;
	color: var(--color-text-maxcontrast, #888);
	border-radius: 4px;
	padding: 0 4px;
	height: 18px;
}

.overflow-btn:hover,
.overflow-btn:focus-visible {
	background-color: var(--color-background-hover, rgba(0, 0, 0, 0.05));
	color: var(--color-main-text, #333);
}

.overflow-dropdown {
	position: absolute;
	top: 100%;
	right: 6px;
	z-index: 1000;
	min-width: 180px;
	background: var(--color-main-background, #fff);
	border: 1px solid var(--color-border, #ddd);
	border-radius: 6px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	padding: 4px 0;
}

.dropdown-item {
	display: block;
	width: 100%;
	padding: 6px 12px;
	border: none;
	background: none;
	text-align: left;
	font-size: 13px;
	color: var(--color-main-text, #333);
	cursor: pointer;
	font-family: inherit;
}

.dropdown-item:hover {
	background-color: var(--color-background-hover, rgba(0, 0, 0, 0.05));
}
</style>
