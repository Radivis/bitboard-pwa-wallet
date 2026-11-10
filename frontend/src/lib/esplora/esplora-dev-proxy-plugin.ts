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

/** Hung TCP only. A live Mempool history response often takes longer than this to send its body. */
const PRIMARY_CONNECT_TIMEOUT_MS = 2_000
/** After a preferred host that never connects, stay on the mirror so the scan does not pay the connect timeout per request. */
const UNREACHABLE_COOLDOWN_MS = 60_000
/** Body budget after TCP connect. Stays under the WASM full-scan request timeout. */
const RESPONSE_TIMEOUT_MS = 25_000
const MAX_POST_BODY_BYTES = 512_000

const PREFERRED_HOST_DOWN_CODES = new Set([
  'ESPLORA_CONNECT_TIMEOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ETIMEDOUT',
])

const skipPreferredHostUntilMs = new Map<string, number>()

/** Connect failure or DNS/refusal. A slow body after TCP connect is not a dead host. */
export function isEsploraPreferredHostDownError(error: unknown): boolean {
  if (typeof error !== 'object' || error == null || !('code' in error)) return false
  const code = error.code
  return typeof code === 'string' && PREFERRED_HOST_DOWN_CODES.has(code)
}

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

function errorWithCode(message: string, code: string): Error {
  const error = new Error(message)
  Object.assign(error, { code })
  return error
}

export function requestUpstream(
  targetUrl: string,
  method: string,
  headers: Record<string, string>,
  body: Buffer | null,
): Promise<UpstreamResponse> {
  const parsedTarget = new URL(targetUrl)
  const transport = parsedTarget.protocol === 'http:' ? httpRequest : httpsRequest
  return new Promise((resolve, reject) => {
    let settled = false
    let responseTimeoutArmed = false
    let connectTimer: ReturnType<typeof setTimeout> | undefined
    let responseTimer: ReturnType<typeof setTimeout> | undefined

    const clearTimers = () => {
      clearTimeout(connectTimer)
      clearTimeout(responseTimer)
    }
    const finishReject = (error: unknown) => {
      if (settled) return
      settled = true
      clearTimers()
      reject(error)
    }
    const finishResolve = (value: UpstreamResponse) => {
      if (settled) return
      settled = true
      clearTimers()
      resolve(value)
    }
    const armResponseTimeout = () => {
      if (responseTimeoutArmed || settled) return
      responseTimeoutArmed = true
      clearTimeout(connectTimer)
      responseTimer = setTimeout(() => {
        upstreamRequest.destroy(
          errorWithCode('Esplora upstream timed out', 'ESPLORA_RESPONSE_TIMEOUT'),
        )
      }, RESPONSE_TIMEOUT_MS)
    }
    const watchSocket = (socket: NodeJS.Socket) => {
      if (socket.connecting) {
        socket.once('connect', armResponseTimeout)
        return
      }
      armResponseTimeout()
    }

    const upstreamRequest = transport(parsedTarget, { method, headers }, (upstreamResponse) => {
      armResponseTimeout()
      const chunks: Buffer[] = []
      upstreamResponse.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      upstreamResponse.on('end', () => {
        const contentTypeHeader = upstreamResponse.headers['content-type']
        finishResolve({
          statusCode: upstreamResponse.statusCode ?? 502,
          contentType: typeof contentTypeHeader === 'string' ? contentTypeHeader : null,
          body: Buffer.concat(chunks),
        })
      })
      upstreamResponse.on('error', finishReject)
    })

    connectTimer = setTimeout(() => {
      upstreamRequest.destroy(
        errorWithCode('Esplora upstream connect timed out', 'ESPLORA_CONNECT_TIMEOUT'),
      )
    }, PRIMARY_CONNECT_TIMEOUT_MS)
    upstreamRequest.on('socket', watchSocket)
    if (upstreamRequest.socket != null) {
      watchSocket(upstreamRequest.socket)
    }
    upstreamRequest.on('error', finishReject)
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
    return requestUpstream(fallbackUrl, method, headers, body)
  }

  try {
    const preferredResponse = await requestUpstream(preferredUrl, method, headers, body)
    if (!isEsploraUpstreamFailoverStatus(preferredResponse.statusCode)) {
      return preferredResponse
    }
    const fallbackResponse = await requestUpstream(fallbackUrl, method, headers, body)
    if (fallbackResponse.statusCode === 429) {
      return preferredResponse
    }
    markPreferredHostUnreachable(route.preferredBase)
    return fallbackResponse
  } catch (error) {
    // A body timeout means Mempool accepted the connection. Falling over to
    // Blockstream for the rest of the scan trips its hourly cap (HTTP 429).
    if (!isEsploraPreferredHostDownError(error)) {
      throw error
    }
  }

  const fallbackResponse = await requestUpstream(fallbackUrl, method, headers, body)
  if (fallbackResponse.statusCode !== 429) {
    markPreferredHostUnreachable(route.preferredBase)
  }
  return fallbackResponse
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
