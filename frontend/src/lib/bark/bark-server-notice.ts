import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import {
  LIFECYCLE_SYNC_ERROR_FALLBACK,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'
import type { NetworkMode } from '@/stores/walletStore'
import { BARK_SERVER_NOTICE_PATH } from '@/lib/bark/bark-server-notice-path'

export { BARK_SERVER_NOTICE_PATH }

type BarkPublicNoticeNetwork = 'signet' | 'mainnet'

/** True when the browser lost the handshake before any server status was readable. */
export function barkSyncFailureShouldReadServerNotice(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('failed to fetch') || lower.includes('handshake request failed')
}

function barkPublicNoticeNetwork(networkMode: NetworkMode): BarkPublicNoticeNetwork | null {
  if (networkMode === 'signet' || networkMode === 'mainnet') return networkMode
  return null
}

export async function fetchBarkServerPublicNotice(
  network: BarkPublicNoticeNetwork,
): Promise<string | null> {
  const response = await fetch(`${BARK_SERVER_NOTICE_PATH}?network=${network}`, {
    cache: 'no-store',
  })
  if (!response.ok) return null
  const body = (await response.json()) as { psa?: unknown }
  if (typeof body.psa !== 'string') return null
  const notice = sanitizeErrorMessageForUi(body.psa.trim())
  return notice.length > 0 ? notice : null
}

/**
 * When the gRPC-Web handshake fails in the browser, replace that transport error
 * with the server's handshake public notice if the same-origin reader can see it.
 */
export async function barkSyncErrorMessageWithServerNotice(
  networkMode: NetworkMode,
  error: unknown,
): Promise<string> {
  const fallback = userFacingLifecycleErrorMessage(error, LIFECYCLE_SYNC_ERROR_FALLBACK)
  const network = barkPublicNoticeNetwork(networkMode)
  const raw = error instanceof Error ? error.message : String(error)
  if (network == null || !barkSyncFailureShouldReadServerNotice(raw)) {
    return fallback
  }
  try {
    const notice = await fetchBarkServerPublicNotice(network)
    return notice ?? fallback
  } catch {
    return fallback
  }
}
