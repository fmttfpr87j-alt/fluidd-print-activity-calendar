import Vue from 'vue'
import Vuex, { type Store } from 'vuex'
import { SocketActions } from '@/api/socketActions'
import { history } from '@/store/history'
import type { RootState } from '@/store/types'

Vue.use(Vuex)

const job: Moonraker.History.Job = {
  job_id: 'activity',
  exists: true,
  end_time: null,
  filament_used: 100,
  filename: 'activity.gcode',
  print_duration: 3600,
  status: 'completed',
  start_time: new Date(2026, 7, 10, 12).getTime() / 1000,
  total_duration: 3600
}

const createStore = () => new Vuex.Store<RootState>({
  modules: {
    history,
    files: {
      namespaced: true,
      state: () => ({ pathContent: {} })
    },
    server: {
      namespaced: true,
      getters: {
        componentSupport: () => () => true
      }
    }
  }
})

const respondWith = (store: Store<RootState>, response: Moonraker.History.ListResponse) => {
  return vi.spyOn(SocketActions, 'serverHistoryList').mockImplementation(async (params, options) => {
    await store.dispatch(options?.dispatch ?? 'history/onHistoryList', {
      ...response,
      __request__: { jsonrpc: '2.0', id: 1, method: 'server.history.list', params }
    })

    return response
  })
}

describe('history activity loading', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 12, 12))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('loads the annual calendar without marking the recent history as fully loaded', async () => {
    const store = createStore()
    const request = respondWith(store, { count: 1, jobs: [job] })

    await store.dispatch('history/loadActivityHistory')

    expect(store.state.history.activityJobs).toEqual([job])
    expect(store.state.history.activityLoaded).toBe(true)
    expect(store.state.history.activityLoading).toBe(false)
    expect(store.state.history.jobs).toEqual([])
    expect(store.state.history.allLoaded).toBe(false)
    expect(request).toHaveBeenCalledWith({
      limit: 0,
      since: new Date(2025, 7, 10).getTime() / 1000 - 1,
      order: 'asc'
    }, { dispatch: 'history/onActivityHistoryList' })
  })

  it('reuses loaded activity history unless a refresh is requested', async () => {
    const store = createStore()
    const request = respondWith(store, { count: 1, jobs: [job] })

    await store.dispatch('history/loadActivityHistory')
    await store.dispatch('history/loadActivityHistory')

    expect(request).toHaveBeenCalledTimes(1)

    await store.dispatch('history/loadActivityHistory', true)

    expect(request).toHaveBeenCalledTimes(2)
    expect(store.state.history.activityJobs).toEqual([job])
  })

  it('clears the loading state after a failed request so it can be retried', async () => {
    const store = createStore()
    vi.spyOn(SocketActions, 'serverHistoryList').mockRejectedValueOnce(new Error('Disconnected'))

    await expect(store.dispatch('history/loadActivityHistory')).rejects.toThrow('Disconnected')

    expect(store.state.history.activityLoading).toBe(false)
    expect(store.state.history.activityLoaded).toBe(false)

    respondWith(store, { count: 1, jobs: [job] })
    await store.dispatch('history/loadActivityHistory')

    expect(store.state.history.activityJobs).toEqual([job])
    expect(store.state.history.activityLoaded).toBe(true)
  })

  it('refreshes a previously loaded calendar when history reconnects', async () => {
    const store = createStore()
    store.commit('history/setActivityHistoryList', { count: 0, jobs: [] })
    respondWith(store, { count: 1, jobs: [job] })
    vi.spyOn(SocketActions, 'serverHistoryTotals').mockResolvedValue({
      job_totals: store.state.history.job_totals,
      auxiliary_totals: []
    })

    await store.dispatch('history/init')

    expect(store.state.history.activityJobs).toEqual([job])
    expect(store.state.history.activityLoading).toBe(false)
  })

  it('keeps history initialization usable if the calendar refresh fails', async () => {
    const store = createStore()
    store.commit('history/setActivityHistoryList', { count: 1, jobs: [job] })
    vi.spyOn(SocketActions, 'serverHistoryList').mockImplementation(async (params, options) => {
      if (options?.dispatch === 'history/onActivityHistoryList') {
        throw new Error('Disconnected')
      }

      return { count: 0, jobs: [] }
    })
    vi.spyOn(SocketActions, 'serverHistoryTotals').mockResolvedValue({
      job_totals: store.state.history.job_totals,
      auxiliary_totals: []
    })

    await expect(store.dispatch('history/init')).resolves.toBeUndefined()

    expect(store.state.history.activityJobs).toEqual([job])
    expect(store.state.history.activityLoading).toBe(false)
  })
})
