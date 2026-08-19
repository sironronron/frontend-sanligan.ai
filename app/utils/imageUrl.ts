/** Image MIME type from a data URL, defaulting to PNG. */
export function imageMimeType(src: string): string {
  const match = /^data:image\/([a-z0-9.+-]+);/i.exec(src)
  return match?.[1]?.toLowerCase() ?? 'png'
}

/** docx ImageRun type for a data URL's MIME type. */
export function docxImageType(src: string): 'png' | 'jpg' | 'gif' | 'bmp' {
  const mime = imageMimeType(src)
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('bmp')) return 'bmp'
  return 'png'
}

/** Load an image from a data URL and report its natural dimensions. */
export function decodeImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Unable to decode that image.'))
    image.src = src
  })
}

/** Scale width/height (preserving aspect) to fit within the given box. */
export function fitWithin(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (width <= 0 || height <= 0) return { width: maxWidth, height: maxHeight }
  const scale = Math.min(maxWidth / width, maxHeight / height, 1)
  return {
    width: Math.max(Math.round(width * scale), 1),
    height: Math.max(Math.round(height * scale), 1),
  }
}

/** Read a data URL's payload into raw bytes (for docx). */
export function dataUrlToBytes(src: string): Uint8Array {
  const base64 = src.includes(',') ? (src.split(',')[1] ?? src) : src
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}