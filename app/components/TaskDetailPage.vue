<script setup lang="ts">
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  FlagIcon,
  LinkIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PlusIcon,
  SendIcon,
  ShareIcon,
  TagIcon,
  TrashIcon,
  UploadIcon,
  UserIcon,
  XIcon,
} from '@lucide/vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'
import { useTodoStore, type Todo } from '~/stores/todos'

/**
 * The full task-detail editor rendered as a desktop page (route /tasks/[id]).
 * Light theme, full width, laid out as a two-column grid: the main content
 * (title, description, tabs) on the left and a details sidebar (status,
 * priority, dates, assignee, attachments) on the right. Shares all editing
 * logic with the slide-in panel through useTaskDetailEditor.
 */
const props = withDefaults(defineProps<{
  todo: Todo
  class?: HTMLAttributes['class']
}>(), { class: '' })

const emit = defineEmits<{ close: [] }>()

const todoStore = useTodoStore()

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

// --- Light-theme badge styles (matches todos.vue) ---
const statusStyles: Record<Todo['status'], string> = {
  pending: 'bg-muted text-muted-foreground',
  'on-going': 'bg-peach/60 text-espresso dark:bg-cream/10 dark:text-peach',
  completed: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
}

const statusLabel: Record<Todo['status'], string> = {
  pending: 'Pending',
  'on-going': 'On-going',
  completed: 'Completed',
}

const priorityStyles: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach',
  high: 'bg-destructive/10 text-destructive dark:bg-cream/10 dark:text-destructive',
}

const priorityLabel: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

const priorityScoreLabel = computed(() => {
  if (priority.value === 'high') return '8/10'
  if (priority.value === 'medium') return '5/10'
  if (priority.value === 'low') return '2/10'
  return null
})

async function onDelete() {
  await deleteTask()
  if (!todoStore.todos.some(t => t.id === props.todo.id)) {
    emit('close')
  }
}
</script>

