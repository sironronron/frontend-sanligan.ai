<script setup lang="ts">
import { CircleAlertIcon, MailCheckIcon } from '@lucide/vue'

definePageMeta({
  middleware: 'guest',
  layout: 'default',
})

const auth = useAuthStore()

const email = ref('')
const sent = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})
const submitting = ref(false)

async function handleSubmit() {
  if (submitting.value) return

  error.value = ''
  fieldErrors.value = {}
  sent.value = false

  if (email.value.trim() === '') {
    fieldErrors.value = { email: 'Enter your email address.' }
    return
  }

  submitting.value = true

  try {
    await auth.sendPasswordResetLink(email.value)
    sent.value = true
  } catch (err) {
    const parsed = parseApiError(err, 'Something went wrong. Please try again.')
    error.value = parsed.message
    fieldErrors.value = parsed.fields
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell
    title="Reset your password"
    subtitle="Enter the email on your account and we'll send you a link to set a new password."
  >
    <div v-if="sent" class="space-y-6">
      <div class="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3.5">
        <MailCheckIcon class="mt-px size-4 shrink-0 text-primary" />
        <div class="min-w-0 text-sm">
          <p class="font-medium">Check your inbox</p>
          <p class="mt-1 leading-relaxed text-muted-foreground">
            If an account exists for <span class="font-medium text-foreground">{{ email }}</span>,
            a reset link is on its way. The link expires in 60 minutes.
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <Button class="h-10 w-full" @click="navigateTo('/login')">
          Back to sign in
        </Button>
        <Button variant="ghost" class="h-10 w-full" :loading="submitting" @click="handleSubmit">
          Resend the link
        </Button>
      </div>
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

      <Button type="submit" class="h-10 w-full" :loading="submitting">
        {{ submitting ? 'Sending…' : 'Send reset link' }}
      </Button>
    </form>

    <template #footer>
      Remembered it?
      <NuxtLink to="/login" class="font-medium text-primary hover:underline">
        Sign in
      </NuxtLink>
    </template>
  </AuthShell>
</template>
