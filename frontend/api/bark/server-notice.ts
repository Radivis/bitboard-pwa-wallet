/**
 * Reads the Bark server's handshake public notice over native gRPC.
 * The browser's gRPC-Web call cannot see that message when the web gateway
 * fails the request before a readable response.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  BARK_PUBLIC_SERVER_ORIGINS,
  readBarkHandshakePublicNotice,
  type BarkPublicServerNetwork,
} from './read-handshake-psa'

export const config = {
  maxDuration: 10,
}

function publicServerNetwork(value: unknown): BarkPublicServerNetwork | null {
  if (value === 'signet' || value === 'mainnet') return value
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).end('Method not allowed')
    return
  }
  const network = publicServerNetwork(req.query.network)
  if (network == null) {
    res.status(400).json({ psa: null })
    return
  }
  const psa = await readBarkHandshakePublicNotice(BARK_PUBLIC_SERVER_ORIGINS[network])
  res.status(200).json({ psa })
}
