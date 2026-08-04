<script setup lang="ts">
definePageMeta({
  middleware: 'guest',
  layout: 'default',
})

const auth = useAuthStore()
const route = useRoute()

const token = computed(() => String(route.query.token ?? ''))
const email = ref(String(route.query.email ?? ''))
const password = ref('')
const passwordConfirmation = ref('')
const done = ref(false)
const error = ref('')

async function handleSubmit() {
  error.value = ''

  try {
    await auth.resetPassword(token.value, email.value, password.value)
    done.value = true
  } catch (err: any) {
    error.value = err?.data?.message ?? 'The reset link is invalid or has expired.'
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
        <CardTitle class="text-xl">Choose a new password</CardTitle>
        <CardDescription>Your new password must be at least 8 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        <form v-if="!done" class="space-y-4" @submit.prevent="handleSubmit">
          <div class="space-y-2">
            <Label for="email">Email</Label>
            <Input id="email" v-model="email" type="email" autocomplete="email" required />
          </div>
          <div class="space-y-2">
            <Label for="password">New password</Label>
            <Input
              id="password"
              v-model="password"
              type="password"
              autocomplete="new-password"
              placeholder="At least 8 characters"
              required
            />
          </div>
          <div class="space-y-2">
            <Label for="password_confirmation">Confirm password</Label>
            <Input
              id="password_confirmation"
              v-model="passwordConfirmation"
              type="password"
              autocomplete="new-password"
              placeholder="Repeat your password"
              required
            />
          </div>

          <p v-if="error" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ error }}
          </p>

          <Button type="submit" class="w-full" :disabled="auth.busy">
            {{ auth.busy ? 'Resetting…' : 'Reset password' }}
          </Button>
        </form>

        <div v-else class="space-y-4">
          <p class="rounded-md bg-primary/10 px-3 py-2 text-sm">
            Password has been reset. You can now sign in.
          </p>
          <Button class="w-full" @click="navigateTo('/login')">
            Sign in
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
