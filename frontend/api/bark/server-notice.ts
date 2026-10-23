/**
 * Reads the Bark server's handshake public notice over native gRPC.
 * The browser's gRPC-Web call cannot see that message when the web gateway
 * fails the request before a readable response.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { barkServerNoticeHttpResult } from './server-notice-http'

export const config = {
  maxDuration: 10,
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  const result = await barkServerNoticeHttpResult(req.method, req.query.network)
  if (result.status === 204) {
    res.status(204).end()
    return
  }
  if (result.status === 405) {
    res.status(405).end(result.body)
    return
  }
  res.status(result.status).json(result.json)
}
