/** Keep user-visible error snippets bounded; full text may contain paths or noisy detail. */
const MAX_UI_ERROR_LENGTH = 320

/**
 * `ark_grpc` wraps `ark_rest::Error` as `request failed: {source}` while REST also
 * displays `request failed`, producing a redundant chain segment in operator errors.
 */
const REDUNDANT_ARK_REQUEST_FAILED_CHAIN = 'request failed: request failed'

/** Short copy when WASM Esplora GET dies as browser `Failed to fetch` / reqwest timeout. */
export const BLOCKCHAIN_EXPLORER_UNREACHABLE_UI_MESSAGE =
  'Could not reach the Bitcoin explorer. This is usually temporary.'

function collapseRedundantArkOperatorErrorSegments(message: string): string {
  if (!message.includes(REDUNDANT_ARK_REQUEST_FAILED_CHAIN)) {
    return message
  }
  return message.replaceAll(REDUNDANT_ARK_REQUEST_FAILED_CHAIN, 'request failed')
}

/** Raw WASM/reqwest transport dump from Esplora, not a structured Ark error payload. */
export function isRawBlockchainFetchFailureMessage(message: string): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  const looksLikeReqwestDump =
    lower.includes('reqwest') ||
    lower.includes('jsvalue') ||
    lower.includes('__wbg_fetch')
  if (!looksLikeReqwestDump) {
    return false
  }
  return (
    lower.includes('failed to fetch') ||
    lower.includes('timedout') ||
    lower.includes('timed out') ||
    lower.includes('kind: request')
  )
}

/** Replace reqwest/WASM fetch dumps with short explorer-unreachable copy (ARK-EXIT-34). */
export function replaceRawBlockchainFetchErrorMessage(message: string): string {
  if (!isRawBlockchainFetchFailureMessage(message)) {
    return message
  }
  return BLOCKCHAIN_EXPLORER_UNREACHABLE_UI_MESSAGE
}

/**
 * Produces a string safe to show in the UI (banners, inline errors) without leaking
 * local file paths, file URLs, `http(s)` endpoints (e.g. custom Esplora hosts), or
 * unbounded implementation detail.
 */
export function sanitizeErrorMessageForUi(raw: string): string {
  if (!raw) return ''

  const explorerReplaced = replaceRawBlockchainFetchErrorMessage(raw)
  let normalizedMessage = explorerReplaced.replace(/\r\n/g, '\n').trim()

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
