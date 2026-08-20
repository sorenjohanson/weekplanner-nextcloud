<script setup lang="ts">
import type { RecurringMoveMode } from '../types'

defineEmits<{
	choose: [mode: RecurringMoveMode]
	cancel: []
}>()
</script>

<template>
	<div class="move-scope-overlay" @click.self="$emit('cancel')">
		<div class="move-scope-dialog" @keydown.escape="$emit('cancel')">
			<div class="move-scope-header">
				<h3>Move recurring task</h3>
			</div>
			<div class="move-scope-options">
				<button class="move-scope-option" @click="$emit('choose', 'this')">
					This occurrence
				</button>
				<button class="move-scope-option" @click="$emit('choose', 'all')">
					All occurrences
				</button>
			</div>
			<div class="move-scope-footer">
				<button class="move-scope-cancel" @click="$emit('cancel')">
					Cancel
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.move-scope-overlay {
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

.move-scope-dialog {
	background-color: var(--color-main-background);
	border-radius: 12px;
	width: 320px;
	max-width: 90vw;
	box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
	overflow: hidden;
}

.move-scope-header {
	padding: 16px 20px 8px;
}

.move-scope-header h3 {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: var(--color-main-text);
}

.move-scope-options {
	display: flex;
	flex-direction: column;
}

.move-scope-option {
	background: none;
	border: none;
	cursor: pointer;
	padding: 10px 20px;
	font-size: 14px;
	color: var(--color-main-text);
	text-align: left;
	font-family: inherit;
}

.move-scope-option:hover {
	background-color: var(--color-background-hover);
}

.move-scope-footer {
	padding: 12px 20px;
	border-top: 1px solid var(--color-border);
	display: flex;
	justify-content: flex-end;
}

.move-scope-cancel {
	background: none;
	border: none;
	cursor: pointer;
	color: var(--color-text-maxcontrast);
	font-size: 14px;
	padding: 8px 16px;
	border-radius: 6px;
	font-family: inherit;
}

.move-scope-cancel:hover {
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
}
</style>
