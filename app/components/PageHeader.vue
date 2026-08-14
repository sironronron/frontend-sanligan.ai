<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="mb-7 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-border/70 pb-5">
    <div class="min-w-0">
      <h1 class="font-heading text-2xl font-semibold tracking-tight">{{ title }}</h1>
      <p v-if="description" class="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {{ description }}
      </p>
    </div>

    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
