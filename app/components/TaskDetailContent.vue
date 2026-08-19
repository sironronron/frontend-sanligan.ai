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
 * The full task-detail editor used inside the centered dialog. Uses the app's
 * standard theme. See TaskDetailPage for the full-width desktop layout — both
 * share useTaskDetailEditor.
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
  copied,
  copyLink,
  deleteTask,
  save,
  formatDate,
  activityIcon,
} = useTaskDetailEditor(() => props.todo)

// --- Status / priority trigger styles ---
const statusTriggerClass = computed(() => {
  switch (status.value) {
    case 'completed': return 'border-transparent bg-primary text-primary-foreground'
    case 'on-going': return 'border-transparent bg-primary/10 text-primary'
    default: return 'border-transparent bg-muted text-foreground'
  }
})

const priorityTriggerClass = computed(() => {
  switch (priority.value) {
    case 'high': return 'border-transparent bg-destructive/10 text-destructive'
    case 'medium': return 'border-transparent bg-primary/10 text-primary'
    case 'low': return 'border-transparent bg-muted text-foreground'
    default: return 'border-transparent bg-muted text-foreground'
  }
})

function onDelete() {
  deleteTask().then(() => {
    if (!todo.value) emit('close')
  })
}
</script>

<template>
  <div :class="cn('flex h-full w-full flex-col overflow-hidden bg-background text-foreground', props.class)">
    <!-- HEADER BAR -->
    <div class="flex items-center justify-between border-b border-border px-5 py-3">
      <button
        type="button"
        class="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Close"
        @click="emit('close')"
      >
        <XIcon class="size-4" />
      </button>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Save"
          @click="save"
        >
          <Edit3Icon class="size-4" />
        </button>
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-lg transition-colors"
          :class="copied
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
          aria-label="Copy link"
          @click="copyLink(todo?.id ?? '')"
        >
          <CheckIcon v-if="copied" class="size-4" />
          <LinkIcon v-else class="size-4" />
        </button>
        <div class="relative">
          <button
            type="button"
            class="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
          class="w-full resize-none bg-transparent text-2xl font-bold leading-snug text-foreground outline-none placeholder:text-muted-foreground break-words whitespace-normal"
          placeholder="Task title"
          @input="autoGrowTitle"
        />

        <!-- METADATA ROWS -->
        <div class="space-y-0">
          <!-- Priority -->
          <div class="flex items-center gap-3 py-2.5 border-b border-border">
            <FlagIcon class="size-4 shrink-0 text-primary" />
            <span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Priority</span>
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
              <span v-if="priority" class="text-xs text-muted-foreground">({{ priorityScore }}/10)</span>
            </div>
          </div>

          <!-- Status -->
          <div class="flex items-center gap-3 py-2.5 border-b border-border">
            <TagIcon class="size-4 shrink-0 text-primary" />
            <span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Status</span>
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
          <div class="flex items-center gap-3 py-2.5 border-b border-border">
            <ClockIcon class="size-4 shrink-0 text-primary" />
            <span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Created</span>
            <span class="flex-1 text-sm text-foreground">{{ formatDate(todo?.created_at ?? null) }}</span>
          </div>

          <!-- Due date -->
          <div class="flex items-center gap-3 py-2.5 border-b border-border">
            <CalendarIcon class="size-4 shrink-0 text-primary" />
            <span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Due date</span>
            <div class="flex flex-1 items-center gap-1.5">
              <input
                v-model="dueDate"
                type="date"
                class="h-8 flex-1 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <button
                v-if="dueDate"
                type="button"
                class="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                @click="clearDueDate"
              >
                <XIcon class="size-3.5" />
              </button>
            </div>
          </div>

          <!-- Progress (derived from subtasks) -->
          <div class="flex items-center gap-3 py-2.5 border-b border-border">
            <HashIcon class="size-4 shrink-0 text-primary" />
            <span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Progress</span>
            <div class="flex flex-1 items-center gap-2.5">
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary transition-all duration-300"
                  :style="{ width: `${resources.subtaskProgress.value}%` }"
                />
              </div>
              <span class="w-9 text-right text-xs font-semibold text-muted-foreground">{{ resources.subtaskProgress.value }}%</span>
            </div>
          </div>

          <!-- Assignees -->
          <div class="flex items-center gap-3 py-2.5">
            <HashIcon class="size-4 shrink-0 text-primary" />
            <span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Assignees</span>
            <div class="flex flex-1 items-center gap-2">
              <div v-if="selectedMember" class="flex items-center gap-2">
                <span class="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {{ initials(selectedMember.name) }}
                </span>
                <span class="text-sm text-foreground">{{ selectedMember.name }}</span>
              </div>
              <div v-else-if="assignee" class="flex items-center gap-2">
                <span class="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {{ initials(assignee) }}
                </span>
                <span class="text-sm text-foreground">{{ assignee }}</span>
              </div>
              <div class="relative flex-1">
                <button
                  type="button"
                  class="flex h-7 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
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
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h3>
          <div class="rounded-xl bg-muted p-3.5">
            <textarea
              v-model="description"
              class="min-h-[4.5rem] w-full bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Add a description…"
            />
          </div>
        </div>

        <!-- ATTACHMENTS -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attachments</h3>
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
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
              class="flex items-center gap-3 rounded-xl bg-muted px-3.5 py-2.5"
            >
              <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileTextIcon class="size-4 text-primary" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-foreground">{{ att.document?.original_filename ?? 'File' }}</p>
                <p class="text-xs text-muted-foreground">{{ att.document?.mime_type?.split('/')?.pop()?.toUpperCase() ?? 'FILE' }}</p>
              </div>
              <button
                type="button"
                class="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                @click="resources.removeAttachment(att.id)"
              >
                <XIcon class="size-3.5" />
              </button>
            </div>
          </div>
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            @click="attachmentInput?.click()"
          >
            <PlusIcon class="size-3.5" />
            Add files
          </button>
        </div>

        <!-- TABS -->
        <div>
          <div class="flex border-b border-border">
            <button
              type="button"
              class="relative px-3.5 py-2.5 text-sm font-medium transition-colors"
              :class="activeTab === 'subtasks' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="activeTab = 'subtasks'"
            >
              Subtasks ({{ resources.subtasks.value.length }})
              <span
                v-if="activeTab === 'subtasks'"
                class="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
              />
            </button>
            <button
              type="button"
              class="relative px-3.5 py-2.5 text-sm font-medium transition-colors"
              :class="activeTab === 'comments' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="activeTab = 'comments'"
            >
              Comments ({{ resources.comments.value.length }})
              <span
                v-if="activeTab === 'comments'"
                class="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
              />
            </button>
            <button
              type="button"
              class="relative px-3.5 py-2.5 text-sm font-medium transition-colors"
              :class="activeTab === 'activities' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="activeTab = 'activities'"
            >
              Activities
              <span
                v-if="activeTab === 'activities'"
                class="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
              />
            </button>
          </div>

          <!-- Subtasks -->
          <div v-if="activeTab === 'subtasks'" class="pt-2.5 space-y-1">
            <div v-for="st in resources.subtasks.value" :key="st.id">
              <div class="group flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
                <button
                  type="button"
                  class="mt-0.5 shrink-0 rounded border transition-colors"
                  :class="st.done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input text-transparent hover:border-primary/70'"
                  @click="toggleSubtask(st.id)"
                >
                  <CheckIcon v-if="st.done" class="size-4" />
                  <span v-else class="block size-4" />
                </button>
                <div class="min-w-0 flex-1">
                  <span
                    class="text-sm leading-snug"
                    :class="st.done ? 'text-muted-foreground line-through' : 'text-foreground'"
                  >
                    {{ st.title }}
                  </span>
                </div>
                <button
                  type="button"
                  class="mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  @click="removeSubtask(st.id)"
                >
                  <XIcon class="size-3.5" />
                </button>
              </div>
            </div>
            <!-- Add subtask -->
            <div class="flex items-center gap-2 px-2 pt-1.5">
              <PlusIcon class="size-3.5 shrink-0 text-muted-foreground" />
              <input
                v-model="newSubtaskTitle"
                class="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="Add a subtask…"
                @keydown.enter.prevent="addSubtask"
              />
            </div>
          </div>

          <!-- Comments -->
          <div v-else-if="activeTab === 'comments'" class="pt-2.5">
            <div v-if="resources.comments.value.length > 0" class="space-y-2.5 mb-4">
              <div v-for="c in resources.comments.value" :key="c.id" class="rounded-xl bg-muted px-3.5 py-2.5">
                <p class="text-sm leading-relaxed text-foreground">{{ c.body }}</p>
                <div class="mt-1.5 flex items-center gap-2">
                  <span v-if="c.user" class="text-xs text-muted-foreground">{{ c.user.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ formatDate(c.created_at) }}</span>
                </div>
              </div>
            </div>
            <p v-else class="mb-4 text-sm text-muted-foreground text-center">No comments yet.</p>
            <div class="flex items-end gap-2">
              <textarea
                v-model="commentText"
                class="min-h-[2.5rem] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground"
                placeholder="Write a comment…"
                rows="1"
                @keydown.enter.meta.prevent="addComment"
                @keydown.enter.ctrl.prevent="addComment"
              />
              <button
                type="button"
                class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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
                <component :is="activityIcon(a.type)" class="size-4 mt-0.5 shrink-0 text-primary" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-foreground/90">
                    <span v-if="a.user" class="font-medium text-foreground">{{ a.user.name }}</span>
                    {{ a.description }}
                  </p>
                  <p class="text-xs text-muted-foreground">{{ formatDate(a.created_at) }}</p>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-muted-foreground text-center pt-5">No activity recorded.</p>
          </div>
        </div>
      </div>
    </ScrollArea>

    <!-- SAVE BAR -->
    <div v-if="hasChanges" class="border-t border-border px-5 py-3">
      <div class="flex items-center justify-end gap-2.5">
        <Button variant="outline" size="sm" class="h-9 px-4 text-sm" @click="emit('close')">Cancel</Button>
        <Button size="sm" class="h-9 px-4 text-sm" :disabled="saving" @click="save">
          <Loader2Icon v-if="saving" class="size-4 animate-spin" />
          {{ saving ? 'Saving…' : 'Save' }}
        </Button>
      </div>
    </div>
  </div>
</template>
