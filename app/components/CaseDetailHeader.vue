<script setup lang="ts">
import type { Component } from 'vue'
import {
  ActivityIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  LockIcon,
  MaximizeIcon,
  MessageSquareIcon,
  MinimizeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  UserPlusIcon,
} from '@lucide/vue'
import { CASE_STATUSES, type LegalCase } from '~/stores/cases'
import type { DueTone } from '~/composables/useCasePresentation'
import CaseMiniCalendar, { type ScheduleEvent } from '~/components/CaseMiniCalendar.vue'

export interface PanelToggle {
  key: string
  label: string
  icon: Component
  active: boolean
  count?: number
  toggle: () => void
}

/**
 * The case overview band: which case you are in, what state it is in, and when
 * it is due — pinned above the whole workspace, then the controls below it.
 *
 * It used to be a slim button row because case identity lived in the left rail.
 * That rail then carried identity plus a calendar plus three material lists,
 * which made it the most crowded panel on the page. Identity, the deadline (and
 * the calendar behind it) and the people now live here, full-width, so the rail
 * is left with just its separated sections.
 *
 * Two rows: the first is identity — back, title, status, priority, deadline,
 * people — and the second is the control bar — view tabs, panel toggles, draft,
 * fullscreen. In fullscreen the identity row drops out so the focused thread is
 * not framed by chrome it is not using.
 */
const props = defineProps<{
  case: LegalCase
  view: 'chat' | 'progress'
  panelToggles: PanelToggle[]
  fullscreen: boolean
  /** Schedule items pinned to days: the case deadline plus due-dated tasks. */
  calendarEvents: ScheduleEvent[]
}>()

const emit = defineEmits<{
  setView: [view: 'chat' | 'progress']
  draft: []
  edit: []
  archive: []
  restore: []
  toggleFullscreen: []
  changeStatus: [status: LegalCase['status']]
}>()

const { formatShortDate, dueState } = useCasePresentation()

const peopleOpen = ref(false)

const archived = computed(() => !!props.case.archived_at)

/** Closed and archived cases are read-only: only reading, exporting, and reopening remain. */
const readOnly = computed(() => archived.value || props.case.status === 'closed')

const editable = computed(() => !readOnly.value)

/**
 * The roster follows the same rule as the rest of the case: it can still be
 * read once the matter is closed or archived, but not changed. The avatar
 * button keeps opening the dialog either way — "who worked this" stays a
 * legitimate question on a finished matter.
 */
const canManageAssignees = computed(() => props.case.can_manage_assignees && editable.value)

/* -------------------------------------------------------------------------
 * Deadline and calendar
 * ---------------------------------------------------------------------- */

const due = computed(() => dueState(props.case.due_date))

/** Only a deadline near enough to act on earns colour. */
const DUE_STRIP: Record<DueTone, string> = {
  overdue: 'border-destructive/30 bg-destructive/10 text-destructive',
  soon: 'border-espresso/30 bg-espresso/10 text-espresso dark:border-peach/30 dark:bg-peach/10 dark:text-peach',
  normal: 'border-border bg-muted/50 text-muted-foreground',
}

const dueStripClass = computed(() =>
  due.value ? DUE_STRIP[due.value.tone] : 'border-border bg-muted/50 text-muted-foreground')

/**
 * The strip is both the case's deadline and the way into its calendar. Those
 * were two separate things — a deadline buried in the brief's definition list,
 * and a collapsed "Calendar" bar above the material lists — which meant the row
 * that said "due in 3 days" was not the row that showed you the days.
 */
const scheduleSummary = computed(() => {
  if (due.value) return due.value.label
  const count = props.calendarEvents.length
  if (count > 0) return `${count} date${count === 1 ? '' : 's'} scheduled`
  return 'No deadline set'
})
</script>