<template>
  <div :class="cn('mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8', props.class)">
    <!-- PAGE HEADER -->
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <button
          type="button"
          class="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-float transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Back to tasks"
          @click="emit('close')"
        >
          <ArrowLeftIcon class="size-4" />
        </button>
        <div class="min-w-0">
          <h1 class="truncate font-heading text-xl font-semibold tracking-tight sm:text-2xl">
            Task details
          </h1>
          <p class="truncate text-sm text-muted-foreground">
            {{ todo?.conversation_id ? 'Action item from your legal matter' : 'Action item' }}
          </p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <Button v-if="hasChanges" size="sm" :disabled="saving" @click="save">
          <Loader2Icon v-if="saving" class="size-4 animate-spin" />
          {{ saving ? 'Saving…' : 'Save changes' }}
        </Button>
        <Button variant="outline" size="sm" class="gap-2" @click="copyLink(todo?.id ?? '')">
          <CheckIcon v-if="copied" class="size-4 text-primary" />
          <LinkIcon v-else class="size-4" />
          {{ copied ? 'Copied!' : 'Copy link' }}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" class="size-9" aria-label="More options">
              <MoreHorizontalIcon class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44">
            <DropdownMenuItem @click="copyLink(todo?.id ?? '')">
              <ShareIcon />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" @click="onDelete">
              <TrashIcon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <!-- TWO-COLUMN LAYOUT -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <!-- MAIN COLUMN -->
      <div class="min-w-0 space-y-6">
        <!-- TITLE CARD -->
        <div class="surface p-5 sm:p-6">
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <Badge :class="statusStyles[status]" class="text-[10px]">{{ statusLabel[status] }}</Badge>
            <Badge v-if="priority" :class="priorityStyles[priority]" class="text-[10px]">
              {{ priorityLabel[priority] }}
            </Badge>
            <Badge v-if="priorityScoreLabel" variant="outline" class="text-[10px] text-muted-foreground">
              {{ priorityScoreLabel }}
            </Badge>
            <span v-if="todo?.due_hint" class="text-[11px] text-muted-foreground">
              {{ todo.due_hint }}
            </span>
          </div>
          <textarea
            ref="titleEl"
            v-model="title"
            rows="1"
            class="w-full resize-none bg-transparent font-heading text-2xl font-semibold leading-snug tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50 break-words whitespace-normal sm:text-3xl"
            placeholder="Task title"
            @input="autoGrowTitle"
          />
        </div>

        <!-- DESCRIPTION CARD -->
        <div class="surface p-5 sm:p-6">
          <div class="mb-2.5 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-foreground">Description</h2>
          </div>
          <textarea
            v-model="description"
            class="min-h-[7rem] w-full resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
            placeholder="Add a description…"
          />
        </div>

        <!-- TABS CARD -->
        <div class="surface overflow-hidden">
          <div class="flex border-b border-border/70 px-4">
            <button
              type="button"
              class="relative px-3 py-3 text-sm font-medium transition-colors"
              :class="activeTab === 'subtasks' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="activeTab = 'subtasks'"
            >
              Subtasks ({{ resources.subtasks.value.length }})
              <span v-if="activeTab === 'subtasks'" class="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
            </button>
            <button
              type="button"
              class="relative px-3 py-3 text-sm font-medium transition-colors"
              :class="activeTab === 'comments' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="activeTab = 'comments'"
            >
              Comments ({{ resources.comments.value.length }})
              <span v-if="activeTab === 'comments'" class="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
            </button>
            <button
              type="button"
              class="relative px-3 py-3 text-sm font-medium transition-colors"
              :class="activeTab === 'activities' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="activeTab = 'activities'"
            >
              Activities
              <span v-if="activeTab === 'activities'" class="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
            </button>
          </div>

          <div class="p-5">
            <!-- Subtasks -->
            <div v-if="activeTab === 'subtasks'" class="space-y-1">
              <div v-for="st in resources.subtasks.value" :key="st.id">
                <div class="group flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
                  <button
                    type="button"
                    class="mt-0.5 shrink-0 rounded border transition-colors"
                    :class="st.done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input text-transparent hover:border-primary/60'"
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
              <div class="flex items-center gap-2 px-2 pt-1.5">
                <PlusIcon class="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  v-model="newSubtaskTitle"
                  class="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                  placeholder="Add a subtask…"
                  @keydown.enter.prevent="addSubtask"
                />
              </div>
            </div>

            <!-- Comments -->
            <div v-else-if="activeTab === 'comments'" class="space-y-4">
              <div v-if="resources.comments.value.length > 0" class="space-y-2.5">
                <div v-for="c in resources.comments.value" :key="c.id" class="rounded-xl bg-muted/50 px-3.5 py-2.5">
                  <p class="text-sm leading-relaxed text-foreground">{{ c.body }}</p>
                  <div class="mt-1.5 flex items-center gap-2">
                    <span v-if="c.user" class="text-xs font-medium text-muted-foreground">{{ c.user.name }}</span>
                    <span class="text-xs text-muted-foreground/70">{{ formatDate(c.created_at) }}</span>
                  </div>
                </div>
              </div>
              <p v-else class="text-center text-sm text-muted-foreground">No comments yet.</p>
              <div class="flex items-end gap-2">
                <textarea
                  v-model="commentText"
                  class="min-h-[2.5rem] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground/60"
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
            <div v-else-if="activeTab === 'activities'" class="space-y-2.5">
              <div v-if="resources.activities.value.length > 0" class="space-y-2.5">
                <div v-for="a in resources.activities.value" :key="a.id" class="flex items-start gap-3 px-2 py-2">
                  <component :is="activityIcon(a.type)" class="size-4 mt-0.5 shrink-0 text-primary" />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-foreground/90">
                      <span v-if="a.user" class="font-medium text-foreground">{{ a.user.name }}</span>
                      {{ a.description }}
                    </p>
                    <p class="text-xs text-muted-foreground/70">{{ formatDate(a.created_at) }}</p>
                  </div>
                </div>
              </div>
              <p v-else class="py-5 text-center text-sm text-muted-foreground">No activity recorded.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- DETAILS SIDEBAR -->
      <div class="min-w-0 space-y-6">
        <!-- DETAILS CARD -->
        <div class="surface p-5">
          <h2 class="mb-3 text-sm font-semibold text-foreground">Details</h2>
          <div class="divide-y divide-border/70">
            <!-- Status -->
            <div class="flex items-center gap-3 py-2.5">
              <TagIcon class="size-4 shrink-0 text-muted-foreground" />
              <span class="w-16 shrink-0 text-xs font-medium text-muted-foreground">Status</span>
              <div class="ml-auto">
                <Select v-model="status">
                  <SelectTrigger class="h-7 w-auto min-w-[6.5rem] rounded-md px-2.5 text-sm font-medium [&>svg]:hidden">
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

            <!-- Priority -->
            <div class="flex items-center gap-3 py-2.5">
              <FlagIcon class="size-4 shrink-0 text-muted-foreground" />
              <span class="w-16 shrink-0 text-xs font-medium text-muted-foreground">Priority</span>
              <div class="ml-auto flex items-center gap-2">
                <Select :model-value="priority ?? '__none__'" @update:model-value="priority = $event === '__none__' ? null : ($event as NonNullable<Todo['priority']>)">
                  <SelectTrigger class="h-7 w-auto min-w-[6.5rem] rounded-md px-2.5 text-sm font-medium [&>svg]:hidden">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    <SelectItem v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <span v-if="priorityScoreLabel" class="text-xs text-muted-foreground">{{ priorityScoreLabel }}</span>
              </div>
            </div>

            <!-- Due date -->
            <div class="flex items-center gap-3 py-2.5">
              <CalendarIcon class="size-4 shrink-0 text-muted-foreground" />
              <span class="w-16 shrink-0 text-xs font-medium text-muted-foreground">Due date</span>
              <div class="ml-auto flex items-center gap-1.5">
                <input
                  v-model="dueDate"
                  type="date"
                  class="h-8 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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

            <!-- Created -->
            <div class="flex items-center gap-3 py-2.5">
              <ClockIcon class="size-4 shrink-0 text-muted-foreground" />
              <span class="w-16 shrink-0 text-xs font-medium text-muted-foreground">Created</span>
              <span class="ml-auto text-sm text-foreground/90">{{ formatDate(todo?.created_at ?? null) }}</span>
            </div>

            <!-- Progress -->
            <div class="flex items-center gap-3 py-2.5">
              <span class="text-xs font-medium text-muted-foreground">Progress</span>
              <div class="ml-auto flex flex-1 items-center gap-2.5">
                <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary transition-all duration-300"
                    :style="{ width: `${resources.subtaskProgress.value}%` }"
                  />
                </div>
                <span class="w-9 text-right text-xs font-semibold text-muted-foreground">{{ resources.subtaskProgress.value }}%</span>
              </div>
            </div>

            <!-- Assignee -->
            <div class="flex items-center gap-3 py-2.5">
              <UserIcon class="size-4 shrink-0 text-muted-foreground" />
              <span class="w-16 shrink-0 text-xs font-medium text-muted-foreground">Assignee</span>
              <div class="ml-auto flex items-center gap-2">
                <div v-if="selectedMember" class="flex items-center gap-2">
                  <span class="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {{ initials(selectedMember.name) }}
                  </span>
                  <span class="max-w-[9rem] truncate text-sm text-foreground/90">{{ selectedMember.name }}</span>
                </div>
                <div v-else-if="assignee" class="flex items-center gap-2">
                  <span class="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {{ initials(assignee) }}
                  </span>
                  <span class="max-w-[9rem] truncate text-sm text-foreground/90">{{ assignee }}</span>
                </div>
                <div class="relative">
                  <button
                    type="button"
                    class="flex h-7 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                    @click="assigneeOpen = !assigneeOpen"
                  >
                    <PlusIcon class="size-3" />
                    Set
                  </button>
                  <div
                    v-if="assigneeOpen"
                    class="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-xl border bg-popover p-1.5 shadow-lg"
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
        </div>

        <!-- ATTACHMENTS CARD -->
        <div class="surface p-5">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
              <PaperclipIcon class="size-4 text-muted-foreground" />
              Attachments
            </h2>
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
              class="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5"
            >
              <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileTextIcon class="size-4 text-primary" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-foreground">{{ att.document?.original_filename ?? 'File' }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ att.document?.mime_type?.split('/')?.pop()?.toUpperCase() ?? 'FILE' }}
                </p>
              </div>
              <button
                type="button"
                class="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                @click="resources.removeAttachment(att.id)"
              >
                <XIcon class="size-3.5" />
              </button>
            </div>
          </div>
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
            @click="attachmentInput?.click()"
          >
            <PlusIcon class="size-3.5" />
            Add files
          </button>
        </div>
      </div>
    </div>

    <!-- STICKY SAVE BAR (mobile / changes pending) -->
    <div v-if="hasChanges" class="sticky bottom-4 z-10 mt-6 flex items-center justify-end gap-2.5 rounded-2xl border border-border bg-card/95 p-3 shadow-float backdrop-blur-md">
      <span class="mr-auto text-sm text-muted-foreground">You have unsaved changes</span>
      <Button variant="outline" size="sm" @click="emit('close')">Discard</Button>
      <Button size="sm" class="gap-2" :disabled="saving" @click="save">
        <Loader2Icon v-if="saving" class="size-4 animate-spin" />
        {{ saving ? 'Saving…' : 'Save changes' }}
      </Button>
    </div>
  </div>
</template>