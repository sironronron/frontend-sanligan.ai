<script setup lang="ts">
/**
 * The assistant's mark, in the gutter beside its answer.
 *
 * It is the only thing that identifies an assistant turn — there is no bubble
 * and no "Batayan said" label — so it carries the working state too: the disc
 * breathes while the turn is running and holds still once it has finished.
 * That makes the state readable from the gutter, at the edge of vision, while
 * the reader's attention is on the text.
 */
defineProps<{
  working?: boolean
}>()
</script>

<template>
  <span class="relative flex size-7 shrink-0 items-center justify-center">
    <span
      v-if="working"
      class="batayan-pulse-ring absolute inset-0 rounded-[9px] bg-primary/30"
      aria-hidden="true"
    />
    <span
      class="relative flex size-7 items-center justify-center rounded-[9px] bg-primary text-primary-foreground shadow-sm"
      :class="working ? 'batayan-breathe' : ''"
    >
      <BatayanMark class="size-[18px]" slab-class="fill-peach dark:fill-current" />
    </span>
    <span class="sr-only">Batayan</span>
  </span>
</template>
