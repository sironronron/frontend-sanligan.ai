<script setup lang="ts">
import { CheckIcon, Loader2Icon, PlusIcon, SearchIcon, TagIcon, XIcon } from '@lucide/vue'
import { onClickOutside } from '@vueuse/core'
import { toast } from '~/components/ui/sonner'
import { cn } from '@/lib/utils'
import { useLabelStore, type Label, type LabelKind } from '~/stores/labels'

const props = withDefaults(defineProps<{
  /** Which vocabulary to offer: document categories or thread tags. */
  kind: LabelKind
  /** The ids currently applied. */
  modelValue: string[]
  /** How many may be applied at once, matching the API's ceiling. */
  max?: number
  triggerLabel?: string
  /**
   * Overrides on the trigger's own chrome, so a caller that files the picker
   * among other icon buttons can drop the dashed pill and match them. Merged
   * over the defaults, so anything left unsaid stays as it is here.
   */
  triggerClass?: string
  /** Spoken name for the trigger, needed when `triggerLabel` is icon-only. */
  ariaLabel?: string
  /** Render the applied labels as removable chips beside the trigger. */
  showChips?: boolean
  disabled?: boolean
}>(), {
  max: 5,
  showChips: true,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [ids: string[]]
}>()

const store = useLabelStore()

const open = ref(false)
const query = ref('')
const creating = ref(false)
const panel = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)

// The popover is teleported to body so the clipped sidebar (overflow hidden
// around its scroll containers) cannot cut it off. It therefore needs page
// coordinates, computed from the trigger and held for the panel's fixed style.
const popoverStyle = ref<{ top: number; left: number }>({ top: 0, left: 0 })
let positionCleanup: (() => void) | null = null

onClickOutside(panel, closePanel, { ignore: [dropdownRef] })

function positionPopover() {
  const el = triggerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const gap = 6
  const height = 320
  const width = 288
  let top = rect.bottom + gap
  if (top + height > window.innerHeight) {
    top = Math.max(gap, rect.top - height - gap)
  }
  const left = Math.min(Math.max(gap, rect.left), window.innerWidth - width - gap)
  popoverStyle.value = { top, left }
}

function closePanel() {
  open.value = false
  positionCleanup?.()
  positionCleanup = null
}

/** Reposition as the page scrolls or the window resizes while the panel is open. */
function trackPosition() {
  const reposition = () => positionPopover()
  window.addEventListener('scroll', reposition, { passive: true })
  window.addEventListener('resize', reposition)
  positionCleanup = () => {
    window.removeEventListener('scroll', reposition)
    window.removeEventListener('resize', reposition)
  }
}

async function openPanel() {
  if (props.disabled) return
  open.value = !open.value
  if (!open.value) {
    closePanel()
    return
  }
  positionPopover()
  trackPosition()
  await store.fetchLabels()
  await nextTick()
  searchInput.value?.focus()
}

const selected = computed(() => props.modelValue
  .map((id) => store.byId.get(id))
  .filter((label): label is Label => label !== undefined))

const atCapacity = computed(() => props.modelValue.length >= props.max)

const groups = computed(() => {
  const needle = query.value.trim().toLowerCase()

  return store.grouped(props.kind)
    .map((group) => ({
      ...group,
      labels: needle
        ? group.labels.filter((label) => label.name.toLowerCase().includes(needle)
          || label.description?.toLowerCase().includes(needle))
        : group.labels,
    }))
    .filter((group) => group.labels.length > 0)
})

/** Whether the typed name is new enough to be worth offering to create. */
const canCreate = computed(() => {
  const needle = query.value.trim()
  if (needle.length === 0) return false

  return !store.labels.some((label) => label.kind === props.kind
    && label.name.toLowerCase() === needle.toLowerCase())
})

function isSelected(id: string) {
  return props.modelValue.includes(id)
}

function toggle(label: Label) {
  if (isSelected(label.id)) {
    emit('update:modelValue', props.modelValue.filter((id) => id !== label.id))
    return
  }

  if (atCapacity.value) {
    toast.error(`You can apply at most ${props.max} at a time.`)
    return
  }

  emit('update:modelValue', [...props.modelValue, label.id])
}

function remove(id: string) {
  emit('update:modelValue', props.modelValue.filter((existing) => existing !== id))
}

