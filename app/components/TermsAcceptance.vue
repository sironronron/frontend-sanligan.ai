<script setup lang="ts">
const emit = defineEmits<{
  accept: [marketingOptIn: boolean]
}>()

const agreed = ref(false)
const marketingOptIn = ref(false)
const loading = ref(false)

const canContinue = computed(() => agreed.value)

async function handleAccept() {
  if (!canContinue.value) return
  loading.value = true
  try {
    emit('accept', marketingOptIn.value)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-4">
      <label class="flex items-start gap-3 cursor-pointer">
        <input
          v-model="agreed"
          type="checkbox"
          class="mt-1 h-4 w-4 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <span class="text-sm text-foreground">
          I have read and agree to the
          <NuxtLink
            to="/legal/terms"
            target="_blank"
            class="text-primary hover:underline"
          >
            Terms of Service and Privacy Policy
          </NuxtLink>
        </span>
      </label>

      <label class="flex items-start gap-3 cursor-pointer">
        <input
          v-model="marketingOptIn"
          type="checkbox"
          class="mt-1 h-4 w-4 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <span class="text-sm text-foreground">
          I agree to receive marketing emails from Saligan AI
        </span>
      </label>
    </div>

    <Button
      :disabled="!canContinue || loading"
      :loading="loading"
      class="w-full"
      @click="handleAccept"
    >
      Continue
    </Button>
  </div>
</template>
