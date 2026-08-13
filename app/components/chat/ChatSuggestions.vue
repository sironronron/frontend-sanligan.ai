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
  <div v-if="suggestions.length > 0" class="flex items-start gap-3">
    <div class="flex max-w-[85%] flex-wrap gap-2">
      <p class="w-full text-[11px] font-medium text-muted-foreground/70">Suggested next steps</p>
      <Button
        v-for="suggestion in suggestions"
        :key="suggestion.label"
        variant="outline"
        size="sm"
        class="h-auto max-w-full gap-1.5 px-3 py-1.5 text-xs leading-snug"
        :title="suggestion.prompt"
        @click="emit('select', suggestion.prompt)"
      >
        <component :is="suggestionIcon(suggestion.icon)" class="size-3 shrink-0 text-primary" />
        <span class="min-w-0 truncate">{{ suggestion.label }}</span>
      </Button>
    </div>
  </div>
</template>
