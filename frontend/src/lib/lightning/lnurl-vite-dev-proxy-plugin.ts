import type { Plugin } from 'vite'
import { forwardLnurlProxyRequest } from './lnurl-proxy-forward'

const LNURL_PROXY_FETCH_PATH = '/api/lnurl/fetch'

export function lnurlViteDevProxyPlugin(): Plugin {
  return {
    name: 'lnurl-dev-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url ?? ''
        const pathname = requestUrl.split('?')[0] ?? ''
        if (pathname !== LNURL_PROXY_FETCH_PATH) {
          next()
          return
        }

        const parsed = new URL(requestUrl, 'http://localhost')
        const upstreamUrl = parsed.searchParams.get('url')
        if (upstreamUrl == null || upstreamUrl === '') {
          res.statusCode = 400
          res.end('Missing url')
          return
        }

        void forwardLnurlProxyRequest(req, res, upstreamUrl).catch(() => {
          if (!res.writableEnded) {
            res.statusCode = 500
            res.end('Proxy error')
          }
        })
      })
    },
  }
}
