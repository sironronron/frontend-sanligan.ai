<script setup lang="ts">
import {
  AlertTriangleIcon,
  BrainIcon,
  CalendarClockIcon,
  CheckIcon,
  CircleIcon,
  ClockIcon,
  FileTextIcon,
  FolderOpenIcon,
  Loader2Icon,
  MessageSquareIcon,
  MessagesSquareIcon,
  RefreshCwIcon,
  SparklesIcon,
  UploadIcon,
} from '@lucide/vue'
import { useCaseStore, type CaseProgress, type CaseProgressEvent } from '~/stores/cases'

const props = defineProps<{ caseId: string }>()
const emit = defineEmits<{ openThread: [id: string] }>()

const caseStore = useCaseStore()

const progress = ref<CaseProgress | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')

async function load(silent = false) {
  if (silent) refreshing.value = true
  else loading.value = true
  error.value = ''
  try {
    progress.value = await caseStore.fetchCaseProgress(props.caseId)
  } catch (err: any) {
    error.value = err?.data?.message ?? 'Could not load the case progress.'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

// The chat can add tasks, drafts, and facts while this view is mounted, so a
// case switch reloads rather than showing the previous matter's numbers.
watch(() => props.caseId, () => void load())

onMounted(() => void load())

defineExpose({ refresh: () => load(true) })

const stats = computed(() => progress.value?.stats ?? null)

const openTasks = computed(() => progress.value?.tasks.filter((t) => t.status !== 'completed') ?? [])
const completedTasks = computed(() => progress.value?.tasks.filter((t) => t.status === 'completed') ?? [])

/** Overdue first, then high priority — the order someone would work them in. */
const nextSteps = computed(() => {
  const weight: Record<string, number> = { high: 0, medium: 1, low: 2 }
  return [...openTasks.value].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    return (weight[a.priority ?? 'low'] ?? 3) - (weight[b.priority ?? 'low'] ?? 3)
  })
})

const factGroups = computed(() => {
  const facts = progress.value?.key_facts
  if (!facts) return []
  return [
    { key: 'fact', label: 'Facts', items: facts.fact ?? [] },
    { key: 'deadline', label: 'Deadlines', items: facts.deadline ?? [] },
    { key: 'strategy', label: 'Strategy', items: facts.strategy ?? [] },
    { key: 'preference', label: 'Preferences', items: facts.preference ?? [] },
  ].filter((group) => group.items.length > 0)
})

/** The timeline reads as a diary, so events are bucketed under their day. */
const timelineDays = computed(() => {
  const groups: Array<{ day: string; label: string; events: CaseProgressEvent[] }> = []
  for (const event of progress.value?.timeline ?? []) {
    const day = event.at.slice(0, 10)
    const existing = groups.at(-1)
    if (existing && existing.day === day) existing.events.push(event)
    else groups.push({ day, label: dayLabel(event.at), events: [event] })
  }
  return groups
})

const eventIcons: Record<CaseProgressEvent['type'], any> = {
  case_created: FolderOpenIcon,
  thread_created: MessagesSquareIcon,
  document_uploaded: UploadIcon,
  document_generated: FileTextIcon,
  task_created: CircleIcon,
  task_completed: CheckIcon,
  memory_recorded: BrainIcon,
  message_sent: MessageSquareIcon,
  message_received: SparklesIcon,
  case_archived: FolderOpenIcon,
}

/**
 * Five of these used to end in the same `dark:bg-cream/10 dark:text-peach`, so
 * at night an upload, a generated draft and a recorded fact were the same
 * chip. These stay distinct in both themes because they lean on token pairs
 * (accent/secondary/primary) rather than on tints of one hue.
 */
const eventTones: Record<CaseProgressEvent['type'], string> = {
  case_created: 'bg-primary/10 text-primary',
  thread_created: 'bg-primary/10 text-primary',
  document_uploaded: 'bg-secondary text-secondary-foreground',
  document_generated: 'bg-accent text-accent-foreground',
  task_created: 'bg-muted text-muted-foreground',
  task_completed: 'bg-primary text-primary-foreground',
  memory_recorded: 'bg-muted text-foreground',
  message_sent: 'bg-muted text-muted-foreground',
  message_received: 'bg-primary/10 text-primary',
  case_archived: 'bg-muted text-muted-foreground',
}

