<template>
  <collapsable-card
    :title="$t('app.print_activity.title')"
    icon="$history"
    :help-tooltip="$t('app.print_activity.help')"
    :loading="loading"
    draggable
    layout-path="dashboard.print-activity-card"
  >
    <template #menu>
      <app-btn
        icon
        :disabled="loading"
        :aria-label="$t('app.general.btn.refresh').toString()"
        @click="loadActivity(true)"
      >
        <v-icon dense>
          $refresh
        </v-icon>
      </app-btn>
    </template>

    <v-card-text>
      <div class="activity-calendar-scroll">
        <svg
          class="activity-calendar"
          :width="calendarWidth"
          :height="calendarHeight"
          :viewBox="`0 0 ${calendarWidth} ${calendarHeight}`"
          role="img"
          :aria-label="$t('app.print_activity.calendar_label').toString()"
        >
          <text
            v-for="month in calendar.months"
            :key="`month:${month.date.getTime()}`"
            class="activity-label secondary--text"
            :x="getWeekX(month.weekIndex)"
            y="10"
          >
            {{ formatMonth(month.date) }}
          </text>

          <text
            v-for="weekday in weekdays"
            :key="`weekday:${weekday.day}`"
            class="activity-label secondary--text"
            x="0"
            :y="getDayY(weekday.day) + cellSize - 1"
          >
            {{ weekday.label }}
          </text>

          <rect
            v-for="day in calendar.days"
            :key="day.dateKey"
            class="activity-cell primary--text"
            :class="{ 'activity-cell--future': day.isFuture }"
            :x="getWeekX(day.weekIndex)"
            :y="getDayY(day.weekday)"
            :width="cellSize"
            :height="cellSize"
            rx="2"
            :fill="getLevelColor(day.level, day.isFuture)"
          >
            <title v-if="!day.isFuture">{{ getDayTooltip(day) }}</title>
          </rect>
        </svg>
      </div>

      <div class="activity-footer secondary--text text-caption">
        <div class="activity-summary">
          <span>
            {{ $tc(
              'app.print_activity.job_count',
              calendar.totalJobs,
              { count: calendar.totalJobs }
            ) }}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {{ $t('app.print_activity.print_time') }}:
            {{ formatDuration(calendar.totalPrintDuration) }}
          </span>
          <template v-if="calendar.totalFilamentUsed > 0">
            <span aria-hidden="true">·</span>
            <span>
              {{ $t('app.print_activity.filament') }}:
              {{ formatFilament(calendar.totalFilamentUsed) }}
            </span>
          </template>
        </div>
      </div>
    </v-card-text>
  </collapsable-card>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator'
import { TinyColor } from '@ctrl/tinycolor'
import { getAllLocales } from '@/plugins/i18n'
import { getDateTimeFormat, getNumberFormat } from '@/util/intl-format-cache'
import {
  buildPrintActivityCalendar,
  PRINT_ACTIVITY_WEEK_COUNT,
  type PrintActivityDay
} from '@/util/print-activity'

const CELL_SIZE = 11
const CELL_GAP = 3
const LABEL_WIDTH = 26
const MONTH_LABEL_HEIGHT = 16

@Component({})
export default class PrintActivityCard extends Vue {
  readonly cellSize = CELL_SIZE
  now = new Date()
  dayChangeTimer: ReturnType<typeof setTimeout> | null = null

  mounted () {
    this.loadActivity()
    this.scheduleDayChange()
  }

  beforeDestroy () {
    if (this.dayChangeTimer !== null) clearTimeout(this.dayChangeTimer)
  }

  get calendarWidth () {
    return LABEL_WIDTH + PRINT_ACTIVITY_WEEK_COUNT * (CELL_SIZE + CELL_GAP)
  }

  get calendarHeight () {
    return MONTH_LABEL_HEIGHT + 7 * (CELL_SIZE + CELL_GAP)
  }

  get calendar () {
    return buildPrintActivityCalendar(this.activityJobs, this.now)
  }

  get activityJobs () {
    return this.$typedState.history.activityJobs
  }

  get loading () {
    return this.$typedState.history.activityLoading
  }

  get supportsHistory () {
    return this.$typedGetters['server/componentSupport']('history')
  }

  get inLayout () {
    return this.$typedState.config.layoutMode
  }

