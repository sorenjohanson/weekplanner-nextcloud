import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import type { AxiosRequestConfig } from 'axios'
import { useWeekPersistence } from '../useWeekPersistence'
import { emptyWeek } from '../../utils/weekData'
import type { WeekData } from '../../types'

vi.mock('@nextcloud/axios', () => ({
	default: { get: vi.fn(), put: vi.fn() },
}))

vi.mock('@nextcloud/router', () => ({
	generateUrl: () => '/mock/week/2026/12',
}))

import axios from '@nextcloud/axios'
const mockGet = vi.mocked(axios.get)
const mockPut = vi.mocked(axios.put)

function setup(weekOverride?: WeekData) {
	const currentYear = ref(2026)
	const currentWeek = ref(12)
	const weekData = ref<WeekData>(weekOverride ?? emptyWeek())
	const onLoaded = vi.fn()
	const persistence = useWeekPersistence(currentYear, currentWeek, weekData, onLoaded)
	return { ...persistence, weekData, onLoaded }
}

function weekWithTask(): WeekData {
	const week = emptyWeek()
	week.days.monday = [{ id: '1', title: 'My Task', done: false, notes: '', recurrence: '', color: '' }]
	return week
}

function serverResponse(week: WeekData, updatedAt = 100) {
	return { data: { ...week, updatedAt } }
}

describe('useWeekPersistence', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('loadWeek', () => {
		it('applies response data to weekData on success', async () => {
			const { loadWeek, weekData } = setup()
			mockGet.mockResolvedValue(serverResponse(weekWithTask()))

			await loadWeek()

			expect(weekData.value.days.monday).toHaveLength(1)
			expect(weekData.value.days.monday[0].title).toBe('My Task')
		})

		it('calls onLoaded after a successful load', async () => {
			const { loadWeek, onLoaded } = setup()
			mockGet.mockResolvedValue(serverResponse(emptyWeek()))

			await loadWeek()

			expect(onLoaded).toHaveBeenCalledTimes(1)
		})

		it('preserves existing weekData when GET fails', async () => {
			const { loadWeek, weekData } = setup(weekWithTask())
			mockGet.mockRejectedValue(new Error('Network error'))

			await loadWeek()

			expect(weekData.value.days.monday).toHaveLength(1)
		})

		it('calls onLoaded even after a failed load', async () => {
			const { loadWeek, onLoaded } = setup()
			mockGet.mockRejectedValue(new Error('Network error'))

			await loadWeek()

			expect(onLoaded).toHaveBeenCalledTimes(1)
		})

		describe('skips applying response when a save is pending', () => {
			beforeEach(() => vi.useFakeTimers())
			afterEach(() => vi.useRealTimers())

			it('does not overwrite weekData if saveTimeout is set when response arrives', async () => {
				const { loadWeek, debouncedSave, weekData } = setup(weekWithTask())

				let resolveGet!: (val: unknown) => void
				mockGet.mockReturnValue(new Promise(r => { resolveGet = r }))

				const loadPromise = loadWeek()
				debouncedSave() // sets saveTimeout before GET resolves
				resolveGet(serverResponse(emptyWeek(), 200))
				await loadPromise

				expect(weekData.value.days.monday).toHaveLength(1)
			})
		})

		it('does not overwrite weekData if a save is in progress when response arrives', async () => {
			const { loadWeek, saveWeekNow, weekData } = setup(weekWithTask())

			let resolveGet!: (val: unknown) => void
			mockGet.mockReturnValue(new Promise(r => { resolveGet = r }))

			let resolvePut!: (val: unknown) => void
			mockPut.mockReturnValue(new Promise(r => { resolvePut = r }))

			const savePromise = saveWeekNow() // isSaving = true
			const loadPromise = loadWeek()

			resolveGet(serverResponse(emptyWeek(), 200)) // arrives while save in flight
			await loadPromise

			expect(weekData.value.days.monday).toHaveLength(1)

			resolvePut({ data: { updatedAt: 999 } })
			await savePromise
		})

		it('cancels in-flight request when called again', async () => {
			const { loadWeek, weekData, onLoaded } = setup(weekWithTask())

			let resolveFirst!: (val: unknown) => void
			let resolveSecond!: (val: unknown) => void

			mockGet
				.mockImplementationOnce((_url: string, config?: AxiosRequestConfig) =>
					new Promise((resolve, reject) => {
						resolveFirst = resolve
						config?.signal?.addEventListener?.('abort', () =>
							reject(Object.assign(new Error('AbortError'), { name: 'AbortError' })),
						)
					}),
				)
				.mockImplementationOnce(() => new Promise(r => { resolveSecond = r }))

			const load1 = loadWeek()
			const load2 = loadWeek() // aborts load1

			resolveSecond(serverResponse(emptyWeek(), 2))
			resolveFirst(serverResponse(weekWithTask(), 1)) // already aborted, ignored

			await Promise.all([load1, load2])

			// Only the second response was applied
			expect(weekData.value.days.monday).toHaveLength(0)
			// onLoaded called only once — for the completed second request
			expect(onLoaded).toHaveBeenCalledTimes(1)
		})
	})

	describe('isLoadIdle', () => {
		it('returns true initially', () => {
			const { isLoadIdle } = setup()
			expect(isLoadIdle()).toBe(true)
		})

		it('returns false while a load is in flight', async () => {
			const { loadWeek, isLoadIdle } = setup()

			let resolveGet!: (val: unknown) => void
			mockGet.mockReturnValue(new Promise(r => { resolveGet = r }))

			const loadPromise = loadWeek()
			expect(isLoadIdle()).toBe(false)

			resolveGet(serverResponse(emptyWeek()))
			await loadPromise
		})

		it('returns true after a successful load', async () => {
			const { loadWeek, isLoadIdle } = setup()
			mockGet.mockResolvedValue(serverResponse(emptyWeek()))

			await loadWeek()

			expect(isLoadIdle()).toBe(true)
		})

		it('returns true after a failed load', async () => {
			const { loadWeek, isLoadIdle } = setup()
			mockGet.mockRejectedValue(new Error('Network error'))

			await loadWeek()

			expect(isLoadIdle()).toBe(true)
		})
	})
})
