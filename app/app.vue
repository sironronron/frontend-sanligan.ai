<script setup lang="ts">
import { Toaster } from '~/components/ui/sonner'
</script>

<template>
  <div>
    <NuxtLoadingIndicator />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <TermsAcceptModal />
    <Toaster />
  </div>
</template>
