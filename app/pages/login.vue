<script setup lang="ts">
import { CircleAlertIcon, Loader2Icon } from '@lucide/vue'

definePageMeta({
  middleware: 'guest',
  layout: 'default',
})

const auth = useAuthStore()

const email = ref('')
const password = ref('')
const remember = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})

// The form is novalidate so errors render in the page rather than in native
// bubbles, which means the empty cases are checked here instead of by the browser.
function validate(): boolean {
  const errors: Record<string, string> = {}

  if (email.value.trim() === '') errors.email = 'Enter your email address.'
  if (password.value === '') errors.password = 'Enter your password.'

  fieldErrors.value = errors

  return Object.keys(errors).length === 0
}

async function handleSubmit() {
  error.value = ''
  fieldErrors.value = {}

  if (!validate()) return

  try {
    await auth.login(email.value, password.value, remember.value)
    await navigateTo(auth.kycCompleted ? auth.homePath() : '/onboarding')
  } catch (err) {
    const parsed = parseApiError(err, 'Sign in failed. Please try again.')
    error.value = parsed.message
    fieldErrors.value = parsed.fields
  }
}
</script>

<template>
  <AuthShell
    title="Welcome back"
    subtitle="Sign in to pick up where you left off."
  >
    <form class="space-y-5" novalidate @submit.prevent="handleSubmit">
      <div
        v-if="error"
        role="alert"
        class="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
      >
        <CircleAlertIcon class="mt-px size-4 shrink-0" />
        <span>{{ error }}</span>
      </div>

      <div class="space-y-2">
        <Label for="email">Email</Label>
        <Input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
          autofocus
          required
          class="h-10"
          :aria-invalid="fieldErrors.email ? true : undefined"
          :aria-describedby="fieldErrors.email ? 'email-error' : undefined"
        />
        <p v-if="fieldErrors.email" id="email-error" class="text-xs text-destructive">
          {{ fieldErrors.email }}
        </p>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-3">
          <Label for="password">Password</Label>
          <NuxtLink to="/forgot-password" class="text-xs text-primary hover:underline">
            Forgot password?
          </NuxtLink>
        </div>
        <PasswordField
          id="password"
          v-model="password"
          autocomplete="current-password"
          :error="fieldErrors.password ?? ''"
        />
        <p v-if="fieldErrors.password" id="password-error" class="text-xs text-destructive">
          {{ fieldErrors.password }}
        </p>
      </div>

      <label class="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
        <input
          v-model="remember"
          type="checkbox"
          class="size-4 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        Keep me signed in
      </label>

      <Button type="submit" class="h-10 w-full gap-2" :disabled="auth.busy">
        <Loader2Icon v-if="auth.busy" class="size-4 animate-spin" />
        {{ auth.busy ? 'Signing in…' : 'Sign in' }}
      </Button>
    </form>

    <template #footer>
      New to Batayan?
      <NuxtLink to="/register" class="font-medium text-primary hover:underline">
        Create an account
      </NuxtLink>
    </template>
  </AuthShell>
</template>
