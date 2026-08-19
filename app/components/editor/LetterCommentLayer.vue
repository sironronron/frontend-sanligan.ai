<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  MessageSquareIcon,
  MessageSquarePlusIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from '@lucide/vue'
import type { Editor } from '@tiptap/vue-3'
import type { LetterComment } from '~/types/tiptap'
import { useAuthStore } from '~/stores/auth'
import {
  createLetterComment,
  deleteLetterComment,
  fetchLetterComments,
} from '~/lib/letterComments'
import { toast } from '~/components/ui/sonner'

const api = useApi()

const props = defineProps<{
  editor: Editor | undefined
  messageId: string | null
}>()

const roots = ref<LetterComment[]>([])
const loading = ref(false)
const hovered = ref<{ blockId: string, top: number, left: number, height: number } | null>(null)
const activeBlockId = ref<string | null>(null)
const indicatorRects = ref<Record<string, { top: number, left: number }>>({})
const panelRect = ref<{ top: number, left: number } | null>(null)

const PANEL_WIDTH = 348

/** Gap between a block's left edge and the comment button/indicator in its gutter. */
const COMMENT_GUTTER = 44

const commentsByBlock = computed<Record<string, LetterComment>>(() => {
  const map: Record<string, LetterComment> = {}
  for (const root of roots.value) {
    map[root.block_id] = root
  }
  return map
})

const activeThread = computed(() =>
  activeBlockId.value ? commentsByBlock.value[activeBlockId.value] ?? null : null,
)

const currentUser = computed(() => {
  const auth = useAuthStore()
  return { id: auth.user?.id ?? null, name: auth.user?.name ?? 'You' }
})

/* ----- data ----- */

async function load() {
  if (!props.messageId) return
  loading.value = true
  try {
    const { data } = await fetchLetterComments(props.messageId)
    roots.value = data
    recomputeIndicators()
  } catch {
    toast.error('Could not load comments.')
  } finally {
    loading.value = false
  }
}

watch(() => props.messageId, load, { immediate: true })

/* ----- positioning ----- */

/**
 * The editor's content element, or null when there is nothing to read it from.
 *
 * `editor.view` is not safe to touch on a destroyed editor: once the view is
 * gone the getter hands back a proxy that throws on any property it does not
 * stub, `dom` included. The panel and the editor tear down together, so this
 * layer is routinely still alive for a tick after the editor has been
 * destroyed underneath it.
 */
function editorDom(editor: Editor | undefined): HTMLElement | null {
  if (!editor || editor.isDestroyed) return null

  return editor.view.dom as HTMLElement
}

