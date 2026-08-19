<script setup lang="ts">
import { Loader2Icon, PuzzleIcon } from '@lucide/vue'

const props = defineProps<{
  /** The provider being connected, shown in the copy. */
  providerName?: string | null
}>()
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background/95 backdrop-blur-sm"
    role="alertdialog"
    aria-busy="true"
    aria-live="assertive"
    aria-label="Connecting to add-ons"
  >
    <div class="relative flex size-20 items-center justify-center">
      <span class="absolute inline-flex size-20 animate-ping rounded-full bg-primary/15" />
      <span class="absolute inline-flex size-14 animate-pulse rounded-full bg-primary/20" />
      <div class="relative flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
        <PuzzleIcon class="size-7" />
      </div>
    </div>

    <div class="text-center">
      <p class="text-lg font-semibold">
        Connecting to add-ons
      </p>
      <p class="mt-1 text-sm text-muted-foreground">
        <template v-if="providerName">
          Linking your {{ providerName }} account…
        </template>
        <template v-else>
          Linking your account…
        </template>
      </p>
    </div>

    <div class="flex items-center gap-2 text-xs text-muted-foreground/80">
      <Loader2Icon class="size-3.5 animate-spin" />
      <span>Securely redirecting to your provider</span>
    </div>
  </div>
</template>
