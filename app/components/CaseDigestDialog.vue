<script setup lang="ts">
import { SparklesIcon, XIcon } from '@lucide/vue'

/**
 * A peek at a case's AI digest without leaving the list.
 *
 * The list payload already carries each case's digest, so this renders
 * instantly from row data — no fetch, no polling. The full case page stays
 * the source of truth for a digest that is still being prepared.
 */
const props = defineProps<{
  title: string
  digest: string | null
  generatedAt?: string | null
}>()

const emit = defineEmits<{
  close: []
  open: []
}>()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-sm"
      style="background: rgb(0 0 0 / 0.45)"
      role="dialog"
      aria-modal="true"
      aria-label="Case digest"
      @click.self="emit('close')"
    >
      <div class="surface flex max-h-[86dvh] w-full max-w-lg flex-col overflow-hidden">
        <div class="flex items-start gap-3 border-b px-5 py-3.5">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <SparklesIcon class="size-4 text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">Case digest</p>
            <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ props.title }}</p>
          </div>
          <Button variant="ghost" size="icon" class="size-7 shrink-0" aria-label="Close" @click="emit('close')">
            <XIcon class="size-4" />
          </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <CaseDigest :digest="props.digest" :generated-at="props.generatedAt" />
        </div>

        <div class="flex items-center justify-end gap-2 border-t px-5 py-3.5">
          <Button variant="outline" @click="emit('close')">Close</Button>
          <Button @click="emit('open')">Open full case</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
