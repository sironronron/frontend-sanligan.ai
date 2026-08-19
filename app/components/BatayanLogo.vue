<script setup lang="ts">
withDefaults(defineProps<{ withWordmark?: boolean; class?: string }>(), {
  withWordmark: false,
  class: '',
})
</script>

<template>
  <span :class="class" class="inline-flex items-center gap-2.5">
    <svg viewBox="0 0 40 40" class="size-8 shrink-0" role="img" aria-label="Batayan" fill="none">
      <rect x="0" y="0" width="40" height="40" rx="10" fill="#1D4533" />
      <g transform="translate(4,4)" fill="#FBF3EC" fill-rule="evenodd">
        <path d="M6 6 L26 6 L16 26 Z M12 15 L20 15 L20 18 L12 18 Z" />
      </g>
      <circle cx="20" cy="30" r="2.4" fill="#F9D2BA" />
    </svg>

    <span
      v-if="withWordmark"
      class="font-heading text-lg font-semibold tracking-tight text-foreground"
    >
      Batayan<span class="font-normal text-primary">.co</span>
    </span>
  </span>
</template>
