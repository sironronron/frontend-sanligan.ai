<script setup lang="ts">
import type { Suggestion } from '~/composables/useChatSuggestions'
import { suggestionIcon } from '~/components/chat/suggestionIcons'

defineProps<{
  suggestions: Suggestion[]
}>()

const emit = defineEmits<{
  select: [prompt: string]
}>()
</script>

<template>
  <div v-if="suggestions.length > 0" class="mx-auto w-full max-w-3xl px-1 pb-2">
    <div class="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span class="shrink-0 text-[11px] font-medium text-muted-foreground/70">Try:</span>
      <button
        v-for="suggestion in suggestions"
        :key="suggestion.prompt"
        type="button"
        class="flex shrink-0 items-center gap-1.5 rounded-full border bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
        :title="suggestion.prompt"
        @click="emit('select', suggestion.prompt)"
      >
        <component :is="suggestionIcon(suggestion.icon)" class="size-3 shrink-0 text-primary" />
        <span class="whitespace-nowrap">{{ suggestion.label }}</span>
      </button>
    </div>
  </div>
</template>