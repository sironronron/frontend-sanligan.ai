<script setup lang="ts">
import { ArrowUpRightIcon, ListChecksIcon, ShieldAlertIcon } from '@lucide/vue'
import type { ChatToolReceipt } from '~/types/chat'

/**
 * What the turn actually wrote, shown under the answer that wrote it.
 *
 * Tasks and flags land in side panels the reader very often does not have
 * open, so until now the only evidence a turn had done anything was the
 * reply's own sentence claiming it had — the one claim in the product that
 * cannot be taken at face value. These come from the tool results instead, so
 * the count is the number of rows that exist, and the chip is a way into them.
 */
defineProps<{
  receipts: ChatToolReceipt[]
}>()

const emit = defineEmits<{
  /** Open the panel that holds what the receipt refers to. */
  open: [panel: 'tasks' | 'advisories']
}>()

const meta = {
  tasks: {
    icon: ListChecksIcon,
    label: (count: number) => `${count} ${count === 1 ? 'task' : 'tasks'} added`,
    action: 'View tasks',
  },
  advisories: {
    icon: ShieldAlertIcon,
    label: (count: number) => `${count} ${count === 1 ? 'thing' : 'things'} to check`,
    action: 'Review',
  },
} as const
</script>

<template>
  <ul class="flex flex-wrap gap-1.5">
    <li v-for="receipt in receipts" :key="receipt.kind">
      <button
        type="button"
        class="group/receipt inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.06] py-1 pl-2 pr-1.5 text-xs transition-colors hover:border-primary/45 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="emit('open', receipt.kind)"
      >
        <component :is="meta[receipt.kind].icon" class="size-3.5 shrink-0 text-primary" />
        <span class="font-medium text-foreground/85">{{ meta[receipt.kind].label(receipt.count) }}</span>
        <span class="flex items-center gap-0.5 text-[11px] text-muted-foreground">
          {{ meta[receipt.kind].action }}
          <ArrowUpRightIcon class="size-3 transition-transform group-hover/receipt:-translate-y-px group-hover/receipt:translate-x-px" />
        </span>
      </button>
    </li>
  </ul>
</template>
