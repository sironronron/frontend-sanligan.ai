<script setup lang="ts">
withDefaults(defineProps<{ class?: string }>(), { class: '' })
</script>

<template>
  <svg
    viewBox="0 0 32 32"
    :class="class"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      fill-rule="evenodd"
      d="M6 6 L26 6 L16 26 Z M12 15 L20 15 L20 18 L12 18 Z"
    />
    <circle cx="16" cy="26" r="2.4" fill="#F9D2BA" />
  </svg>
</template>
