/**
 * Build the authenticated API URL that serves an uploaded document's stored
 * file. `inline` renders in the browser (PDFs, images, plain text); `attachment`
 * forces a download. Auth is session-cookie based, so plain <a>/<img>/<iframe>
 * navigation to these URLs works on same-site origins.
 */
export function useDocumentFile() {
  const {
    public: { apiBase },
  } = useRuntimeConfig()

  function fileUrl(id: string, disposition: 'inline' | 'attachment' = 'inline') {
    return `${apiBase}/api/documents/${id}/file?disposition=${disposition}`
  }

  return { fileUrl }
}
