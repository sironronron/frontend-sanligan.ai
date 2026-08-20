<script setup lang="ts">
import {
  ArrowRightIcon,
  FilePenIcon,
  FileSearchIcon,
  FolderIcon,
  GaugeIcon,
  ListChecksIcon,
  MessageSquareIcon,
  UsersIcon,
} from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import type { Todo } from '~/stores/todos'
import { timeAgo } from '~/utils/time'
import { useLetterDraftPanel } from '~/composables/useLetterDraftPanel'
import { useTaskDetailPanel } from '~/composables/useTaskDetailPanel'

definePageMeta({
  middleware: ['auth', 'onboarding', 'subscription', 'terms', 'suspended'],
  layout: 'default',
})

const auth = useAuthStore()
const todos = useTodoStore()
const { openTodo } = useTaskDetailPanel()
const { openLetterDraft: openDraft } = useLetterDraftPanel()

const { summary, loading, error, load } = useDashboard()

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
})

const firstName = computed(() => auth.user?.name?.split(/\s+/)[0] ?? 'there')

const openTasks = computed<Todo[]>(() =>
  todos.todos.filter(t => t.status !== 'completed').slice(0, 6),
)

const messages = computed(() => summary.value?.usage.messages ?? null)
const cases = computed(() => summary.value?.cases ?? null)
const org = computed(() => summary.value?.organization ?? null)
const tasks = computed(() => summary.value?.tasks ?? null)
const drafts = computed(() => summary.value?.drafts ?? null)
const vetting = computed(() => summary.value?.vetting ?? null)

const recentDrafts = computed(() => drafts.value?.recent ?? [])
const vettingStatuses = computed(() =>
  Object.entries(vetting.value?.by_status ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]),
)

function startChat() {
  navigateTo('/chat')
}

async function draftLetter() {
  try {
    await navigateTo('/chat')
  } catch {
    toast.message('Open a chat to draft a letter.')
  }
}

function openDraftPanel(messageId: string, title: string) {
  openDraft({ content: null, title, messageId })
}

