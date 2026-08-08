<script setup lang="ts">
defineProps<{
  text: string
  clamp?: number
}>()
</script>

<template>
  <div class="mt-2.5 overflow-hidden rounded-md border border-primary/20 bg-peach/30 px-2.5 py-2 dark:border-peach/25 dark:bg-peach/10">
    <p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Cited text</p>
    <p
      class="whitespace-pre-wrap break-words text-xs leading-relaxed text-espresso dark:text-peach"
      :style="clamp ? { display: '-webkit-box', WebkitLineClamp: clamp, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined"
    >
      {{ text }}
    </p>
  </div>
</template>
