<script setup lang="ts">
import type { Component } from 'vue'
import {
  ActivityIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  FileTextIcon,
  MaximizeIcon,
  MessageSquareIcon,
  MinimizeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  UserPlusIcon,
} from '@lucide/vue'
import type { LegalCase } from '~/stores/cases'

export interface PanelToggle {
  key: string
  label: string
  icon: Component
  active: boolean
  count?: number
  toggle: () => void
}

/**
 * The case control bar.
 *
 * It used to stack identity — title, status, priority, references — above a
 * control row, two rows of chrome before the first message. The case identity
 * now lives in the case brief on the left rail, so the header is just the
 * buttons: the view tabs on one side and the panel controls on the other, on
 * a single compact line.
 */
const props = defineProps<{
  case: LegalCase
  view: 'chat' | 'progress'
  panelToggles: PanelToggle[]
  fullscreen: boolean
}>()

const emit = defineEmits<{
  setView: [view: 'chat' | 'progress']
  draft: []
  edit: []
  archive: []
  restore: []
  toggleFullscreen: []
}>()

const peopleOpen = ref(false)

const archived = computed(() => !!props.case.archived_at)

/** Closed and archived cases are read-only: only reading, exporting, and reopening remain. */
const readOnly = computed(() => archived.value || props.case.status === 'closed')

/**
 * The roster follows the same rule as the rest of the case: it can still be
 * read once the matter is closed or archived, but not changed. The avatar
 * button keeps opening the dialog either way — "who worked this" stays a
 * legitimate question on a finished matter.
 */
const canManageAssignees = computed(() => props.case.can_manage_assignees && !readOnly.value)
</script>

<template>
  <header class="shrink-0 border-b px-3 py-2">
    <div class="flex flex-wrap items-center gap-2">
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

      <!--
        Who is on the matter, next to the view tabs rather than off in the
        overflow menu: on a shared case it is identity, not an action.
      -->
      <button
        v-if="props.case.owner"
        type="button"
        class="ml-1 flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted"
        :aria-label="canManageAssignees ? 'Manage who is on this case' : 'People on this case'"
        :title="canManageAssignees ? 'Manage who is on this case' : 'People on this case'"
        @click="peopleOpen = true"
      >
        <CaseMemberAvatars :owner="props.case.owner" :assignees="props.case.assignees" />
        <UserPlusIcon v-if="canManageAssignees" class="size-3.5 text-muted-foreground" />
      </button>

      <div class="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          v-if="props.view === 'chat'"
          type="button"
          :aria-pressed="props.fullscreen"
          :aria-label="props.fullscreen ? 'Exit full screen' : 'Full screen'"
          :title="props.fullscreen ? 'Exit full screen' : 'Full screen'"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
