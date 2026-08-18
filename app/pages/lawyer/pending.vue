<script setup lang="ts">
import { ClockIcon, Loader2Icon, ScaleIcon } from '@lucide/vue'

definePageMeta({
  middleware: 'auth',
  layout: 'bare',
})

const auth = useAuthStore()

const loading = ref(true)

onMounted(async () => {
  // A profile approved while this screen is open should not sit here forever;
  // the route guards redirect at navigation time, so this is the same check
  // performed once the profile has actually landed.
  if (!auth.user?.lawyer_profile || auth.user.lawyer_profile.verification_status === 'rejected') {
    await navigateTo('/lawyer/register')
    return
  }
  if (auth.isVerifiedLawyer) {
    await navigateTo('/lawyer/dashboard')
    return
  }
  loading.value = false
})
</script>

<template>
  <div class="flex flex-1 flex-col bg-muted/30">
    <header class="flex items-center justify-between px-6 py-4 sm:px-10">
      <NuxtLink to="/" class="flex items-center gap-2.5 font-heading text-lg font-semibold tracking-tight">
        <span class="size-2.5 rounded-full bg-peach" />
        Batayan
      </NuxtLink>
      <NuxtLink to="/chat" class="text-sm text-muted-foreground hover:text-foreground">Back to workspace</NuxtLink>
    </header>

    <main class="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <template v-if="loading">
        <Loader2Icon class="size-6 animate-spin text-muted-foreground" />
      </template>

      <template v-else>
        <div class="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-forest text-cream">
          <ScaleIcon class="size-7" />
        </div>

        <h1 class="font-heading text-2xl font-semibold tracking-tight">Application under review</h1>

        <div class="mx-auto mt-3 flex max-w-sm items-start gap-3 rounded-xl border border-border bg-card p-4 text-left">
          <ClockIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p class="text-sm leading-relaxed text-muted-foreground">
            Our team is verifying your credentials. We usually finish within
            2 business days. You will be notified here and by email once a
            decision is made — no need to check back.
          </p>
        </div>

        <div class="mt-8 flex gap-3">
          <Button variant="outline" @click="navigateTo('/chat')">Continue to workspace</Button>
          <Button @click="navigateTo('/lawyer/register')">Edit my application</Button>
        </div>
      </template>
    </main>
  </div>
</template>
