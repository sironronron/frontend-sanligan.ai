<script setup lang="ts">
import { CheckIcon, CircleIcon, ClockIcon, ListChecksIcon, Loader2Icon } from '@lucide/vue'
import { useTodoStore, type Todo } from '~/stores/todos'

const todoStore = useTodoStore()
const router = useRouter()

const pendingTodos = computed(() => todoStore.todos.filter((t) => t.status !== 'completed'))
const completedTodos = computed(() => todoStore.todos.filter((t) => t.status === 'completed'))

function statusIcon(status: Todo['status']) {
  return status === 'completed' ? CheckIcon : status === 'on-going' ? ClockIcon : CircleIcon
}

function statusColor(status: Todo['status']) {
  return status === 'completed' ? 'text-forest dark:text-peach' : status === 'on-going' ? 'text-espresso dark:text-peach' : 'text-muted-foreground'
}

function priorityBadge(priority: Todo['priority']) {
  if (!priority) return ''
  return priority === 'high' ? 'bg-destructive/10 text-destructive' : priority === 'medium' ? 'bg-peach/60 text-espresso' : 'bg-muted text-muted-foreground'
}

function formatDueDate(date: string | null) {
  if (!date) return ''
  const d = new Date(`${date}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function dueText(todo: Todo) {
  if (todo.due_date) return `Due ${formatDueDate(todo.due_date)}`
  return todo.due_hint ?? ''
}

async function openConversation(conversationId: string) {
  await router.push({ path: '/chat', query: { c: conversationId } })
}
</script>

<template>
  <div v-if="todoStore.loading" class="flex items-center justify-center py-8">
    <Loader2Icon class="size-5 animate-spin text-muted-foreground" />
  </div>

  <div v-else-if="todoStore.todos.length === 0" class="px-3 py-8 text-center">
    <ListChecksIcon class="mx-auto size-5 text-muted-foreground/50" />
    <p class="mt-2 text-xs text-muted-foreground">No action items yet</p>
  </div>

  <template v-else>
    <div v-if="pendingTodos.length > 0">
      <p class="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Open · {{ pendingTodos.length }}
      </p>
      <div
        v-for="todo in pendingTodos"
        :key="todo.id"
        class="group flex items-start gap-2 rounded-md px-3 py-1.5 transition-colors hover:bg-muted/50"
      >
        <button
          :class="statusColor(todo.status)"
          class="mt-0.5 shrink-0"
          @click="todoStore.toggleStatus(todo.id)"
        >
          <component :is="statusIcon(todo.status)" class="size-4" />
        </button>
        <div class="min-w-0 flex-1">
          <button
            class="block w-full truncate text-left text-sm leading-tight"
            @click="openConversation(todo.conversation_id)"
          >
            {{ todo.title }}
          </button>
          <div v-if="todo.priority || dueText(todo)" class="mt-0.5 flex items-center gap-1.5">
            <Badge v-if="todo.priority" :class="priorityBadge(todo.priority)" class="px-1.5 py-0 text-[10px]">
              {{ todo.priority }}
            </Badge>
            <span v-if="dueText(todo)" class="truncate text-[11px] text-muted-foreground">
              {{ dueText(todo) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="completedTodos.length > 0">
      <p class="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Done · {{ completedTodos.length }}
      </p>
      <div
        v-for="todo in completedTodos"
        :key="todo.id"
        class="flex items-start gap-2 rounded-md px-3 py-1.5 opacity-60"
      >
        <button
          type="button"
          :aria-label="`Mark “${todo.title}” as not done`"
          class="mt-0.5 shrink-0 rounded text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-peach"
          @click="todoStore.toggleStatus(todo.id)"
        >
          <CheckIcon class="size-4" />
        </button>
        <p class="min-w-0 flex-1 truncate text-sm leading-tight line-through">{{ todo.title }}</p>
      </div>
    </div>
  </template>
</template>