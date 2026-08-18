<script setup lang="ts">
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  Edit3Icon,
  FileTextIcon,
  FlagIcon,
  HashIcon,
  LinkIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PlusIcon,
  SendIcon,
  ShareIcon,
  TagIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from '@lucide/vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'
import type { Todo } from '~/stores/todos'

/**
 * The full task-detail editor used inside the slide-in panel. Dark forest
 * theme, tuned for the narrow right-side sheet. See TaskDetailPage for the
 * light, full-width desktop layout — both share useTaskDetailEditor.
 */
const props = withDefaults(defineProps<{
  todo: Todo
  class?: HTMLAttributes['class']
}>(), { class: '' })

const emit = defineEmits<{ close: [] }>()

const {
  todo,
  resources,
  title,
  description,
  dueDate,
  assignee,
  priority,
  status,
  saving,
  assigneeOpen,
  assigneeSearch,
  titleEl,
  autoGrowTitle,
  hasChanges,
  priorityOptions,
  priorityScore,
  statusOptions,
  newSubtaskTitle,
  addSubtask,
  toggleSubtask,
  removeSubtask,
  attachmentInput,
  onAttachmentPick,
  commentText,
  addComment,
  filteredMembers,
  selectedMember,
  initials,
  selectAssignee,
  clearDueDate,
  activeTab,
  moreOpen,
  copyLink,
  deleteTask,
  save,
  formatDate,
  activityIcon,
} = useTaskDetailEditor(() => props.todo)

// --- Status / priority trigger styles (tuned for the forest panel) ---
const statusTriggerClass = computed(() => {
  switch (status.value) {
    case 'completed': return 'border-transparent bg-peach text-espresso'
    case 'on-going': return 'border-transparent bg-peach/25 text-peach'
    default: return 'border-transparent bg-cream/10 text-cream/90'
  }
})

const priorityTriggerClass = computed(() => {
  switch (priority.value) {
    case 'high': return 'border-transparent bg-destructive/30 text-[#F6B8A6]'
    case 'medium': return 'border-transparent bg-peach/25 text-peach'
    case 'low': return 'border-transparent bg-cream/10 text-cream/90'
    default: return 'border-transparent bg-cream/10 text-cream/90'
  }
})

function onDelete() {
  deleteTask().then(() => {
    if (!todo.value) emit('close')
  })
}
</script>

