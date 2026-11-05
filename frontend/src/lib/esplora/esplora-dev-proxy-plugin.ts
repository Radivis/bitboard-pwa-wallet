import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Plugin } from 'vite'
import { isProxiedUrlPathWithinAllowlistedBase } from '../shared/validate-proxied-upstream-url'
import {
  ESPLORA_SAME_ORIGIN_PROXY_PREFIX,
  esploraFallbackUpstreamBase,
  getUpstreamBaseForEsploraProxy,
  isEsploraUpstreamFailoverStatus,
} from './esplora-service-whitelist'

/** Enough to notice a hung TCP connect without eating the WASM full-scan budget on every call. */
const PRIMARY_CONNECT_TIMEOUT_MS = 2_000
/** After a failed preferred host, stay on the mirror so a scan does not pay the connect timeout per request. */
const UNREACHABLE_COOLDOWN_MS = 60_000
const FALLBACK_REQUEST_TIMEOUT_MS = 25_000
const MAX_POST_BODY_BYTES = 512_000

const skipPreferredHostUntilMs = new Map<string, number>()
/** A preferred host that already answered can use the long timeout. The first probe stays short. */
const preferredHostHasAnswered = new Set<string>()

type UpstreamResponse = {
  statusCode: number
  contentType: string | null
  body: Buffer
}

function preferredHostIsOnCooldown(preferredBase: string, nowMs: number): boolean {
  return (skipPreferredHostUntilMs.get(preferredBase) ?? 0) > nowMs
}

function markPreferredHostUnreachable(preferredBase: string): void {
  skipPreferredHostUntilMs.set(preferredBase, Date.now() + UNREACHABLE_COOLDOWN_MS)
}

function upstreamUrlForBase(base: string, esploraSubpath: string, search: string): string | null {
  const baseTrimmed = base.replace(/\/$/, '')
  const pathSuffix = esploraSubpath.length > 0 ? `/${esploraSubpath}` : ''
  const upstreamUrl = `${baseTrimmed}${pathSuffix}${search}`
  if (!isProxiedUrlPathWithinAllowlistedBase(upstreamUrl, baseTrimmed)) return null
  return upstreamUrl
}

/**
 * Default-provider requests that have a Blockstream mirror.
 * Regtest and Mutinynet stay on the plain Vite proxy.
 */
function defaultProviderRequestWithFallback(
  requestUrl: string,
): { preferredBase: string; fallbackBase: string; esploraSubpath: string; search: string } | null {
  const parsedUrl = new URL(requestUrl, 'http://127.0.0.1')
  const prefix = `${ESPLORA_SAME_ORIGIN_PROXY_PREFIX}/`
  if (!parsedUrl.pathname.startsWith(prefix)) return null
  const segments = parsedUrl.pathname.slice(prefix.length).split('/').filter(Boolean)
  if (segments.length < 2) return null
  if (segments.some((segment) => segment === '.' || segment === '..')) return null
  const providerId = segments[0] ?? ''
  const network = segments[1] ?? ''
  if (providerId !== 'default') return null
  const preferredBase = getUpstreamBaseForEsploraProxy(providerId, network)
  const fallbackBase = esploraFallbackUpstreamBase(providerId, network)
  if (preferredBase == null || fallbackBase == null) return null
  return {
    preferredBase,
    fallbackBase,
    esploraSubpath: segments.slice(2).join('/'),
    search: parsedUrl.search,
  }
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function requestUpstream(
  targetUrl: string,
  method: string,
  headers: Record<string, string>,
  body: Buffer | null,
  timeoutMs: number,
): Promise<UpstreamResponse> {
  const parsedTarget = new URL(targetUrl)
  const transport = parsedTarget.protocol === 'http:' ? httpRequest : httpsRequest
  return new Promise((resolve, reject) => {
    const upstreamRequest = transport(
      parsedTarget,
      { method, headers, timeout: timeoutMs },
      (upstreamResponse) => {
        const chunks: Buffer[] = []
        upstreamResponse.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })
        upstreamResponse.on('end', () => {
          const contentTypeHeader = upstreamResponse.headers['content-type']
          resolve({
            statusCode: upstreamResponse.statusCode ?? 502,
            contentType: typeof contentTypeHeader === 'string' ? contentTypeHeader : null,
            body: Buffer.concat(chunks),
          })
        })
        upstreamResponse.on('error', reject)
      },
    )
    upstreamRequest.on('timeout', () => {
      upstreamRequest.destroy(new Error('Esplora upstream timed out'))
    })
    upstreamRequest.on('error', reject)
    if (body != null && body.byteLength > 0) {
      upstreamRequest.write(body)
    }
    upstreamRequest.end()
  })
}

