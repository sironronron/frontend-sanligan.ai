<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import type { SlashCommandItem } from '~/lib/tiptap/slashCommand'

const props = defineProps<SuggestionProps<SlashCommandItem, SlashCommandItem>>()

const selectedIndex = ref(0)

const items = computed(() => props.items)

watch(
  () => props.query,
  () => {
    selectedIndex.value = 0
  },
)

function select(index: number) {
  const item = items.value[index]
  if (item) props.command(item)
}

function onKeyDown({ event }: SuggestionKeyDownProps): boolean {
  if (event.key === 'ArrowUp') {
    selectedIndex.value = (selectedIndex.value - 1 + items.value.length) % items.value.length
    return true
  }

  if (event.key === 'ArrowDown') {
    selectedIndex.value = (selectedIndex.value + 1) % items.value.length
    return true
  }

  if (event.key === 'Enter') {
    select(selectedIndex.value)
    return true
  }

  return false
}

function mouseEnter(index: number) {
  selectedIndex.value = index
}

defineExpose({ onKeyDown })
</script>

<template>
  <div class="surface max-h-72 w-64 overflow-y-auto rounded-xl border p-1 shadow-xl">
    <div
      v-for="(item, index) in items"
      :key="item.title"
      role="option"
      :aria-selected="index === selectedIndex"
      class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2"
      :class="index === selectedIndex ? 'bg-primary/10' : ''"
      @mouseenter="mouseEnter(index)"
      @mousedown.prevent="select(index)"
    >
      <div
        v-if="item.icon"
        class="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
      >
        <component :is="item.icon" class="size-4" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">{{ item.title }}</p>
        <p v-if="item.description" class="truncate text-xs text-muted-foreground">
          {{ item.description }}
        </p>
      </div>
    </div>

    <p v-if="items.length === 0" class="px-2.5 py-2 text-sm text-muted-foreground">
      No matching commands
    </p>
  </div>
</template>