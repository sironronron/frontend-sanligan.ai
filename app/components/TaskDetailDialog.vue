<script setup lang="ts">
import { CalendarIcon, CheckIcon, ChevronDownIcon, Loader2Icon, XIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { useTodoStore, type Todo } from '~/stores/todos'
import { useOrganizationStore, type OrgMember } from '~/stores/organization'

const props = defineProps<{
  todo: Todo
  open: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const todoStore = useTodoStore()
const orgStore = useOrganizationStore()

const dueDate = ref<string>('')
const assignee = ref<string>('')
const description = ref<string>('')
const saving = ref(false)
const assigneeOpen = ref(false)
const assigneeSearch = ref('')

// Local copies to track dirty state
const original = ref({ dueDate: '', assignee: '', description: '' })

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    dueDate.value = props.todo.due_date ?? ''
    assignee.value = props.todo.assignee ?? ''
    description.value = props.todo.description ?? ''
    original.value = { dueDate: dueDate.value, assignee: assignee.value, description: description.value }
    orgStore.fetchMembers()
  }
}, { immediate: true })

const hasChanges = computed(() =>
  dueDate.value !== original.value.dueDate
  || assignee.value !== original.value.assignee
  || description.value !== original.value.description,
)

const filteredMembers = computed(() => {
  const needle = assigneeSearch.value.trim().toLowerCase()
  if (needle === '') return orgStore.members.filter(m => m.org_status === 'active')
  return orgStore.members.filter(
    m => m.org_status === 'active'
      && (m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle)),
  )
})

const selectedMember = computed(() =>
  orgStore.members.find(m => m.name === assignee.value) ?? null,
)

function initials(name: string) {
  return name.split(/\s+/).map(p => p[0] ?? '').join('').slice(0, 2).toUpperCase()
}

function selectAssignee(member: OrgMember | null) {
  assignee.value = member?.name ?? ''
  assigneeOpen.value = false
  assigneeSearch.value = ''
}

function clearDueDate() {
  dueDate.value = ''
}

async function save() {
  if (!hasChanges.value) {
    emit('close')
    return
  }
  saving.value = true
  try {
    await todoStore.updateTodo(props.todo.id, {
      due_date: dueDate.value || null,
      assignee: assignee.value || null,
      description: description.value || null,
    })
    toast.success('Task updated')
    emit('close')
  } catch {
    toast.error('Could not update task')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-sm"
      style="background: rgb(0 0 0 / 0.45)"
      role="dialog"
      aria-modal="true"
      aria-label="Task details"
      @click.self="emit('close')"
    >
      <div class="surface flex max-h-[86dvh] w-full max-w-md flex-col overflow-hidden">
        <div class="flex items-start gap-3 border-b px-5 py-3.5">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ todo.title }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">Task details</p>
          </div>
          <Button variant="ghost" size="icon" class="size-7 shrink-0" aria-label="Close" @click="emit('close')">
            <XIcon class="size-4" />
          </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <!-- Deadline -->
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Deadline</label>
            <div class="mt-1.5 flex items-center gap-2">
              <div class="relative flex-1">
                <CalendarIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  v-model="dueDate"
                  type="date"
                  class="h-9 w-full rounded-lg border bg-transparent py-1.5 pr-3 pl-9 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3"
                  :class="dueDate ? 'border-ring' : 'border-input'"
                />
              </div>
              <Button
                v-if="dueDate"
                variant="ghost"
                size="icon"
                class="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Clear deadline"
                @click="clearDueDate"
              >
                <XIcon class="size-3.5" />
              </Button>
            </div>
          </div>

          <!-- Assignee -->
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Assignee</label>
            <div class="mt-1.5 relative">
              <button
                type="button"
                class="flex h-9 w-full items-center gap-2.5 rounded-lg border bg-transparent px-3 text-sm text-left outline-none transition-colors hover:border-ring focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3"
                :class="selectedMember ? 'border-ring' : 'border-input'"
                @click="assigneeOpen = !assigneeOpen"
              >
                <span
                  v-if="selectedMember"
                  class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
                >
                  {{ initials(selectedMember.name) }}
                </span>
                <span v-if="selectedMember" class="min-w-0 flex-1 truncate">{{ selectedMember.name }}</span>
                <span v-else class="min-w-0 flex-1 text-muted-foreground">Unassigned</span>
                <ChevronDownIcon class="size-4 shrink-0 text-muted-foreground" />
              </button>

              <div
                v-if="assigneeOpen"
                class="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-lg"
              >
                <div class="p-1.5">
                  <Input
                    v-model="assigneeSearch"
                    class="h-8 text-xs"
                    placeholder="Search members…"
                    autofocus
                  />
                </div>
                <div class="max-h-48 overflow-y-auto p-1">
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                    :class="selectedMember === null ? 'bg-muted' : ''"
                    @click="selectAssignee(null)"
                  >
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                      —
                    </span>
                    <span class="min-w-0 flex-1 text-muted-foreground">Unassigned</span>
                    <CheckIcon v-if="!selectedMember" class="size-3.5 shrink-0 text-primary" />
                  </button>

                  <button
                    v-for="member in filteredMembers"
                    :key="member.id"
                    type="button"
                    class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                    :class="selectedMember?.id === member.id ? 'bg-muted' : ''"
                    @click="selectAssignee(member)"
                  >
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                      {{ initials(member.name) }}
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium">{{ member.name }}</p>
                      <p class="truncate text-[11px] text-muted-foreground">{{ member.email }}</p>
                    </div>
                    <CheckIcon v-if="selectedMember?.id === member.id" class="size-3.5 shrink-0 text-primary" />
                  </button>

                  <p v-if="filteredMembers.length === 0" class="px-2.5 py-2 text-xs text-muted-foreground">
                    No members found.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div>
            <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notes</label>
            <Textarea
              v-model="description"
              class="mt-1.5 min-h-24 text-sm"
              placeholder="Add notes about this task…"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" size="sm" @click="emit('close')">Cancel</Button>
          <Button size="sm" :disabled="saving || !hasChanges" @click="save">
            <Loader2Icon v-if="saving" class="size-3.5 animate-spin" />
            {{ saving ? 'Saving…' : 'Save' }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
