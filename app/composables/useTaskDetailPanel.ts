import type { Todo } from '~/stores/todos'

const selectedTodo = ref<Todo | null>(null)

/**
 * Shared state for the task detail slide-in panel.
 * Any component can call `openTodo(todo)` to show the panel,
 * and `closeTodo()` to dismiss it.
 */
export function useTaskDetailPanel() {
  function openTodo(todo: Todo) {
    selectedTodo.value = todo
  }

  function closeTodo() {
    selectedTodo.value = null
  }

  return {
    selectedTodo: readonly(selectedTodo),
    openTodo,
    closeTodo,
  }
}
