<script setup lang="ts">
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue'
import { cn } from '~/lib/utils'

/**
 * One schedule item the calendar can pin to a day. Todo store entries and the
 * case record's tasks carry due dates; the case itself carries a deadline.
 */
export interface ScheduleEvent {
  id: string
  title: string
  /** Calendar date, YYYY-MM-DD. */
  date: string
  kind: 'deadline' | 'task'
  status?: 'pending' | 'on-going' | 'completed'
}

/**
 * The case's schedule, one day at a time.
 *
 * A case already scatters its due dates across the case brief (deadline) and
 * the tasks panel (per-task due dates), so the sidebar's left rail is where
 * they should come together. The calendar sits above the materials tabs —
 * threads, files, drafts — because it is the case's time, not its content, and
 * it stays a mini view: month/week/today, a strip of dots per day, and the
 * selected day's items underneath. The whole panel collapses to its header so
 * the rail hands the vertical space back to the lists, and it starts collapsed
 * — the header still reports how much is due — so the materials own the rail
 * unless the user reaches for the calendar.
 */
const props = defineProps<{
  events: ScheduleEvent[]
}>()

type Mode = 'month' | 'week' | 'today'

const collapsed = ref(true)
const mode = ref<Mode>('month')
const cursor = ref(startOfDay(new Date()))
const selected = ref(startOfDay(new Date()))

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const modeOptions: Array<{ key: Mode; label: string }> = [
  { key: 'month', label: 'Month' },
  { key: 'week', label: 'Week' },
  { key: 'today', label: 'Today' },
]

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number) {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Monday is the first day of the week. */
function startOfWeek(d: Date) {
  const out = startOfDay(d)
  return addDays(out, -((out.getDay() + 6) % 7))
}

function toKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayKey() {
  const d = new Date()
  return toKey(d)
}

const eventsByDate = computed(() => {
  const map = new Map<string, ScheduleEvent[]>()
  for (const event of props.events) {
    const list = map.get(event.date) ?? []
    list.push(event)
    map.set(event.date, list)
  }
  return map
})

interface DayCell {
  key: string
  date: Date
  day: number
  weekday: number
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  events: ScheduleEvent[]
}

function cellFor(date: Date, inMonth: boolean): DayCell {
  const key = toKey(date)
  return {
    key,
    date,
    day: date.getDate(),
    weekday: (date.getDay() + 6) % 7,
    inMonth,
    isToday: key === todayKey(),
    isSelected: key === toKey(selected.value),
    events: eventsByDate.value.get(key) ?? [],
  }
}

const monthWeeks = computed<DayCell[][]>(() => {
  const first = new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1)
  const start = addDays(first, -((first.getDay() + 6) % 7))
  const weeks: DayCell[][] = []
  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = []
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, w * 7 + i)
      week.push(cellFor(date, date.getMonth() === cursor.value.getMonth()))
    }
    weeks.push(week)
  }
  return weeks
})

const weekDays = computed<DayCell[]>(() => {
  const start = startOfWeek(cursor.value)
  const cells: DayCell[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i)
    cells.push(cellFor(date, true))
  }
  return cells
})

const selectedEvents = computed(() => eventsByDate.value.get(toKey(selected.value)) ?? [])

function selectDay(date: Date) {
  selected.value = startOfDay(date)
  cursor.value = startOfDay(date)
}

function goToday() {
  const today = startOfDay(new Date())
  selected.value = today
  cursor.value = today
  mode.value = 'today'
}

function prevPeriod() {
  if (mode.value === 'month') {
    cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() - 1, 1)
  } else if (mode.value === 'week') {
    cursor.value = addDays(cursor.value, -7)
  } else {
    selected.value = addDays(selected.value, -1)
  }
}

function nextPeriod() {
  if (mode.value === 'month') {
    cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + 1, 1)
  } else if (mode.value === 'week') {
    cursor.value = addDays(cursor.value, 7)
  } else {
    selected.value = addDays(selected.value, 1)
  }
}

const periodLabel = computed(() => {
  if (mode.value === 'month') {
    return cursor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }
  if (mode.value === 'week') {
    const start = startOfWeek(cursor.value)
    const end = addDays(start, 6)
    const startText = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const endText = end.toLocaleDateString(
      undefined,
      start.getMonth() === end.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' },
    )
    return `${startText} – ${endText}`
  }
  return selected.value.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
})

const selectedLabel = computed(() =>
  selected.value.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
)

const selectedIsToday = computed(() => toKey(selected.value) === todayKey())

const periodCount = computed(() => {
  if (mode.value === 'month') {
    return monthWeeks.value.flat().reduce((total, cell) => total + cell.events.length, 0)
  }
  if (mode.value === 'week') {
    return weekDays.value.reduce((total, cell) => total + cell.events.length, 0)
  }
  return selectedEvents.value.length
})

const countLabel = computed(() => {
  if (periodCount.value === 0) return 'nothing due'
  return `${periodCount.value} due`
})

const showAll = ref(false)

function eventDotClass(event: ScheduleEvent) {
  if (event.kind === 'deadline') return 'bg-destructive'
  if (event.status === 'completed') return 'bg-muted-foreground/50'
  if (event.status === 'on-going') return 'bg-espresso dark:bg-peach'
  return 'bg-primary'
}

