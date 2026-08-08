<script setup lang="ts">
import { ScaleIcon } from '@lucide/vue'

defineProps<{
  title: string
  description: string
  eyebrow?: string
}>()
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center px-6 text-center">
    <div class="relative mb-5">
      <div class="absolute -inset-3 rounded-full bg-primary/10 blur-xl" aria-hidden="true" />
      <div class="relative flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
        <ScaleIcon class="size-7 text-primary" />
      </div>
    </div>

    <p v-if="eyebrow" class="text-[11px] font-semibold uppercase tracking-widest text-primary">{{ eyebrow }}</p>
    <h2 class="mt-2 text-xl font-semibold tracking-tight">{{ title }}</h2>
    <p class="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
      {{ description }}
    </p>

    <div class="mt-7 flex w-full max-w-md flex-wrap items-stretch justify-center gap-2">
      <slot />
    </div>
  </div>
</template>