async function createFromQuery() {
  const name = query.value.trim()
  if (!name || creating.value) return

  creating.value = true
  try {
    const label = await store.createLabel({ kind: props.kind, name })
    query.value = ''
    if (!atCapacity.value) emit('update:modelValue', [...props.modelValue, label.id])
    toast.success(`Created "${label.name}"`)
  } catch (error) {
    const message = (error as { data?: { errors?: Record<string, string[]> } })?.data?.errors?.name?.[0]
    toast.error(message ?? 'That label could not be created.')
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  void store.fetchLabels()
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <span
      v-for="label in (props.showChips ? selected : [])"
      :key="label.id"
      class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
      :title="label.description ?? undefined"
    >
      {{ label.name }}
      <button
        v-if="!props.disabled"
        type="button"
        :aria-label="`Remove ${label.name}`"
        class="rounded text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        @click="remove(label.id)"
      >
        <XIcon class="size-3" />
      </button>
    </span>

    <div ref="panel" class="relative">
      <button
        ref="triggerRef"
        type="button"
        :disabled="props.disabled"
        :aria-label="props.ariaLabel"
        :class="cn(
          'inline-flex items-center gap-1 rounded-md border border-dashed bg-muted/45 px-2 py-0.5 text-xs text-muted-foreground hover:border-solid hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
          props.triggerClass,
        )"
        @click="openPanel"
      >
        <TagIcon class="size-3" />
        {{ props.triggerLabel ?? 'Add' }}
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="open"
        ref="dropdownRef"
        class="fixed z-50 w-72 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        :style="{ top: `${popoverStyle.top}px`, left: `${popoverStyle.left}px` }"
      >
        <div class="flex items-center gap-2 border-b px-2 py-1.5">
          <SearchIcon class="size-3.5 shrink-0 text-muted-foreground" />
          <input
            ref="searchInput"
            v-model="query"
            class="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search or create…"
            @keydown.enter.prevent="canCreate && createFromQuery()"
            @keydown.esc="closePanel()"
          />
        </div>

        <div class="max-h-64 overflow-y-auto py-1">
          <div v-if="store.loading && store.labels.length === 0" class="px-2 py-3 text-center text-xs text-muted-foreground">
            <Loader2Icon class="mx-auto size-4 animate-spin" />
          </div>

          <div v-for="group in groups" :key="group.name" class="mb-1">
            <p class="px-2 py-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
              {{ group.name }}
            </p>
            <button
              v-for="label in group.labels"
              :key="label.id"
              type="button"
              class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/10 dark:hover:text-popover-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none dark:focus-visible:bg-accent/10 dark:focus-visible:text-popover-foreground"
              :class="{ 'opacity-50': atCapacity && !isSelected(label.id) }"
              @click="toggle(label)"
            >
              <CheckIcon class="mt-0.5 size-3.5 shrink-0" :class="isSelected(label.id) ? 'opacity-100' : 'opacity-0'" />
              <span class="min-w-0 flex-1">
                <span class="block truncate">{{ label.name }}</span>
                <span v-if="label.description" class="block truncate text-xs text-muted-foreground">
                  {{ label.description }}
                </span>
              </span>
              <span v-if="label.scope !== 'system'" class="mt-0.5 shrink-0 text-[0.6rem] uppercase text-muted-foreground">
                {{ label.scope === 'organization' ? 'Firm' : 'Mine' }}
              </span>
            </button>
          </div>

          <p v-if="groups.length === 0 && !store.loading" class="px-2 py-3 text-center text-xs text-muted-foreground">
            No matches.
          </p>
        </div>

        <button
          v-if="canCreate"
          type="button"
          :disabled="creating"
          class="flex w-full items-center gap-2 border-t px-2 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/10 dark:hover:text-popover-foreground disabled:opacity-50"
          @click="createFromQuery"
        >
          <Loader2Icon v-if="creating" class="size-3.5 animate-spin" />
          <PlusIcon v-else class="size-3.5" />
          Create "{{ query.trim() }}"
        </button>

        <p v-if="atCapacity" class="border-t px-2 py-1.5 text-[0.7rem] text-muted-foreground">
          {{ props.max }} applied — remove one to add another.
        </p>
      </div>
    </Teleport>
  </div>
</template>