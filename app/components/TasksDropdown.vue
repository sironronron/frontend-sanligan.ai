<script setup lang="ts">
import { ListChecksIcon } from '@lucide/vue'
import { useTodoStore } from '~/stores/todos'

withDefaults(defineProps<{ class?: string }>(), { class: '' })

const todoStore = useTodoStore()

const open = ref(false)

const pendingTodos = computed(() => todoStore.todos.filter((t) => t.status !== 'completed'))
const completedTodos = computed(() => todoStore.todos.filter((t) => t.status === 'completed'))

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
        class="flex h-8 items-center gap-2 rounded-full border px-2.5 pr-3 text-sm transition-colors hover:bg-muted"
        aria-label="Tasks"
      >
        <span class="relative">
          <span
            class="flex size-5 items-center justify-center rounded-full"
            :class="pendingTodos.length > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
          >
            <ListChecksIcon class="size-3" />
          </span>
          <span
            v-if="pendingTodos.length > 0"
            class="absolute -right-1 -top-1 flex min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-semibold leading-3 tabular-nums text-primary-foreground"
          >
            {{ pendingTodos.length }}
          </span>
        </span>
        <span class="font-medium text-foreground">Tasks</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" class="w-80">
        <DropdownMenuLabel class="flex items-center justify-between">
          <span class="text-sm font-medium">Tasks</span>
          <span class="text-xs tabular-nums text-muted-foreground">
            {{ pendingTodos.length }} open · {{ completedTodos.length }} done
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <TaskList />

        <DropdownMenuSeparator />
        <DropdownMenuItem @click="navigateTo('/todos')">
          View all tasks
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
