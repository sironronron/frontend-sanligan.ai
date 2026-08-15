<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'onboarding', 'subscription'],
})

await navigateTo('/chat', { replace: true })
</script>

<template>
  <div />
</template>
