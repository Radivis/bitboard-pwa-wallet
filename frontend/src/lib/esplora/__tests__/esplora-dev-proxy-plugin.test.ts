import { createServer, type Server } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  fetchWithMirrorFallback,
  isEsploraPreferredHostDownError,
  requestUpstream,
} from '@/lib/esplora/esplora-dev-proxy-plugin'

describe('isEsploraPreferredHostDownError', () => {
  it('treats connect failures as a dead preferred host', () => {
    expect(
      isEsploraPreferredHostDownError(
        Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
      ),
    ).toBe(true)
    expect(
      isEsploraPreferredHostDownError(
        Object.assign(new Error('connect'), { code: 'ESPLORA_CONNECT_TIMEOUT' }),
      ),
    ).toBe(true)
  })

  it('keeps a slow response on the preferred host', () => {
    expect(
      isEsploraPreferredHostDownError(
        Object.assign(new Error('body'), { code: 'ESPLORA_RESPONSE_TIMEOUT' }),
      ),
    ).toBe(false)
  })
})

describe('requestUpstream', () => {
  it('waits out a body that arrives after the connect budget', async () => {
    const server = createServer((_request, response) => {
      setTimeout(() => {
        response.statusCode = 200
        response.end('slow-body')
      }, 2_500)
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    const port = typeof address === 'object' && address != null ? address.port : 0

    try {
      const upstream = await requestUpstream(
        `http://127.0.0.1:${port}/blocks/tip/height`,
        'GET',
        {},
        null,
      )
      expect(upstream.statusCode).toBe(200)
      expect(upstream.body.toString()).toBe('slow-body')
    } finally {
      await closeServer(server)
    }
  })
})

function listenOnLocalhost(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address != null ? address.port : 0)
    })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

describe('fetchWithMirrorFallback', () => {
  it('returns the preferred body when the mirror answers 429 and does not mark the host down', async () => {
    let preferredHits = 0
    const preferred = createServer((_request, response) => {
      preferredHits += 1
      if (preferredHits === 1) {
        response.statusCode = 502
        response.end('preferred-down')
        return
      }
      response.statusCode = 200
      response.end('preferred-ok')
    })
    const fallback = createServer((_request, response) => {
      response.statusCode = 429
      response.end('rate-limited')
    })
    const preferredPort = await listenOnLocalhost(preferred)
    const fallbackPort = await listenOnLocalhost(fallback)
    const route = {
      preferredBase: `http://127.0.0.1:${preferredPort}`,
      fallbackBase: `http://127.0.0.1:${fallbackPort}`,
      esploraSubpath: 'blocks/tip/height',
      search: '',
    }

    try {
      const rateLimitedMirror = await fetchWithMirrorFallback(route, 'GET', {}, null)
      expect(rateLimitedMirror.statusCode).toBe(502)
      expect(rateLimitedMirror.body.toString()).toBe('preferred-down')

      const stillOnPreferred = await fetchWithMirrorFallback(route, 'GET', {}, null)
      expect(stillOnPreferred.statusCode).toBe(200)
      expect(stillOnPreferred.body.toString()).toBe('preferred-ok')
      expect(preferredHits).toBe(2)
    } finally {
      await closeServer(preferred)
      await closeServer(fallback)
    }
  })
})
