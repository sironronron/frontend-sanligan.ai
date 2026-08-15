<script setup lang="ts">
import { ActivityIcon, ChevronRightIcon, CrownIcon } from '@lucide/vue'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import type { CaseMember, LegalCase } from '~/stores/cases'

/**
 * One case as a scannable row.
 *
 * The facts sit on a fixed grid rather than in a wrapping sentence: every row
 * puts reference, type, deadline and last activity in the same four tracks, so
 * the eye can run straight down a column and compare cases without reading
 * each one. Empty cells hold their place instead of collapsing, which is what
 * keeps the columns true.
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

const details = computed(() => {
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

/** The owner leads; the roster below the case is the same list the avatars draw. */
const people = computed(() => {
  const list: Array<CaseMember & { isOwner: boolean }> = []

  if (props.case.owner) list.push({ ...props.case.owner, isOwner: true })

  for (const assignee of props.case.assignees ?? []) {
    if (assignee.id !== props.case.owner?.id) list.push({ ...assignee, isOwner: false })
  }

  return list
})

const peopleLabel = computed(() => {
  const n = people.value.length
  if (n === 0) return 'Unassigned'
  if (n === 1) return people.value[0]!.isOwner ? 'Owner only' : '1 person'
  return `${n} people`
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
        <h3 class="truncate text-lg font-semibold group-hover:text-primary">{{ props.case.title }}</h3>
        <CasePriorityBadge :priority="props.case.priority" />
        <span
          v-if="props.case.archived_at"
          class="shrink-0 rounded-4xl border px-1.5 text-[10px] text-muted-foreground"
        >
          Archived
        </span>
      </div>

      <!--
        Fixed tracks, not auto ones: a column that resized to its own row's
        content would defeat the point of putting these facts in columns.
      -->
      <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-[8rem_9rem_9rem_9rem]">
        <div v-for="detail in details" :key="detail.label" class="min-w-0">
          <dt class="text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase">
            {{ detail.label }}
          </dt>
          <dd class="truncate text-xs" :class="detail.class">{{ detail.text }}</dd>
        </div>
      </dl>

      <p v-if="props.case.last_message_snippet" class="mt-2 truncate text-xs text-muted-foreground/80">
        {{ props.case.last_message_snippet }}
      </p>

      <!--
        Who is on the case closes the block, below the facts about it. It is a
        button rather than a static stack because four avatars is where a row
        stops being able to answer "who exactly?" — past that the popover does.
      -->
      <Popover>
        <PopoverTrigger as-child>
          <button
            type="button"
            class="mt-2.5 -ml-1 inline-flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            :aria-label="`People on ${props.case.title}: ${peopleLabel}`"
            @click.stop
            @keydown.enter.stop
            @keydown.space.stop
          >
            <CaseMemberAvatars
              v-if="people.length > 0"
              :owner="props.case.owner"
              :assignees="props.case.assignees"
              :max="4"
              overflow-label="4+"
            />
            <span class="text-xs text-muted-foreground">{{ peopleLabel }}</span>
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" class="w-64 gap-0 p-0" @click.stop>
          <p class="border-b px-3 py-2 text-xs font-medium">On this case</p>

          <div v-if="people.length === 0" class="px-3 py-3 text-xs text-muted-foreground">
            Nobody is assigned yet.
          </div>

          <ul v-else class="max-h-64 overflow-y-auto py-1">
            <li
              v-for="person in people"
              :key="person.id"
              class="flex items-center gap-2 px-3 py-1.5"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-medium">{{ person.name }}</p>
                <p class="truncate text-[11px] text-muted-foreground">{{ person.email }}</p>
              </div>
              <CrownIcon v-if="person.isOwner" class="size-3.5 shrink-0 text-primary" aria-label="Owner" />
            </li>
          </ul>
        </PopoverContent>
      </Popover>
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
