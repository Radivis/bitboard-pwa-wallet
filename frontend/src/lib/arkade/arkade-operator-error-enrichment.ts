/**
 * Appends short, actionable hints for known Ark operator / preview-proxy failure
 * patterns. Runs before {@link sanitizeErrorMessageForUi} (privacy + length cap).
 */
export function enrichArkadeOperatorErrorMessage(message: string): string {
  if (!message) return message

  const lower = message.toLowerCase()

  if (
    (message.includes('FUNCTION_INVOCATION_FAILED') ||
      message.includes('FUNCTION_INVOCATION_TIMEOUT')) &&
    (lower.includes('batch') ||
      lower.includes('join batch') ||
      lower.includes('event stream'))
  ) {
    return `${message} — Preview proxy failed during batch event stream (SSE).`
  }

  if (
    message.includes('DIGEST_MISMATCH') ||
    message.includes('BUILD_VERSION_TOO_OLD')
  ) {
    return `${message} — Refresh your Ark session or update the app, then retry.`
  }

  if (
    lower.includes('duplicated input') ||
    lower.includes('missing forfeit tx')
  ) {
    return `${message} — Known batch wedge: do not retry blindly; wait for operator batch to clear.`
  }

  return message
}
