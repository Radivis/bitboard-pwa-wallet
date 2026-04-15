/** Keep user-visible error snippets bounded; full text may contain paths or noisy detail. */
const MAX_UI_ERROR_LENGTH = 320

/**
 * Produces a string safe to show in the UI (banners, inline errors) without leaking
 * local file paths, file URLs, or unbounded implementation detail.
 */
export function sanitizeErrorMessageForUi(raw: string): string {
  if (!raw) return ''

  let s = raw.replace(/\r\n/g, '\n').trim()

  s = s.replace(/file:\/\/[^\s<>'"`)]+/gi, '[file]')

  // Windows paths: C:\... or C:/...
  s = s.replace(/\b[A-Za-z]:(?:\\|\/)[^\s<>'"`)]+/g, '[path]')

  // Unix-style paths with at least one directory segment (/a/b).
  // (?<![:/]) avoids matching the "//" of "https://" as a path start.
  s = s.replace(/(?<![:/])\/(?:[^/\s]+\/)+[^/\s]+/g, '[path]')

  s = s.replace(/\s+/g, ' ').trim()

  if (s.length <= MAX_UI_ERROR_LENGTH) {
    return s
  }
  return `${s.slice(0, MAX_UI_ERROR_LENGTH - 1)}…`
}
