<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

await navigateTo('/chat', { replace: true })
</script>

<template>
  <div />
</template>
