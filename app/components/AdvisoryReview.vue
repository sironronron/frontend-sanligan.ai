<script setup lang="ts">
import {
  CalendarClockIcon,
  CheckIcon,
  CircleHelpIcon,
  EyeIcon,
  LightbulbIcon,
  ListPlusIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  Undo2Icon,
  XIcon,
} from '@lucide/vue'
import type { Component } from 'vue'
import { toast } from '~/components/ui/sonner'
import {
  useAdvisoryStore,
  type Advisory,
  type AdvisoryKind,
  type AdvisorySeverity,
  type AdvisoryStatus,
} from '~/stores/advisories'

/**
 * The caveats, gaps, and assumptions an answer carried, surfaced as something
 * the user answers rather than something they scroll past.
 *
 * They used to live only in the "Caveats and next steps" prose at the bottom of
 * a reply — the part of a long legal answer a reader reliably never reaches.
 * Here they are a count in the corner of the conversation, and each one gets a
 * disposition: file it as a task, wave it off, come back to it, or mark it
 * handled.
 */
const props = withDefaults(defineProps<{
  conversationId: string | null
  /** Closed and archived matters are read-only: nothing can be answered. */
  readonly?: boolean
}>(), { readonly: false })

const store = useAdvisoryStore()

const open = ref(false)
const busyId = ref<string | null>(null)
const noteFor = ref<string | null>(null)
const noteDraft = ref('')

const items = computed(() => store.forConversation(props.conversationId))
const openItems = computed(() => items.value.filter((a) => a.status === 'open'))
const answeredItems = computed(() => items.value.filter((a) => a.status !== 'open'))
const highCount = computed(() => openItems.value.filter((a) => a.severity === 'high').length)

/**
 * The pill is worth showing while anything is unanswered, and stays available
 * afterwards so the user can reread what they waved off — but it stops
 * demanding attention once the list is clear.
 */
const visible = computed(() => items.value.length > 0)

const kindMeta: Record<AdvisoryKind, { label: string; icon: Component }> = {
  caveat: { label: 'Caveat', icon: CircleHelpIcon },
  gap: { label: 'Missing fact', icon: LightbulbIcon },
  risk: { label: 'Exposure', icon: ShieldAlertIcon },
  assumption: { label: 'Assumption', icon: EyeIcon },
  deadline: { label: 'Deadline', icon: CalendarClockIcon },
}

const severityMeta: Record<AdvisorySeverity, { label: string; chip: string; rail: string }> = {
  high: {
    label: 'High',
    chip: 'bg-destructive/10 text-destructive',
    rail: 'bg-destructive',
  },
  medium: {
    label: 'Medium',
    chip: 'bg-peach/60 text-espresso dark:bg-cream/10 dark:text-peach',
    rail: 'bg-peach dark:bg-peach/70',
  },
  low: {
    label: 'Low',
    chip: 'bg-muted text-muted-foreground',
    rail: 'bg-border',
  },
}

const statusMeta: Record<Exclude<AdvisoryStatus, 'open'>, { label: string; icon: Component; chip: string }> = {
  tracked: { label: 'Added to tasks', icon: ListPlusIcon, chip: 'bg-primary/10 text-primary' },
  not_a_problem: { label: 'Not a problem', icon: XIcon, chip: 'bg-muted text-muted-foreground' },
  will_check: { label: 'Will check', icon: EyeIcon, chip: 'bg-peach/60 text-espresso dark:bg-cream/10 dark:text-peach' },
  mitigated: { label: 'Handled', icon: ShieldCheckIcon, chip: 'bg-forest/10 text-forest dark:bg-peach/10 dark:text-peach' },
}

