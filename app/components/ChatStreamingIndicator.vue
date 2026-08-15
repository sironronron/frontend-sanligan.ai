<script setup lang="ts">
import { Loader2Icon } from '@lucide/vue'
import { useChatStreamStore, type ChatTurn } from '~/stores/chatStream'

/**
 * "Batayan is replying" for the app header.
 *
 * A turn keeps running after the user leaves the thread that started it, which
 * is only obvious from the thread list — and the thread list is on the chat and
 * case pages. From anywhere else the app looked idle while it was working, so
 * this carries the fact into the one place that is always on screen, along with
 * the way back to the thread.
 */

const props = withDefaults(defineProps<{ class?: string }>(), { class: '' })

const chatStream = useChatStreamStore()
const route = useRoute()
const router = useRouter()

/**
 * Turns worth announcing here: the ones whose thread is not already open. That
 * page shows the answer arriving in the thread itself, so repeating it in the
 * header would only be noise.
 */
const elsewhere = computed(() =>
  chatStream.streamingTurns.filter((turn) => turn.returnTo !== route.fullPath),
)

const open = ref(false)

/** The question, trimmed to something that fits on one line. */
function label(turn: ChatTurn): string {
  const question = turn.question.replace(/\s+/g, ' ').trim()
  // Intake submissions are a wall of "field: value" pairs, never a readable title.
  if (question.startsWith('[Intake Form Submission]')) return 'Drafting your document'
  if (question.startsWith('[Template:')) return 'Filling in your template'
  // A choice submission is the Q/A transport, not a question the user typed.
  if (question.startsWith('[Choice Selection]')) return 'Acting on your choice'

  return question.length > 60 ? `${question.slice(0, 60)}…` : question
}

/** What it is doing right now, when the server has said. */
function detail(turn: ChatTurn): string {
  return turn.statusLabel ?? 'Batayan is replying…'
}

async function openThread(turn: ChatTurn) {
  open.value = false
  await router.push(turn.returnTo)
}
</script>

<template>
  <div v-if="elsewhere.length > 0" :class="props.class">
    <!-- One thread: the button is the whole thing, no menu to open first. -->
    <button
      v-if="elsewhere.length === 1 && elsewhere[0]"
      type="button"
      class="flex max-w-[13rem] items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-2 pr-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      :title="`${label(elsewhere[0])} — ${detail(elsewhere[0])}`"
      @click="openThread(elsewhere[0])"
    >
      <Loader2Icon class="size-3.5 shrink-0 animate-spin" />
      <!-- The spinner alone carries it where the header has no room. -->
      <span class="hidden truncate sm:inline">Batayan is replying</span>
    </button>

    <DropdownMenu v-else v-model:open="open">
      <DropdownMenuTrigger
        class="flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-2 pr-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Loader2Icon class="size-3.5 shrink-0 animate-spin" />
        <span class="hidden sm:inline">Replying to {{ elsewhere.length }} threads</span>
        <span class="sm:hidden">{{ elsewhere.length }}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-72">
        <DropdownMenuLabel class="text-xs text-muted-foreground">
          Still being written
        </DropdownMenuLabel>
        <DropdownMenuItem
          v-for="turn in elsewhere"
          :key="turn.conversationId"
          class="flex flex-col items-start gap-0.5"
          @select="openThread(turn)"
        >
          <span class="w-full truncate text-sm">{{ label(turn) }}</span>
          <span class="flex w-full items-center gap-1.5 text-[11px] text-primary">
            <Loader2Icon class="size-3 shrink-0 animate-spin" />
            <span class="truncate">{{ detail(turn) }}</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
