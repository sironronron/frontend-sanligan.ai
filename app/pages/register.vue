<script setup lang="ts">
import { CircleAlertIcon } from '@lucide/vue'

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
const fieldErrors = ref<Record<string, string>>({})

/** The API enforces a minimum of 8 characters; the rest is guidance, not a rule. */
const MIN_PASSWORD_LENGTH = 8

const strength = computed(() => {
  const value = password.value

  if (value.length === 0) return { score: 0, label: '' }
  if (value.length < MIN_PASSWORD_LENGTH) return { score: 0, label: 'Too short' }

  let score = 1
  if (value.length >= 12) score++
  if (/[A-Z]/.test(value) && /[a-z]/.test(value) && /[^A-Za-z]/.test(value)) score++

  return { score, label: ['', 'Weak', 'Fair', 'Strong'][score] ?? '' }
})

const strengthColor = computed(() =>
  strength.value.score >= 3 ? 'bg-primary' : strength.value.score === 2 ? 'bg-peach' : 'bg-destructive',
)

function validate(): boolean {
  const errors: Record<string, string> = {}

  if (name.value.trim() === '') errors.name = 'Enter your name.'
  if (email.value.trim() === '') errors.email = 'Enter your email address.'
  if (password.value.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  if (passwordConfirmation.value !== password.value) errors.password_confirmation = 'Passwords do not match.'

  fieldErrors.value = errors

  return Object.keys(errors).length === 0
}

async function handleSubmit() {
  error.value = ''

  if (!validate()) return

  try {
    await auth.register(name.value, email.value, password.value, passwordConfirmation.value)

    if (!auth.hasAcceptedTerms) {
      await navigateTo('/terms/accept')
    } else if (!auth.kycCompleted) {
      await navigateTo('/onboarding')
    } else {
      await navigateTo(auth.homePath())
    }
  } catch (err) {
    const parsed = parseApiError(err, 'Registration failed. Please try again.')
    error.value = parsed.message
    fieldErrors.value = parsed.fields
  }
}
</script>

<template>
  <AuthShell
    title="Create your account"
    subtitle="Start researching Philippine law with Batayan."
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
        <Label for="name">Full name</Label>
        <Input
          id="name"
          v-model="name"
          autocomplete="name"
          placeholder="Maria Santos"
          autofocus
          required
          class="h-10"
          :aria-invalid="fieldErrors.name ? true : undefined"
          :aria-describedby="fieldErrors.name ? 'name-error' : undefined"
        />
        <p v-if="fieldErrors.name" id="name-error" class="text-xs text-destructive">
          {{ fieldErrors.name }}
        </p>
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
          class="h-10"
          :aria-invalid="fieldErrors.email ? true : undefined"
          :aria-describedby="fieldErrors.email ? 'email-error' : undefined"
        />
        <p v-if="fieldErrors.email" id="email-error" class="text-xs text-destructive">
          {{ fieldErrors.email }}
        </p>
      </div>

      <div class="space-y-2">
        <Label for="password">Password</Label>
        <PasswordField
          id="password"
          v-model="password"
          autocomplete="new-password"
          placeholder="At least 8 characters"
          :error="fieldErrors.password ?? ''"
        />

        <div v-if="password" class="flex items-center gap-2 pt-0.5">
          <div class="flex flex-1 gap-1" aria-hidden="true">
            <span
              v-for="segment in 3"
              :key="segment"
              class="h-1 flex-1 rounded-full transition-colors"
              :class="segment <= strength.score ? strengthColor : 'bg-muted'"
            />
          </div>
          <span class="w-16 shrink-0 text-right text-[11px] text-muted-foreground">{{ strength.label }}</span>
        </div>

        <p v-if="fieldErrors.password" id="password-error" class="text-xs text-destructive">
          {{ fieldErrors.password }}
        </p>
        <p v-else class="text-xs text-muted-foreground">
          At least 8 characters. Longer passphrases with mixed characters are stronger.
        </p>
      </div>

      <div class="space-y-2">
        <Label for="password_confirmation">Confirm password</Label>
        <PasswordField
          id="password_confirmation"
          v-model="passwordConfirmation"
          autocomplete="new-password"
          placeholder="Repeat your password"
          :error="fieldErrors.password_confirmation ?? ''"
        />
        <p v-if="fieldErrors.password_confirmation" id="password_confirmation-error" class="text-xs text-destructive">
          {{ fieldErrors.password_confirmation }}
        </p>
      </div>

      <Button type="submit" class="h-10 w-full" :loading="auth.busy">
        {{ auth.busy ? 'Creating account…' : 'Create account' }}
      </Button>

      <p class="text-center text-xs leading-relaxed text-muted-foreground">
        By creating an account you agree to our
        <NuxtLink to="/legal/terms" target="_blank" class="text-primary hover:underline">
          Terms of Service and Privacy Policy
        </NuxtLink>.
      </p>
    </form>

    <template #footer>
      Already have an account?
      <NuxtLink to="/login" class="font-medium text-primary hover:underline">
        Sign in
      </NuxtLink>
    </template>
  </AuthShell>
</template>
