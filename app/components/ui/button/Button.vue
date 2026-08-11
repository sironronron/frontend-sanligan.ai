<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from '.'
import { Loader2Icon } from '@lucide/vue'
import { Primitive } from 'reka-ui'
import { cn } from '@/lib/utils'
import { buttonVariants } from '.'

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
  /** Swaps in a spinner and blocks further clicks while an action is in flight. */
  loading?: boolean
  /**
   * Declared rather than left to fall through, so `loading` can force it on
   * without the inherited attribute winning the merge.
   */
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
  loading: false,
  disabled: false,
})

// An icon button has no room for a spinner beside its icon, so the spinner
// replaces the content instead of joining it.
const iconOnly = computed(() => String(props.size ?? '').startsWith('icon'))
</script>

<template>
  <Primitive
    data-slot="button"
    :data-variant="variant"
    :data-size="size"
    :data-loading="loading ? '' : undefined"
    :as="as"
    :as-child="asChild"
    :disabled="disabled || loading || undefined"
    :aria-busy="loading || undefined"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <Loader2Icon v-if="loading" class="animate-spin" />
    <slot v-if="!(loading && iconOnly)" />
  </Primitive>
</template>
