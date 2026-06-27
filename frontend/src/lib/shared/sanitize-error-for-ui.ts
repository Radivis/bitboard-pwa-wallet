/** Keep user-visible error snippets bounded; full text may contain paths or noisy detail. */
const MAX_UI_ERROR_LENGTH = 320

/**
 * `ark_grpc` wraps `ark_rest::Error` as `request failed: {source}` while REST also
 * displays `request failed`, producing a redundant chain segment in operator errors.
 */
const REDUNDANT_ARK_REQUEST_FAILED_CHAIN = 'request failed: request failed'

function collapseRedundantArkOperatorErrorSegments(message: string): string {
  if (!message.includes(REDUNDANT_ARK_REQUEST_FAILED_CHAIN)) {
    return message
  }
  return message.replaceAll(REDUNDANT_ARK_REQUEST_FAILED_CHAIN, 'request failed')
}

/**
 * Produces a string safe to show in the UI (banners, inline errors) without leaking
 * local file paths, file URLs, `http(s)` endpoints (e.g. custom Esplora hosts), or
 * unbounded implementation detail.
 */
export function sanitizeErrorMessageForUi(raw: string): string {
  if (!raw) return ''

  let normalizedMessage = raw.replace(/\r\n/g, '\n').trim()

  normalizedMessage = normalizedMessage.replace(/file:\/\/[^\s<>'"`)]+/gi, '[file]')
  normalizedMessage = normalizedMessage.replace(/https?:\/\/[^\s<>'"`)]+/gi, '[url]')

  // Windows paths: C:\... or C:/...
  normalizedMessage = normalizedMessage.replace(/\b[A-Za-z]:(?:\\|\/)[^\s<>'"`)]+/g, '[path]')

  // Unix-style paths with at least one directory segment (/a/b).
  // (?<![:/]) avoids matching the "//" of "https://" as a path start.
  normalizedMessage = normalizedMessage.replace(/(?<![:/])\/(?:[^/\s]+\/)+[^/\s]+/g, '[path]')

  normalizedMessage = normalizedMessage.replace(/\s+/g, ' ').trim()
  normalizedMessage = collapseRedundantArkOperatorErrorSegments(normalizedMessage)

  if (normalizedMessage.length <= MAX_UI_ERROR_LENGTH) {
    return normalizedMessage
  }
  return `${normalizedMessage.slice(0, MAX_UI_ERROR_LENGTH - 1)}…`
}
