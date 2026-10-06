import {
  buildPrintActivityCalendar,
  PRINT_ACTIVITY_WEEK_COUNT,
  type PrintActivityJob
} from '@/util/print-activity'

const timestamp = (year: number, month: number, day: number, hour = 12) => {
  return new Date(year, month, day, hour).getTime() / 1000
}

const job = (
  startTime: number,
  printDuration: number,
  status: Moonraker.History.Job['status'] = 'completed',
  filamentUsed = 0
): PrintActivityJob => ({
  start_time: startTime,
  print_duration: printDuration,
  filament_used: filamentUsed,
  status
})

describe('print activity calendar', () => {
  const now = new Date(2026, 7, 12, 12)

  it('builds 53 complete Sunday-to-Saturday weeks', () => {
    const calendar = buildPrintActivityCalendar([], now)

    expect(calendar.days).toHaveLength(PRINT_ACTIVITY_WEEK_COUNT * 7)
    expect(calendar.startDate.getDay()).toBe(0)
    expect(calendar.endDate.getDay()).toBe(6)
    expect(calendar.days.filter(day => day.isFuture)).toHaveLength(3)
    expect(calendar.days[calendar.days.length - 1].dateKey).toBe('2026-08-15')
  })

  it('aggregates jobs by their local start date', () => {
    const calendar = buildPrintActivityCalendar([
      job(timestamp(2026, 7, 10), 30 * 60, 'completed', 100),
      job(timestamp(2026, 7, 10, 18), 2 * 60 * 60, 'error', 50),
      job(timestamp(2026, 7, 12), 0, 'in_progress'),
      job(timestamp(2025, 0, 1), 10 * 60 * 60),
      job(timestamp(2026, 7, 13), 10 * 60 * 60)
    ], now)

    const august10 = calendar.days.find(day => day.dateKey === '2026-08-10')
    const august12 = calendar.days.find(day => day.dateKey === '2026-08-12')

    expect(august10).toMatchObject({
      jobCount: 2,
      completedCount: 1,
      failedCount: 1,
      printDuration: 2.5 * 60 * 60,
      filamentUsed: 150,
      level: 2
    })
    expect(august12).toMatchObject({
      jobCount: 1,
      completedCount: 0,
      failedCount: 0,
      level: 1
    })
    expect(calendar.totalJobs).toBe(3)
    expect(calendar.totalPrintDuration).toBe(2.5 * 60 * 60)
    expect(calendar.totalFilamentUsed).toBe(150)
  })

  it('maps daily print time to four activity levels', () => {
    const calendar = buildPrintActivityCalendar([
      job(timestamp(2026, 7, 8), 30 * 60),
      job(timestamp(2026, 7, 9), 60 * 60),
      job(timestamp(2026, 7, 10), 4 * 60 * 60),
      job(timestamp(2026, 7, 11), 8 * 60 * 60)
    ], now)

    const getLevel = (dateKey: string) => {
      return calendar.days.find(day => day.dateKey === dateKey)?.level
    }

    expect(getLevel('2026-08-08')).toBe(1)
    expect(getLevel('2026-08-09')).toBe(2)
    expect(getLevel('2026-08-10')).toBe(3)
    expect(getLevel('2026-08-11')).toBe(4)
  })

  it('excludes interrupted records to match Moonraker job totals', () => {
    const calendar = buildPrintActivityCalendar([
      job(timestamp(2026, 7, 10), 30 * 60, 'completed', 100),
      job(timestamp(2026, 7, 10, 18), 10 * 60, 'interrupted', 50)
    ], now)

    const august10 = calendar.days.find(day => day.dateKey === '2026-08-10')

    expect(august10).toMatchObject({
      jobCount: 1,
      completedCount: 1,
      failedCount: 0,
      printDuration: 30 * 60,
      filamentUsed: 100,
      level: 1
    })
    expect(calendar.totalJobs).toBe(1)
  })
})
