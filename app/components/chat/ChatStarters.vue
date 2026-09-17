<script setup lang="ts">
import type { Suggestion } from '~/composables/useChatSuggestions'
import { suggestionIcon } from '~/components/chat/suggestionIcons'

defineProps<{
  starters: Suggestion[]
}>()

const emit = defineEmits<{
  select: [prompt: string]
}>()
</script>

<template>
  <div class="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
    <button
      v-for="starter in starters"
      :key="starter.label"
      type="button"
      class="surface-interactive flex flex-col items-start gap-2.5 p-4 text-left outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      @click="emit('select', starter.prompt)"
    >
      <span class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <component :is="suggestionIcon(starter.icon)" class="size-4.5" />
      </span>
      <span class="min-w-0">
        <span class="block text-sm font-semibold">{{ starter.label }}</span>
        <span class="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {{ starter.prompt }}
        </span>
      </span>
    </button>
  </div>
</template>
