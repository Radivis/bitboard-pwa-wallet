/**
 * Operator paths that use Server-Sent Events (long-lived GET streams).
 * Keep in sync with ark-rest client (`get_event_stream`, `get_subscription`, txs stream).
 */
export const OPERATOR_SSE_UPSTREAM_PATHS = [
  'v1/batch/events',
  'v1/txs',
] as const

/** Prefix for per-subscription SSE streams opened after script subscribe. */
export const OPERATOR_SSE_SUBSCRIPTION_PATH_PREFIX = 'v1/script/subscription/'

const EVENT_STREAM_ACCEPT = 'text/event-stream'

function normalizeOperatorSubpath(operatorSubpath: string): string {
  return operatorSubpath.replace(/^\/+/, '').replace(/\/+$/, '')
}

function acceptsEventStream(acceptHeader: string | undefined): boolean {
  if (acceptHeader == null || acceptHeader === '') {
    return false
  }
  return acceptHeader.toLowerCase().includes(EVENT_STREAM_ACCEPT)
}

function isOperatorSseUpstreamPath(normalizedSubpath: string): boolean {
  if (
    OPERATOR_SSE_UPSTREAM_PATHS.some(
      (ssePath) =>
        normalizedSubpath === ssePath ||
        normalizedSubpath.startsWith(`${ssePath}/`),
    )
  ) {
    return true
  }
  return normalizedSubpath.startsWith(OPERATOR_SSE_SUBSCRIPTION_PATH_PREFIX)
}

/**
 * True when the proxied operator request should use the SSE stream branch
 * (GET + Accept: text/event-stream on a known streaming path).
 */
export function isOperatorServerSentEventsRequest(
  method: string,
  operatorSubpath: string,
  acceptHeader: string | undefined,
): boolean {
  if (method.toUpperCase() !== 'GET') {
    return false
  }
  if (!acceptsEventStream(acceptHeader)) {
    return false
  }
  return isOperatorSseUpstreamPath(normalizeOperatorSubpath(operatorSubpath))
}
