<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'organization', 'subscription'],
})

await navigateTo('/chat', { replace: true })
</script>

<template>
  <div />
</template>
