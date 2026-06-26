import type { WeekData } from '../../types'

import axios from '@nextcloud/axios'
import { getCapabilities } from '@nextcloud/capabilities'
import { listen } from '@nextcloud/notify_push'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { getViewBuckets } from '../../utils/dateUtils'
import { emptyWeek } from '../../utils/weekData'
import { usePolling } from '../usePolling'

vi.mock('@nextcloud/notify_push', () => ({
	listen: vi.fn().mockReturnValue(true),
}))

vi.mock('@nextcloud/capabilities', () => ({
	getCapabilities: vi.fn(),
}))

vi.mock('@nextcloud/axios', () => ({
	default: { get: vi.fn() },
}))

vi.mock('@nextcloud/router', () => ({
	generateUrl: () => '/mock/url',
}))
const mockListen = vi.mocked(listen as (event: string, cb: (type: string, body: unknown) => void) => boolean)
const mockGet = vi.mocked(axios.get)
const mockGetCapabilities = vi.mocked(getCapabilities)

const YEAR = 2026
const WEEK = 12
// Monday Mar 16 2026 → ISO week 12, single bucket (firstDay=Mon default).
const VIEW_START = new Date(2026, 2, 16)

class FakeWebSocketSuccess {
	onopen: (() => void) | null = null
	onerror: (() => void) | null = null
	onclose: (() => void) | null = null
	constructor() {
		queueMicrotask(() => this.onopen?.())
	}

	close() {}
}

class FakeWebSocketFailure {
	onopen: (() => void) | null = null
	onerror: (() => void) | null = null
	onclose: (() => void) | null = null
	constructor() {
		queueMicrotask(() => this.onerror?.())
	}

	close() {}
}

function setup(overrides: {
	isWeekSaveIdle?: () => boolean
	isWeekLoadIdle?: () => boolean
	isCustomSaveIdle?: () => boolean
	editingTask?: { day: string, taskId: string } | null
} = {}) {
	const loadWeek = vi.fn().mockResolvedValue(undefined)
	const loadCustomColumns = vi.fn().mockResolvedValue(undefined)

	const viewStart = ref(new Date(VIEW_START))
	const bucketKeys = computed(() => getViewBuckets(viewStart.value))

	const polling = usePolling({
		bucketKeys,
		weekData: ref(emptyWeek()),
		editingTask: ref(overrides.editingTask ?? null),
		loadWeek,
		loadCustomColumns,
		materializeRecurringTasks: vi.fn(),
		applyCustomColumnsData: vi.fn(),
		applyBucketData: vi.fn(),
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
	const originalWebSocket = globalThis.WebSocket

	beforeEach(() => {
		vi.clearAllMocks()
		mockGetCapabilities.mockReturnValue({ notify_push: { endpoints: {} } })
		globalThis.WebSocket = FakeWebSocketSuccess as unknown as typeof WebSocket
	})

	afterEach(() => {
		globalThis.WebSocket = originalWebSocket
	})

	describe('trySetupNotifyPush', () => {
		it('returns false when notify_push capability is absent', async () => {
			mockGetCapabilities.mockReturnValue({})
			const { polling } = setup()

			await expect(polling.trySetupNotifyPush()).resolves.toBe(false)
			expect(mockListen).not.toHaveBeenCalled()
		})

		it('returns false when the WebSocket probe fails', async () => {
			globalThis.WebSocket = FakeWebSocketFailure as unknown as typeof WebSocket
			const { polling } = setup()

			await expect(polling.trySetupNotifyPush()).resolves.toBe(false)
			expect(mockListen).not.toHaveBeenCalled()
		})

		it('rewrites the notify_push websocket to the page origin and leaves pre_auth alone', async () => {
			const caps = { notify_push: { endpoints: { websocket: 'ws://hardcoded:7867/ws', pre_auth: 'http://nextcloud/index.php/apps/notify_push/preauth' } } }
			mockGetCapabilities.mockReturnValue(caps)
			const { polling } = setup()

			await polling.trySetupNotifyPush()

			expect(caps.notify_push.endpoints.websocket).toMatch(/^wss?:\/\/[^/]+\/push\/ws$/)
			expect(caps.notify_push.endpoints.pre_auth).toBe('http://nextcloud/index.php/apps/notify_push/preauth')
		})
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

	describe('longPollWeek', () => {
		function setupWithTasks() {
			const weekData = ref<WeekData>({
				days: {
					monday: [{ id: '1', title: 'My Task', done: false, notes: '', recurrence: '', color: '' }],
					tuesday: [],
					wednesday: [],
					thursday: [],
					friday: [],
					saturday: [],
					sunday: [],
				},
			})
			const materializeRecurringTasks = vi.fn()
			const viewStart = ref(new Date(VIEW_START))
			const bucketKeys = computed(() => getViewBuckets(viewStart.value))

			const polling = usePolling({
				bucketKeys,
				weekData,
				editingTask: ref(null),
				loadWeek: vi.fn(),
				loadCustomColumns: vi.fn(),
				materializeRecurringTasks,
				applyCustomColumnsData: vi.fn(),
				applyBucketData: vi.fn(),
				isWeekSaveIdle: () => true,
				isWeekLoadIdle: () => true,
				isCustomSaveIdle: () => true,
				getWeekKnownUpdatedAt: vi.fn().mockReturnValue(0),
				setWeekKnownUpdatedAt: vi.fn(),
				getCustomKnownUpdatedAt: vi.fn().mockReturnValue(0),
				setCustomKnownUpdatedAt: vi.fn(),
			})

			return { polling, weekData, materializeRecurringTasks }
		}

		it('does not wipe regular tasks when server returns changed=true with no data field', async () => {
			const { polling, weekData } = setupWithTasks()

			let resolveGet!: (val: unknown) => void
			mockGet
				.mockImplementationOnce(() => new Promise((resolve) => { resolveGet = resolve }))
				.mockReturnValue(new Promise(() => {})) // subsequent calls never resolve

			polling.startLongPolling()
			resolveGet({ data: { changed: true, updatedAt: 123 } }) // no data field
			await Promise.resolve()
			await Promise.resolve()

			expect(weekData.value.days.monday).toHaveLength(1)

			polling.stopAllPolling()
		})
	})
})
