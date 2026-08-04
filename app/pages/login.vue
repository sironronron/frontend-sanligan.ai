<script setup lang="ts">
definePageMeta({
  middleware: 'guest',
  layout: 'default',
})

import { toast } from 'vue-sonner'

const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')

async function handleSubmit() {
  error.value = ''

  try {
    await auth.login(email.value, password.value)
    await navigateTo('/chat')
  } catch (err: any) {
    error.value = err?.data?.message ?? 'Sign in failed. Please try again.'
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
        <CardTitle class="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your Saligan.AI account</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="handleSubmit">
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
            <div class="flex items-center justify-between">
              <Label for="password">Password</Label>
              <NuxtLink to="/forgot-password" class="text-xs text-primary hover:underline">
                Forgot password?
              </NuxtLink>
            </div>
            <Input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>

          <p v-if="error" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ error }}
          </p>

          <Button type="submit" class="w-full" :disabled="auth.busy">
            {{ auth.busy ? 'Signing in…' : 'Sign in' }}
          </Button>
        </form>
      </CardContent>
      <CardFooter class="justify-center text-sm text-muted-foreground">
        Don't have an account?
        <NuxtLink to="/register" class="ml-1 text-primary hover:underline">Register</NuxtLink>
      </CardFooter>
    </Card>
  </div>
</template>
