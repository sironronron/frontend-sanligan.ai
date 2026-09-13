<script setup lang="ts">
import { SparklesIcon } from '@lucide/vue'

const props = withDefaults(defineProps<{
  digest: string | null
  generatedAt?: string | null
  compact?: boolean
}>(), { generatedAt: null, compact: false })

const { relativeTime } = useCasePresentation()
</script>

<template>
  <section
    class="rounded-xl border border-primary/20 bg-primary/[0.04] text-left"
    :class="props.compact ? 'p-3' : 'p-4'"
    aria-label="AI-generated case digest"
  >
    <div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
      <SparklesIcon class="size-3.5" />
      <span>Case digest</span>
      <span v-if="props.generatedAt" class="font-normal normal-case tracking-normal text-muted-foreground">
        · updated {{ relativeTime(props.generatedAt) }}
      </span>
    </div>
    <p
      v-if="props.digest"
      class="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/85"
      :class="props.compact ? 'line-clamp-3 text-xs leading-snug' : 'max-h-56 overflow-y-auto'"
    >
      {{ props.digest }}
    </p>
    <p v-else class="mt-2 text-sm text-muted-foreground">
      The digest is being prepared from this case's chats, files, tasks, deadlines, and matter memory.
    </p>
  </section>
</template>
