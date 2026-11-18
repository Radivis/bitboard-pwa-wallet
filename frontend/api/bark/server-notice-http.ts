import { BARK_SERVER_NOTICE_PATH } from '../../src/lib/bark/bark-server-notice-path.ts'
import {
  BARK_PUBLIC_SERVER_ORIGINS,
  readBarkHandshakePublicNotice,
  type BarkPublicServerNetwork,
} from './read-handshake-psa.ts'

export { BARK_SERVER_NOTICE_PATH }

export type BarkServerNoticeHttpResult =
  | { status: 204 }
  | { status: 405; body: string }
  | { status: 400; json: { psa: null } }
  | { status: 200; json: { psa: string | null } }

function publicServerNetwork(value: unknown): BarkPublicServerNetwork | null {
  if (value === 'signet' || value === 'mainnet') return value
  return null
}

/**
 * Method and network query in, status and body out.
 * A handshake failure is an empty notice, not an error status.
 */
export async function barkServerNoticeHttpResult(
  method: string | undefined,
  networkQuery: unknown,
): Promise<BarkServerNoticeHttpResult> {
  if (method === 'OPTIONS') return { status: 204 }
  if (method !== 'GET') return { status: 405, body: 'Method not allowed' }
  const network = publicServerNetwork(networkQuery)
  if (network == null) return { status: 400, json: { psa: null } }
  try {
    const psa = await readBarkHandshakePublicNotice(BARK_PUBLIC_SERVER_ORIGINS[network])
    return { status: 200, json: { psa } }
  } catch {
    return { status: 200, json: { psa: null } }
  }
}
