<script setup lang="ts">
withDefaults(defineProps<{ class?: string }>(), { class: '' })
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    :class="class"
    aria-hidden="true"
  >
    <path d="M12 4v16" />
    <path d="M12 6c-2.2 0-4 .5-4 1.5 0 .6 1 1.1 2.4 1.3L12 9l1.6-.2c1.4-.2 2.4-.7 2.4-1.3C16 6.5 14.2 6 12 6Z" />
    <path d="M5 10l1.8 3.2a2.5 2.5 0 0 0 4.4 0L13 10" />
    <path d="M11 10l1.8 3.2a2.5 2.5 0 0 0 4.4 0L19 10" />
    <path d="M12 18v2" />
  </svg>
</template>
