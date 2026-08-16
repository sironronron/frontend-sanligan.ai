<script setup lang="ts">
import { CheckIcon, CircleIcon, ClockIcon } from '@lucide/vue'
import { useTodoStore, type Todo } from '~/stores/todos'

/**
 * One task in the sidebar's "Next up" list.
 *
 * Its own component because the list renders twice — inline when the sidebar is
 * open, inside a popover when it is collapsed — and a row carrying a status
 * control, a priority mark, and a due chip is too much to keep in sync by hand
 * in two places.
 *
 * Two targets in one row: the status circle cycles the task's state where it
 * stands, and everything else opens the thread it came from. The circle stops
 * propagation so ticking something off never navigates away from what you were
 * doing — the whole point of acting on it from the sidebar.
 */
const props = defineProps<{
  todo: Todo
  /** Popover rows sit on the popover surface, inline rows on the sidebar accent. */
  variant?: 'inline' | 'popover'
}>()

const emit = defineEmits<{ open: [todo: Todo] }>()

const todoStore = useTodoStore()

const STATUS_LABEL: Record<Todo['status'], string> = {
  pending: 'Pending',
  'on-going': 'On-going',
  completed: 'Completed',
}

const statusIcon = computed(() =>
  props.todo.status === 'completed'
    ? CheckIcon
    : props.todo.status === 'on-going'
      ? ClockIcon
      : CircleIcon,
)

/**
 * Filled once the task is moving, hollow while it is still untouched — the
 * state should read from the mark itself, not only from its colour.
 */
const statusClass = computed(() => {
  switch (props.todo.status) {
    case 'completed':
      return 'border-forest bg-forest text-cream dark:border-peach dark:bg-peach dark:text-espresso'
    case 'on-going':
      return 'border-espresso text-espresso dark:border-peach dark:text-peach'
    default:
      return 'border-sidebar-foreground/30 text-transparent hover:border-primary hover:text-primary/40'
  }
})

const PRIORITY_CLASS: Record<string, string> = {
  high: 'bg-destructive/15 text-destructive',
  medium: 'bg-peach/60 text-espresso dark:bg-cream/10 dark:text-peach',
  low: 'bg-sidebar-accent text-sidebar-foreground/60',
}

const priorityClass = computed(() =>
  props.todo.priority ? (PRIORITY_CLASS[props.todo.priority] ?? '') : '',
)

/** The due date as the user would say it, falling back to the AI's own hint. */
const dueLabel = computed(() => {
  if (!props.todo.due_date) return props.todo.due_hint

  const due = new Date(`${props.todo.due_date}T00:00:00`)
  if (Number.isNaN(due.getTime())) return props.todo.due_hint

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)

  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 7) return `In ${days}d`

  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
})

const overdue = computed(() => {
  if (!props.todo.due_date) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return new Date(`${props.todo.due_date}T00:00:00`).getTime() < today.getTime()
})

async function cycleStatus() {
  try {
    await todoStore.toggleStatus(props.todo.id)
  } catch {
    // The board and the tasks page own error reporting for this; a sidebar
    // glance should not throw a toast over whatever the user is reading.
  }
}
</script>

<template>
  <div
    class="group/task flex items-start gap-2 rounded-lg py-1.5 pr-1.5 pl-1 transition-colors"
    :class="variant === 'popover' ? 'hover:bg-accent' : 'hover:bg-sidebar-accent'"
  >
    <button
      type="button"
      role="checkbox"
      :aria-checked="todo.status === 'completed'"
      :aria-label="`${todo.title} — ${STATUS_LABEL[todo.status]}. Change status.`"
      :title="`${STATUS_LABEL[todo.status]} — click to change`"
      class="mt-px flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      :class="statusClass"
      @click.stop="cycleStatus"
    >
      <component :is="statusIcon" class="size-2.5" stroke-width="3" />
    </button>

    <button
      type="button"
      class="min-w-0 flex-1 text-left"
      @click="emit('open', todo)"
    >
      <span
        class="block truncate text-xs leading-snug"
        :class="todo.status === 'completed'
          ? 'text-sidebar-foreground/40 line-through'
          : 'text-sidebar-foreground/90'"
      >
        {{ todo.title }}
      </span>

      <span v-if="todo.priority || dueLabel" class="mt-1 flex items-center gap-1.5">
        <span
          v-if="todo.priority"
          class="rounded px-1 py-px text-[10px] font-medium uppercase leading-none tracking-wide"
          :class="priorityClass"
        >
          {{ todo.priority }}
        </span>
        <span
          v-if="dueLabel"
          class="flex items-center gap-0.5 text-[11px] leading-none"
          :class="overdue ? 'font-medium text-destructive' : 'text-sidebar-foreground/50'"
        >
          <ClockIcon class="size-2.5" />
          {{ dueLabel }}
        </span>
      </span>
    </button>
  </div>
</template>
