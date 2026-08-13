import { toast } from '~/components/ui/sonner'
import { upgradeMessage } from '~/stores/billing'
import type { ChatMessageAttachment } from '~/types/chat'

export interface ChatAttachment {
  /** Stable key for the chip; the server id only exists after the upload. */
  localId: string
  id: string | null
  name: string
  size: number
  status: 'uploading' | 'queued' | 'processing' | 'ready' | 'failed'
  error: string | null
}

interface UploadedDocument {
  id: string
  original_filename: string
  status: 'queued' | 'processing' | 'ready' | 'failed'
  error_message: string | null
}

const POLL_INTERVAL = 3000

/**
 * Files attached from the chat composer. They take the ordinary upload path —
 * POST /documents, then the ingestion queue — so an attachment is just a
 * document that happens to have been uploaded from the composer instead of the
 * documents page. Once it is ready, retrieval picks it up for the conversation
 * like any other document the user owns.
 */
export function useChatAttachments(options: {
  caseId?: MaybeRefOrGetter<string | null>
  onUploaded?: () => void | Promise<void>
} = {}) {
  const api = useApi()

  const attachments = ref<ChatAttachment[]>([])
  const uploading = ref(false)

  let pollTimer: ReturnType<typeof setInterval> | null = null

  /** Still being uploaded or ingested — retrieval cannot see these yet. */
  const pending = computed(() =>
    attachments.value.some((a) => a.status === 'uploading' || a.status === 'queued' || a.status === 'processing'),
  )

  const ready = computed(() => attachments.value.filter((a) => a.status === 'ready'))

  function schedulePolling() {
    const needsPoll = attachments.value.some((a) => a.status === 'queued' || a.status === 'processing')

    if (needsPoll && pollTimer === null) {
      pollTimer = setInterval(pollStatuses, POLL_INTERVAL)
    } else if (!needsPoll && pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  async function pollStatuses() {
    const inFlight = attachments.value.filter(
      (a) => a.id !== null && (a.status === 'queued' || a.status === 'processing'),
    )

    await Promise.all(
      inFlight.map(async (attachment) => {
        try {
          const { data } = await api<{ data: UploadedDocument }>(`/documents/${attachment.id}`)
          attachment.status = data.status
          attachment.error = data.error_message

          if (data.status === 'failed') {
            toast.error(`"${attachment.name}" could not be processed`)
          }
        } catch {
          // Transient failure — leave the status alone and try again next tick.
        }
      }),
    )

    schedulePolling()
  }

  async function upload(file: File) {
    const attachment = reactive<ChatAttachment>({
      localId: crypto.randomUUID(),
      id: null,
      name: file.name,
      size: file.size,
      status: 'uploading',
      error: null,
    })
    attachments.value.push(attachment)

    const form = new FormData()
    form.append('file', file)

    const caseId = toValue(options.caseId ?? null)
    if (caseId) form.append('case_id', caseId)

    try {
      const { data } = await api<{ data: UploadedDocument }>('/documents', {
        method: 'POST',
        body: form,
      })
      attachment.id = data.id
      attachment.status = data.status
      attachment.error = data.error_message
    } catch (err: any) {
      const upgrade = upgradeMessage(err)
      attachments.value = attachments.value.filter((a) => a.localId !== attachment.localId)

      if (upgrade) {
        toast.error(`${upgrade}. Upgrade your plan to continue.`, {
          action: { label: 'Upgrade', onClick: () => navigateTo('/settings/billing') },
        })
      } else {
        toast.error(err?.data?.message ?? `"${file.name}" could not be uploaded`)
      }
    }
  }

  async function add(files: File[]) {
    if (files.length === 0) return

    uploading.value = true
    try {
      for (const file of files) {
        await upload(file)
      }
    } finally {
      uploading.value = false
      schedulePolling()
      await options.onUploaded?.()
    }
  }

  /**
   * Remove the chip and delete the document behind it. An attachment the user
   * takes back should not stay in their library — or keep being retrieved.
   */
  async function remove(localId: string) {
    const attachment = attachments.value.find((a) => a.localId === localId)
    if (!attachment) return

    attachments.value = attachments.value.filter((a) => a.localId !== localId)
    schedulePolling()

    if (!attachment.id) return

    try {
      await api(`/documents/${attachment.id}`, { method: 'DELETE' })
      await options.onUploaded?.()
    } catch {
      toast.error(`Could not remove "${attachment.name}"`)
    }
  }

  /**
   * Drop the chips after a send. The documents themselves stay in the user's
   * library and remain retrievable for the rest of the conversation.
   */
  function clear() {
    attachments.value = []
    schedulePolling()
  }

  /**
   * Hand the ready attachments to the message being sent and clear the chips.
   * Anything that failed is left behind — it has no text to retrieve.
   */
  function take(): ChatMessageAttachment[] {
    const sent: ChatMessageAttachment[] = ready.value
      .filter((a) => a.id !== null)
      .map((a) => ({
        id: a.id as string,
        title: a.name,
        original_filename: a.name,
        mime_type: null,
        status: 'ready',
      }))

    clear()

    return sent
  }

  onBeforeUnmount(() => {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  })

  return { attachments, uploading, pending, ready, add, remove, clear, take }
}
