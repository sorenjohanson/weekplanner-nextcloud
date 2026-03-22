import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { usePolling } from '../usePolling'
import { emptyWeek } from '../../utils/weekData'

vi.mock('@nextcloud/notify_push', () => ({
	listen: vi.fn().mockReturnValue(true),
}))

vi.mock('@nextcloud/axios', () => ({
	default: { get: vi.fn() },
}))

vi.mock('@nextcloud/router', () => ({
	generateUrl: () => '/mock/url',
}))

import { listen } from '@nextcloud/notify_push'
const mockListen = vi.mocked(listen as (event: string, cb: (type: string, body: unknown) => void) => boolean)

const YEAR = 2026
const WEEK = 12

function setup(overrides: {
	isWeekSaveIdle?: () => boolean
	isWeekLoadIdle?: () => boolean
	isCustomSaveIdle?: () => boolean
	editingTask?: { day: string; taskId: string } | null
} = {}) {
	const loadWeek = vi.fn().mockResolvedValue(undefined)
	const loadCustomColumns = vi.fn().mockResolvedValue(undefined)

	const polling = usePolling({
		currentYear: ref(YEAR),
		currentWeek: ref(WEEK),
		weekData: ref(emptyWeek()),
		editingTask: ref(overrides.editingTask ?? null),
		loadWeek,
		loadCustomColumns,
		materializeRecurringTasks: vi.fn(),
		applyCustomColumnsData: vi.fn(),
		isWeekSaveIdle: overrides.isWeekSaveIdle ?? (() => true),
		isWeekLoadIdle: overrides.isWeekLoadIdle ?? (() => true),
		isCustomSaveIdle: overrides.isCustomSaveIdle ?? (() => true),
		getWeekKnownUpdatedAt: vi.fn().mockReturnValue(0),
		setWeekKnownUpdatedAt: vi.fn(),
		getCustomKnownUpdatedAt: vi.fn().mockReturnValue(0),
		setCustomKnownUpdatedAt: vi.fn(),
	})

	return { polling, loadWeek, loadCustomColumns }
}

function getWeekUpdateListener() {
	const call = mockListen.mock.calls.find(([event]) => event === 'weekplanner_week_update')
	return call?.[1]
}

function fireWeekUpdate(body: unknown) {
	getWeekUpdateListener()?.('weekplanner_week_update', body)
}

describe('usePolling', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('notify_push weekplanner_week_update', () => {
		it('calls loadWeek when all guards pass', async () => {
			const { polling, loadWeek } = setup()
			await polling.trySetupNotifyPush()

			fireWeekUpdate({ year: YEAR, week: WEEK })

			expect(loadWeek).toHaveBeenCalledTimes(1)
		})

		it('does not call loadWeek when a load is already in flight', async () => {
			const { polling, loadWeek } = setup({ isWeekLoadIdle: () => false })
			await polling.trySetupNotifyPush()

			fireWeekUpdate({ year: YEAR, week: WEEK })

			expect(loadWeek).not.toHaveBeenCalled()
		})

		it('does not call loadWeek when a save is in progress', async () => {
			const { polling, loadWeek } = setup({ isWeekSaveIdle: () => false })
			await polling.trySetupNotifyPush()

			fireWeekUpdate({ year: YEAR, week: WEEK })

			expect(loadWeek).not.toHaveBeenCalled()
		})

		it('does not call loadWeek when a task is being edited', async () => {
			const { polling, loadWeek } = setup({ editingTask: { day: 'monday', taskId: '1' } })
			await polling.trySetupNotifyPush()

			fireWeekUpdate({ year: YEAR, week: WEEK })

			expect(loadWeek).not.toHaveBeenCalled()
		})

		it('does not call loadWeek for a different week', async () => {
			const { polling, loadWeek } = setup()
			await polling.trySetupNotifyPush()

			fireWeekUpdate({ year: YEAR, week: WEEK + 1 })

			expect(loadWeek).not.toHaveBeenCalled()
		})

		it('does not call loadWeek for a different year', async () => {
			const { polling, loadWeek } = setup()
			await polling.trySetupNotifyPush()

			fireWeekUpdate({ year: YEAR + 1, week: WEEK })

			expect(loadWeek).not.toHaveBeenCalled()
		})

		it('does not call loadWeek when body is absent', async () => {
			const { polling, loadWeek } = setup()
			await polling.trySetupNotifyPush()

			fireWeekUpdate(null)

			expect(loadWeek).not.toHaveBeenCalled()
		})
	})
})
