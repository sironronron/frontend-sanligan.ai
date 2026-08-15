<script setup lang="ts">
import { Loader2Icon } from '@lucide/vue'

/**
 * The "attach this document to a case" strip that opens under a document.
 *
 * Its own component so the documents page can hang it under a list row, a
 * card, or a full-width table row without three copies of the same select.
 */
defineProps<{
  cases: Array<{ id: string, title: string }>
  /** True while the attach request is in flight. */
  busy?: boolean
}>()

const emit = defineEmits<{ attach: [], cancel: [] }>()

const caseId = defineModel<string>({ required: true })
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-3">
    <Select v-model="caseId" class="w-64">
      <SelectTrigger class="text-sm">
        <SelectValue :placeholder="cases.length === 0 ? 'No cases yet' : 'Choose a case…'" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="c in cases" :key="c.id" :value="c.id">
          {{ c.title }}
        </SelectItem>
      </SelectContent>
    </Select>
    <Button size="sm" :disabled="busy || !caseId" @click="emit('attach')">
      <Loader2Icon v-if="busy" class="size-3 animate-spin" />
      Attach
    </Button>
    <Button variant="ghost" size="sm" @click="emit('cancel')">
      Cancel
    </Button>
    <p class="ml-auto text-[11px] text-muted-foreground">
      This document becomes retrievable in that case's conversations.
    </p>
  </div>
</template>