<template>
  <header class="surface flex flex-col">
    <!-- Row 1 — identity. Drops out in fullscreen, where the thread is the point. -->
    <div
      v-if="!props.fullscreen"
      class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
    >
      <div class="flex min-w-0 flex-1 items-center gap-2.5">
        <NuxtLink
          to="/cases"
          class="-ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ArrowLeftIcon class="size-3.5" />
          All cases
        </NuxtLink>

        <h1
          class="min-w-0 truncate font-heading text-base font-semibold leading-snug tracking-tight"
          :title="props.case.title"
        >
          {{ props.case.title }}
        </h1>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <DropdownMenu v-if="editable">
          <DropdownMenuTrigger
            class="inline-flex h-8 shrink-0 items-center rounded-lg border border-border bg-card px-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            :aria-label="`Case status: ${props.case.status}`"
          >
            <CaseStatusBadge
              :status="props.case.status"
              interactive
              class="h-auto rounded-lg border-0 bg-transparent p-0 px-1"
            >
              <ChevronDownIcon class="size-3 opacity-60" />
            </CaseStatusBadge>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-40">
            <DropdownMenuLabel class="text-xs text-muted-foreground">Move case to</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              v-for="option in CASE_STATUSES"
              :key="option.value"
              @click="emit('changeStatus', option.value as LegalCase['status'])"
            >
              <CheckIcon v-if="props.case.status === option.value" class="size-4 text-primary" />
              <span v-else class="size-4" aria-hidden="true" />
              {{ option.label }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <CaseStatusBadge v-else :status="props.case.status" class="h-8 rounded-lg" />

        <CasePriorityBadge
          :priority="props.case.priority"
          show-quiet
          class="h-8 rounded-lg px-2.5"
        />

        <span
          v-if="readOnly"
          class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          title="Closed and archived cases can be read and exported, but not changed."
        >
          <LockIcon class="size-3" />
          Read-only
        </span>
      </div>

      <div class="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
        <!-- The deadline is also the door to the calendar it belongs to. -->
        <Popover>
          <PopoverTrigger as-child>
            <button
              type="button"
              class="flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              :class="dueStripClass"
              :aria-label="`Case schedule: ${scheduleSummary}`"
            >
              <CalendarClockIcon class="size-4 shrink-0" />
              <span class="min-w-0 max-w-44 truncate text-left">{{ scheduleSummary }}</span>
              <span v-if="due" class="shrink-0 tabular-nums opacity-70">
                {{ formatShortDate(props.case.due_date) }}
              </span>
              <ChevronDownIcon class="size-3.5 shrink-0 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-[21rem] gap-0 p-0" :avoid-collisions="false">
            <CaseMiniCalendar :events="props.calendarEvents" />
          </PopoverContent>
        </Popover>

        <!--
          Who is on the matter, next to the deadline rather than off in the
          overflow menu: on a shared case it is identity, not an action.
        -->
        <button
          v-if="props.case.owner"
          type="button"
          class="flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted"
          :aria-label="canManageAssignees ? 'Manage who is on this case' : 'People on this case'"
          :title="canManageAssignees ? 'Manage who is on this case' : 'People on this case'"
          @click="peopleOpen = true"
        >
          <CaseMemberAvatars :owner="props.case.owner" :assignees="props.case.assignees" size="md" />
          <UserPlusIcon v-if="canManageAssignees" class="size-3.5 text-muted-foreground" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            class="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Case actions"
          >
            <MoreHorizontalIcon class="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44">
            <DropdownMenuItem v-if="!readOnly" @click="emit('edit')">
              <PencilIcon class="size-4" />
              Edit case
            </DropdownMenuItem>
            <DropdownMenuSeparator v-if="!readOnly" />
            <DropdownMenuItem v-if="!archived" variant="destructive" @click="emit('archive')">
              <ArchiveIcon class="size-4" />
              Archive case
            </DropdownMenuItem>
            <DropdownMenuItem v-else @click="emit('restore')">
              <ArchiveRestoreIcon class="size-4" />
              Restore case
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <!-- Row 2 — the control bar, always on. -->
    <div class="flex flex-wrap items-center gap-2 px-3 py-2" :class="props.fullscreen ? '' : 'border-t'">
      <div class="flex items-center rounded-lg border bg-muted/40 p-0.5" role="tablist" aria-label="Case view">
        <button
          type="button"
          role="tab"
          :aria-selected="props.view === 'chat'"
          class="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
          :class="props.view === 'chat' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="emit('setView', 'chat')"
        >
          <MessageSquareIcon class="size-3.5" />
          Chat
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="props.view === 'progress'"
          class="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
          :class="props.view === 'progress' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="emit('setView', 'progress')"
        >
          <ActivityIcon class="size-3.5" />
          Progress
        </button>
      </div>

      <div class="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
        <button
          v-if="props.view === 'chat'"
          type="button"
          :aria-pressed="props.fullscreen"
          :aria-label="props.fullscreen ? 'Exit full screen' : 'Full screen'"
          :title="props.fullscreen ? 'Exit full screen' : 'Full screen'"
          class="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          @click="emit('toggleFullscreen')"
        >
          <MinimizeIcon v-if="props.fullscreen" class="size-4" />
          <MaximizeIcon v-else class="size-4" />
        </button>

        <!--
          Loose buttons, not a segmented group. Segmented chrome means "pick
          one", but search, citations and tasks are independent switches that
          can all be on at once — and dressing them as a second segmented
          control made them read as a twin of the view switcher beside them.
        -->
        <div v-if="props.view === 'chat' && props.panelToggles.length > 0" class="flex items-center gap-0.5">
          <button
            v-for="toggle in props.panelToggles"
            :key="toggle.key"
            type="button"
            :aria-pressed="toggle.active"
            :aria-label="toggle.label"
            :title="toggle.label"
            class="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors"
            :class="toggle.active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
            @click="toggle.toggle()"
          >
            <component :is="toggle.icon" class="size-4" />
            <span v-if="toggle.count" class="tabular-nums">{{ toggle.count }}</span>
          </button>
        </div>

        <!--
          The one control that produces work sits at the end of the cluster,
          styled like the loose state buttons so the row reads as one group.
        -->
        <button
          v-if="!readOnly && props.view === 'chat'"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          @click="emit('draft')"
        >
          <FileTextIcon class="size-4" />
          <span class="hidden sm:inline">Draft a letter</span>
          <span class="sm:hidden">Draft</span>
        </button>
      </div>
    </div>

    <CaseAssigneeDialog
      v-if="peopleOpen"
      :case-id="props.case.id"
      :owner="props.case.owner"
      :assignees="props.case.assignees"
      :can-manage="props.case.can_manage_assignees"
      :readonly="readOnly"
      @close="peopleOpen = false"
    />
  </header>
</template>