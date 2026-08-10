<script setup lang="ts">
definePageMeta({
  middleware: 'guest',
  layout: 'default',
})

const auth = useAuthStore()

const name = ref('')
const email = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const error = ref('')

async function handleSubmit() {
  error.value = ''

  try {
    await auth.register(name.value, email.value, password.value)
    await navigateTo(auth.kycCompleted ? auth.homePath() : '/onboarding')
  } catch (err: any) {
    error.value = err?.data?.message ?? 'Registration failed. Please try again.'
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
        <CardTitle class="text-xl">Create an account</CardTitle>
        <CardDescription>Start researching Philippine law with Batayan</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <div class="space-y-2">
            <Label for="name">Name</Label>
            <Input id="name" v-model="name" autocomplete="name" placeholder="Maria Santos" required />
          </div>
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
          <div class="space-y-2">
            <Label for="password">Password</Label>
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
            {{ auth.busy ? 'Creating account…' : 'Create account' }}
          </Button>
        </form>
      </CardContent>
      <CardFooter class="justify-center text-sm text-muted-foreground">
        Already have an account?
        <NuxtLink to="/login" class="ml-1 text-primary hover:underline">Sign in</NuxtLink>
      </CardFooter>
    </Card>
  </div>
</template>
