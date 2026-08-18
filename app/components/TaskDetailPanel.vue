<script setup lang="ts">
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '~/components/ui/sheet'
import type { Todo } from '~/stores/todos'

const props = defineProps<{
  todo: Todo
  open: boolean
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Sheet :open="open" @update:open="(v) => { if (!v) emit('close') }">
    <SheetContent
      side="right"
      class="w-full p-0 sm:w-[32vw] sm:min-w-[420px] sm:max-w-[520px] border-l"
      :show-close-button="false"
    >
      <SheetTitle class="sr-only">{{ props.todo.title }}</SheetTitle>
      <SheetDescription class="sr-only">Task details for {{ props.todo.title }}</SheetDescription>
      <TaskDetailContent :todo="props.todo" @close="emit('close')" />
    </SheetContent>
  </Sheet>
</template>
