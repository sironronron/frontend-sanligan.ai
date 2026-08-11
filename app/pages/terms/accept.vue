<script setup lang="ts">
import { Loader2Icon } from '@lucide/vue'
import { useAuthStore } from '~/stores/auth'

definePageMeta({
  layout: false,
})

const auth = useAuthStore()
const api = useApi()
const router = useRouter()

const document = ref('')
const loading = ref(true)
const error = ref('')
const accepted = ref(false)

onMounted(async () => {
  try {
    const response = await api<{ content: string; hash: string; version: string }>('/terms/document')
    document.value = response.content
  } catch (e) {
    error.value = 'Failed to load terms document. Please try again.'
  } finally {
    loading.value = false
  }
})

async function handleAccept(marketingOptIn: boolean) {
  try {
    await auth.acceptTerms(marketingOptIn)
    accepted.value = true
    // Redirect to next step based on user state
    if (!auth.hasOrganization) {
      router.push('/organization/setup')
    } else if (!auth.kycCompleted) {
      router.push('/onboarding')
    } else {
      router.push('/chat')
    }
  } catch (e) {
    error.value = 'Failed to accept terms. Please try again.'
  }
}
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col">
    <div class="flex-1 flex items-center justify-center p-4">
      <div class="w-full max-w-2xl">
        <div class="bg-card text-card-foreground rounded-lg shadow-sm border p-6">
          <div class="mb-6">
            <h1 class="text-xl font-semibold text-foreground">Terms of Service and Privacy Policy</h1>
            <p class="text-sm text-muted-foreground mt-1">Please review and accept our terms to continue.</p>
          </div>

          <div
            v-if="loading"
            class="flex items-center justify-center py-12"
          >
            <Loader2Icon class="h-6 w-6 animate-spin text-primary" />
          </div>

          <div
            v-else-if="error"
            class="text-center py-12"
          >
            <p class="text-sm text-destructive">{{ error }}</p>
            <Button
              variant="outline"
              class="mt-4"
              @click="$router.go(0)"
            >
              Try Again
            </Button>
          </div>

          <template v-else>
            <div
              class="markdown-body max-h-96 overflow-y-auto border rounded-md bg-background p-4 mb-6 text-sm"
              v-html="renderMarkdown(document)"
            />

            <TermsAcceptance @accept="handleAccept" />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