<template>
  <div :class="cn('flex h-full w-full flex-col overflow-hidden bg-forest text-cream', props.class)">
    <!-- HEADER BAR -->
    <div class="flex items-center justify-between border-b border-cream/15 px-5 py-3">
      <button
        type="button"
        class="flex size-9 items-center justify-center rounded-lg text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream"
        aria-label="Close"
        @click="emit('close')"
      >
        <XIcon class="size-4" />
      </button>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-lg text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream"
          aria-label="Save"
          @click="save"
        >
          <Edit3Icon class="size-4" />
        </button>
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-lg text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream"
          aria-label="Copy link"
          @click="copyLink(todo?.id ?? '')"
        >
          <LinkIcon class="size-4" />
        </button>
        <div class="relative">
          <button
            type="button"
            class="flex size-9 items-center justify-center rounded-lg text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream"
            aria-label="More options"
            @click="moreOpen = !moreOpen"
          >
            <MoreHorizontalIcon class="size-4" />
          </button>
          <div
            v-if="moreOpen"
            class="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border bg-popover p-1.5 shadow-lg"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              @click="copyLink(todo?.id ?? ''); moreOpen = false"
            >
              <ShareIcon class="size-4" />
              Share
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
              @click="onDelete"
            >
              <TrashIcon class="size-4" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- SCROLLABLE BODY -->
    <ScrollArea class="min-h-0 flex-1">
      <div class="px-5 py-5 space-y-6">
        <!-- TITLE -->
        <textarea
          ref="titleEl"
          v-model="title"
          rows="1"
          class="w-full resize-none bg-transparent text-2xl font-bold leading-snug text-cream outline-none placeholder:text-cream/40 break-words whitespace-normal"
          placeholder="Task title"
          @input="autoGrowTitle"
        />

        <!-- METADATA ROWS -->
        <div class="space-y-0">
          <!-- Priority -->
          <div class="flex items-center gap-3 py-2.5 border-b border-cream/15">
            <FlagIcon class="size-4 shrink-0 text-peach/90" />
            <span class="w-20 shrink-0 text-xs font-medium text-cream/60">Priority</span>
            <div class="flex flex-1 items-center gap-2.5">
              <Select :model-value="priority ?? '__none__'" @update:model-value="priority = $event === '__none__' ? null : ($event as NonNullable<Todo['priority']>)">
                <SelectTrigger :class="priorityTriggerClass" class="h-7 w-auto min-w-[5.5rem] rounded-md border px-2.5 text-sm font-semibold [&>svg]:hidden">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <span v-if="priority" class="text-xs text-cream/50">({{ priorityScore }}/10)</span>
            </div>
          </div>

          <!-- Status -->
          <div class="flex items-center gap-3 py-2.5 border-b border-cream/15">
            <TagIcon class="size-4 shrink-0 text-peach/90" />
            <span class="w-20 shrink-0 text-xs font-medium text-cream/60">Status</span>
            <div class="flex-1">
              <Select v-model="status">
                <SelectTrigger :class="statusTriggerClass" class="h-7 w-auto min-w-[5.5rem] rounded-md border px-2.5 text-sm font-semibold [&>svg]:hidden">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <!-- Created date -->
          <div class="flex items-center gap-3 py-2.5 border-b border-cream/15">
            <ClockIcon class="size-4 shrink-0 text-peach/90" />
            <span class="w-20 shrink-0 text-xs font-medium text-cream/60">Created</span>
            <span class="flex-1 text-sm text-cream/90">{{ formatDate(todo?.created_at ?? null) }}</span>
          </div>

          <!-- Due date -->
          <div class="flex items-center gap-3 py-2.5 border-b border-cream/15">
            <CalendarIcon class="size-4 shrink-0 text-peach/90" />
            <span class="w-20 shrink-0 text-xs font-medium text-cream/60">Due date</span>
            <div class="flex flex-1 items-center gap-1.5">
              <input
                v-model="dueDate"
                type="date"
                class="h-8 flex-1 rounded-md border border-cream/20 bg-cream/10 px-2.5 text-sm text-cream outline-none transition-colors focus-visible:border-peach/60 focus-visible:ring-3 focus-visible:ring-peach/30 [color-scheme:dark]"
              />
              <button
                v-if="dueDate"
                type="button"
                class="flex size-8 shrink-0 items-center justify-center rounded-md text-cream/60 transition-colors hover:bg-cream/10 hover:text-cream"
                @click="clearDueDate"
              >
                <XIcon class="size-3.5" />
              </button>
            </div>
          </div>

          <!-- Progress (derived from subtasks) -->
          <div class="flex items-center gap-3 py-2.5 border-b border-cream/15">
            <HashIcon class="size-4 shrink-0 text-peach/90" />
            <span class="w-20 shrink-0 text-xs font-medium text-cream/60">Progress</span>
            <div class="flex flex-1 items-center gap-2.5">
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-cream/15">
                <div
                  class="h-full rounded-full bg-peach transition-all duration-300"
                  :style="{ width: `${resources.subtaskProgress.value}%` }"
                />
              </div>
              <span class="w-9 text-right text-xs font-semibold text-cream/70">{{ resources.subtaskProgress.value }}%</span>
            </div>
          </div>

          <!-- Assignees -->
          <div class="flex items-center gap-3 py-2.5">
            <HashIcon class="size-4 shrink-0 text-peach/90" />
            <span class="w-20 shrink-0 text-xs font-medium text-cream/60">Assignees</span>
            <div class="flex flex-1 items-center gap-2">
              <div v-if="selectedMember" class="flex items-center gap-2">
                <span class="flex size-6 items-center justify-center rounded-full bg-cream/15 text-[10px] font-semibold text-peach">
                  {{ initials(selectedMember.name) }}
                </span>
                <span class="text-sm text-cream/90">{{ selectedMember.name }}</span>
              </div>
              <div v-else-if="assignee" class="flex items-center gap-2">
                <span class="flex size-6 items-center justify-center rounded-full bg-cream/15 text-[10px] font-semibold text-peach">
                  {{ initials(assignee) }}
                </span>
                <span class="text-sm text-cream/90">{{ assignee }}</span>
              </div>
              <div class="relative flex-1">
                <button
                  type="button"
                  class="flex h-7 items-center gap-1.5 rounded-md border border-dashed border-cream/40 px-2.5 text-xs text-cream/70 transition-colors hover:border-peach/60 hover:text-peach"
                  @click="assigneeOpen = !assigneeOpen"
                >
                  <PlusIcon class="size-3" />
                  Invite
                </button>
                <div
                  v-if="assigneeOpen"
                  class="absolute left-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-xl border bg-popover p-1.5 shadow-lg"
                >
                  <div class="p-1.5">
                    <Input
                      v-model="assigneeSearch"
                      class="h-8 text-sm bg-muted/50"
                      placeholder="Search members…"
                      autofocus
                    />
                  </div>
                  <div class="max-h-44 overflow-y-auto p-1">
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                      @click="selectAssignee(null)"
                    >
                      <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">—</span>
                      <span class="min-w-0 flex-1 text-muted-foreground">Unassigned</span>
                      <CheckIcon v-if="!selectedMember && !assignee" class="size-4 shrink-0 text-primary" />
                    </button>
                    <button
                      v-for="member in filteredMembers"
                      :key="member.id"
                      type="button"
                      class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                      @click="selectAssignee(member)"
                    >
                      <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                        {{ initials(member.name) }}
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium">{{ member.name }}</p>
                        <p class="truncate text-xs text-muted-foreground">{{ member.email }}</p>
                      </div>
                      <CheckIcon v-if="selectedMember?.id === member.id" class="size-4 shrink-0 text-primary" />
                    </button>
                    <p v-if="filteredMembers.length === 0" class="px-2.5 py-2.5 text-xs text-muted-foreground">
                      No members found.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- DESCRIPTION BOX -->
        <div>
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-cream/60">Description</h3>
          <div class="rounded-xl bg-cream/10 p-3.5">
            <textarea
              v-model="description"
              class="min-h-[4.5rem] w-full bg-transparent text-sm leading-relaxed text-cream outline-none placeholder:text-cream/40"
              placeholder="Add a description…"
            />
          </div>
        </div>

        <!-- ATTACHMENTS -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-cream/60">Attachments</h3>
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs text-cream/70 transition-colors hover:text-cream"
              @click="attachmentInput?.click()"
            >
              <UploadIcon class="size-3.5" />
              Upload
            </button>
            <input
              ref="attachmentInput"
              type="file"
              multiple
              class="hidden"
              @change="onAttachmentPick"
            />
          </div>
          <div v-if="resources.attachments.value.length > 0" class="space-y-2">
            <div
              v-for="att in resources.attachments.value"
              :key="att.id"
              class="flex items-center gap-3 rounded-xl bg-cream/10 px-3.5 py-2.5"
            >
              <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-peach/20">
                <FileTextIcon class="size-4 text-peach" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-cream/95">{{ att.document?.original_filename ?? 'File' }}</p>
                <p class="text-xs text-cream/50">{{ att.document?.mime_type?.split('/')?.pop()?.toUpperCase() ?? 'FILE' }}</p>
              </div>
              <button
                type="button"
                class="flex size-6 shrink-0 items-center justify-center rounded-md text-cream/50 transition-colors hover:bg-cream/10 hover:text-cream"
                @click="resources.removeAttachment(att.id)"
              >
                <XIcon class="size-3.5" />
              </button>
            </div>
          </div>
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cream/30 p-3 text-sm text-cream/70 transition-colors hover:border-peach/50 hover:text-peach"
            @click="attachmentInput?.click()"
          >
            <PlusIcon class="size-3.5" />
            Add files
          </button>
        </div>

        <!-- TABS -->
        <div>
          <div class="flex border-b border-cream/15">
            <button
              type="button"
              class="relative px-3.5 py-2.5 text-sm font-medium transition-colors"
              :class="activeTab === 'subtasks' ? 'text-cream' : 'text-cream/60 hover:text-cream/90'"
              @click="activeTab = 'subtasks'"
            >
              Subtasks ({{ resources.subtasks.value.length }})
              <span
                v-if="activeTab === 'subtasks'"
                class="absolute inset-x-0 -bottom-px h-0.5 bg-peach"
              />
            </button>
            <button
              type="button"
              class="relative px-3.5 py-2.5 text-sm font-medium transition-colors"
              :class="activeTab === 'comments' ? 'text-cream' : 'text-cream/60 hover:text-cream/90'"
              @click="activeTab = 'comments'"
            >
              Comments ({{ resources.comments.value.length }})
              <span
                v-if="activeTab === 'comments'"
                class="absolute inset-x-0 -bottom-px h-0.5 bg-peach"
              />
            </button>
            <button
              type="button"
              class="relative px-3.5 py-2.5 text-sm font-medium transition-colors"
              :class="activeTab === 'activities' ? 'text-cream' : 'text-cream/60 hover:text-cream/90'"
              @click="activeTab = 'activities'"
            >
              Activities
              <span
                v-if="activeTab === 'activities'"
                class="absolute inset-x-0 -bottom-px h-0.5 bg-peach"
              />
            </button>
          </div>

          <!-- Subtasks -->
          <div v-if="activeTab === 'subtasks'" class="pt-2.5 space-y-1">
            <div v-for="st in resources.subtasks.value" :key="st.id">
              <div class="group flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-cream/5">
                <button
                  type="button"
                  class="mt-0.5 shrink-0 rounded border transition-colors"
                  :class="st.done
                    ? 'border-peach bg-peach text-espresso'
                    : 'border-cream/40 text-transparent hover:border-peach/70'"
                  @click="toggleSubtask(st.id)"
                >
                  <CheckIcon v-if="st.done" class="size-4" />
                  <span v-else class="block size-4" />
                </button>
                <div class="min-w-0 flex-1">
                  <span
                    class="text-sm leading-snug"
                    :class="st.done ? 'text-cream/50 line-through' : 'text-cream/90'"
                  >
                    {{ st.title }}
                  </span>
                </div>
                <button
                  type="button"
                  class="mt-0.5 shrink-0 rounded p-1 text-cream/50 opacity-0 transition-opacity hover:text-peach group-hover:opacity-100"
                  @click="removeSubtask(st.id)"
                >
                  <XIcon class="size-3.5" />
                </button>
              </div>
            </div>
            <!-- Add subtask -->
            <div class="flex items-center gap-2 px-2 pt-1.5">
              <PlusIcon class="size-3.5 shrink-0 text-cream/50" />
              <input
                v-model="newSubtaskTitle"
                class="min-w-0 flex-1 bg-transparent text-sm text-cream outline-none placeholder:text-cream/40"
                placeholder="Add a subtask…"
                @keydown.enter.prevent="addSubtask"
              />
            </div>
          </div>

          <!-- Comments -->
          <div v-else-if="activeTab === 'comments'" class="pt-2.5">
            <div v-if="resources.comments.value.length > 0" class="space-y-2.5 mb-4">
              <div v-for="c in resources.comments.value" :key="c.id" class="rounded-xl bg-cream/10 px-3.5 py-2.5">
                <p class="text-sm leading-relaxed text-cream/90">{{ c.body }}</p>
                <div class="mt-1.5 flex items-center gap-2">
                  <span v-if="c.user" class="text-xs text-cream/60">{{ c.user.name }}</span>
                  <span class="text-xs text-cream/40">{{ formatDate(c.created_at) }}</span>
                </div>
              </div>
            </div>
            <p v-else class="mb-4 text-sm text-cream/50 text-center">No comments yet.</p>
            <div class="flex items-end gap-2">
              <textarea
                v-model="commentText"
                class="min-h-[2.5rem] flex-1 resize-none rounded-xl border border-cream/20 bg-cream/10 px-3 py-2 text-sm text-cream outline-none transition-colors focus-visible:border-peach/60 focus-visible:ring-3 focus-visible:ring-peach/30 placeholder:text-cream/40"
                placeholder="Write a comment…"
                rows="1"
                @keydown.enter.meta.prevent="addComment"
                @keydown.enter.ctrl.prevent="addComment"
              />
              <button
                type="button"
                class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-peach text-espresso transition-colors hover:bg-peach/85 disabled:opacity-50"
                :disabled="!commentText.trim()"
                @click="addComment"
              >
                <SendIcon class="size-4" />
              </button>
            </div>
          </div>

          <!-- Activities -->
          <div v-else-if="activeTab === 'activities'" class="pt-2.5">
            <div v-if="resources.activities.value.length > 0" class="space-y-2.5">
              <div v-for="a in resources.activities.value" :key="a.id" class="flex items-start gap-3 px-2 py-2">
                <component :is="activityIcon(a.type)" class="size-4 mt-0.5 shrink-0 text-peach/70" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-cream/80">
                    <span v-if="a.user" class="font-medium text-cream/95">{{ a.user.name }}</span>
                    {{ a.description }}
                  </p>
                  <p class="text-xs text-cream/40">{{ formatDate(a.created_at) }}</p>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-cream/50 text-center pt-5">No activity recorded.</p>
          </div>
        </div>
      </div>
    </ScrollArea>

    <!-- SAVE BAR -->
    <div v-if="hasChanges" class="border-t border-cream/15 px-5 py-3">
      <div class="flex items-center justify-end gap-2.5">
        <Button variant="outline" size="sm" class="h-9 border-cream/20 bg-cream/10 px-4 text-sm text-cream hover:bg-cream/20 hover:text-cream" @click="emit('close')">Cancel</Button>
        <Button size="sm" class="h-9 bg-peach px-4 text-sm text-espresso hover:bg-peach/85" :disabled="saving" @click="save">
          <Loader2Icon v-if="saving" class="size-4 animate-spin" />
          {{ saving ? 'Saving…' : 'Save' }}
        </Button>
      </div>
    </div>
  </div>
</template>