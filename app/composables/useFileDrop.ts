export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tiff', '.heic']

/**
 * Shared drag-and-drop state for file upload dropzones. Tracks whether a file
 * drag is currently over the zone (with enter/leave depth counting so nested
 * children don't flicker the highlight) and filters dropped files against an
 * allow-list of extensions before handing them to the caller.
 */
export function useFileDrop(accept: string[] = ['.pdf', '.docx', '.txt', '.md', ...IMAGE_EXTENSIONS]) {
  const dragging = ref(false)
  let depth = 0

  function preventDefault(event: DragEvent) {
    event.preventDefault()
  }

  onMounted(() => {
    window.addEventListener('dragover', preventDefault)
    window.addEventListener('drop', preventDefault)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('dragover', preventDefault)
    window.removeEventListener('drop', preventDefault)
  })

  function matchesAccept(file: File): boolean {
    if (accept.length === 0) return true

    const dot = file.name.lastIndexOf('.')
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''

    if (accept.includes(ext)) return true

    const mime = file.type.toLowerCase()

    // Accept any image whose MIME type we recognize even when the filename
    // lacks a usable extension (e.g. HEIC photos).
    if (mime.startsWith('image/') && accept.some((rule) => IMAGE_EXTENSIONS.includes(rule))) return true

    return accept.some((rule) => {
      if (rule === '.pdf' && (mime === 'application/pdf' || ext === '.pdf')) return true
      if (rule === '.txt' && (mime === 'text/plain' || ext === '.txt')) return true
      if (rule === '.md' && (mime.includes('markdown') || ext === '.md')) return true
      if (rule === '.docx' && (mime.includes('word') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx')) return true
      return false
    })
  }

  function isFileDrag(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files')
  }

  function onDragEnter(event: DragEvent) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    depth++
    dragging.value = true
  }

  function onDragOver(event: DragEvent) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave(event: DragEvent) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    depth = Math.max(0, depth - 1)
    if (depth === 0) dragging.value = false
  }

  function onDrop(event: DragEvent, onFiles: (files: File[]) => void): File[] {
    event.preventDefault()
    depth = 0
    dragging.value = false

    const dropped = Array.from(event.dataTransfer?.files ?? [])
    const valid = dropped.filter(matchesAccept)

    if (valid.length > 0) {
      onFiles(valid)
    }

    return dropped.filter((file) => !valid.includes(file))
  }

  function reset() {
    depth = 0
    dragging.value = false
  }

  return {
    dragging,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    reset,
  }
}
