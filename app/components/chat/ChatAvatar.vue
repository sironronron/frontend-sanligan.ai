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
      <!-- The Batayan mark: a foundation stone, drawn rather than imported so
           it inherits currentColor and stays crisp at 28px. -->
      <svg viewBox="0 0 24 24" class="size-4" fill="none" aria-hidden="true">
        <path
          d="M4 17.5 12 21l8-3.5M4 12.5 12 16l8-3.5M12 3 4 7.5 12 11l8-3.5L12 3Z"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <span class="sr-only">Batayan</span>
  </span>
</template>
