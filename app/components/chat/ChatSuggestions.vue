<script setup lang="ts">
import { SparklesIcon } from '@lucide/vue'
import type { Suggestion } from '~/composables/useChatSuggestions'

defineProps<{
  suggestions: Suggestion[]
}>()

const emit = defineEmits<{
  select: [prompt: string]
}>()
</script>

<template>
  <div v-if="suggestions.length > 0" class="flex items-start gap-3">
    <div class="flex max-w-[85%] flex-wrap gap-2">
      <p class="w-full text-[11px] font-medium text-muted-foreground/70">Suggested next steps</p>
      <Button
        v-for="suggestion in suggestions"
        :key="suggestion.label"
        variant="outline"
        size="sm"
        class="h-auto gap-1.5 px-3 py-1.5 text-xs leading-snug"
        @click="emit('select', suggestion.prompt)"
      >
        <SparklesIcon class="size-3 shrink-0 text-primary" />
        <span>{{ suggestion.label }}</span>
      </Button>
    </div>
  </div>
</template>
