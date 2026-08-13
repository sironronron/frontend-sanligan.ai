<script setup lang="ts">
/**
 * Status reads as neutral chrome plus a colored dot. Tinting the whole pill
 * per status put four different backgrounds in one row and made priority —
 * which is also a pill — impossible to pick out at a glance.
 */
const props = defineProps<{
  status: string
  /** Renders the chevron affordance when the badge doubles as a menu trigger. */
  interactive?: boolean
}>()

const { statusLabel, statusDotClass } = useCasePresentation()
</script>

<template>
  <Badge
    variant="outline"
    class="gap-1.5 bg-card"
    :class="props.interactive ? 'pr-1.5 transition-colors hover:bg-muted' : ''"
  >
    <span class="size-1.5 shrink-0 rounded-full" :class="statusDotClass(props.status)" aria-hidden="true" />
    {{ statusLabel(props.status) }}
    <slot />
  </Badge>
</template>
