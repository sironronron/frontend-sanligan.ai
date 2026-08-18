import { toast } from '~/components/ui/sonner'
import {
  CheckIcon,
  ClockIcon,
  Edit3Icon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from '@lucide/vue'
import { useTodoStore, type Todo } from '~/stores/todos'
import { useOrganizationStore } from '~/stores/organization'

/**
 * Shared state + actions for editing a single task detail. Used by the
 * slide-in panel (TaskDetailContent) and the full desktop page
 * (TaskDetailPage) so both surfaces edit identically without duplicating
 * logic. `todo` is a getter so the same composable instance can follow the
 * currently-selected todo.
 */
export function useTaskDetailEditor(todo: MaybeRefOrGetter<Todo | null>) {
  const todoStore = useTodoStore()
  const orgStore = useOrganizationStore()
  const api = useApi()

  // --- Task resources (subtasks, comments, activities, attachments) ---
  const resources = useTaskResources(() => toValue(todo)?.id ?? '')

  // --- Editable fields ---
  const title = ref('')
  const description = ref('')
  const dueDate = ref<string>('')
  const assignee = ref('')
  const priority = ref<Todo['priority']>(null)
  const status = ref<Todo['status']>('pending')
  const saving = ref(false)
  const assigneeOpen = ref(false)
  const assigneeSearch = ref('')
  const titleEl = ref<HTMLTextAreaElement | null>(null)

  function autoGrowTitle() {
    const el = titleEl.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const currentTodo = computed(() => toValue(todo))

  watch(currentTodo, () => {
    nextTick(autoGrowTitle)
  }, { immediate: true })

  watch(() => title.value, autoGrowTitle)

  const original = ref({ title: '', description: '', dueDate: '', assignee: '', priority: null as Todo['priority'], status: 'pending' as Todo['status'] })

  watch(currentTodo, (t) => {
    if (t) {
      title.value = t.title
      description.value = t.description ?? ''
      dueDate.value = t.due_date ?? ''
      assignee.value = t.assignee ?? ''
      priority.value = t.priority
      status.value = t.status
      original.value = { title: t.title, description: description.value, dueDate: dueDate.value, assignee: assignee.value, priority: priority.value, status: status.value }
    }
  }, { immediate: true })

  const hasChanges = computed(() =>
    title.value !== original.value.title
    || description.value !== original.value.description
    || dueDate.value !== original.value.dueDate
    || assignee.value !== original.value.assignee
    || priority.value !== original.value.priority
    || status.value !== original.value.status,
  )

  // --- Priority ---
  const priorityOptions: { value: NonNullable<Todo['priority']>; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ]

  const priorityScore = computed(() => {
    if (priority.value === 'high') return 8
    if (priority.value === 'medium') return 5
    if (priority.value === 'low') return 2
    return 0
  })

  // --- Status ---
  const statusOptions: { value: Todo['status']; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'on-going', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
  ]

  // --- Subtasks ---
  const newSubtaskTitle = ref('')

  async function addSubtask() {
    const t = newSubtaskTitle.value.trim()
    if (!t) return
    const created = await resources.addSubtask(t)
    if (created) newSubtaskTitle.value = ''
  }

  async function toggleSubtask(id: string) {
    const st = resources.subtasks.value.find(s => s.id === id)
    if (st) await resources.updateSubtask(id, { done: !st.done })
  }

  async function removeSubtask(id: string) {
    await resources.removeSubtask(id)
  }

  // --- Attachments ---
  const attachmentInput = ref<HTMLInputElement | null>(null)

  function onAttachmentPick(event: Event) {
    const target = event.target as HTMLInputElement
    const files = target.files ? Array.from(target.files) : []
    for (const file of files) {
      uploadAndAttach(file)
    }
    target.value = ''
  }

  async function uploadAndAttach(file: File) {
    const form = new FormData()
    form.append('file', file)
    try {
      const { data: doc } = await api<{ data: { id: string } }>('/documents', {
        method: 'POST',
        body: form,
      })
      await resources.addAttachment(doc.id)
      toast.success(`Uploaded "${file.name}"`)
    } catch {
      toast.error(`Could not upload "${file.name}"`)
    }
  }

  // --- Comments ---
  const commentText = ref('')

  async function addComment() {
    const text = commentText.value.trim()
    if (!text) return
    const created = await resources.addComment(text)
    if (created) commentText.value = ''
  }

  // --- Members ---
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

  function selectAssignee(member: { name: string } | null) {
    assignee.value = member?.name ?? ''
    assigneeOpen.value = false
    assigneeSearch.value = ''
  }

  function clearDueDate() {
    dueDate.value = ''
  }

  // --- Tabs ---
  const activeTab = ref<'subtasks' | 'comments' | 'activities'>('subtasks')

  // --- Header actions ---
  const moreOpen = ref(false)

  function copyLink(todoId: string) {
    const url = `${window.location.origin}/tasks/${todoId}`
    navigator.clipboard.writeText(url)
    toast.success('Link copied to clipboard')
  }

  async function deleteTask() {
    const t = toValue(todo)
    if (!t) return
    try {
      await todoStore.deleteTodo(t.id)
      toast.success('Task deleted')
    } catch {
      toast.error('Could not delete task')
    }
    moreOpen.value = false
  }

  // --- Save ---
  async function save() {
    if (!hasChanges.value) return
    saving.value = true
    try {
      const t = toValue(todo)
      if (!t) return
      await todoStore.updateTodo(t.id, {
        title: title.value,
        description: description.value || null,
        due_date: dueDate.value || null,
        assignee: assignee.value || null,
        priority: priority.value,
        status: status.value,
      })
      toast.success('Task updated')
    } catch {
      toast.error('Could not update task')
    } finally {
      saving.value = false
    }
  }

  // --- Load members + resources when the todo is known ---
  watch(currentTodo, (t) => {
    if (t) {
      orgStore.fetchMembers()
      resources.fetchAll()
    }
  }, { immediate: true })

  function formatDate(value: string | null) {
    if (!value) return '—'
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function activityIcon(type: string) {
    switch (type) {
      case 'subtask_added': return PlusIcon
      case 'subtask_completed': return CheckIcon
      case 'subtask_reopened': return XIcon
      case 'subtask_removed': return TrashIcon
      case 'attachment_added': return UploadIcon
      case 'attachment_removed': return TrashIcon
      case 'todo_created': return PlusIcon
      case 'todo_updated': return Edit3Icon
      default: return ClockIcon
    }
  }

  return {
    todo: currentTodo,
    resources,
    title,
    description,
    dueDate,
    assignee,
    priority,
    status,
    saving,
    assigneeOpen,
    assigneeSearch,
    titleEl,
    autoGrowTitle,
    original,
    hasChanges,
    priorityOptions,
    priorityScore,
    statusOptions,
    newSubtaskTitle,
    addSubtask,
    toggleSubtask,
    removeSubtask,
    attachmentInput,
    onAttachmentPick,
    uploadAndAttach,
    commentText,
    addComment,
    filteredMembers,
    selectedMember,
    initials,
    selectAssignee,
    clearDueDate,
    activeTab,
    moreOpen,
    copyLink,
    deleteTask,
    save,
    formatDate,
    formatBytes,
    activityIcon,
  }
}