/** The four dispositions, in the order the dialog offers them. */
const actions: Array<{ status: Exclude<AdvisoryStatus, 'open'>; label: string; icon: Component; hint: string }> = [
  { status: 'tracked', label: 'Add to tasks', icon: ListPlusIcon, hint: 'Files it on this thread’s task list' },
  { status: 'will_check', label: 'Will check', icon: EyeIcon, hint: 'Keeps it listed, marked as yours to verify' },
  { status: 'mitigated', label: 'Handled', icon: ShieldCheckIcon, hint: 'Already dealt with' },
  { status: 'not_a_problem', label: 'Not a problem', icon: XIcon, hint: 'Does not apply to this matter' },
]

const pillLabel = computed(() => {
  const count = openItems.value.length
  if (count === 0) return 'Reviewed'
  return count === 1 ? '1 thing to check' : `${count} things to check`
})

async function respond(advisory: Advisory, status: Exclude<AdvisoryStatus, 'open'>) {
  if (props.readonly || busyId.value) return

  busyId.value = advisory.id
  const note = noteFor.value === advisory.id ? noteDraft.value.trim() : undefined

  try {
    await store.respond(advisory.id, status, note || undefined)
    if (status === 'tracked') toast.success('Added to your tasks')
    if (noteFor.value === advisory.id) closeNote()
  } catch {
    toast.error('Could not save your answer')
  } finally {
    busyId.value = null
  }
}

async function reopen(advisory: Advisory) {
  if (props.readonly || busyId.value) return

  busyId.value = advisory.id
  try {
    await store.respond(advisory.id, 'open')
  } catch {
    toast.error('Could not reopen this item')
  } finally {
    busyId.value = null
  }
}

function toggleNote(advisory: Advisory) {
  if (noteFor.value === advisory.id) {
    closeNote()
    return
  }
  noteFor.value = advisory.id
  noteDraft.value = advisory.note ?? ''
}

function closeNote() {
  noteFor.value = null
  noteDraft.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) open.value = false
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// A thread with nothing left to answer should not keep a dialog open over it.
watch(visible, (shown) => {
  if (!shown) open.value = false
})

watch(() => props.conversationId, () => {
  open.value = false
  closeNote()
})
</script>

