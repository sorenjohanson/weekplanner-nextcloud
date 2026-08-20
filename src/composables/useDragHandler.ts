import type { DayKey, Task } from '../types'

// Coordinates persistence after a drag-and-drop change.
//
// Drags can move tasks between any two lists: day columns, weekend columns,
// or custom columns. vuedraggable emits a `change` event from each affected
// list (a `removed` from the source and an `added` on the target), so we
// don't get to inspect which lists were involved from the DOM alone. The
// event payload's `added`/`removed`/`moved` shapes let us tell a cross-list
// move from an in-list reorder, and carry the dragged Task.
//
// A recurring task dropped onto a day needs a scope decision (move just this
// occurrence, or the whole series), which requires a confirmation dialog. The
// handler defers that decision to `requestRecurringMove` instead of applying
// the single-occurrence bookkeeping blindly. The paired `removed` event is
// skipped so the confirmation only fires once.
//
// To keep server state consistent we always save both the week and the
// custom columns — debouncing collapses the burst of events into one network
// write per side.
export function useDragHandler(deps: {
	handleDragChange: () => boolean
	debouncedSave: () => void
	debouncedSaveCustomColumns: () => void
	requestRecurringMove?: (task: Task, target: DayKey | string) => void
}) {
	function onDragChange(
		target: DayKey | string,
		evt?: { added?: { element?: Task }, removed?: { element?: Task } },
	) {
		const added = evt?.added?.element
		if (added?.recurringSourceId && deps.requestRecurringMove) {
			deps.requestRecurringMove(added, target)
			return
		}
		// The `removed` half of a cross-list recurring move is handled by the
		// paired `added` event; skip it to avoid applying bookkeeping early.
		if (evt?.removed?.element?.recurringSourceId && deps.requestRecurringMove) {
			return
		}
		deps.handleDragChange()
		deps.debouncedSave()
		deps.debouncedSaveCustomColumns()
	}

	return { onDragChange }
}
