import type { ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
  barkServerNoticeHttpResult,
  type BarkServerNoticeHttpResult,
} from '../../../api/bark/server-notice-http'
import { BARK_SERVER_NOTICE_PATH } from './bark-server-notice-path'

export { BARK_SERVER_NOTICE_PATH }

function writeServerNoticeResult(res: ServerResponse, result: BarkServerNoticeHttpResult): void {
  if (result.status === 204) {
    res.statusCode = 204
    res.end()
    return
  }
  if (result.status === 405) {
    res.statusCode = 405
    res.end(result.body)
    return
  }
  res.statusCode = result.status
  res.setHeader('content-type', 'application/json')
  if (result.status === 200) {
    res.setHeader('cache-control', 'no-store')
  }
  res.end(JSON.stringify(result.json))
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
        const networkQuery = new URL(requestUrl, 'http://localhost').searchParams.get('network')
        void barkServerNoticeHttpResult(req.method, networkQuery)
          .then((result) => {
            if (!res.writableEnded) writeServerNoticeResult(res, result)
          })
          .catch(() => {
            if (!res.writableEnded) {
              writeServerNoticeResult(res, { status: 200, json: { psa: null } })
            }
          })
      })
    },
  }
}
