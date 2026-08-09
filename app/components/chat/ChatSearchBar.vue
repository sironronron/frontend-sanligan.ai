<script setup lang="ts">
import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from '@lucide/vue'

const props = defineProps<{
  messages: Array<{ id: string; content: string }>
}>()

const emit = defineEmits<{
  navigate: [messageId: string]
  close: []
  query: [query: string]
}>()

const rootEl = ref<HTMLElement | null>(null)

const query = ref('')
const current = ref(0)

const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  const found: Array<{ id: string }> = []
  for (const message of props.messages) {
    if (message.content.toLowerCase().includes(q)) found.push({ id: message.id })
  }
  return found
})

const total = computed(() => matches.value.length)

watch(query, (value) => {
  current.value = 0
  emit('query', value)
  const first = matches.value[0]
  if (first) {
    emit('navigate', first.id)
  }
})

function move(delta: number) {
  if (total.value === 0) return
  current.value = (current.value + delta + total.value) % total.value
  const match = matches.value[current.value]
  if (match) {
    emit('navigate', match.id)
  }
}

function clear() {
  query.value = ''
  current.value = 0
  emit('close')
}

function focusInput() {
  const input = rootEl.value?.querySelector('input')
  input?.focus()
  input?.select()
}

defineExpose({ focusInput })
</script>

<template>
  <div ref="rootEl" class="flex w-full items-center gap-1.5">
    <div class="relative min-w-0 flex-1">
      <SearchIcon class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        v-model="query"
        class="h-8 w-full pl-8 pr-8 text-xs"
        placeholder="Search messages…"
        autofocus
        @keydown.esc="clear"
      />
      <button
        v-if="query"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        title="Clear"
        @click="clear"
      >
        <XIcon class="size-3.5" />
      </button>
    </div>
    <Button variant="ghost" size="icon" class="size-8 shrink-0" :disabled="total === 0" title="Previous match" @click="move(-1)">
      <ChevronUpIcon class="size-4" />
    </Button>
    <Button variant="ghost" size="icon" class="size-8 shrink-0" :disabled="total === 0" title="Next match" @click="move(1)">
      <ChevronDownIcon class="size-4" />
    </Button>
    <span class="w-12 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">
      {{ total === 0 ? '0 / 0' : `${current + 1} / ${total}` }}
    </span>
  </div>
</template>
