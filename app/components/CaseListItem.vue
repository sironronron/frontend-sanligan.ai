<script setup lang="ts">
import { ActivityIcon, ChevronRightIcon } from '@lucide/vue'
import type { LegalCase } from '~/stores/cases'

/**
 * One case as a scannable row.
 *
 * The previous card stacked five border-separated blocks — heading, blurb,
 * meta, progress, last message, action footer — each at its own font size, so
 * two cases filled a laptop screen and nothing lined up between them. A row
 * puts the same facts on fixed columns: identity reads left, state reads
 * right, and the eye can run straight down either one.
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
    due.value?.tone === 'overdue' &&
    !props.case.archived_at &&
    props.case.status !== 'closed',
)

const doneTasks = computed(() => props.case.total_tasks_count - props.case.open_tasks_count)

const meta = computed(() => {
  const c = props.case
  const parts: Array<{ text: string; class?: string }> = []
  if (c.reference) parts.push({ text: c.reference, class: 'font-medium text-foreground/70' })
  parts.push({ text: typeLabel(c.case_type) })
  if (due.value) parts.push({ text: due.value.label, class: due.value.class })
  if (c.open_tasks_count > 0) {
    parts.push({ text: `${c.open_tasks_count} open task${c.open_tasks_count === 1 ? '' : 's'}` })
  }
  if (c.last_message_at) parts.push({ text: relativeTime(c.last_message_at) })
  if (c.archived_at) parts.push({ text: 'Archived' })
  return parts
})
</script>

<template>
  <article
    role="button"
    tabindex="0"
    class="surface-interactive group relative flex w-full cursor-pointer items-center gap-4 overflow-hidden py-3 pr-3 pl-4 text-left focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    @click="emit('open', props.case.id)"
    @keydown.enter.self="emit('open', props.case.id)"
    @keydown.space.self.prevent="emit('open', props.case.id)"
  >
    <!-- A late case earns an edge marker: visible while scrolling past, silent otherwise. -->
    <span v-if="isLate" class="absolute inset-y-0 left-0 w-1 bg-destructive" aria-hidden="true" />

    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2">
        <h3 class="truncate text-sm font-medium group-hover:text-primary">{{ props.case.title }}</h3>
        <CasePriorityBadge :priority="props.case.priority" />
      </div>

      <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <template v-for="(part, index) in meta" :key="`${part.text}-${index}`">
          <span v-if="index > 0" aria-hidden="true" class="text-muted-foreground/40">·</span>
          <span :class="part.class">{{ part.text }}</span>
        </template>
      </div>

      <p v-if="props.case.last_message_snippet" class="mt-1.5 truncate text-xs text-muted-foreground/80">
        {{ props.case.last_message_snippet }}
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-3">
      <!-- Fixed-width so the meters align down the list and can be compared. -->
      <div v-if="props.case.total_tasks_count > 0" class="hidden w-24 sm:block">
        <div class="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span>{{ doneTasks }}/{{ props.case.total_tasks_count }}</span>
          <span>{{ taskPercent(props.case) }}%</span>
        </div>
        <div class="mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${taskPercent(props.case)}%` }" />
        </div>
      </div>

      <CaseStatusBadge :status="props.case.status" />

      <!--
        Hidden on phones: the row already carries status and a chevron there,
        and progress is one tap away inside the case.
      -->
      <Button
        variant="ghost"
        size="icon-sm"
        class="hidden text-muted-foreground transition-opacity sm:inline-flex lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        :aria-label="`View progress for ${props.case.title}`"
        title="View progress"
        @click.stop="emit('progress', props.case.id)"
      >
        <ActivityIcon />
      </Button>

      <ChevronRightIcon class="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </div>
  </article>
</template>
