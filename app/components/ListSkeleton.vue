<script setup lang="ts">
// A skeleton that mirrors the shape of the list it replaces reads as "content
// is arriving" rather than "something is happening somewhere", which is what a
// bare centred spinner communicates.
withDefaults(defineProps<{
  rows?: number
  /** Show the leading square that list rows use for an icon or avatar. */
  icon?: boolean
}>(), {
  rows: 4,
  icon: true,
})
</script>

<template>
  <div class="space-y-2" role="status" aria-label="Loading">
    <div
      v-for="row in rows"
      :key="row"
      class="flex items-center gap-3 rounded-xl border bg-card p-4"
    >
      <Skeleton v-if="icon" class="size-9 shrink-0 rounded-lg" />
      <div class="min-w-0 flex-1 space-y-2">
        <Skeleton class="h-3.5 w-[42%]" />
        <Skeleton class="h-3 w-[68%]" />
      </div>
      <Skeleton class="h-7 w-20 shrink-0 rounded-lg" />
    </div>
  </div>
</template>
