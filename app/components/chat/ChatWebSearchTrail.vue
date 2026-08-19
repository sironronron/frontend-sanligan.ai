<script setup lang="ts">
import { CheckIcon, GlobeIcon } from '@lucide/vue'
import type { ChatWebSearch } from '~/types/chat'

/**
 * The sites the delegated Gemini search is reading, while it reads them.
 *
 * A grounded search is the longest silent stretch of a turn: the answer stops,
 * a second model goes out to the web, and the reader waits. This is that wait
 * made legible — the query, then each host as it comes back, then each row
 * resolving into the page it turned out to be.
 *
 * It is transient by contract. The trail is what was *read*; the citation
 * cards are what was *used*, and they are a different, persisted thing. So the
 * list leaves when the search ends rather than settling into a second source
 * list that contradicts the first.
 *
 * The server can hand over several rows in one frame — the search is a single
 * blocking tool call — so the one-at-a-time reading is produced here by
 * staggering each row's entrance rather than by waiting on the network.
 */
const props = defineProps<{
  search: ChatWebSearch
}>()

/** Capped so a full page of results does not take a second to finish arriving. */
function rowDelay(index: number): string {
  return `${Math.min(index * 65, 520)}ms`
}

const resolved = computed(() => props.search.phase === 'read')
</script>

<template>
  <div
    class="rounded-lg border border-border/70 bg-card/60 px-2.5 py-2"
    aria-live="polite"
    :aria-busy="!resolved"
  >
    <p class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <GlobeIcon class="size-3 shrink-0" :class="resolved ? '' : 'text-primary'" />
      <span class="min-w-0 truncate">
        {{ resolved ? 'Read' : 'Searching' }}
        <span class="font-medium text-foreground/75">{{ search.query || 'the web' }}</span>
      </span>
    </p>

    <ul v-if="search.sources.length > 0" class="mt-1.5 space-y-1">
      <li
        v-for="(source, index) in search.sources"
        :key="source.url"
        class="batayan-row-in flex items-center gap-2 text-[11px]"
        :style="{ '--row-delay': rowDelay(index) }"
      >
        <span
          class="flex size-3.5 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
          :class="source.title ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground/60'"
        >
          <CheckIcon v-if="source.title" class="size-2" />
          <span v-else class="batayan-dot" />
        </span>
        <!-- The host leads and never changes; the title fills in beside it once
             the page has been fetched. Swapping one for the other would make
             every row jump the moment the search resolved. -->
        <span class="shrink-0 font-medium text-foreground/70">{{ source.domain ?? 'source' }}</span>
        <span
          class="min-w-0 flex-1 truncate"
          :class="source.title ? 'text-muted-foreground/75' : 'text-muted-foreground/45'"
        >
          {{ source.title ?? 'reading…' }}
        </span>
      </li>
    </ul>
  </div>
</template>
