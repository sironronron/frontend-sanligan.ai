<script setup lang="ts">
withDefaults(defineProps<{
  /** Number of skeleton tiles to draw. */
  count?: number
}>(), {
  count: 6,
})
</script>

<template>
  <div
    class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
    role="status"
    aria-label="Loading"
  >
    <div v-for="n in count" :key="n" class="surface flex flex-col gap-3 p-5">
      <div class="flex items-center justify-between">
        <Skeleton class="h-3 w-20" />
        <Skeleton class="size-9 rounded-lg" />
      </div>
      <Skeleton class="h-8 w-16" />
      <Skeleton class="h-3 w-24" />
    </div>
  </div>
</template>
