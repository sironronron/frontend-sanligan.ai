import { authHeaders } from '~/lib/http'

/**
 * Access to an uploaded document's stored file.
 *
 * The API authenticates a bearer token, not a cookie, so the browser cannot
 * reach these URLs on its own: `<iframe src>`, `<img src>`, and `<a download>`
 * send no Authorization header and would all get a 401. Every read therefore
 * goes through fetch() and is handed to the DOM as a `blob:` URL instead.
 */
export function useDocumentFile() {
  const {
    public: { apiBase },
  } = useRuntimeConfig()

  function endpoint(id: string, disposition: 'inline' | 'attachment') {
    return `${apiBase}/api/documents/${id}/file?disposition=${disposition}`
  }

  async function fetchBlob(id: string, disposition: 'inline' | 'attachment' = 'inline'): Promise<Blob> {
    const response = await fetch(endpoint(id, disposition), {
      headers: await authHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Could not load the file (HTTP ${response.status})`)
    }

    return response.blob()
  }

  /**
   * A `blob:` URL for the document, safe to bind to an iframe or img. The
   * caller owns it and must revoke it when the element goes away.
   */
  async function objectUrl(id: string, disposition: 'inline' | 'attachment' = 'inline'): Promise<string> {
    return URL.createObjectURL(await fetchBlob(id, disposition))
  }

  /** Download the file through a temporary anchor, since href alone cannot authenticate. */
  async function download(id: string, filename: string): Promise<void> {
    const url = await objectUrl(id, 'attachment')

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()

    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return { fetchBlob, objectUrl, download }
}
