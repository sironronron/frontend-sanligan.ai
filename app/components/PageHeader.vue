<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Thin shim over `AppPageHeader` so the ~18 existing pages that import
 * `PageHeader` keep working. New pages should use `AppPageHeader` directly —
 * it accepts `eyebrow`, a `breadcrumb` slot, and a default slot for inline
 * content beneath the title.
 */
const props = defineProps<{
  title: string
  description?: string
  icon?: Component
}>()
</script>

<template>
  <AppPageHeader :title="title" :description="description" :icon="icon">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
    <slot />
  </AppPageHeader>
</template>
