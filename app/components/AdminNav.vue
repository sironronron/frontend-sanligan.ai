<script setup lang="ts">
// The three admin pages carried an identical copy of this header, so the active
// tab was set by hand in each file and drifted whenever a tab was added.
const route = useRoute()

const tabs = [
  { to: '/admin/legal-sources', label: 'Legal sources' },
  { to: '/admin/crawled-pages', label: 'Crawled pages' },
  { to: '/admin/legal-documents', label: 'Uploaded documents' },
  { to: '/admin/system-prompts', label: 'System prompts' },
  { to: '/admin/lawyers', label: 'Lawyers' },
  { to: '/admin/vetting', label: 'Vetting & payouts' },
]

function isActive(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <div class="mb-6">
    <h1 class="font-heading text-2xl font-semibold tracking-tight">Admin</h1>

    <!--
      The same segmented control the case list uses for status: a recessed well
      with the active tab raised out of it, so the sections read as one strip
      rather than four loose links.
    -->
    <nav
      class="surface-inset mt-4 flex items-center overflow-x-auto p-0.5 text-sm"
      aria-label="Admin sections"
    >
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="inline-flex h-7 shrink-0 items-center rounded-md px-3 text-xs font-medium transition-colors"
        :class="isActive(tab.to) ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
        :aria-current="isActive(tab.to) ? 'page' : undefined"
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>
  </div>
</template>
