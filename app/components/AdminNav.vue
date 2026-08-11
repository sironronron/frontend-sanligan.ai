<script setup lang="ts">
// The three admin pages carried an identical copy of this header, so the active
// tab was set by hand in each file and drifted whenever a tab was added.
const route = useRoute()

const tabs = [
  { to: '/admin/legal-sources', label: 'Legal sources' },
  { to: '/admin/crawled-pages', label: 'Crawled pages' },
  { to: '/admin/system-prompts', label: 'System prompts' },
]

function isActive(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <div class="mb-6">
    <h1 class="text-xl font-semibold tracking-tight">Admin</h1>
    <nav class="mt-3 flex items-center gap-1 text-sm" aria-label="Admin sections">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="rounded-md px-3 py-1.5 transition-colors"
        :class="isActive(tab.to) ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted'"
        :aria-current="isActive(tab.to) ? 'page' : undefined"
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>
  </div>
</template>
