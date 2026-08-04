<script setup lang="ts">
definePageMeta({
  middleware: 'guest',
  layout: 'default',
})

const auth = useAuthStore()

const email = ref('')
const sent = ref(false)
const error = ref('')

async function handleSubmit() {
  error.value = ''
  sent.value = false

  try {
    await auth.sendPasswordResetLink(email.value)
    sent.value = true
  } catch (err: any) {
    error.value = err?.data?.message ?? 'Something went wrong. Please try again.'
  }
}
</script>

<template>
  <div class="flex flex-1 items-center justify-center px-4 py-12">
    <Card class="w-full max-w-sm">
      <CardHeader class="text-center">
        <div class="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <span class="size-2.5 rounded-full bg-primary" />
        </div>
        <CardTitle class="text-xl">Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we'll send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form v-if="!sent" class="space-y-4" @submit.prevent="handleSubmit">
          <div class="space-y-2">
            <Label for="email">Email</Label>
            <Input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              required
            />
          </div>

          <p v-if="error" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ error }}
          </p>

          <Button type="submit" class="w-full" :disabled="auth.busy">
            {{ auth.busy ? 'Sending…' : 'Send reset link' }}
          </Button>
        </form>

        <div v-else class="space-y-4">
          <p class="rounded-md bg-primary/10 px-3 py-2 text-sm">
            Password reset link sent. Check your inbox.
          </p>
          <Button variant="outline" class="w-full" @click="navigateTo('/login')">
            Back to sign in
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
