<script setup lang="ts">
import type { Component } from 'vue'
import {
  ActivityIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  Loader2Icon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
} from '@lucide/vue'
import { CASE_STATUSES, type LegalCase } from '~/stores/cases'

export interface PanelToggle {
  key: string
  label: string
  icon: Component
  active: boolean
  count?: number
  toggle: () => void
}

/**
 * The case identity stacked above a control row.
 *
 * It used to be three: identity, then a toolbar, then a summary strip — about
 * 150px of chrome standing between the user and the conversation on every
 * screen. Status and priority sit above the title, the references run beneath
 * it, and a separated bottom row holds the view tabs beside the panel
 * controls, which keep their icon-only labels so the row stays one compact
 * line.
 */
const props = defineProps<{
  case: LegalCase
  view: 'chat' | 'progress'
  statusSaving: boolean
  panelToggles: PanelToggle[]
}>()

const emit = defineEmits<{
  back: []
  setView: [view: 'chat' | 'progress']
  changeStatus: [status: LegalCase['status']]
  draft: []
  edit: []
  archive: []
  restore: []
}>()

const { typeLabel, formatDate, dueState } = useCasePresentation()

const archived = computed(() => !!props.case.archived_at)

/** Closed and archived cases are read-only: only reading, exporting, and reopening remain. */
const readOnly = computed(() => archived.value || props.case.status === 'closed')

const facts = computed(() => {
  const c = props.case
  const due = dueState(c.due_date)
  const out: Array<{ text: string; class?: string }> = []
  if (c.reference) out.push({ text: c.reference })
  out.push({ text: typeLabel(c.case_type) })
  if (due) out.push({ text: due.label, class: archived.value ? undefined : due.class })
  if (c.archived_at) out.push({ text: `Archived ${formatDate(c.archived_at)}` })
  return out
})
</script>

<template>
  <header class="shrink-0 border-b px-3 py-2.5 space-y-4">
    <div class="flex flex-wrap items-end gap-x-3 gap-y-2">
      <div class="min-w-0 grow basis-full sm:basis-0">
        <div class="mb-0.5 flex flex-wrap items-center gap-1.5">
          <!--
            The badge is the switcher. Moving a matter to "on hold" is the most
            frequent edit by far, and routing it through the full intake form
            made it feel like a records change.
          -->
          <DropdownMenu>
            <DropdownMenuTrigger
              :disabled="archived || props.statusSaving"
              class="shrink-0 rounded-4xl disabled:pointer-events-none"
              :aria-label="`Case status: ${props.case.status}`"
            >
              <CaseStatusBadge :status="props.case.status" :interactive="!archived">
                <Loader2Icon v-if="props.statusSaving" class="size-3 animate-spin" />
                <ChevronDownIcon v-else-if="!archived" class="size-3 opacity-60" />
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

          <CasePriorityBadge :priority="props.case.priority" show-quiet class="shrink-0" />
        </div>

        <h1 class="truncate text-xl font-semibold mt-2">{{ props.case.title }}</h1>

        <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <template v-for="(fact, index) in facts" :key="`${fact.text}-${index}`">
            <span v-if="index > 0" aria-hidden="true" class="text-muted-foreground/40">·</span>
            <span :class="fact.class">{{ fact.text }}</span>
          </template>
        </div>
      </div>
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-2 py-2">
      <div class="flex items-center rounded-lg border bg-muted/40 p-0.5" role="tablist" aria-label="Case view">
        <button
          type="button"
          role="tab"
          :aria-selected="props.view === 'chat'"
          class="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
          :class="props.view === 'chat' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
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
          :class="props.view === 'progress' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="emit('setView', 'progress')"
        >
          <ActivityIcon class="size-3.5" />
          Progress
        </button>
      </div>

      <div class="ml-auto flex shrink-0 items-center gap-1.5">
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
  </header>
</template>
