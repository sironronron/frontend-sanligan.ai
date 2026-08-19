<script setup lang="ts">
import type { CaseMember } from '~/stores/cases'

/**
 * The people on a case, drawn as an overlapping avatar stack.
 *
 * The owner always leads and is marked as such — on a shared matter "who holds
 * this" is a different question from "who is working it", and a flat row of
 * identical circles answers neither.
 */
const props = withDefaults(defineProps<{
  owner?: CaseMember | null
  assignees?: CaseMember[]
  /** Beyond this many, the rest collapse into a +N chip. */
  max?: number
  /** Replaces the +N chip's text where a fixed marker reads better than a count. */
  overflowLabel?: string
  size?: 'sm' | 'md'
}>(), {
  max: 4,
  size: 'sm',
})

const people = computed(() => {
  const list: Array<CaseMember & { isOwner: boolean }> = []

  if (props.owner) list.push({ ...props.owner, isOwner: true })

  for (const assignee of props.assignees ?? []) {
    // Defensive: the owner should never also be an assignee row, but a stale
    // payload must not draw the same person twice.
    if (assignee.id !== props.owner?.id) list.push({ ...assignee, isOwner: false })
  }

  return list
})

const shown = computed(() => people.value.slice(0, props.max))
const overflow = computed(() => Math.max(0, people.value.length - props.max))

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/** Read out to screen readers in place of a row of unlabelled circles. */
const summary = computed(() => {
  if (people.value.length === 0) return 'Nobody assigned'

  const names = people.value.map((p) => (p.isOwner ? `${p.name} (owner)` : p.name))

  return `On this case: ${names.join(', ')}`
})

const sizeClass = computed(() => (props.size === 'md' ? 'size-8 text-xs' : 'size-6 text-[10px]'))
</script>

<template>
  <div v-if="people.length > 0" class="flex items-center" :aria-label="summary" role="img">
    <div class="flex -space-x-1.5">
      <span
        v-for="person in shown"
        :key="person.id"
        :title="person.isOwner ? `${person.name} · Owner` : person.name"
        class="flex items-center justify-center rounded-full border-2 border-card font-medium"
        :class="[
          sizeClass,
          person.isOwner
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground',
        ]"
      >
        {{ initials(person.name) }}
      </span>

      <span
        v-if="overflow > 0"
        :title="`${overflow} more`"
        class="flex items-center justify-center rounded-full border-2 border-card bg-muted font-medium text-muted-foreground"
        :class="sizeClass"
      >
        {{ props.overflowLabel ?? `+${overflow}` }}
      </span>
    </div>
  </div>
</template>
