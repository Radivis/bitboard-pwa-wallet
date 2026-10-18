import type { Plugin } from 'vite'
import {
  BARK_PUBLIC_SERVER_ORIGINS,
  readBarkHandshakePublicNotice,
  type BarkPublicServerNetwork,
} from '../../../api/bark/read-handshake-psa'

export const BARK_SERVER_NOTICE_PATH = '/api/bark/server-notice'

function publicServerNetwork(value: string | null): BarkPublicServerNetwork | null {
  if (value === 'signet' || value === 'mainnet') return value
  return null
}

/** Dev-server route for the Bark handshake public notice. Production uses `api/bark/server-notice.ts`. */
export function barkServerNoticeVitePlugin(): Plugin {
  return {
    name: 'bark-server-notice',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url ?? ''
        const pathname = requestUrl.split('?')[0] ?? ''
        if (pathname !== BARK_SERVER_NOTICE_PATH) {
          next()
          return
        }
        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        const network = publicServerNetwork(new URL(requestUrl, 'http://localhost').searchParams.get('network'))
        if (network == null) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ psa: null }))
          return
        }
        void readBarkHandshakePublicNotice(BARK_PUBLIC_SERVER_ORIGINS[network])
          .then((psa) => {
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.setHeader('cache-control', 'no-store')
            res.end(JSON.stringify({ psa }))
          })
          .catch(() => {
            if (!res.writableEnded) {
              res.statusCode = 200
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ psa: null }))
            }
          })
      })
    },
  }
}
