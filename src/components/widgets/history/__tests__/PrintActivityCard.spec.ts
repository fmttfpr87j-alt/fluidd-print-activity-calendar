/** @vitest-environment jsdom */
import Vue from 'vue'
import Vuex from 'vuex'
import PrintActivityCard from '../PrintActivityCard.vue'
import { FiltersPlugin } from '@/plugins/filters'
import { history } from '@/store/history'
import { config } from '@/store/config'

Vue.use(Vuex)
Vue.use(FiltersPlugin)

describe('print activity card', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts jobs started after the calendar was opened on the same day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 12, 10))
    const store = new Vuex.Store({ modules: { history, config } })
    store.commit('history/setActivityHistoryList', { count: 0, jobs: [] })
    const card = new PrintActivityCard({ store })

    try {
      expect(card.calendar.totalJobs).toBe(0)
      vi.setSystemTime(new Date(2026, 7, 12, 11))
      store.commit('history/setUpdateHistory', {
        job_id: 'live',
        exists: true,
        end_time: null,
        filament_used: 0,
        filename: 'live.gcode',
        print_duration: 0,
        status: 'in_progress',
        start_time: Date.now() / 1000,
        total_duration: 0
      } satisfies Moonraker.History.Job)

      await Vue.nextTick()

      expect(card.calendar.totalJobs).toBe(1)
      expect(card.calendar.days.find(day => day.dateKey === '2026-08-12')).toMatchObject({
        jobCount: 1,
        failedCount: 0
      })
    } finally {
      card.$destroy()
    }
  })
})
