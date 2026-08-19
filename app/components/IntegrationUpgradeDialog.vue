<script setup lang="ts">
import { LockIcon, SparklesIcon } from '@lucide/vue'

defineProps<{
  open: boolean
  /** The add-on the user reached for, named in the prompt. */
  providerName?: string | null
}>()

defineEmits<{ 'update:open': [value: boolean] }>()
</script>

<template>
  <AlertDialog :open="open" @update:open="$emit('update:open', $event)">
    <AlertDialogContent class="max-w-md">
      <AlertDialogHeader>
        <div class="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10">
          <LockIcon class="size-5 text-primary" />
        </div>
        <AlertDialogTitle>
          <template v-if="providerName">{{ providerName }} is a Pro feature</template>
          <template v-else>Add-ons are a Pro feature</template>
        </AlertDialogTitle>
        <AlertDialogDescription>
          <template v-if="providerName">
            The {{ providerName }} integration is available on the Pro, Firm, and Business plans.
          </template>
          <template v-else>
            Add-ons and integrations are available on the Pro, Firm, and Business plans.
          </template>
          Upgrade to connect it and choose exactly which capabilities it gets.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Not now</AlertDialogCancel>
        <AlertDialogAction @click.prevent="navigateTo('/pricing')">
          <SparklesIcon class="size-4" />
          View plans
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
