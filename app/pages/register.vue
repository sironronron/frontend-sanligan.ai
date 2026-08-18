<script setup lang="ts">
import { ArrowLeftIcon, BookOpenIcon, CheckIcon, CircleAlertIcon, MailIcon, MailCheckIcon, ScaleIcon } from '@lucide/vue'

definePageMeta({
  middleware: 'guest',
  layout: 'default',
})

const auth = useAuthStore()

const name = ref('')
const email = ref('')
const password = ref('')
const passwordConfirmation = ref('')
// Set when Supabase requires the address to be confirmed before first sign-in.
const confirmSent = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})
const submitting = ref(false)
const showEmailForm = ref(false)
// Decides where a fresh account lands after email confirmation. A lawyer is
// sent on to their application; a researcher into the KYC questions.
const intent = ref<'researcher' | 'lawyer'>('researcher')

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
  if (submitting.value) return

  error.value = ''

  if (!validate()) return

  submitting.value = true

  try {
    const { confirmationRequired } = await auth.register(name.value, email.value, password.value)

    // Parked now so it survives the email-confirmation -> sign-in hop: the
    // confirmation link requires a fresh sign-in, and the destination has to
    // be carried across it without riding on the link itself.
    if (intent.value === 'lawyer') {
      rememberPostAuthRedirect('/lawyer/register')
    }

    if (confirmationRequired) {
      confirmSent.value = true

      return
    }

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
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell
    title="Create your account"
    subtitle="Start researching Philippine law with Batayan."
  >
    <div v-if="confirmSent" class="space-y-5">
      <div class="flex items-start gap-2.5 rounded-lg border border-forest/25 bg-forest/10 px-3.5 py-3 text-sm">
        <MailCheckIcon class="mt-px size-4 shrink-0" />
        <span v-if="intent === 'lawyer'">
          Confirm your email to finish creating your account. Once you sign in, we'll continue
          straight to your lawyer application.
        </span>
        <span v-else>
          Confirm your email to finish setting up your account. We sent a link to
          <span class="font-medium">{{ email }}</span>.
        </span>
      </div>

      <p class="text-sm text-muted-foreground">
        The link expires after a short while. If it does not arrive, check your spam folder or
        start again with the same address.
      </p>

      <Button variant="outline" class="h-10 w-full" @click="navigateTo('/login')">
        Back to sign in
      </Button>
    </div>

    <template v-else>
      <div class="space-y-6">
        <div class="space-y-2">
          <Label>I'm joining as</Label>
          <div class="grid grid-cols-2 gap-3" role="group" aria-label="Account type">
            <button
              type="button"
              class="relative flex flex-col gap-2 rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="intent === 'researcher' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/40'"
              :aria-pressed="intent === 'researcher'"
              @click="intent = 'researcher'"
            >
              <span
                class="flex size-8 items-center justify-center rounded-lg"
                :class="intent === 'researcher' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
              >
                <BookOpenIcon class="size-4" />
              </span>
              <span class="text-sm font-semibold">Researcher</span>
              <span class="text-xs leading-relaxed text-muted-foreground">
                Research Philippine laws, cases & commentary.
              </span>
              <CheckIcon
                v-if="intent === 'researcher'"
                class="absolute right-3 top-3 size-4 text-primary"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              class="relative flex flex-col gap-2 rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="intent === 'lawyer' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/40'"
              :aria-pressed="intent === 'lawyer'"
              @click="intent = 'lawyer'"
            >
              <span
                class="flex size-8 items-center justify-center rounded-lg"
                :class="intent === 'lawyer' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
              >
                <ScaleIcon class="size-4" />
              </span>
              <span class="text-sm font-semibold">Lawyer</span>
              <span class="text-xs leading-relaxed text-muted-foreground">
                Offer document vetting & notarization.
              </span>
              <CheckIcon
                v-if="intent === 'lawyer'"
                class="absolute right-3 top-3 size-4 text-primary"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

      <div v-if="!showEmailForm" class="space-y-3">
        <GoogleAuthButton
          label="Create account with Google"
          :redirect="intent === 'lawyer' ? '/lawyer/register' : undefined"
          @error="error = $event"
        />
        <Button type="button" variant="outline" class="h-10 w-full gap-2.5" @click="showEmailForm = true">
          <MailIcon class="size-4" />
          Create account with Email
        </Button>
      </div>

      <template v-else>
        <Button type="button" variant="ghost" class="-ml-2 mb-4 gap-1.5" @click="showEmailForm = false">
          <ArrowLeftIcon class="size-4" />
          All sign-up options
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

          <Button type="submit" class="h-10 w-full" :loading="submitting">
            {{ submitting ? 'Creating account…' : 'Create account' }}
          </Button>

          <div class="flex items-center gap-3 pt-1">
            <span class="h-px flex-1 bg-border" />
            <span class="text-xs text-muted-foreground">or</span>
            <span class="h-px flex-1 bg-border" />
          </div>

          <GoogleAuthButton
            label="Create account with Google"
            :redirect="intent === 'lawyer' ? '/lawyer/register' : undefined"
            @error="error = $event"
          />

          <p class="text-center text-xs leading-relaxed text-muted-foreground">
            By creating an account you agree to our
            <NuxtLink to="/legal/terms" target="_blank" class="text-primary hover:underline">
              Terms of Service and Privacy Policy
            </NuxtLink>.
          </p>
        </form>
      </template>
      </div>
    </template>

    <template #footer>
      Already have an account?
      <NuxtLink to="/login" class="font-medium text-primary hover:underline">
        Sign in
      </NuxtLink>
    </template>
  </AuthShell>
</template>
