<script setup lang="ts">
/**
 * The founding-member offer's terms and how many places are left. Shown on
 * the plan pickers while the offer is open to this account.
 */
import type { FoundingOffer } from '~/stores/billing'

defineProps<{ offer: FoundingOffer }>()
</script>

<template>
  <div
    class="mx-auto mt-5 flex max-w-xl flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl border border-primary/15 bg-primary/[0.06] px-4 py-2.5 text-sm"
  >
    <span class="rounded-full bg-primary px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary-foreground">
      Founding members
    </span>
    <span>
      <strong class="font-semibold text-primary">{{ offer.discount_percent }}% off any plan, for life.</strong>
      {{ offer.slots_remaining }} of {{ offer.slots_total }} places left.
    </span>
  </div>
</template>
