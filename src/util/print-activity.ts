export const PRINT_ACTIVITY_WEEK_COUNT = 53

const HOUR_IN_SECONDS = 60 * 60
const ACTIVITY_LEVEL_THRESHOLDS = [
  HOUR_IN_SECONDS,
  HOUR_IN_SECONDS * 4,
  HOUR_IN_SECONDS * 8
] as const

export interface PrintActivityDay {
  date: Date;
  dateKey: string;
  weekIndex: number;
  weekday: number;
  isFuture: boolean;
  jobCount: number;
  completedCount: number;
  failedCount: number;
  printDuration: number;
  filamentUsed: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface PrintActivityMonth {
  date: Date;
  weekIndex: number;
}

export interface PrintActivityCalendar {
  startDate: Date;
  endDate: Date;
  days: PrintActivityDay[];
  months: PrintActivityMonth[];
  totalJobs: number;
  totalPrintDuration: number;
  totalFilamentUsed: number;
}

export type PrintActivityJob = Pick<
  Moonraker.History.Job,
  'filament_used' | 'print_duration' | 'start_time' | 'status'
>

const startOfDay = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

const addDays = (date: Date, days: number) => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)

  return result
}

const getDateKey = (date: Date) => {
  const year = date.getFullYear().toString()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')

  return `${year}-${month}-${day}`
}

export const getPrintActivityStartDate = (now = new Date()) => {
  const today = startOfDay(now)
  const currentWeekStart = addDays(today, -today.getDay())

  return addDays(currentWeekStart, -(PRINT_ACTIVITY_WEEK_COUNT - 1) * 7)
}

const getActivityLevel = (jobCount: number, printDuration: number): PrintActivityDay['level'] => {
  if (jobCount === 0) return 0
  if (printDuration < ACTIVITY_LEVEL_THRESHOLDS[0]) return 1
  if (printDuration < ACTIVITY_LEVEL_THRESHOLDS[1]) return 2
  if (printDuration < ACTIVITY_LEVEL_THRESHOLDS[2]) return 3

  return 4
}

const isCompleted = (status: Moonraker.History.Job['status']) => status === 'completed'

const isInProgress = (status: Moonraker.History.Job['status']) => {
  return status === 'in_progress' || status === 'printing'
}

export const buildPrintActivityCalendar = (
  jobs: readonly PrintActivityJob[],
  now = new Date()
): PrintActivityCalendar => {
  const today = startOfDay(now)
  const startDate = getPrintActivityStartDate(now)
  const endDate = addDays(startDate, PRINT_ACTIVITY_WEEK_COUNT * 7 - 1)
  const days: PrintActivityDay[] = []
  const daysByDate = new Map<string, PrintActivityDay>()
  const months: PrintActivityMonth[] = []

  for (let dayIndex = 0; dayIndex < PRINT_ACTIVITY_WEEK_COUNT * 7; dayIndex++) {
    const date = addDays(startDate, dayIndex)
    const day: PrintActivityDay = {
      date,
      dateKey: getDateKey(date),
      weekIndex: Math.floor(dayIndex / 7),
      weekday: date.getDay(),
      isFuture: date > today,
      jobCount: 0,
      completedCount: 0,
      failedCount: 0,
      printDuration: 0,
      filamentUsed: 0,
      level: 0
    }

    days.push(day)
    daysByDate.set(day.dateKey, day)

    if (!day.isFuture && date.getDate() === 1) {
      months.push({ date, weekIndex: day.weekIndex })
    }
  }

  for (const job of jobs) {
    // Moonraker creates interrupted records when it finds a previous job that
    // never finished, and excludes those records from its job totals.
    if (job.status === 'interrupted') continue
    if (!Number.isFinite(job.start_time)) continue

    const jobDate = new Date(job.start_time * 1000)
    if (jobDate > now) continue

    const day = daysByDate.get(getDateKey(jobDate))
    if (!day) continue

    day.jobCount++
    day.printDuration += Math.max(0, Number.isFinite(job.print_duration) ? job.print_duration : 0)
    day.filamentUsed += Math.max(0, Number.isFinite(job.filament_used) ? job.filament_used : 0)

    if (isCompleted(job.status)) {
      day.completedCount++
    } else if (!isInProgress(job.status)) {
      day.failedCount++
    }
  }

  let totalJobs = 0
  let totalPrintDuration = 0
  let totalFilamentUsed = 0

  for (const day of days) {
    day.level = getActivityLevel(day.jobCount, day.printDuration)

    if (!day.isFuture) {
      totalJobs += day.jobCount
      totalPrintDuration += day.printDuration
      totalFilamentUsed += day.filamentUsed
    }
  }

  return {
    startDate,
    endDate,
    days,
    months,
    totalJobs,
    totalPrintDuration,
    totalFilamentUsed
  }
}
