<script setup lang="ts">
import { ActivityIcon } from '@lucide/vue'
import type { LegalCase } from '~/stores/cases'

/**
 * One case as a tile.
 *
 * The row layout puts its facts in fixed columns so the eye can run down them;
 * a card cannot do that, and pretending otherwise just makes a narrow row. So
 * the card leans the other way: the title gets real room, and the facts
 * underneath are labelled pairs that read on their own.
 */
const props = defineProps<{
  case: LegalCase
}>()

const emit = defineEmits<{
  open: [id: string]
  progress: [id: string]
}>()

const { typeLabel, relativeTime, dueState, taskPercent } = useCasePresentation()

const due = computed(() => dueState(props.case.due_date))

/** Only a live case can be late; a closed or archived one is just history. */
const isLate = computed(
  () =>
    due.value?.tone === 'overdue'
    && !props.case.archived_at
    && props.case.status !== 'closed',
)

const doneTasks = computed(() => props.case.total_tasks_count - props.case.open_tasks_count)

const facts = computed(() => {
  const c = props.case
  const muted = 'text-muted-foreground/50'

  return [
    {
      label: 'Reference',
      text: c.reference || 'None',
      class: c.reference ? 'font-medium text-foreground/80' : muted,
    },
    { label: 'Type', text: typeLabel(c.case_type), class: 'text-muted-foreground' },
    {
      label: 'Due',
      text: due.value?.label ?? 'No deadline',
      class: due.value?.class ?? muted,
    },
    {
      label: 'Activity',
      text: c.last_message_at ? relativeTime(c.last_message_at) : 'No messages',
      class: c.last_message_at ? 'text-muted-foreground' : muted,
    },
  ]
})
</script>

<template>
  <article
    role="button"
    tabindex="0"
    class="surface-interactive group relative flex h-full cursor-pointer flex-col gap-3 overflow-hidden p-4 text-left focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    @click="emit('open', props.case.id)"
    @keydown.enter.self="emit('open', props.case.id)"
    @keydown.space.self.prevent="emit('open', props.case.id)"
  >
    <!-- Same edge marker the row uses, so a late case reads the same either way. -->
    <span v-if="isLate" class="absolute inset-y-0 left-0 w-1 bg-destructive" aria-hidden="true" />

    <div class="flex items-start gap-2">
      <h3 class="line-clamp-2 min-w-0 flex-1 text-base font-semibold group-hover:text-primary">
        {{ props.case.title }}
      </h3>
      <Button
        variant="ghost"
        size="icon-sm"
        class="-mt-1 shrink-0 text-muted-foreground transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        :aria-label="`View progress for ${props.case.title}`"
        title="View progress"
        @click.stop="emit('progress', props.case.id)"
      >
        <ActivityIcon />
      </Button>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <CaseStatusBadge :status="props.case.status" />
      <CasePriorityBadge :priority="props.case.priority" />
      <span
        v-if="props.case.archived_at"
        class="rounded-4xl border px-1.5 text-[10px] text-muted-foreground"
      >
        Archived
      </span>
    </div>

    <dl class="grid grid-cols-2 gap-x-4 gap-y-2">
      <div v-for="fact in facts" :key="fact.label" class="min-w-0">
        <dt class="text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase">
          {{ fact.label }}
        </dt>
        <dd class="truncate text-xs" :class="fact.class">{{ fact.text }}</dd>
      </div>
    </dl>

    <p v-if="props.case.last_message_snippet" class="line-clamp-2 text-xs text-muted-foreground/80">
      {{ props.case.last_message_snippet }}
    </p>

    <!-- Pinned to the foot so the meter and roster line up across the grid. -->
    <div class="mt-auto space-y-3 pt-1">
      <div v-if="props.case.total_tasks_count > 0">
        <div class="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span>{{ doneTasks }}/{{ props.case.total_tasks_count }} tasks</span>
          <span>{{ taskPercent(props.case) }}%</span>
        </div>
        <div class="mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${taskPercent(props.case)}%` }" />
        </div>
      </div>

      <CaseMemberAvatars
        v-if="props.case.owner"
        :owner="props.case.owner"
        :assignees="props.case.assignees"
        :max="4"
        overflow-label="4+"
      />
    </div>
  </article>
</template>
