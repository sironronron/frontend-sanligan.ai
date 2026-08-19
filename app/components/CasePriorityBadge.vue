<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
/**
 * Filled, so it cuts through a list of neutral status pills — but only for
 * high and urgent unless the caller asks for all of them. A "medium" badge on
 * every row is chrome, not signal, and it drowns the two that matter.
 */
const props = withDefaults(
  defineProps<{
    priority: string | null | undefined
    /** Detail views show the value whatever it is; lists opt out. */
    showQuiet?: boolean
    /** Lets the caller override height, radius and spacing to align with neighbours. */
    class?: HTMLAttributes['class']
  }>(),
  { showQuiet: false },
)

const { priorityLabel, priorityClass, isLoudPriority } = useCasePresentation()

const visible = computed(() => {
  if (!props.priority) return false
  return props.showQuiet || isLoudPriority(props.priority)
})
</script>

<template>
  <Badge v-if="visible" variant="outline" :class="[priorityClass(props.priority!), props.class]">
    {{ priorityLabel(props.priority!) }}
  </Badge>
</template>
