<script setup lang="ts">
import { Loader2Icon } from '@lucide/vue'
import { useTodoStore } from '~/stores/todos'

definePageMeta({
  middleware: ['auth', 'onboarding', 'subscription'],
})

const route = useRoute()
const todoStore = useTodoStore()

const todoId = route.params.id as string
const notFound = ref(false)

onMounted(async () => {
  // Make sure todos are loaded
  if (todoStore.todos.length === 0) {
    await todoStore.fetchTodos()
  }

  if (!todoStore.todos.some(t => t.id === todoId)) {
    notFound.value = true
  }
})

// Watch for the todo to appear (in case it loads async)
watch(() => todoStore.todos, (todos) => {
  if (todos.some(t => t.id === todoId)) {
    notFound.value = false
  }
}, { deep: true })

const todo = computed(() => todoStore.todos.find(t => t.id === todoId))
</script>

<template>
  <div class="flex flex-1 flex-col">
    <div v-if="notFound" class="flex flex-1 items-center justify-center p-6">
      <div class="text-center">
        <p class="text-sm text-muted-foreground">Task not found.</p>
        <NuxtLink to="/todos" class="mt-2 text-sm text-primary hover:underline">
          Back to tasks
        </NuxtLink>
      </div>
    </div>
    <div v-else-if="todo">
      <TaskDetailPage
        :todo="todo"
        @close="navigateTo('/todos')"
      />
    </div>
    <div v-else class="flex flex-1 items-center justify-center p-6">
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon class="size-4 animate-spin" />
        Loading task…
      </div>
    </div>
  </div>
</template>