import { mutations } from '@/store/history/mutations'
import { createState } from '@/store/history/state'

const job = (
  jobId: string,
  status: Moonraker.History.Job['status'] = 'in_progress'
): Moonraker.History.Job => ({
  job_id: jobId,
  exists: true,
  end_time: null,
  filament_used: 0,
  filename: `${jobId}.gcode`,
  print_duration: 0,
  status,
  start_time: 1_700_000_000,
  total_duration: 0
})

describe('history activity mutations', () => {
  it('keeps extended activity history separate from the regular job list', () => {
    const state = createState()
    const recentJob = job('recent', 'completed')
    const activityJob = job('activity', 'completed')

    mutations.setHistoryList(state, { count: 1, jobs: [recentJob] })
    mutations.setActivityHistoryList(state, { count: 1, jobs: [activityJob] })

    expect(state.jobs.map(item => item.job_id)).toEqual(['recent'])
    expect(state.activityJobs.map(item => item.job_id)).toEqual(['activity'])
    expect(state.activityLoaded).toBe(true)
  })

  it('applies live job changes to a loaded activity history', () => {
    const state = Object.assign(createState(), {
      activityJobs: [] as Readonly<Moonraker.History.Job>[],
      activityLoaded: true,
      activityLoading: false
    })
    const startedJob = job('live')
    const finishedJob = {
      ...startedJob,
      status: 'completed' as const,
      print_duration: 3600
    }

    mutations.setUpdateHistory(state, startedJob)
    mutations.setUpdateHistory(state, startedJob)
    mutations.setUpdateHistory(state, finishedJob)

    expect(state.activityJobs).toHaveLength(1)
    expect(state.activityJobs[0]).toMatchObject({
      job_id: 'live',
      status: 'completed',
      print_duration: 3600
    })

    mutations.setDeleteJobs(state, ['live'])

    expect(state.activityJobs).toHaveLength(0)
  })

  it('updates existing activity jobs when missing history is fetched in batches', () => {
    const activityJob = job('activity')
    const state = Object.assign(createState(), {
      activityJobs: [Object.freeze(activityJob)],
      activityLoaded: true,
      activityLoading: false
    })
    state.unresolvedJobIds.add('activity')

    mutations.setUpdateHistoryJobs(state, [
      { ...activityJob, status: 'completed', print_duration: 3600 },
      job('older', 'completed')
    ])

    expect(state.activityJobs).toHaveLength(1)
    expect(state.activityJobs[0]).toMatchObject({
      job_id: 'activity',
      status: 'completed',
      print_duration: 3600
    })
    expect(state.jobs.map(item => item.job_id)).toEqual(['activity', 'older'])
    expect(state.unresolvedJobIds.has('activity')).toBe(false)
  })

  it('deletes activity jobs outside the recent history window', () => {
    const state = Object.assign(createState(), {
      activityJobs: [Object.freeze(job('activity', 'completed'))],
      activityLoaded: true,
      activityLoading: false
    })

    mutations.setDeleteJobs(state, ['activity'])

    expect(state.activityJobs).toEqual([])
    expect(state.unresolvedJobIds.has('activity')).toBe(true)
  })

  it('clears the activity cache when switching printers', () => {
    const state = Object.assign(createState(), {
      activityJobs: [Object.freeze(job('activity', 'completed'))],
      activityLoaded: true,
      activityLoading: true
    })

    mutations.setReset(state)

    expect(state.activityJobs).toEqual([])
    expect(state.activityLoaded).toBe(false)
    expect(state.activityLoading).toBe(false)
  })

  it('does not populate the activity cache until the calendar is loaded', () => {
    const state = Object.assign(createState(), {
      activityJobs: [] as Readonly<Moonraker.History.Job>[],
      activityLoaded: false,
      activityLoading: false
    })

    mutations.setUpdateHistory(state, job('live'))

    expect(state.activityJobs).toEqual([])
    expect(state.jobs).toHaveLength(1)
  })
})