<template>
  <!--
    Anchored inside the conversation column rather than to the viewport, so it
    never lands on top of the tasks or sources rail on a wide screen.
  -->
  <Transition name="advisory-pill">
    <button
      v-if="visible && !open"
      type="button"
      class="absolute bottom-16 right-4 z-20 flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur transition-colors"
      :class="openItems.length > 0
        ? 'border-destructive/25 bg-card/95 text-foreground hover:bg-accent'
        : 'border-border bg-card/90 text-muted-foreground hover:bg-accent'"
      :aria-label="`Review what to watch out for: ${pillLabel}`"
      @click="open = true"
    >
      <span class="relative flex size-4 items-center justify-center">
        <span
          v-if="highCount > 0"
          class="absolute size-full animate-ping rounded-full bg-destructive/25"
          aria-hidden="true"
        />
        <TriangleAlertIcon
          class="size-4"
          :class="openItems.length > 0 ? 'text-destructive' : 'text-muted-foreground'"
        />
      </span>
      <span>{{ pillLabel }}</span>
      <Badge
        v-if="openItems.length > 0"
        variant="secondary"
        class="px-1.5 py-0 text-[10px] tabular-nums"
      >
        {{ openItems.length }}
      </Badge>
    </button>
  </Transition>

  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[110] flex items-end justify-center p-0 backdrop-blur-sm sm:items-center sm:p-4"
      style="background: rgb(0 0 0 / 0.45)"
      role="dialog"
      aria-modal="true"
      aria-label="Things to watch out for"
      @click.self="open = false"
    >
      <div class="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border bg-card shadow-2xl sm:rounded-2xl">
        <div class="flex items-start gap-3 border-b px-5 py-3.5">
          <div class="min-w-0 flex-1">
            <h2 class="flex items-center gap-2 text-sm font-semibold">
              <TriangleAlertIcon class="size-4 shrink-0 text-destructive" />
              Before you rely on this
            </h2>
            <p class="mt-0.5 text-xs text-muted-foreground">
              <template v-if="openItems.length > 0">
                {{ openItems.length }} of {{ items.length }} still need an answer from you.
              </template>
              <template v-else>
                All {{ items.length }} reviewed. Reopen any of them to change your answer.
              </template>
            </p>
          </div>
          <Button variant="ghost" size="icon" class="size-7 shrink-0" aria-label="Close" @click="open = false">
            <XIcon class="size-4" />
          </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <ul class="space-y-2.5 p-4">
            <li
              v-for="advisory in items"
              :key="advisory.id"
              class="relative overflow-hidden rounded-xl border bg-background/60 pl-4 pr-3.5 py-3"
              :class="advisory.status === 'open' ? '' : 'opacity-75'"
            >
              <span
                class="absolute inset-y-0 left-0 w-1"
                :class="advisory.status === 'open' ? severityMeta[advisory.severity].rail : 'bg-border'"
                aria-hidden="true"
              />

              <div class="flex flex-wrap items-center gap-1.5">
                <span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <component :is="kindMeta[advisory.kind].icon" class="size-3" />
                  {{ kindMeta[advisory.kind].label }}
                </span>
                <span
                  class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  :class="severityMeta[advisory.severity].chip"
                >
                  {{ severityMeta[advisory.severity].label }}
                </span>
                <span
                  v-if="advisory.status !== 'open'"
                  class="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  :class="statusMeta[advisory.status].chip"
                >
                  <component :is="statusMeta[advisory.status].icon" class="size-3" />
                  {{ statusMeta[advisory.status].label }}
                </span>
              </div>

              <p class="mt-1.5 text-sm font-medium leading-snug break-words">{{ advisory.title }}</p>
              <p v-if="advisory.detail" class="mt-1 text-[13px] leading-relaxed text-muted-foreground break-words">
                {{ advisory.detail }}
              </p>

              <p v-if="advisory.note" class="mt-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs italic text-muted-foreground break-words">
                “{{ advisory.note }}”
              </p>

              <template v-if="!readonly && advisory.status === 'open'">
                <div v-if="noteFor === advisory.id" class="mt-2.5">
                  <Textarea
                    v-model="noteDraft"
                    rows="2"
                    class="text-xs"
                    placeholder="Add a note — saved with whichever answer you pick"
                    autofocus
                  />
                </div>

                <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <Button
                    v-for="action in actions"
                    :key="action.status"
                    variant="outline"
                    size="sm"
                    class="h-7 gap-1.5 px-2.5 text-xs"
                    :title="action.hint"
                    :disabled="busyId === advisory.id"
                    @click="respond(advisory, action.status)"
                  >
                    <component :is="action.icon" class="size-3.5" />
                    {{ action.label }}
                  </Button>
                  <button
                    type="button"
                    class="ml-auto rounded px-1.5 py-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                    @click="toggleNote(advisory)"
                  >
                    {{ noteFor === advisory.id ? 'Discard note' : 'Add a note' }}
                  </button>
                </div>
              </template>

              <div v-else-if="!readonly" class="mt-2.5 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                  :disabled="busyId === advisory.id"
                  @click="reopen(advisory)"
                >
                  <Undo2Icon class="size-3.5" />
                  Reopen
                </Button>
                <span v-if="advisory.todo_id" class="text-[11px] text-muted-foreground">
                  On your task list
                </span>
              </div>
            </li>
          </ul>
        </div>

        <div class="flex items-center justify-between gap-3 border-t px-5 py-3">
          <p class="text-[11px] leading-snug text-muted-foreground">
            Flagged by Batayan from this thread. Not a substitute for your lawyer’s review.
          </p>
          <Button size="sm" class="h-8 shrink-0 gap-1.5 px-3 text-xs" @click="open = false">
            <CheckIcon class="size-3.5" />
            Done
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.advisory-pill-enter-active,
.advisory-pill-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.advisory-pill-enter-from,
.advisory-pill-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
