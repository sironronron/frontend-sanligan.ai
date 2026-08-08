<script setup lang="ts">
import { Loader2Icon } from '@lucide/vue'
import ChatMessage from '~/components/chat/ChatMessage.vue'
import ActivityTimeline from '~/components/ActivityTimeline.vue'
import type { ChatActivityStep, ChatMessage as ChatMessageType } from '~/types/chat'

defineProps<{
  messages: ChatMessageType[]
  streaming: boolean
  statusLabel: string | null
  currentStatus: string | null
  activitySteps: ChatActivityStep[]
  awaitingIntake: boolean
  intakeDismissed: boolean
  hasIntakeFields: boolean
  lastQuestion: string
  busy: boolean
  streamError: string
  displayContent: (m: ChatMessageType) => string
}>()

defineEmits<{
  'markdown-click': [event: MouseEvent, message: ChatMessageType]
  rate: [message: ChatMessageType, feedback: 'up' | 'down']
  export: [message: ChatMessageType, type: 'word' | 'pdf']
  retry: []
  'abandon-intake': []
  'reopen-intake': []
}>()
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-7 px-4 py-6">
    <ChatMessage
      v-for="(m, index) in messages"
      :key="m.id"
      :message="m"
      :display-content="displayContent(m)"
      :is-streaming="streaming && index === messages.length - 1"
      :status-label="statusLabel"
      :activity-steps="activitySteps"
      :awaiting-intake="awaitingIntake"
      @markdown-click="(event, message) => $emit('markdown-click', event, message)"
      @rate="(message, feedback) => $emit('rate', message, feedback)"
      @export="(message, type) => $emit('export', message, type)"
    />

    <div v-if="awaitingIntake" class="flex items-start gap-3">
      <div class="intake-waiting max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed">
        <div class="flex items-center gap-2.5">
          <span class="shining-text font-medium">{{ currentStatus === 'collecting_facts' ? 'Tinkering with your request' : 'Needed more information from you' }}</span>
          <span class="flex items-center gap-1">
            <span class="waiting-dot" />
            <span class="waiting-dot" style="animation-delay: 0.15s" />
            <span class="waiting-dot" style="animation-delay: 0.3s" />
          </span>
        </div>
        <ActivityTimeline v-if="activitySteps.length > 0" :steps="activitySteps" class="mt-3" />
      </div>
    </div>

    <div v-if="hasIntakeFields && intakeDismissed" class="flex items-start gap-3">
      <div class="flex max-w-[85%] flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
        <div class="min-w-0 flex-1">
          <p class="font-medium">Information form closed</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Fill in the required details to continue drafting, or cancel this request.
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" class="h-8 text-xs" @click="$emit('abandon-intake')">Cancel</Button>
          <Button size="sm" class="h-8 text-xs" @click="$emit('reopen-intake')">Fill requirement</Button>
        </div>
      </div>
    </div>

    <div v-if="streamError" class="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
      <span class="flex-1">{{ streamError }}</span>
      <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" :disabled="!lastQuestion || busy" @click="$emit('retry')">
        <Loader2Icon v-if="busy" class="size-3.5 animate-spin" />
        Retry
      </Button>
    </div>
  </div>
</template>

<style scoped>
.intake-waiting {
  position: relative;
  overflow: hidden;
  background: color-mix(in oklab, var(--primary) 6%, transparent);
  border: 1px solid color-mix(in oklab, var(--primary) 22%, transparent);
}

.intake-waiting::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 40%;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in oklab, var(--primary) 10%, transparent),
    transparent
  );
  animation: shine-sweep 2.4s ease-in-out infinite;
}

@keyframes shine-sweep {
  0% { left: -50%; }
  55%, 100% { left: 120%; }
}

.shining-text {
  background: linear-gradient(
    90deg,
    var(--primary),
    color-mix(in oklab, var(--primary) 45%, transparent),
    var(--primary)
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: text-shine 2.4s linear infinite;
}

@keyframes text-shine {
  to { background-position: -200% center; }
}

.waiting-dot {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: var(--primary);
  animation: dot-bounce 1.2s ease-in-out infinite;
}

@keyframes dot-bounce {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-2px); }
}
</style>
