<script setup lang="ts">
import { Loader2Icon } from '@lucide/vue'
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()
const api = useApi()
const route = useRoute()

const document = ref('')
const loading = ref(false)
const error = ref('')
const agreed = ref(false)
const marketingOptIn = ref(false)
const submitting = ref(false)

// /terms/accept renders the same flow as a full page, so skip the modal there.
const showModal = computed(
  () => auth.initialized && !!auth.user && !auth.hasAcceptedTerms && route.path !== '/terms/accept',
)

const canSubmit = computed(() => agreed.value && !!document.value && !submitting.value)

async function loadDocument() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const response = await api<{ content: string; hash: string; version: string }>('/terms/document')
    document.value = response.content
  } catch {
    error.value = 'Failed to load the terms document. Please try again.'
  } finally {
    loading.value = false
  }
}

// The user is usually signed in after this component mounts — on the login page the
// layout renders before /user resolves — so load on visibility rather than on mount.
watch(
  showModal,
  (visible) => {
    if (visible) {
      if (!document.value) void loadDocument()
      return
    }

    document.value = ''
    agreed.value = false
    marketingOptIn.value = false
    error.value = ''
  },
  { immediate: true },
)

async function handleAccept() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = ''
  try {
    await auth.acceptTerms(marketingOptIn.value)
  } catch {
    error.value = 'Failed to accept the terms. Please try again.'
  } finally {
    submitting.value = false
  }
}

async function handleLogout() {
  await auth.logout()
  await navigateTo('/login')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-modal-title"
    >
      <div class="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-lg border bg-background shadow-xl">
        <div class="border-b px-6 py-4">
          <h2 id="terms-modal-title" class="text-lg font-semibold text-foreground">
            {{ auth.needsTermsReacceptance ? 'We’ve updated our terms' : 'Terms of Service and Privacy Policy' }}
          </h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {{
              auth.needsTermsReacceptance
                ? 'Please review and accept the updated Terms of Service and Privacy Policy to continue.'
                : 'Please review and accept our Terms of Service and Privacy Policy to continue.'
            }}
          </p>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-4">
          <div v-if="loading" class="flex items-center justify-center py-12">
            <Loader2Icon class="size-6 animate-spin text-primary" />
          </div>

          <div v-else-if="!document" class="py-8 text-center">
            <p class="text-sm text-destructive">{{ error }}</p>
            <Button variant="outline" class="mt-4" @click="loadDocument">
              Try again
            </Button>
          </div>

          <template v-else>
            <div
              class="markdown-body mb-4 max-h-[50dvh] overflow-y-auto rounded-md border p-4 text-sm"
              v-html="renderMarkdown(document)"
            />

            <div class="space-y-3 border-t pt-4">
              <label class="flex cursor-pointer items-start gap-3">
                <input
                  v-model="agreed"
                  type="checkbox"
                  class="mt-1 size-4 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <span class="text-sm text-foreground">
                  I have read and agree to the
                  <NuxtLink to="/legal/terms" target="_blank" class="text-primary hover:underline">
                    Terms of Service and Privacy Policy
                  </NuxtLink>
                </span>
              </label>

              <label class="flex cursor-pointer items-start gap-3">
                <input
                  v-model="marketingOptIn"
                  type="checkbox"
                  class="mt-1 size-4 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <span class="text-sm text-foreground">
                  I agree to receive marketing emails from Saligan AI
                </span>
              </label>
            </div>

            <p v-if="error" class="mt-3 text-sm text-destructive">{{ error }}</p>
          </template>
        </div>

        <div class="flex items-center justify-between gap-4 border-t px-6 py-4">
          <button
            type="button"
            class="text-sm text-muted-foreground hover:text-foreground hover:underline"
            @click="handleLogout"
          >
            Sign out
          </button>
          <Button :disabled="!canSubmit" :loading="submitting" @click="handleAccept">
            Continue
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
