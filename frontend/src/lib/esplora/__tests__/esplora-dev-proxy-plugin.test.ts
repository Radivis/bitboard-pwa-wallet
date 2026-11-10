import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
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
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
