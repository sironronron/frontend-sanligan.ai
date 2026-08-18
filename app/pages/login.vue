<script setup lang="ts">
import { ArrowLeftIcon, CircleAlertIcon, MailIcon } from '@lucide/vue'
import { timeAgo } from '~/utils/time'

definePageMeta({
  middleware: 'guest',
  layout: 'default',
})

const auth = useAuthStore()
const api = useApi()

const email = ref('')
const password = ref('')
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})
const submitting = ref(false)
const showEmailForm = ref(false)
const lookingUp = ref(false)
// Set when the email has been submitted and we've moved to the password step.
const emailConfirmed = ref(false)
// When the account was last used, shown on the password step. Null hides the
// greeting for an account that exists but has never used the app.
const lastUsedAt = ref<string | null>(null)

// The form is novalidate so errors render in the page rather than in native
// bubbles, which means the empty cases are checked here instead of by the browser.
function validateEmailStep(): boolean {
  const errors: Record<string, string> = {}

  if (email.value.trim() === '') errors.email = 'Enter your email address.'

  fieldErrors.value = errors

  return Object.keys(errors).length === 0
}

function validatePasswordStep(): boolean {
  const errors: Record<string, string> = {}

  if (password.value === '') errors.password = 'Enter your password.'

  fieldErrors.value = errors

  return Object.keys(errors).length === 0
}

/**
 * Look up the email, then either refuse to continue (no account) or move on
 * to the password step. The greeting is a nicety, so a failed lookup never
 * blocks sign-in — the user just proceeds without it.
 */
async function continueWithEmail() {
  if (lookingUp.value || submitting.value) return

  error.value = ''
  fieldErrors.value = {}

  if (!validateEmailStep()) return

  lookingUp.value = true

  try {
    const { exists, last_used_at } = await api<{ exists: boolean; last_used_at: string | null }>(
      `/auth/last-used?email=${encodeURIComponent(email.value.trim())}`,
    )

    if (!exists) {
      error.value = `No account found for ${email.value.trim()}. Check the address or create an account instead.`
      return
    }

    lastUsedAt.value = last_used_at
  } catch {
    // The lookup is a nicety: if it fails, proceed to the password step and
    // let the actual sign-in be the source of truth.
    lastUsedAt.value = null
  } finally {
    lookingUp.value = false
  }

  emailConfirmed.value = true
}

function backToEmail() {
  emailConfirmed.value = false
  lastUsedAt.value = null
  error.value = ''
  fieldErrors.value = {}
}

function backToOptions() {
  showEmailForm.value = false
  emailConfirmed.value = false
  lastUsedAt.value = null
  error.value = ''
  fieldErrors.value = {}
}

async function handleSubmit() {
  if (submitting.value) return

  error.value = ''
  fieldErrors.value = {}

  if (!validatePasswordStep()) return

  submitting.value = true

  try {
    await auth.login(email.value.trim(), password.value)

    // Terms and the KYC questions are checked here rather than in a route
    // guard so the destination resolves in the same order for every entry
    // point — email/password, Google, or a lawyer registration parked during
    // sign-up.
    await navigateTo(resolveAuthDestination(String(useRoute().query.redirect ?? '') || null))
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

    <template v-else-if="!emailConfirmed">
      <Button type="button" variant="ghost" class="-ml-2 mb-4 gap-1.5" @click="backToOptions">
        <ArrowLeftIcon class="size-4" />
        All sign-in options
      </Button>

      <form class="space-y-5" novalidate @submit.prevent="continueWithEmail">
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

        <Button type="submit" class="h-10 w-full" :loading="lookingUp">
          {{ lookingUp ? 'Checking…' : 'Continue' }}
        </Button>
      </form>

      <div class="my-6 flex items-center gap-3">
        <span class="h-px flex-1 bg-border" />
        <span class="text-xs text-muted-foreground">or</span>
        <span class="h-px flex-1 bg-border" />
      </div>

      <GoogleAuthButton label="Sign in with Google" :last-used="timeAgo(lastUsedAt)" @error="error = $event" />
    </template>

    <template v-else>
      <Button type="button" variant="ghost" class="-ml-2 mb-4 gap-1.5" @click="backToOptions">
        <ArrowLeftIcon class="size-4" />
        All sign-in options
      </Button>

      <div
        v-if="error"
        role="alert"
        class="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
      >
        <CircleAlertIcon class="mt-px size-4 shrink-0" />
        <span>{{ error }}</span>
      </div>

      <form class="space-y-5" novalidate @submit.prevent="handleSubmit">

        <div class="space-y-2">
          <Label for="email">Email</Label>
          <div class="flex items-center gap-3">
            <Input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              class="h-10"
              readonly
            />
            <Button
              type="button"
              variant="ghost"
              class="h-10 shrink-0 px-3 text-xs"
              @click="backToEmail"
            >
              Change
            </Button>
          </div>
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
            autofocus
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

      <GoogleAuthButton label="Sign in with Google" :last-used="timeAgo(lastUsedAt)" @error="error = $event" />
    </template>

    <template #footer>
      New to Batayan?
      <NuxtLink to="/register" class="font-medium text-primary hover:underline">
        Create an account
      </NuxtLink>
    </template>
  </AuthShell>
</template>
