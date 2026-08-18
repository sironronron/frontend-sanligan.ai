<script setup lang="ts">
import { ListChecksIcon } from '@lucide/vue'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTodoStore, type Todo } from '~/stores/todos'

/**
 * The next three things to do, in the sidebar footer.
 *
 * Same shape as the usage block below it: an inline card while the sidebar is
 * open, and a single icon that opens a popover once it collapses to rail width.
 * Hiding the tasks entirely on the rail would make collapsing the sidebar
 * quietly cost you information, so both variants show the same rows — and each
 * row can be ticked off in place without leaving the page.
 */
const todoStore = useTodoStore()
const { openTodo } = useTaskDetailPanel()

const HOW_MANY = 3

/** high before medium before low, and an unset priority last. */
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

function rankOf(todo: Todo) {
  return todo.priority ? (PRIORITY_RANK[todo.priority] ?? 3) : 3
}

const openTasks = computed(() => todoStore.todos.filter((todo) => todo.status !== 'completed'))

/**
 * Priority first, then the nearest due date. A task with no due date sorts
 * after dated ones of the same priority: "sometime" should never outrank
 * "Friday".
 */
const topTasks = computed(() =>
  openTasks.value
    .slice()
    .sort((a, b) => {
      const byPriority = rankOf(a) - rankOf(b)
      if (byPriority !== 0) return byPriority

      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1

      // Nothing left to separate them by, so fall back to the order the board
      // already shows them in rather than letting sort() decide arbitrarily.
      return a.order - b.order
    })
    .slice(0, HOW_MANY),
)

/** How many are waiting behind the three on show. */
const remaining = computed(() => Math.max(0, openTasks.value.length - topTasks.value.length))

/**
 * Open the task detail panel instead of navigating away.
 */
function openTask(todo: Todo) {
  openTodo(todo)
}

onMounted(() => {
  // Only when nothing has loaded them yet: the tasks page and the chat thread
  // both fill this store, and a second unfiltered fetch would replace what they
  // put there.
  if (todoStore.todos.length === 0) void todoStore.fetchTodos()
})
</script>

<template>
  <template v-if="topTasks.length > 0">
    <!--
      Collapsed to the rail: one icon, the list behind a popover. The panel is
      built in bands — header, rows, footer — rather than as one padded box, so
      the rows have a surface of their own to highlight against on hover.
    -->
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover>
          <PopoverTrigger as-child>
            <SidebarMenuButton
              :tooltip="`Next up — ${openTasks.length} open ${openTasks.length === 1 ? 'task' : 'tasks'}`"
              class="hidden group-data-[collapsible=icon]:flex"
            >
              <ListChecksIcon />
              <span>Tasks</span>
            </SidebarMenuButton>
          </PopoverTrigger>

          <PopoverContent side="right" align="end" :side-offset="8" class="w-72 overflow-hidden p-0">
            <div class="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span class="flex items-center gap-1.5 text-sm font-semibold">
                <ListChecksIcon class="size-3.5 text-primary" />
                Next up
              </span>
              <span class="text-[11px] text-muted-foreground tabular-nums">
                {{ openTasks.length }} open
              </span>
            </div>

            <div class="p-1.5">
              <SidebarTaskRow
                v-for="todo in topTasks"
                :key="todo.id"
                :todo="todo"
                variant="popover"
                @open="openTask"
              />
            </div>

            <NuxtLink
              to="/todos"
              class="flex items-center justify-between border-t px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-accent"
            >
              <span>{{ remaining > 0 ? `${remaining} more` : 'All tasks' }}</span>
              <span aria-hidden="true">→</span>
            </NuxtLink>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>

    <!-- Expanded: the same rows, inline. -->
    <div
      class="overflow-hidden rounded-xl border border-sidebar-border/70 bg-sidebar-accent/40 group-data-[collapsible=icon]:hidden"
    >
      <div class="flex items-center justify-between gap-2 px-2.5 pt-2 pb-1">
        <span class="text-sm font-medium text-sidebar-foreground/70">Next up</span>
        <NuxtLink to="/todos" class="text-xs font-medium text-primary hover:underline">
          {{ remaining > 0 ? `${remaining} more` : 'All tasks' }}
        </NuxtLink>
      </div>

      <div class="px-1.5 pb-1.5">
        <SidebarTaskRow
          v-for="todo in topTasks"
          :key="todo.id"
          :todo="todo"
          variant="inline"
          @open="openTask"
        />
      </div>
    </div>
  </template>
</template>