/** Matches the file chips in the case sidebar: neutral chrome, colored dot. */
const DOC_DOT: Record<string, string> = {
  queued: 'bg-muted-foreground/40',
  processing: 'bg-espresso dark:bg-peach',
  ready: 'bg-primary',
  failed: 'bg-destructive',
}

const { formatDate, relativeTime: relativeTimeOrBlank, humanize } = useCasePresentation()
const { fileIcon } = useFileTypeIcon()

function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function dayLabel(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Same wording as the case list, but a dash reads better than a gap here. */
function relativeTime(value: string | null) {
  return relativeTimeOrBlank(value) || '—'
}

function deadlineText(deadline: NonNullable<CaseProgress['deadline']>) {
  const days = deadline.days_remaining
  if (days === 0) return 'Due today'
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
  return `${days} day${days === 1 ? '' : 's'} left`
}
</script>

<template>
  <div class="px-4 py-6">
    <div v-if="loading" class="mx-auto w-full max-w-4xl space-y-4">
      <Skeleton class="h-28 w-full rounded-xl" />
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Skeleton v-for="i in 4" :key="i" class="h-20 rounded-xl" />
      </div>
      <Skeleton class="h-64 w-full rounded-xl" />
    </div>

    <div v-else-if="error" class="mx-auto w-full max-w-4xl rounded-xl border border-dashed py-16 text-center">
      <AlertTriangleIcon class="mx-auto size-8 text-muted-foreground" />
      <p class="mt-3 text-sm font-medium">{{ error }}</p>
      <Button variant="outline" size="sm" class="mt-4 gap-1.5" @click="load()">
        <RefreshCwIcon class="size-3.5" />
        Try again
      </Button>
    </div>

    <div v-else-if="progress" class="space-y-5">
      <!-- Stage track — spans the full width of the pane -->
      <section class="rounded-xl border bg-card px-4 py-3">
        <ol class="flex items-center gap-2">
          <li v-for="(stage, index) in progress.stages" :key="stage.key" class="flex flex-1 items-center gap-2">
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              :class="stage.state === 'done'
                ? 'bg-primary/15 text-primary'
                : stage.state === 'active'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground/60'"
            >
              <CheckIcon v-if="stage.state === 'done'" class="size-3.5" />
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span
              class="truncate text-xs"
              :class="stage.state === 'pending' ? 'text-muted-foreground/60' : 'font-medium'"
            >
              {{ stage.label }}
            </span>
            <span
              v-if="index < progress.stages.length - 1"
              class="h-px flex-1"
              :class="stage.state === 'done' ? 'bg-primary/30' : 'bg-border'"
            />
          </li>
        </ol>
      </section>

      <div class="mx-auto w-full max-w-4xl space-y-5">
      <!-- Where the matter stands -->
      <section class="rounded-xl border bg-card p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Case progress</p>
            <p class="mt-1 text-sm text-muted-foreground">
              Open {{ progress.stats.days_open }} day{{ progress.stats.days_open === 1 ? '' : 's' }}
              · last activity {{ relativeTime(progress.stats.last_activity_at) }}
            </p>
          </div>
          <Button variant="ghost" size="sm" class="gap-1.5 text-xs" :disabled="refreshing" @click="load(true)">
            <Loader2Icon v-if="refreshing" class="size-3.5 animate-spin" />
            <RefreshCwIcon v-else class="size-3.5" />
            Refresh
          </Button>
        </div>

        <div class="mt-4 flex items-center gap-3">
          <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-primary transition-[width] duration-500"
              :style="{ width: `${progress.progress.percent}%` }"
            />
          </div>
          <span class="shrink-0 text-sm font-semibold tabular-nums">{{ progress.progress.percent }}%</span>
        </div>
        <p class="mt-1.5 text-xs text-muted-foreground">{{ progress.progress.label }}</p>

        <div v-if="progress.case.status === 'on_hold'" class="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          This matter is on hold — the stage above reflects where it stopped.
        </div>

        <div
          v-if="progress.deadline"
          class="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          :class="progress.deadline.overdue ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'"
        >
          <CalendarClockIcon class="size-4 shrink-0" />
          <span>
            Due {{ formatDate(progress.deadline.due_date) }} — {{ deadlineText(progress.deadline) }}
          </span>
        </div>
      </section>

      <!-- Counters -->
      <section class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-xl border bg-card p-3">
          <p class="text-xl font-semibold tabular-nums">{{ progress.stats.tasks.completed }}/{{ progress.stats.tasks.total }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">Tasks done</p>
          <p v-if="progress.stats.tasks.overdue > 0" class="mt-0.5 text-xs font-medium text-destructive">
            {{ progress.stats.tasks.overdue }} overdue
          </p>
        </div>
        <div class="rounded-xl border bg-card p-3">
          <p class="text-xl font-semibold tabular-nums">{{ progress.stats.documents.total }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">Files uploaded</p>
          <p v-if="progress.stats.documents.processing > 0" class="mt-0.5 text-xs text-muted-foreground">
            {{ progress.stats.documents.processing }} still processing
          </p>
        </div>
        <div class="rounded-xl border bg-card p-3">
          <p class="text-xl font-semibold tabular-nums">{{ progress.stats.generated_documents }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">Drafts produced</p>
        </div>
        <div class="rounded-xl border bg-card p-3">
          <p class="text-xl font-semibold tabular-nums">{{ progress.stats.messages }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">Messages in {{ progress.stats.threads }} thread{{ progress.stats.threads === 1 ? '' : 's' }}</p>
        </div>
      </section>

      <!-- What the case is about -->
      <section v-if="progress.case.description || progress.case.related_parties.length || progress.case.tags.length" class="rounded-xl border bg-card p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The matter</p>
        <p v-if="progress.case.description" class="mt-2 whitespace-pre-line text-sm leading-relaxed">
          {{ progress.case.description }}
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p v-if="progress.case.related_parties.length" class="text-xs text-muted-foreground">
            <span class="font-medium">Parties:</span> {{ progress.case.related_parties.join(' · ') }}
          </p>
          <div v-if="progress.case.tags.length" class="flex flex-wrap items-center gap-1">
            <Badge v-for="tag in progress.case.tags" :key="tag" variant="secondary">{{ tag }}</Badge>
          </div>
        </div>
      </section>

      <!-- Next steps -->
      <section class="rounded-xl border bg-card p-4">
        <div class="flex items-center justify-between">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next steps</p>
          <span class="text-xs text-muted-foreground">{{ openTasks.length }} open · {{ completedTasks.length }} done</span>
        </div>

        <p v-if="nextSteps.length === 0" class="mt-2 text-sm text-muted-foreground">
          Nothing outstanding. Ask Batayan in a thread and it will draft the next steps for you.
        </p>

        <ul v-else class="mt-2 space-y-1.5">
          <li v-for="task in nextSteps" :key="task.id" class="flex items-start gap-2 rounded-lg border px-2.5 py-2">
            <component
              :is="task.status === 'on-going' ? ClockIcon : CircleIcon"
              class="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm leading-snug">{{ task.title }}</p>
              <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <CasePriorityBadge :priority="task.priority" />
                <span v-if="task.due_date" :class="task.overdue ? 'font-medium text-destructive' : ''">
                  Due {{ formatDate(task.due_date) }}
                </span>
                <span v-else-if="task.due_hint">{{ task.due_hint }}</span>
                <span v-if="task.thread">{{ task.thread }}</span>
              </div>
            </div>
          </li>
        </ul>

        <details v-if="completedTasks.length > 0" class="mt-3">
          <summary class="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            {{ completedTasks.length }} completed task{{ completedTasks.length === 1 ? '' : 's' }}
          </summary>
          <ul class="mt-2 space-y-1">
            <li v-for="task in completedTasks" :key="task.id" class="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckIcon class="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span class="line-through">{{ task.title }}</span>
            </li>
          </ul>
        </details>
      </section>

      <!-- What Batayan remembers -->
      <section v-if="factGroups.length > 0" class="rounded-xl border bg-card p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What Batayan remembers</p>
        <div class="mt-3 space-y-3">
          <div v-for="group in factGroups" :key="group.key">
            <p class="text-sm font-medium">{{ group.label }}</p>
            <ul class="mt-1 space-y-1">
              <li v-for="item in group.items" :key="item.id" class="flex items-start gap-2 text-sm leading-snug text-muted-foreground">
                <span class="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                <span>{{ item.content }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Work product -->
      <section class="grid gap-3 md:grid-cols-2">
        <div class="rounded-xl border bg-card p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drafts produced</p>
          <p v-if="progress.generated_documents.length === 0" class="mt-2 text-sm text-muted-foreground">
            No drafts yet.
          </p>
          <ul v-else class="mt-2 space-y-1.5">
            <li v-for="doc in progress.generated_documents" :key="doc.id" class="flex items-start gap-2">
              <FileTextIcon class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">{{ doc.title }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ formatDate(doc.created_at) }}<template v-if="doc.thread"> · {{ doc.thread }}</template>
                </p>
              </div>
            </li>
          </ul>
        </div>

        <div class="rounded-xl border bg-card p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Files on file</p>
          <p v-if="progress.documents.length === 0" class="mt-2 text-sm text-muted-foreground">
            No documents uploaded yet.
          </p>
          <ul v-else class="mt-2 space-y-1.5">
            <li v-for="doc in progress.documents" :key="doc.id" class="flex items-start gap-2">
              <component :is="fileIcon(doc.original_filename)" class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ doc.title }}</p>
                <p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span class="size-1.5 shrink-0 rounded-full" :class="DOC_DOT[doc.status]" aria-hidden="true" />
                  {{ humanize(doc.status) }}
                  <span aria-hidden="true" class="text-muted-foreground/40">·</span>
                  {{ formatDate(doc.created_at) }}
                </p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <!-- Threads -->
      <section class="rounded-xl border bg-card p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lines of work</p>
        <ul class="mt-2 space-y-1.5">
          <li v-for="thread in progress.threads" :key="thread.id">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
              @click="emit('openThread', thread.id)"
            >
              <MessagesSquareIcon class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ thread.label }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">
                {{ thread.messages_count }} message{{ thread.messages_count === 1 ? '' : 's' }}
                <template v-if="thread.open_tasks > 0"> · {{ thread.open_tasks }} open</template>
                <template v-if="thread.last_message_at"> · {{ relativeTime(thread.last_message_at) }}</template>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <!-- Full history -->
      <section class="rounded-xl border bg-card p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</p>

        <div class="mt-3 space-y-4">
          <div v-for="group in timelineDays" :key="group.day">
            <p class="text-xs font-medium text-muted-foreground">{{ group.label }}</p>
            <ol class="mt-2 space-y-2">
              <li v-for="(event, index) in group.events" :key="`${event.type}-${event.at}-${index}`" class="flex gap-2.5">
                <span
                  class="flex size-6 shrink-0 items-center justify-center rounded-full"
                  :class="eventTones[event.type]"
                >
                  <component :is="eventIcons[event.type]" class="size-3" />
                </span>
                <div class="min-w-0 flex-1 pt-0.5">
                  <p class="text-sm">
                    <span class="font-medium">{{ event.title }}</span>
                    <span class="ml-1.5 text-xs text-muted-foreground">{{ formatTime(event.at) }}</span>
                  </p>
                  <p v-if="event.description" class="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                    {{ event.description }}
                  </p>
                  <p v-if="event.meta?.thread" class="mt-0.5 text-xs text-muted-foreground/80">{{ event.meta.thread }}</p>
                </div>
              </li>
            </ol>
          </div>
        </div>

        <p v-if="progress.timeline_truncated" class="mt-3 text-xs text-muted-foreground">
          Showing the most recent activity only — older entries are trimmed.
        </p>
      </section>
    </div>
  </div>
</div>
</template>
