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
  <Button
    v-for="starter in starters"
    :key="starter.label"
    variant="outline"
    class="max-w-full gap-2 text-left"
    :title="starter.prompt"
    @click="emit('select', starter.prompt)"
  >
    <component :is="suggestionIcon(starter.icon)" class="size-4 shrink-0 text-primary" />
    <span class="min-w-0 truncate text-xs">{{ starter.label }}</span>
  </Button>
</template>
