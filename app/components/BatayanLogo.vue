<script setup lang="ts">
/**
 * The mark on its forest tile, optionally followed by the wordmark. The
 * wordmark is live Fraunces text here so it inherits theme colour; the
 * outlined SVG versions for use outside the app live in /public/logo.
 */
withDefaults(defineProps<{ withWordmark?: boolean; class?: string }>(), {
  withWordmark: false,
  class: '',
})
</script>

<template>
  <span :class="class" class="inline-flex items-center gap-2.5">
    <span class="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground" role="img" aria-label="Batayan">
      <BatayanMark class="size-5" slab-class="fill-peach dark:fill-current" />
    </span>

    <span
      v-if="withWordmark"
      class="font-heading text-lg font-semibold tracking-tight text-foreground"
    >
      Batayan
    </span>
  </span>
</template>
