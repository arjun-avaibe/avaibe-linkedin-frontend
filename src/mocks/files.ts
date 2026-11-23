/**
 * Mock mode only: files "uploaded" to a draft (images, carousel PDFs, videos) are kept in memory as blob URLs,
 * so <img src> and "open the current file" links work without a backend. After a reload they are gone,
 * and a neutral placeholder picture is shown instead.
 *
 * Kept separate from the rest of the mock backend (and free of imports) because api.ts needs it synchronously.
 */
const urls = new Map<string, string>()

export function setMockFile(kind: 'image' | 'media', id: number, file: File) {
  const key = `${kind}:${id}`
  const old = urls.get(key)
  if (old) URL.revokeObjectURL(old)
  urls.set(key, URL.createObjectURL(file))
}

export function clearMockFile(kind: 'image' | 'media', id: number) {
  const key = `${kind}:${id}`
  const old = urls.get(key)
  if (old) URL.revokeObjectURL(old)
  urls.delete(key)
}

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5dfc"/><stop offset="1" stop-color="#22c1c3"/></linearGradient></defs>
      <rect width="1200" height="1200" fill="url(#g)"/>
      <text x="600" y="610" font-family="sans-serif" font-size="64" fill="#fff" text-anchor="middle" opacity="0.9">Sample image</text>
    </svg>`,
  )

export function mockFileUrl(kind: 'image' | 'media', id: number): string {
  return urls.get(`${kind}:${id}`) ?? PLACEHOLDER
}