onMounted(async () => {
  await load()
  if (summary.value) {
    await todos.fetchTodos()
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
    <!-- Hero -->
    <section class="hero-gradient surface mb-6 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <p class="text-label">Dashboard</p>
        <h1 class="text-display mt-1">Good {{ greeting }}, {{ firstName }}</h1>
        <p class="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Here's what's happening with your legal work right now.
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <Button class="gap-2" @click="startChat">
          <MessageSquareIcon class="size-4" />
          Start a chat
        </Button>
        <Button variant="outline" class="gap-2" @click="draftLetter">
          <FilePenIcon class="size-4" />
          Draft a letter
        </Button>
      </div>
    </section>

    <!-- Stat tile grid -->
    <StatSkeleton v-if="loading" :count="6" />

    <div v-else-if="error" class="surface flex flex-col items-center gap-3 p-10 text-center">
      <p class="text-sm font-medium">{{ error }}</p>
      <Button class="gap-2" @click="load()">
        Retry
      </Button>
    </div>

    <template v-else-if="summary">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Messages"
          :value="messages?.used ?? 0"
          :used="messages?.used ?? null"
          :limit="messages?.limit ?? null"
          :hint="messages?.limit ? `${messages.limit.toLocaleString()} included` : 'Unlimited'"
          :icon="GaugeIcon"
          to="/settings/billing"
        />
        <StatTile
          label="Cases"
          :value="cases?.total ?? 0"
          :hint="`${cases?.open ?? 0} open`"
          :icon="FolderIcon"
          to="/cases"
        />
        <StatTile
          label="Members"
          :value="org?.members ?? 0"
          :hint="`${org?.seats_used ?? 0} of ${org?.seats_total ?? 0} seats`"
          :icon="UsersIcon"
          to="/settings/organization"
        />
        <StatTile
          label="Open tasks"
          :value="tasks?.open ?? 0"
          :hint="`${tasks?.pending ?? 0} pending · ${tasks?.on_going ?? 0} on-going`"
          :icon="ListChecksIcon"
          to="/todos"
        />
        <StatTile
          label="Drafts"
          :value="drafts?.total ?? 0"
          :hint="recentDrafts.length ? `${recentDrafts.length} recent` : 'No drafts yet'"
          :icon="FilePenIcon"
          to="/drafts"
        />
        <StatTile
          label="Vetting"
          :value="vetting?.active ?? 0"
          :hint="vetting?.active ? 'in progress' : 'None active'"
          :icon="FileSearchIcon"
          to="/vetting"
        />
      </div>

      <!-- Work area -->
      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <!-- Primary column -->
        <div class="flex flex-col gap-4 lg:col-span-2">
          <SectionCard title="Your tasks" :icon="ListChecksIcon" body-class="p-0">
            <template #actions>
              <Button variant="ghost" size="sm" class="gap-1.5" @click="navigateTo('/todos')">
                View all
                <ArrowRightIcon class="size-3.5" />
              </Button>
            </template>

            <div v-if="openTasks.length === 0" class="p-5">
              <EmptyState
                :icon="ListChecksIcon"
                title="No open tasks"
                description="Tasks the assistant creates will show up here so you can pick up where you left off."
                action-label="Start a chat"
                to="/chat"
              />
            </div>

            <ul v-else class="divide-y divide-border/70">
              <li
                v-for="task in openTasks"
                :key="task.id"
                class="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                @click="openTodo(task)"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ task.title }}</span>
                  <span class="text-caption text-muted-foreground">{{ timeAgo(task.created_at) }}</span>
                </span>
                <StatusBadge :status="task.status" :label="task.status.replace('_', ' ')" />
              </li>
            </ul>
          </SectionCard>

          <SectionCard title="Recent drafts" :icon="FilePenIcon" body-class="p-0">
            <template #actions>
              <Button variant="ghost" size="sm" class="gap-1.5" @click="navigateTo('/drafts')">
                View all
                <ArrowRightIcon class="size-3.5" />
              </Button>
            </template>

            <div v-if="recentDrafts.length === 0" class="p-5">
              <EmptyState
                :icon="FilePenIcon"
                title="No drafted letters yet"
                description="Ask the assistant to draft a letter and it will appear here, ready to open and edit."
                action-label="Start a chat"
                to="/chat"
              />
            </div>

            <ul v-else class="divide-y divide-border/70">
              <li
                v-for="draft in recentDrafts"
                :key="draft.message_id"
                class="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                @click="openDraftPanel(draft.message_id, draft.title)"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ draft.title || 'Untitled letter' }}</span>
                  <span class="text-caption text-muted-foreground">{{ timeAgo(draft.created_at) }}</span>
                </span>
                <ArrowRightIcon class="size-4 shrink-0 text-muted-foreground" />
              </li>
            </ul>
          </SectionCard>
        </div>

        <!-- Rail -->
        <div class="flex flex-col gap-4">
          <SectionCard title="On-going vetting" :icon="FileSearchIcon" body-class="p-0">
            <template #actions>
              <Button variant="ghost" size="sm" class="gap-1.5" @click="navigateTo('/vetting')">
                View all
                <ArrowRightIcon class="size-3.5" />
              </Button>
            </template>

            <div v-if="vettingStatuses.length === 0" class="p-5">
              <EmptyState
                :icon="FileSearchIcon"
                title="No active vetting"
                description="Document vetting and notarization requests you start will appear here."
                action-label="New vetting request"
                to="/vetting/new"
              />
            </div>

            <ul v-else class="divide-y divide-border/70">
              <li
                v-for="[status, count] in vettingStatuses"
                :key="status"
                class="flex items-center gap-3 px-5 py-3"
              >
                <StatusBadge :status="status" :label="status.replace('_', ' ')" class="flex-1" />
                <span class="text-sm font-semibold tabular-nums">{{ count }}</span>
              </li>
            </ul>
          </SectionCard>

          <SectionCard title="Cases needing attention" :icon="FolderIcon" body-class="p-0">
            <template #actions>
              <Button variant="ghost" size="sm" class="gap-1.5" @click="navigateTo('/cases')">
                View all
                <ArrowRightIcon class="size-3.5" />
              </Button>
            </template>

            <div v-if="(cases?.open ?? 0) === 0" class="p-5">
              <EmptyState
                :icon="FolderIcon"
                title="No open cases"
                description="Create a case to organize a matter, its documents, and the tasks around it."
                action-label="Create a case"
                to="/cases"
              />
            </div>

            <ul v-else class="divide-y divide-border/70">
              <li
                class="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                @click="navigateTo('/cases')"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ cases?.open }} open case{{ cases?.open === 1 ? '' : 's' }}</span>
                  <span class="text-caption text-muted-foreground">{{ cases?.total }} total</span>
                </span>
                <ArrowRightIcon class="size-4 shrink-0 text-muted-foreground" />
              </li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </template>
  </div>
</template>
