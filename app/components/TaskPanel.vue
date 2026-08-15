<script setup lang="ts">
import { CheckIcon, CircleIcon, ClipboardListIcon, ClockIcon, GripVerticalIcon, PlusIcon, TrashIcon, XIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { useTodoStore, type Todo } from '~/stores/todos'
import { cn } from '~/lib/utils'

const props = withDefaults(defineProps<{
  conversationId: string
  class?: string
  visible?: boolean
  /** Closed and archived cases are read-only: no adding, editing, or deleting. */
  readonly?: boolean
}>(), { class: '', visible: true, readonly: false })

defineEmits<{ close: [] }>()

const todoStore = useTodoStore()

const newTaskTitle = ref('')
const adding = ref(false)
const editingId = ref<string | null>(null)
const editTitle = ref('')
const dragId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)

const tasks = computed(() =>
  todoStore.todos
    .filter((t) => t.conversation_id === props.conversationId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
)

const pendingTasks = computed(() => tasks.value.filter((t) => t.status !== 'completed'))
const completedTasks = computed(() => tasks.value.filter((t) => t.status === 'completed'))

const progress = computed(() => {
  if (tasks.value.length === 0) return 0
  return Math.round((completedTasks.value.length / tasks.value.length) * 100)
})

function statusIcon(status: Todo['status']) {
  return status === 'completed' ? CheckIcon : status === 'on-going' ? ClockIcon : CircleIcon
}

function statusColor(status: Todo['status']) {
  return status === 'completed' ? 'text-forest dark:text-peach' : status === 'on-going' ? 'text-espresso dark:text-peach' : 'text-muted-foreground'
}

function priorityBadge(priority: Todo['priority']) {
  if (!priority) return ''
  return priority === 'high' ? 'bg-destructive/10 text-destructive dark:bg-cream/10 dark:text-destructive' : priority === 'medium' ? 'bg-peach/60 text-espresso dark:bg-cream/10 dark:text-peach' : 'bg-muted text-muted-foreground dark:bg-cream/5 dark:text-muted-foreground'
}

async function addTask() {
  if (props.readonly) return
  const title = newTaskTitle.value.trim()
  if (!title || !props.conversationId) return
  await todoStore.addTodo({ conversation_id: props.conversationId, title })
  newTaskTitle.value = ''
  adding.value = false
}

function startEdit(todo: Todo) {
  if (props.readonly) return
  editingId.value = todo.id
  editTitle.value = todo.title
}

async function saveEdit(todo: Todo) {
  if (props.readonly) return
  const title = editTitle.value.trim()
  if (title && title !== todo.title) {
    await todoStore.updateTodo(todo.id, { title })
  }
  editingId.value = null
}

async function toggleDone(todo: Todo) {
  if (props.readonly) return
  const nextStatus = todo.status === 'completed' ? 'pending' : 'completed'
  await todoStore.updateTodo(todo.id, { status: nextStatus })
}

async function removeTask(todo: Todo) {
  if (props.readonly) return
  const snapshot = todo
  await todoStore.deleteTodo(todo.id)
  toast('Task deleted', {
    description: snapshot.title,
    action: {
      label: 'Undo',
      onClick: () => {
        todoStore.addTodo({
          conversation_id: props.conversationId,
          title: snapshot.title,
          status: snapshot.status,
          priority: snapshot.priority ?? undefined,
          due_hint: snapshot.due_hint ?? undefined,
        })
      },
    },
  })
}

function onDragStart(todo: Todo) {
  if (props.readonly) return
  dragId.value = todo.id
}

function onDragOver(event: DragEvent, todo: Todo) {
  if (props.readonly) return
  event.preventDefault()
  dragOverId.value = todo.id
}

function onDrop(event: DragEvent, todo: Todo) {
  if (props.readonly) return
  event.preventDefault()
  const fromId = dragId.value
  dragId.value = null
  dragOverId.value = null
  if (!fromId || fromId === todo.id) return

  const list = [...tasks.value]
  const fromIndex = list.findIndex((t) => t.id === fromId)
  const toIndex = list.findIndex((t) => t.id === todo.id)
  if (fromIndex === -1 || toIndex === -1) return

  const moved = list.splice(fromIndex, 1)[0]
  if (!moved) return
  list.splice(toIndex, 0, moved)
  const orderedIds = list.map((t) => t.id)

  // Optimistic local reorder, persisted in the background.
  list.forEach((t, index) => {
    const local = todoStore.todos.find((x) => x.id === t.id)
    if (local) local.order = index + 1
  })

  todoStore.reorderTodos(props.conversationId, orderedIds).catch(() => {
    toast.error('Could not save the new order')
    todoStore.fetchTodos(props.conversationId)
  })
}

function formatDueDate(date: string | null) {
  if (!date) return ''
  const d = new Date(`${date}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <div class="contents">
    <div v-if="props.visible" class="fixed inset-0 z-30 bg-black/60 lg:hidden" aria-hidden="true" @click="$emit('close')" />
    <aside
      :class="cn(
        'min-h-0 flex-col overflow-hidden bg-sidebar border-sidebar-border',
        props.visible
          ? 'flex fixed inset-x-0 bottom-0 z-40 max-h-[75dvh] w-full rounded-t-2xl border shadow-2xl'
          : 'hidden',
        'lg:static lg:z-auto lg:flex lg:h-full lg:max-h-none lg:w-80 lg:shrink-0 lg:rounded-xl lg:border lg:shadow-raised',
        props.class,
      )"
    >
    <div class="flex items-center justify-between px-4 pb-2 pt-3">
      <div class="flex items-baseline gap-2">
        <h3 class="text-sm font-semibold">Tasks</h3>
        <span v-if="tasks.length > 0" class="text-xs tabular-nums text-muted-foreground">
          {{ completedTasks.length }} of {{ tasks.length }} done
        </span>
      </div>
      <div class="flex items-center gap-1">
        <Button v-if="!props.readonly" variant="outline" size="sm" class="h-7 gap-1 px-2 text-xs" @click="adding = !adding">
          <PlusIcon class="size-3.5" />
          {{ adding ? 'Cancel' : 'Add' }}
        </Button>
        <Button variant="ghost" size="icon" class="size-7 lg:hidden" aria-label="Close tasks" @click="$emit('close')">
          <XIcon class="size-4" />
        </Button>
      </div>
    </div>

    <div v-if="tasks.length > 0" class="mx-4 mb-1 h-0.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
      <div class="h-full rounded-full bg-primary transition-all duration-300" :style="{ width: `${progress}%` }" />
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div class="space-y-0.5 p-2">
        <div
          v-if="tasks.length === 0 && !adding"
          class="flex flex-col items-center gap-2 py-10 text-center"
        >
          <span class="flex size-10 items-center justify-center rounded-full bg-muted">
            <ClipboardListIcon class="size-5 text-muted-foreground" />
          </span>
          <p class="text-xs text-muted-foreground">{{ props.readonly ? 'No tasks on this case' : 'No tasks yet' }}</p>
          <Button v-if="!props.readonly" variant="outline" size="sm" class="gap-1 text-xs" @click="adding = true">
            <PlusIcon class="size-3.5" />
            Add your first task
          </Button>
        </div>

        <div
          v-if="adding"
          class="flex items-center gap-2 rounded-lg bg-muted/50 p-2"
        >
          <Input
            v-model="newTaskTitle"
            class="h-8 bg-card text-sm"
            placeholder="Task title…"
            autofocus
            @keydown.enter.prevent="addTask"
            @keydown.esc="adding = false"
          />
          <Button size="sm" class="h-8 shrink-0 px-2.5" :disabled="!newTaskTitle.trim()" @click="addTask">
            Add
          </Button>
        </div>

        <template v-for="todo in pendingTasks" :key="todo.id">
          <div
            class="group flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors"
            :class="{
              'opacity-50': dragId === todo.id,
              'bg-primary/10': dragOverId === todo.id,
              'hover:bg-muted': dragOverId !== todo.id,
            }"
            :draggable="!props.readonly"
            @dragstart="onDragStart(todo)"
            @dragover="onDragOver($event, todo)"
            @drop="onDrop($event, todo)"
            @dragend="dragId = null; dragOverId = null"
          >
            <GripVerticalIcon
              class="mt-0.5 size-3.5 shrink-0 text-muted-foreground/30"
              :class="props.readonly ? '' : 'cursor-grab'"
            />
            <button
              type="button"
              :aria-label="todo.status === 'completed' ? `Mark “${todo.title}” as not done` : `Mark “${todo.title}” as done`"
              :class="statusColor(todo.status)"
              class="mt-0.5 shrink-0 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              :disabled="props.readonly"
              @click="toggleDone(todo)"
            >
              <component :is="statusIcon(todo.status)" class="size-4" />
            </button>

            <div class="min-w-0 flex-1">
              <template v-if="editingId === todo.id">
                <Input
                  v-model="editTitle"
                  class="h-7 text-sm"
                  @keydown.enter.prevent="saveEdit(todo)"
                  @keydown.esc="editingId = null"
                  @blur="saveEdit(todo)"
                />
              </template>
              <template v-else>
                <button
                  class="block w-full text-left text-sm leading-tight"
                  @dblclick="startEdit(todo)"
                  @click="startEdit(todo)"
                >
                  {{ todo.title }}
                </button>
              </template>

              <div v-if="todo.description" class="mt-1 text-xs text-muted-foreground line-clamp-2">
                {{ todo.description }}
              </div>

              <div v-if="todo.priority || todo.due_date || todo.due_hint || todo.assignee" class="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge v-if="todo.priority" :class="priorityBadge(todo.priority)" class="px-1.5 py-0 text-[10px]">
                  {{ todo.priority }}
                </Badge>
                <span v-if="todo.due_date" class="text-[11px] text-muted-foreground">
                  Due {{ formatDueDate(todo.due_date) }}
                </span>
                <span v-else-if="todo.due_hint" class="text-[11px] text-muted-foreground">
                  {{ todo.due_hint }}
                </span>
                <span v-if="todo.assignee" class="text-[11px] text-muted-foreground">
                  {{ todo.assignee }}
                </span>
              </div>
            </div>

            <button
              v-if="!props.readonly"
              type="button"
              :aria-label="`Delete task: ${todo.title}`"
              class="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover:opacity-100 max-lg:opacity-100"
              @click="removeTask(todo)"
            >
              <TrashIcon class="size-3.5" />
            </button>
          </div>
        </template>

        <div v-if="completedTasks.length > 0" class="mt-2 border-t border-sidebar-border pt-2">
          <p class="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Completed · {{ completedTasks.length }}
          </p>
          <div
            v-for="todo in completedTasks"
            :key="todo.id"
            class="group flex items-start gap-2 rounded-lg px-2 py-1.5 opacity-60 transition-opacity hover:bg-muted"
          >
            <GripVerticalIcon class="mt-0.5 size-3.5 shrink-0 text-muted-foreground/30" />
            <button
              type="button"
              :aria-label="`Mark “${todo.title}” as not done`"
              class="mt-0.5 shrink-0 cursor-pointer rounded text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-peach"
              :disabled="props.readonly"
              @click="toggleDone(todo)"
            >
              <CheckIcon class="size-4" />
            </button>
            <button class="min-w-0 flex-1 text-left text-sm leading-tight line-through" @dblclick="startEdit(todo)">
              {{ todo.title }}
            </button>
            <button
              v-if="!props.readonly"
              type="button"
              :aria-label="`Delete task: ${todo.title}`"
              class="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover:opacity-100 max-lg:opacity-100"
              @click="removeTask(todo)"
            >
              <TrashIcon class="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </ScrollArea>
    </aside>
  </div>
</template>
