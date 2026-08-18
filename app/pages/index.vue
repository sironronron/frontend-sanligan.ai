<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'onboarding'],
})

const auth = useAuthStore()
await navigateTo(auth.isVerifiedLawyer ? '/lawyer/dashboard' : '/chat', { replace: true })
</script>

<template>
  <div />
</template>
