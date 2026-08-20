import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import EditDialog from '../EditDialog.vue'

vi.mock('vue-color', () => ({
	ChromePicker: { template: '<div class="chrome-picker-mock" />' },
}))

vi.mock('@nextcloud/vue/components/NcButton', () => ({
	default: { template: '<button><slot /></button>' },
}))

function mountDialog(isRecurring: boolean) {
	return mount(EditDialog, {
		props: {
			title: 'Standup',
			notes: '',
			recurrence: 'weekly',
			color: '',
			isRecurring,
			currentLocation: 'thursday',
			moveDayOptions: [
				{ key: 'monday', label: 'Monday', date: '', isToday: false },
				{ key: 'tuesday', label: 'Tuesday', date: '', isToday: false },
				{ key: 'wednesday', label: 'Wednesday', date: '', isToday: false },
			],
			moveNextWeekDayOptions: [],
			moveColumnOptions: [],
		},
	})
}

describe('EditDialog move scope', () => {
	it('shows the move scope popup when moving a recurring task', async () => {
		const wrapper = mountDialog(true)

		const chip = wrapper.findAll('button.edit-move-chip').find((b) => b.text() === 'Wednesday')
		expect(chip).toBeTruthy()
		await chip!.trigger('click')

		expect(wrapper.text()).toContain('Move recurring task')
		expect(wrapper.text()).toContain('This occurrence')
		expect(wrapper.text()).toContain('All occurrences')
	})

	it('does not show the popup for a non-recurring task', async () => {
		const wrapper = mountDialog(false)

		const chip = wrapper.findAll('button.edit-move-chip').find((b) => b.text() === 'Wednesday')
		await chip!.trigger('click')

		expect(wrapper.text()).not.toContain('Move recurring task')
	})
})
