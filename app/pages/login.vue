<script setup lang="ts">
import { ArrowLeftIcon, CircleAlertIcon, MailIcon } from '@lucide/vue'

definePageMeta({
  middleware: 'guest',
  layout: 'default',
})

const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})
const submitting = ref(false)
const showEmailForm = ref(false)

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
  if (submitting.value) return

  error.value = ''
  fieldErrors.value = {}

  if (!validate()) return

  submitting.value = true

  try {
    await auth.login(email.value, password.value)

    const redirect = String(useRoute().query.redirect ?? '')

    await navigateTo(redirect || (auth.kycCompleted ? auth.homePath() : '/onboarding'))
  } catch (err) {
    const parsed = parseApiError(err, 'Sign in failed. Please try again.')
    error.value = parsed.message
    fieldErrors.value = parsed.fields
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell
    title="Welcome back"
    subtitle="Sign in to pick up where you left off."
  >
    <template v-if="!showEmailForm">
      <div class="space-y-3">
        <GoogleAuthButton label="Sign in with Google" @error="error = $event" />
        <Button type="button" variant="outline" class="h-10 w-full gap-2.5" @click="showEmailForm = true">
          <MailIcon class="size-4" />
          Sign in with Email
        </Button>
      </div>
    </template>

    <template v-else>
      <Button type="button" variant="ghost" class="-ml-2 mb-4 gap-1.5" @click="showEmailForm = false">
        <ArrowLeftIcon class="size-4" />
        All sign-in options
      </Button>

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

        <Button type="submit" class="h-10 w-full" :loading="submitting">
          {{ submitting ? 'Signing in…' : 'Sign in' }}
        </Button>
      </form>

      <div class="my-6 flex items-center gap-3">
        <span class="h-px flex-1 bg-border" />
        <span class="text-xs text-muted-foreground">or</span>
        <span class="h-px flex-1 bg-border" />
      </div>

      <GoogleAuthButton label="Sign in with Google" @error="error = $event" />
    </template>

    <template #footer>
      New to Batayan?
      <NuxtLink to="/register" class="font-medium text-primary hover:underline">
        Create an account
      </NuxtLink>
    </template>
  </AuthShell>
</template>