function cellClass(cell: DayCell) {
  return cn(
    'flex h-6 flex-col items-center justify-center rounded-md text-[11px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
    cell.isToday && cell.isSelected
      ? 'bg-primary text-primary-foreground font-semibold'
      : cell.isSelected
        ? 'bg-primary/15 text-primary font-semibold'
        : cell.isToday
          ? 'ring-1 ring-inset ring-primary text-foreground font-semibold'
          : cell.inMonth
            ? 'text-foreground hover:bg-muted'
            : 'text-muted-foreground/40 hover:bg-muted',
  )
}
</script>

<template>
  <div class="shrink-0 border-b">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
    >
      <span class="flex items-center gap-1.5">
        <CalendarIcon class="size-3.5" />
        Calendar
      </span>
      <span class="flex items-center gap-1.5">
        <span v-if="periodCount > 0" class="text-[10px] tabular-nums text-muted-foreground/70">{{ countLabel }}</span>
        <ChevronDownIcon class="size-3.5 transition-transform" :class="collapsed ? '-rotate-90' : ''" />
      </span>
    </button>

    <div v-if="!collapsed" class="space-y-1.5 px-2 pb-2">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          :aria-label="mode === 'today' ? 'Previous day' : 'Previous period'"
          @click="prevPeriod"
        >
          <ChevronLeftIcon class="size-3.5" />
        </button>
        <span class="min-w-0 flex-1 truncate text-center text-xs font-semibold text-foreground">{{ periodLabel }}</span>
        <button
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          :aria-label="mode === 'today' ? 'Next day' : 'Next period'"
          @click="nextPeriod"
        >
          <ChevronRightIcon class="size-3.5" />
        </button>
      </div>

      <div class="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
        <button
          v-for="option in modeOptions"
          :key="option.key"
          type="button"
          class="h-6 flex-1 rounded text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          :class="mode === option.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="mode = option.key"
        >
          {{ option.label }}
        </button>
      </div>

      <!-- Monthly grid -->
      <div v-if="mode === 'month'">
        <div class="grid grid-cols-7 text-center text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          <span v-for="day in WEEKDAYS" :key="day" class="py-0.5">{{ day }}</span>
        </div>
        <div v-for="(week, index) in monthWeeks" :key="index" class="grid grid-cols-7 gap-px">
          <button
            v-for="cell in week"
            :key="cell.key"
            type="button"
            :class="cellClass(cell)"
            :aria-label="cell.date.toDateString()"
            @click="selectDay(cell.date)"
          >
            <span class="leading-none">{{ cell.day }}</span>
            <span class="mt-0.5 flex h-1 items-center gap-0.5">
              <span
                v-for="(dot, i) in cell.events.slice(0, 3)"
                :key="`${cell.key}-${i}`"
                class="size-1 rounded-full"
                :class="eventDotClass(dot)"
              />
            </span>
          </button>
        </div>
      </div>

      <!-- Weekly strip -->
      <div v-else-if="mode === 'week'">
        <div class="grid grid-cols-7 gap-px">
          <button
            v-for="cell in weekDays"
            :key="cell.key"
            type="button"
            class="flex h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            :class="cell.isToday && cell.isSelected
              ? 'bg-primary text-primary-foreground'
              : cell.isSelected
                ? 'bg-primary/15 text-primary'
                : cell.isToday
                  ? 'ring-1 ring-inset ring-primary'
                  : 'text-foreground hover:bg-muted'"
            :aria-label="cell.date.toDateString()"
            @click="selectDay(cell.date)"
          >
            <span class="text-[9px] font-medium uppercase text-muted-foreground" :class="cell.isToday && cell.isSelected ? 'text-primary-foreground/70' : ''">
              {{ WEEKDAYS[cell.weekday] }}
            </span>
            <span class="leading-none font-medium">{{ cell.day }}</span>
            <span class="flex h-1 items-center gap-0.5">
              <span
                v-for="(dot, i) in cell.events.slice(0, 3)"
                :key="`${cell.key}-${i}`"
                class="size-1 rounded-full"
                :class="eventDotClass(dot)"
              />
            </span>
          </button>
        </div>
      </div>

      <!-- Today / selected-day agenda -->
      <div class="mt-0.5 border-t pt-1.5">
        <div class="flex items-center justify-between gap-1 px-0.5">
          <p class="truncate text-[11px] font-medium text-foreground">
            {{ selectedLabel }}
            <span
              v-if="selectedIsToday"
              class="ml-1 rounded bg-primary/10 px-1 py-px align-middle text-[9px] font-semibold uppercase tracking-wide text-primary"
            >
              Today
            </span>
          </p>
          <button
            type="button"
            class="shrink-0 text-[10px] font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            @click="goToday"
          >
            Jump to today
          </button>
        </div>

        <p v-if="selectedEvents.length === 0" class="px-0.5 pt-1 text-[11px] text-muted-foreground">
          Nothing scheduled this day.
        </p>
        <div v-else class="mt-0.5 space-y-0.5">
          <button
            v-for="event in (showAll ? selectedEvents : selectedEvents.slice(0, 3))"
            :key="event.id"
            type="button"
            class="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            :title="event.title"
          >
            <span class="size-1.5 shrink-0 rounded-full" :class="eventDotClass(event)" />
            <span class="min-w-0 flex-1 truncate text-[11px] text-foreground">{{ event.title }}</span>
            <span
              v-if="event.kind === 'deadline'"
              class="shrink-0 rounded bg-destructive/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-destructive"
            >
              Deadline
            </span>
            <span
              v-else-if="event.status === 'completed'"
              class="shrink-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Done
            </span>
          </button>
          <button
            v-if="selectedEvents.length > 3"
            type="button"
            class="px-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            @click="showAll = !showAll"
          >
            {{ showAll ? 'Show fewer' : `+${selectedEvents.length - 3} more` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>