function writeUpstreamResponse(res: ServerResponse, upstream: UpstreamResponse): void {
  res.statusCode = upstream.statusCode
  if (upstream.contentType != null) {
    res.setHeader('content-type', upstream.contentType)
  }
  res.end(upstream.body)
}

async function fetchWithMirrorFallback(
  route: { preferredBase: string; fallbackBase: string; esploraSubpath: string; search: string },
  method: string,
  headers: Record<string, string>,
  body: Buffer | null,
): Promise<UpstreamResponse> {
  const fallbackUrl = upstreamUrlForBase(route.fallbackBase, route.esploraSubpath, route.search)
  const preferredUrl = upstreamUrlForBase(route.preferredBase, route.esploraSubpath, route.search)
  if (fallbackUrl == null || preferredUrl == null) {
    throw new Error('Esplora upstream path escaped the allowlisted base')
  }

  if (preferredHostIsOnCooldown(route.preferredBase, Date.now())) {
    return requestUpstream(fallbackUrl, method, headers, body, FALLBACK_REQUEST_TIMEOUT_MS)
  }

  const preferredTimeoutMs = preferredHostHasAnswered.has(route.preferredBase)
    ? FALLBACK_REQUEST_TIMEOUT_MS
    : PRIMARY_CONNECT_TIMEOUT_MS

  try {
    const preferredResponse = await requestUpstream(
      preferredUrl,
      method,
      headers,
      body,
      preferredTimeoutMs,
    )
    if (!isEsploraUpstreamFailoverStatus(preferredResponse.statusCode)) {
      preferredHostHasAnswered.add(route.preferredBase)
      return preferredResponse
    }
  } catch {
    preferredHostHasAnswered.delete(route.preferredBase)
    // Preferred host did not connect. The mirror answers the same chain.
  }

  markPreferredHostUnreachable(route.preferredBase)
  preferredHostHasAnswered.delete(route.preferredBase)
  return requestUpstream(fallbackUrl, method, headers, body, FALLBACK_REQUEST_TIMEOUT_MS)
}

/**
 * Dev-server proxy for `/api/esplora/default/{mainnet,testnet,signet}`.
 * Installed before Vite's HTTP proxy so a dead Mempool connect falls over to Blockstream
 * instead of surfacing as "Could not reach the Bitcoin explorer".
 */
export function esploraDevProxyPlugin(): Plugin {
  return {
    name: 'esplora-dev-proxy-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const route = defaultProviderRequestWithFallback(req.url ?? '')
        if (route == null) {
          next()
          return
        }
        const method = (req.method ?? 'GET').toUpperCase()
        if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        void (async () => {
          const headers: Record<string, string> = {}
          const accept = req.headers.accept
          if (typeof accept === 'string') headers.accept = accept
          const contentType = req.headers['content-type']
          if (typeof contentType === 'string') headers['content-type'] = contentType

          let body: Buffer | null = null
          if (method === 'POST') {
            body = await readRequestBody(req)
            if (body.byteLength > MAX_POST_BODY_BYTES) {
              res.statusCode = 413
              res.end('Payload too large')
              return
            }
          }

          const upstream = await fetchWithMirrorFallback(route, method, headers, body)
          if (!res.writableEnded) {
            writeUpstreamResponse(res, upstream)
          }
        })().catch(() => {
          if (!res.writableEnded) {
            res.statusCode = 502
            res.end('Upstream unreachable')
          }
        })
      })
    },
  }
}
