<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'onboarding'],
})

const auth = useAuthStore()
await navigateTo(auth.isVerifiedLawyer ? '/lawyer/dashboard' : '/dashboard', { replace: true })
</script>

<template>
  <div />
</template>