  get weekdays () {
    return [1, 3, 5].map(day => ({
      day,
      label: getDateTimeFormat(getAllLocales(), {
        weekday: 'short'
      }).format(new Date(2023, 0, day + 1))
    }))
  }

  @Watch('inLayout')
  onLayoutModeChange (inLayout: boolean) {
    if (!inLayout) this.loadActivity()
  }

  @Watch('activityJobs')
  onActivityJobsChange () {
    this.now = new Date()
  }

  async loadActivity (force = false) {
    if (!this.supportsHistory || this.inLayout) return

    try {
      await this.$typedDispatch('history/loadActivityHistory', force)
      this.now = new Date()
    } catch {
      // Socket errors are surfaced globally.
    }
  }

  scheduleDayChange () {
    if (this.dayChangeTimer !== null) clearTimeout(this.dayChangeTimer)

    const nextDay = new Date()
    nextDay.setHours(24, 0, 0, 0)

    this.dayChangeTimer = setTimeout(() => {
      this.now = new Date()
      this.scheduleDayChange()
    }, Math.max(1000, nextDay.getTime() - Date.now()))
  }

  getWeekX (weekIndex: number) {
    return LABEL_WIDTH + weekIndex * (CELL_SIZE + CELL_GAP)
  }

  getDayY (weekday: number) {
    return MONTH_LABEL_HEIGHT + weekday * (CELL_SIZE + CELL_GAP)
  }

  formatMonth (date: Date) {
    return getDateTimeFormat(getAllLocales(), { month: 'short' }).format(date)
  }

  formatDuration (seconds: number) {
    const totalSeconds = Math.max(0, Math.floor(seconds))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor(totalSeconds % 3600 / 60)
    const remainingSeconds = totalSeconds % 60
    const formatUnit = (value: number, unit: 'hour' | 'minute' | 'second') => {
      return getNumberFormat(getAllLocales(), {
        style: 'unit',
        unit,
        unitDisplay: 'short'
      }).format(value)
    }
    const parts: string[] = []

    if (hours > 0) parts.push(formatUnit(hours, 'hour'))
    if (hours > 0 || minutes > 0) parts.push(formatUnit(minutes, 'minute'))
    parts.push(formatUnit(remainingSeconds, 'second'))

    return parts.join(' ')
  }

  formatFilament (millimeters: number) {
    return this.$filters.getReadableLengthString(millimeters, { showKilometers: true })
  }

  getLevelColor (level: PrintActivityDay['level'], isFuture = false) {
    if (isFuture) return 'transparent'

    if (level === 0) {
      return this.$vuetify.theme.dark
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(0, 0, 0, 0.08)'
    }

    const alpha = [0, 0.3, 0.5, 0.72, 1][level]
    const primary = this.$vuetify.theme.currentTheme.primary?.toString() ?? '#2196f3'

    return new TinyColor(primary).setAlpha(alpha).toRgbString()
  }

  getDayTooltip (day: PrintActivityDay) {
    const date = getDateTimeFormat(getAllLocales(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(day.date)
    const jobs = this.$tc('app.print_activity.job_count', day.jobCount, {
      count: day.jobCount
    })
    const lines = [
      date,
      jobs.toString(),
      `${this.$t('app.print_activity.print_time')}: ${this.formatDuration(day.printDuration)}`
    ]

    if (day.completedCount > 0) {
      lines.push(`${this.$t('app.print_activity.completed')}: ${day.completedCount}`)
    }

    if (day.failedCount > 0) {
      lines.push(`${this.$t('app.print_activity.unsuccessful')}: ${day.failedCount}`)
    }

    if (day.filamentUsed > 0) {
      const filament = this.formatFilament(day.filamentUsed)
      lines.push(`${this.$t('app.print_activity.filament')}: ${filament}`)
    }

    return lines.join('\n')
  }
}
</script>

<style lang="scss" scoped>
.activity-calendar-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
}

.activity-calendar {
  display: block;
  margin: 0 auto;
}

.activity-label {
  fill: currentColor;
  font-size: 10px;
}

.activity-cell:not(.activity-cell--future):hover {
  stroke: currentColor;
  stroke-width: 1px;
}

.activity-footer,
.activity-summary {
  display: flex;
  align-items: center;
  gap: 6px;
}

.activity-footer {
  flex-wrap: wrap;
  justify-content: space-between;
  margin-top: 8px;
}

.activity-summary {
  flex-wrap: wrap;
}

</style>
