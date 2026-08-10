<script setup lang="ts">
import { Building2Icon, Loader2Icon } from '@lucide/vue'

definePageMeta({
  middleware: 'auth',
  layout: 'minimal',
})

const auth = useAuthStore()

if (auth.hasOrganization) {
  await navigateTo(auth.homePath())
}

const name = ref('')
const error = ref('')

async function handleSubmit() {
  error.value = ''

  try {
    await auth.createOrganization(name.value)
    const billing = useBillingStore()
    const sub = await billing.fetchSubscription()
    const next = auth.user?.is_admin || sub?.status === 'active' ? '/chat' : '/pricing'
    await navigateTo(auth.kycCompleted ? next : `/onboarding?next=${encodeURIComponent(next)}`)
  } catch (err: any) {
    error.value = err?.data?.message ?? 'Could not create your organization. Please try again.'
  }
}

async function handleLogout() {
  await auth.logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex flex-1 items-center justify-center px-4 py-12">
    <Card class="w-full max-w-sm">
      <CardHeader class="text-center">
        <div class="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <Building2Icon class="size-5 text-primary" />
        </div>
        <CardTitle class="text-xl">Set up your organization</CardTitle>
        <CardDescription>
          Create your organization to start using Batayan. You'll be its owner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <div class="space-y-2">
            <Label for="organization_name">Organization name</Label>
            <Input
              id="organization_name"
              v-model="name"
              autocomplete="organization"
              placeholder="Santos & Associates Law Office"
              required
            />
          </div>

          <p v-if="error" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ error }}
          </p>

          <Button type="submit" class="w-full" :disabled="auth.busy">
            <Loader2Icon v-if="auth.busy" class="size-4 animate-spin" />
            {{ auth.busy ? 'Creating organization…' : 'Create organization' }}
          </Button>
        </form>
      </CardContent>
      <CardFooter class="justify-center text-sm text-muted-foreground">
        Signed in as {{ auth.user?.email }}.
        <button type="button" class="ml-1 text-primary hover:underline" @click="handleLogout">
          Log out
        </button>
      </CardFooter>
    </Card>
  </div>
</template>
