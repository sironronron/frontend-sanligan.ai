<script setup lang="ts">
import { CheckIcon, TrashIcon, CircleIcon, ClockIcon } from '@lucide/vue'
import { useTodoStore, type Todo } from '~/stores/todos'

const props = defineProps<{
  conversationId: string
}>()

const todoStore = useTodoStore()

const filteredTodos = computed(() =>
  todoStore.todos.filter((t) => t.conversation_id === props.conversationId)
)

const pendingTodos = computed(() => filteredTodos.value.filter((t) => t.status !== 'completed'))
const completedTodos = computed(() => filteredTodos.value.filter((t) => t.status === 'completed'))

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
</script>

<template>
  <aside class="hidden lg:flex w-[350px] shrink-0 flex-col border-l bg-background">
    <div class="flex items-center border-b px-4 py-2.5">
      <h3 class="text-sm font-semibold">Next Steps</h3>
      <Badge variant="secondary" class="ml-2">{{ pendingTodos.length }} pending</Badge>
    </div>

    <ScrollArea class="flex-1">
      <div class="p-4 space-y-2">
        <div v-if="filteredTodos.length === 0" class="text-center py-8">
          <p class="text-xs text-muted-foreground">No action items yet</p>
        </div>

        <template v-if="pendingTodos.length > 0">
          <div
            v-for="todo in pendingTodos"
            :key="todo.id"
            class="group flex items-start gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <button
              :class="statusColor(todo.status)"
              class="mt-0.5 shrink-0"
              @click="todoStore.toggleStatus(todo.id)"
            >
              <component :is="statusIcon(todo.status)" class="size-4" />
            </button>
            <div class="flex-1 min-w-0">
              <p class="text-sm leading-tight">{{ todo.title }}</p>
              <div class="mt-1 flex items-center gap-2">
                <Badge v-if="todo.priority" :class="priorityBadge(todo.priority)" class="text-[10px] px-1.5 py-0">
                  {{ todo.priority }}
                </Badge>
                <span v-if="todo.due_hint" class="text-[11px] text-muted-foreground">
                  {{ todo.due_hint }}
                </span>
              </div>
            </div>
            <button
              class="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 max-lg:opacity-100"
              @click="todoStore.deleteTodo(todo.id)"
            >
              <TrashIcon class="size-3.5" />
            </button>
          </div>
        </template>

        <template v-if="completedTodos.length > 0">
          <div class="pt-2">
            <p class="text-xs font-medium text-muted-foreground mb-2">Completed</p>
            <div
              v-for="todo in completedTodos"
              :key="todo.id"
              class="group flex items-start gap-2 rounded-lg border p-3 opacity-60 transition-colors hover:bg-muted/50"
            >
              <button
                :class="statusColor(todo.status)"
                class="mt-0.5 shrink-0"
                @click="todoStore.toggleStatus(todo.id)"
              >
                <CheckIcon class="size-4" />
              </button>
              <div class="flex-1 min-w-0">
                <p class="text-sm leading-tight line-through">{{ todo.title }}</p>
              </div>
              <button
                class="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                @click="todoStore.deleteTodo(todo.id)"
              >
                <TrashIcon class="size-3.5" />
              </button>
            </div>
          </div>
        </template>
      </div>
    </ScrollArea>
  </aside>
</template>
