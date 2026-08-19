<script setup lang="ts">
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import type { Todo } from '~/stores/todos'

const props = defineProps<{
  todo: Todo
  open: boolean
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <DialogRoot :open="open" @update:open="(v) => { if (!v) emit('close') }">
    <DialogPortal>
      <DialogOverlay
        class="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-black/50 duration-200"
      />
      <DialogContent
        class="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 fixed top-1/2 left-1/2 z-50 flex h-[min(90dvh,52rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl outline-none duration-200"
      >
        <DialogTitle class="sr-only">{{ props.todo.title }}</DialogTitle>
        <DialogDescription class="sr-only">Task details for {{ props.todo.title }}</DialogDescription>
        <TaskDetailContent :todo="props.todo" @close="emit('close')" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
