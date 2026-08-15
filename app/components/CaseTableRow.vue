<script setup lang="ts">
import { ActivityIcon } from '@lucide/vue'
import type { LegalCase } from '~/stores/cases'

/**
 * One case as a table row.
 *
 * The columns are the reason to be here, so every cell holds its track even
 * when empty — a dash rather than a collapsed cell, which is what lets the eye
 * compare deadlines and progress straight down the page.
 */
const props = defineProps<{
  case: LegalCase
}>()

const emit = defineEmits<{
  open: [id: string]
  progress: [id: string]
}>()

const { typeLabel, relativeTime, dueState, taskPercent } = useCasePresentation()

const due = computed(() => dueState(props.case.due_date))

const isLate = computed(
  () =>
    due.value?.tone === 'overdue'
    && !props.case.archived_at
    && props.case.status !== 'closed',
)

const doneTasks = computed(() => props.case.total_tasks_count - props.case.open_tasks_count)
</script>

<template>
  <TableRow
    role="button"
    tabindex="0"
    class="group cursor-pointer"
    @click="emit('open', props.case.id)"
    @keydown.enter.self="emit('open', props.case.id)"
    @keydown.space.self.prevent="emit('open', props.case.id)"
  >
    <TableCell class="max-w-[22rem]">
      <div class="flex items-center gap-2">
        <!-- The row's stand-in for the list's full-height edge marker. -->
        <span
          class="h-8 w-1 shrink-0 rounded-full"
          :class="isLate ? 'bg-destructive' : 'bg-transparent'"
          aria-hidden="true"
        />
        <div class="min-w-0">
          <div class="flex min-w-0 items-center gap-1.5">
            <span class="truncate text-sm font-medium group-hover:text-primary">{{ props.case.title }}</span>
            <span
              v-if="props.case.archived_at"
              class="shrink-0 rounded-4xl border px-1.5 text-[10px] text-muted-foreground"
            >
              Archived
            </span>
          </div>
          <p class="truncate text-[11px] text-muted-foreground">
            {{ props.case.reference || 'No reference' }} · {{ typeLabel(props.case.case_type) }}
          </p>
        </div>
      </div>
    </TableCell>

    <TableCell>
      <CaseStatusBadge :status="props.case.status" />
    </TableCell>

    <TableCell class="hidden sm:table-cell">
      <CasePriorityBadge :priority="props.case.priority" />
    </TableCell>

    <TableCell class="hidden whitespace-nowrap text-xs md:table-cell" :class="due?.class ?? 'text-muted-foreground/50'">
      {{ due?.label ?? 'No deadline' }}
    </TableCell>

    <TableCell class="hidden lg:table-cell">
      <div v-if="props.case.total_tasks_count > 0" class="w-24">
        <div class="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>{{ doneTasks }}/{{ props.case.total_tasks_count }}</span>
          <span>{{ taskPercent(props.case) }}%</span>
        </div>
        <div class="mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${taskPercent(props.case)}%` }" />
        </div>
      </div>
      <span v-else class="text-xs text-muted-foreground/50">—</span>
    </TableCell>

    <TableCell class="hidden lg:table-cell">
      <CaseMemberAvatars
        v-if="props.case.owner"
        :owner="props.case.owner"
        :assignees="props.case.assignees"
        :max="3"
        overflow-label="3+"
      />
      <span v-else class="text-xs text-muted-foreground/50">—</span>
    </TableCell>

    <TableCell class="hidden whitespace-nowrap text-xs text-muted-foreground xl:table-cell">
      {{ props.case.last_message_at ? relativeTime(props.case.last_message_at) : '—' }}
    </TableCell>

    <TableCell>
      <div class="flex justify-end">
        <Button
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground"
          :aria-label="`View progress for ${props.case.title}`"
          title="View progress"
          @click.stop="emit('progress', props.case.id)"
        >
          <ActivityIcon />
        </Button>
      </div>
    </TableCell>
  </TableRow>
</template>
