<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'subscription'],
})

await navigateTo('/chat', { replace: true })
</script>

<template>
  <div />
</template>
