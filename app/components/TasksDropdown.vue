<script setup lang="ts">
import { CheckIcon, CircleIcon, ClockIcon, Loader2Icon } from '@lucide/vue'
import { useTodoStore, type Todo } from '~/stores/todos'

withDefaults(defineProps<{ class?: string }>(), { class: '' })

const todoStore = useTodoStore()
const router = useRouter()

const open = ref(false)

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

async function openConversation(conversationId: string) {
  await router.push({ path: '/chat', query: { c: conversationId } })
}

watch(open, (isOpen) => {
  if (isOpen) {
    void todoStore.fetchTodos()
  }
})

onMounted(() => {
  void todoStore.fetchTodos()
})
</script>

<template>
  <div :class="class">
    <DropdownMenu v-model:open="open">
      <DropdownMenuTrigger
        class="flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors hover:bg-muted"
        aria-label="Next steps"
      >
        <span class="font-medium tabular-nums text-foreground">
          {{ completedTodos.length }}/{{ todoStore.todos.length }}
        </span>
        <span class="text-muted-foreground">Tasks</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" class="w-80">
        <DropdownMenuLabel class="flex items-center justify-between">
          <span class="text-sm font-medium">Next steps</span>
          <span class="text-xs text-muted-foreground">
            {{ pendingTodos.length }}/{{ todoStore.todos.length }} pending
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div v-if="todoStore.loading" class="flex items-center justify-center py-8">
          <Loader2Icon class="size-5 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="todoStore.todos.length === 0" class="px-3 py-8 text-center">
          <p class="text-xs text-muted-foreground">No action items yet</p>
        </div>

        <template v-else>
          <div v-if="pendingTodos.length > 0">
            <p class="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Pending
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
              <button
                class="min-w-0 flex-1 text-left text-sm leading-tight"
                @click="openConversation(todo.conversation_id)"
              >
                {{ todo.title }}
              </button>
              <Badge v-if="todo.priority" :class="priorityBadge(todo.priority)" class="px-1.5 py-0 text-[10px]">
                {{ todo.priority }}
              </Badge>
            </div>
          </div>

          <div v-if="completedTodos.length > 0">
            <p class="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Completed
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

        <DropdownMenuSeparator />
        <DropdownMenuItem @click="navigateTo('/todos')">
          View all tasks
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
