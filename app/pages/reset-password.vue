<script setup lang="ts">
import { CircleAlertIcon, CircleCheckIcon } from '@lucide/vue'

definePageMeta({
  layout: 'default',
})

const auth = useAuthStore()
const password = ref('')
const passwordConfirmation = ref('')
const done = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})
const submitting = ref(false)

const MIN_PASSWORD_LENGTH = 8

function validate(): boolean {
  const errors: Record<string, string> = {}

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
    await auth.resetPassword(password.value)
    done.value = true
  } catch (err) {
    const parsed = parseApiError(err, 'The reset link is invalid or has expired.')
    error.value = parsed.message
    fieldErrors.value = parsed.fields
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell
    title="Choose a new password"
    subtitle="Pick something you haven't used before — at least 8 characters."
  >
    <div v-if="done" class="space-y-6">
      <div class="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3.5">
        <CircleCheckIcon class="mt-px size-4 shrink-0 text-primary" />
        <div class="min-w-0 text-sm">
          <p class="font-medium">Password updated</p>
          <p class="mt-1 leading-relaxed text-muted-foreground">
            You can now sign in with your new password.
          </p>
        </div>
      </div>

      <Button class="h-10 w-full" @click="navigateTo('/login')">
        Sign in
      </Button>
    </div>

    <form v-else class="space-y-5" novalidate @submit.prevent="handleSubmit">
      <div
        v-if="error"
        role="alert"
        class="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
      >
        <CircleAlertIcon class="mt-px size-4 shrink-0" />
        <span>{{ error }}</span>
      </div>

      <div class="space-y-2">
        <Label for="password">New password</Label>
        <PasswordField
          id="password"
          v-model="password"
          autocomplete="new-password"
          placeholder="At least 8 characters"
          :error="fieldErrors.password ?? ''"
        />
        <p v-if="fieldErrors.password" id="password-error" class="text-xs text-destructive">
          {{ fieldErrors.password }}
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
        {{ submitting ? 'Resetting…' : 'Reset password' }}
      </Button>
    </form>

    <template #footer>
      Back to
      <NuxtLink to="/login" class="font-medium text-primary hover:underline">
        sign in
      </NuxtLink>
    </template>
  </AuthShell>
</template>