function blockElement(blockId: string): HTMLElement | null {
  return editorDom(props.editor)?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`) ?? null
}

function recomputeIndicators() {
  const dom = editorDom(props.editor)
  if (!dom) return
  const next: Record<string, { top: number, left: number }> = {}
  dom
    .querySelectorAll<HTMLElement>('[data-block-id]')
    .forEach((el) => {
      const blockId = el.getAttribute('data-block-id')
      if (!blockId || !commentsByBlock.value[blockId]) return
      const rect = el.getBoundingClientRect()
      next[blockId] = { top: rect.top, left: rect.left - COMMENT_GUTTER }
    })
  indicatorRects.value = next

  if (activeBlockId.value) {
    positionPanel(activeBlockId.value)
  }
}

let rafPending = false
function scheduleRecompute() {
  if (rafPending) return
  rafPending = true
  requestAnimationFrame(() => {
    rafPending = false
    recomputeIndicators()
  })
}

/**
 * The add-comment button floats in the gutter to the left of the block, so
 * reaching it means crossing a few pixels of editor space that are not the
 * block itself. Clearing `hovered` the instant the pointer leaves the block
 * would hide the button mid-reach, so the hide is delayed and cancelled the
 * moment the pointer lands on the button (or returns to a block).
 */
let hideTimer: ReturnType<typeof setTimeout> | null = null

function cancelHide() {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function scheduleHide() {
  cancelHide()
  hideTimer = setTimeout(() => {
    hovered.value = null
    hideTimer = null
  }, 180)
}

function onMove(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const block = target?.closest<HTMLElement>('[data-block-id]')
  if (!block) {
    scheduleHide()
    return
  }
  const blockId = block.getAttribute('data-block-id')
  if (!blockId) {
    scheduleHide()
    return
  }
  cancelHide()
  const rect = block.getBoundingClientRect()
  hovered.value = {
    blockId,
    top: rect.top,
    left: rect.left - COMMENT_GUTTER,
    height: rect.height,
  }
}

function positionPanel(blockId: string) {
  const el = blockElement(blockId)
  if (!el) {
    panelRect.value = null
    return
  }
  const rect = el.getBoundingClientRect()
  const placeLeft = rect.left - PANEL_WIDTH - 16 >= 8
  panelRect.value = {
    top: Math.min(Math.max(rect.top, 12), window.innerHeight - 320),
    left: placeLeft ? rect.left - PANEL_WIDTH - 12 : Math.min(rect.right + 12, window.innerWidth - PANEL_WIDTH - 12),
  }
}

/* ----- interactions ----- */

function openThread(blockId: string) {
  activeBlockId.value = blockId
  positionPanel(blockId)
  hovered.value = null
}

function closeThread() {
  activeBlockId.value = null
  panelRect.value = null
}

const draftBody = ref('')
const submitting = ref(false)

async function submit() {
  const body = draftBody.value.trim()
  if (!body || !props.messageId || submitting.value) return

  const blockId = activeBlockId.value
  if (!blockId) return

  submitting.value = true
  const parentId = activeThread.value ? activeThread.value.id : null

  try {
    const { data } = await createLetterComment(props.messageId, {
      block_id: blockId,
      body,
      parent_id: parentId,
    })
    draftBody.value = ''

    // The block id anchoring this comment is generated client-side and lives
    // only in the editor's document. Persist the document now so the anchor
    // survives closing and reopening the panel — otherwise the block is
    // re-stamped with a fresh id on reload and the comment can never be found.
    persistDraftContent()

    if (parentId) {
      const root = roots.value.find(r => r.id === parentId)
      root?.replies.push(data)
    } else {
      roots.value.push(data)
    }
    recomputeIndicators()
    toast.success(parentId ? 'Reply added' : 'Comment added')
  } catch {
    toast.error('Could not save the comment.')
  } finally {
    submitting.value = false
  }
}

/**
 * Save the editor's current document back onto the draft. The comment was just
 * anchored to a block id that the editor assigned in memory; unless we write
 * that id into the stored document it is lost the next time the panel opens and
 * the block is re-stamped, orphaning the comment. Title is left null so the
 * server keeps whatever title it already has. Best-effort: a failure here must
 * not roll back the comment that was just created.
 */
function persistDraftContent() {
  const editor = props.editor
  const messageId = props.messageId
  if (!editor || editor.isDestroyed || !messageId) return

  api(`/messages/${messageId}/letter-draft`, {
    method: 'PATCH',
    body: {
      content: editor.getJSON(),
      title: null,
    },
  }).catch(() => {})
}

async function remove(comment: LetterComment) {
  if (!props.messageId) return
  try {
    await deleteLetterComment(props.messageId, comment.id)
    if (comment.parent_id === null) {
      roots.value = roots.value.filter(r => r.id !== comment.id)
    } else {
      for (const root of roots.value) {
        root.replies = root.replies.filter(r => r.id !== comment.id)
      }
    }
    recomputeIndicators()
    toast.success('Comment deleted')
  } catch {
    toast.error('Could not delete the comment.')
  }
}

const initials = (name: string | null) =>
  (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || '?'

function relativeTime(value: string): string {
  const then = new Date(value).getTime()
  const diff = Date.now() - then
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

/* ----- listeners ----- */

/**
 * The element the listeners below are attached to.
 *
 * Held rather than re-derived: by the time they come off, the editor may be
 * destroyed and unable to name its own DOM. Detaching from the node we
 * attached to is both safe and exact.
 */
let boundDom: HTMLElement | null = null

function unbind() {
  cancelHide()
  boundDom?.removeEventListener('mousemove', onMove)
  boundDom?.removeEventListener('scroll', scheduleRecompute, true)
  boundDom = null
}

// One binding for the editor's whole life, re-pointed if it is replaced —
// mounting and a later arrival of the editor are the same case here.
watch(
  () => props.editor,
  (editor) => {
    unbind()

    const dom = editorDom(editor)
    if (!dom) return

    boundDom = dom
    dom.addEventListener('mousemove', onMove)
    dom.addEventListener('scroll', scheduleRecompute, true)
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('resize', scheduleRecompute)
})

onBeforeUnmount(() => {
  unbind()
  window.removeEventListener('resize', scheduleRecompute)
})
</script>

<template>
  <!-- The layer renders inline inside the letter editor so it lives within the
       draft Sheet's focus scope and dismissable layer. Teleporting it to <body>
       put it outside both: the modal's focus trap then stole focus from the
       comment textarea and `interactOutside` dismissed the whole draft. -->
  <!-- Hover affordance: a comment button that glides to the hovered block. -->
  <Transition name="comment-fade">
    <button
      v-if="hovered && hovered.blockId !== activeBlockId"
      type="button"
      class="comment-hover-btn pointer-events-auto fixed z-[60] flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-[top,left,colors,transform,opacity] duration-150 ease-out hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
      :style="{ top: `${hovered.top + 2}px`, left: `${hovered.left}px` }"
      :title="commentsByBlock[hovered.blockId] ? 'View comments' : 'Add a comment'"
      @mouseenter="cancelHide"
      @mouseleave="scheduleHide"
      @click="openThread(hovered.blockId)"
    >
      <MessageSquarePlusIcon v-if="!commentsByBlock[hovered.blockId]" class="size-4" />
      <MessageSquareIcon v-else class="size-4" />
    </button>
  </Transition>

    <!-- Persistent indicators on blocks that already have comments. -->
    <button
      v-for="(rect, blockId) in indicatorRects"
      :key="blockId"
      type="button"
      class="comment-indicator pointer-events-auto fixed z-[55] flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary shadow-sm transition-transform hover:scale-105"
      :style="{ top: `${rect.top}px`, left: `${rect.left}px` }"
      :title="`${commentsByBlock[blockId]?.replies.length ? commentsByBlock[blockId].replies.length + 1 : 1} comment(s)`"
      @click="openThread(blockId)"
    >
      <MessageSquareIcon class="size-3" />
      {{ commentsByBlock[blockId]?.replies.length ? commentsByBlock[blockId].replies.length + 1 : 1 }}
    </button>

    <!-- Thread panel for the active block. -->
    <Transition name="thread-slide">
      <div
        v-if="activeBlockId && panelRect"
        class="comment-thread pointer-events-auto fixed z-[70] flex max-h-[70vh] w-[348px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        :style="{ top: `${panelRect.top}px`, left: `${panelRect.left}px`, width: `${PANEL_WIDTH}px` }"
      >
        <div class="flex items-center justify-between border-b px-3 py-2.5">
          <div class="flex items-center gap-2 text-sm font-semibold">
            <MessageSquareIcon class="size-4 text-primary" />
            {{ commentsByBlock[activeBlockId] ? 'Discussion' : 'Add a comment' }}
          </div>
          <Button variant="ghost" size="icon" class="size-7" aria-label="Close" @click="closeThread">
            <XIcon class="size-4" />
          </Button>
        </div>

        <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
          <p v-if="loading" class="text-xs text-muted-foreground">Loading…</p>

          <template v-if="activeThread">
            <TransitionGroup name="comment-item" tag="div" class="space-y-3">
              <div :key="activeThread.id" class="flex gap-2.5">
                <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                  {{ initials(activeThread.user.name) }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline justify-between gap-2">
                    <span class="truncate text-xs font-medium">{{ activeThread.user.name ?? 'Unknown' }}</span>
                    <span class="shrink-0 text-[10px] text-muted-foreground">{{ relativeTime(activeThread.created_at) }}</span>
                  </div>
                  <p class="mt-0.5 whitespace-pre-wrap break-words text-sm">{{ activeThread.body }}</p>
                  <button
                    v-if="activeThread.user.id === currentUser.id"
                    type="button"
                    class="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                    @click="remove(activeThread)"
                  >
                    <Trash2Icon class="size-3" /> Delete
                  </button>
                </div>
              </div>

              <div v-for="reply in activeThread.replies" :key="reply.id" class="flex gap-2.5 pl-4">
                <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {{ initials(reply.user.name) }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline justify-between gap-2">
                    <span class="truncate text-xs font-medium">{{ reply.user.name ?? 'Unknown' }}</span>
                    <span class="shrink-0 text-[10px] text-muted-foreground">{{ relativeTime(reply.created_at) }}</span>
                  </div>
                  <p class="mt-0.5 whitespace-pre-wrap break-words text-sm">{{ reply.body }}</p>
                  <button
                    v-if="reply.user.id === currentUser.id"
                    type="button"
                    class="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                    @click="remove(reply)"
                  >
                    <Trash2Icon class="size-3" /> Delete
                  </button>
                </div>
              </div>
            </TransitionGroup>
          </template>

          <p v-else-if="!loading" class="text-xs text-muted-foreground">
            Start a discussion on this section. Anyone who can open this draft — including the lawyer vetting or notarizing it — will see it.
          </p>
        </div>

        <form class="flex items-end gap-2 border-t bg-muted/30 p-2.5" @submit.prevent="submit">
          <textarea
            v-model="draftBody"
            rows="1"
            :placeholder="activeThread ? 'Reply…' : 'Comment on this section…'"
            class="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none transition-colors focus:border-primary/50"
            @keydown.enter.exact.prevent="submit"
          />
          <Button type="submit" size="icon" class="size-9 shrink-0" :disabled="!draftBody.trim() || submitting" :title="activeThread ? 'Reply' : 'Comment'">
            <SendIcon v-if="!submitting" class="size-4" />
            <span v-else class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          </Button>
        </form>
      </div>
    </Transition>
</template>

<style scoped>
/* The hover button glides in from above and fades. */
.comment-fade-enter-active,
.comment-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.comment-fade-enter-from,
.comment-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.9);
}

/* The thread panel slides in from the side. */
.thread-slide-enter-active,
.thread-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}
.thread-slide-enter-from,
.thread-slide-leave-to {
  opacity: 0;
  transform: translateX(16px) scale(0.98);
}

/* Each comment gently rises as it appears. */
.comment-item-enter-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.comment-item-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.comment-item-leave-active {
  transition: opacity 0.15s ease;
}
.comment-item-leave-to {
  opacity: 0;
}
.comment-item-move {
  transition: transform 0.2s ease;
}
</style>
