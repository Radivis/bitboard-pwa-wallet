import { describe, expect, it } from 'vitest'
import {
  esploraPathAfterProxyPrefix,
  handleE2eArkadeEsploraMockRequest,
} from '@/lib/arkade/e2e/arkade-esplora-mock-handler'

describe('arkade esplora mock', () => {
  it('strips provider/network prefix from same-origin Esplora URLs', () => {
    expect(
      esploraPathAfterProxyPrefix('/api/esplora/default/signet/blocks/tip/hash'),
    ).toBe('/blocks/tip/hash')
    expect(
      esploraPathAfterProxyPrefix(
        '/api/esplora/default/testnet/address/tb1qexample/txs',
      ),
    ).toBe('/address/tb1qexample/txs')
    expect(esploraPathAfterProxyPrefix('/api/arkade/operator/signet/v1/info')).toBeNull()
  })

  it('returns the Testnet4 genesis hash as the empty-chain tip', () => {
    const chunks: Buffer[] = []
    const res = {
      statusCode: 0,
      setHeader() {},
      end(body?: unknown) {
        if (typeof body === 'string') {
          chunks.push(Buffer.from(body))
        }
      },
    }
    handleE2eArkadeEsploraMockRequest(
      { method: 'GET' } as never,
      res as never,
      '/api/esplora/default/testnet/blocks/tip/hash',
    )
    expect(Buffer.concat(chunks).toString('utf8')).toBe(
      '00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043',
    )
  })

  it('returns an empty JSON list for address history so full scan can finish', () => {
    const chunks: Buffer[] = []
    const res = {
      statusCode: 0,
      setHeader() {},
      end(body?: unknown) {
        if (typeof body === 'string') {
          chunks.push(Buffer.from(body))
        }
      },
    }
    const handled = handleE2eArkadeEsploraMockRequest(
      { method: 'GET' } as never,
      res as never,
      '/api/esplora/default/signet/address/tb1qexample/txs',
    )
    expect(handled).toBe(true)
    expect(JSON.parse(Buffer.concat(chunks).toString('utf8'))).toEqual([])
  })

  it('returns a non-empty /blocks list so esplora-client does not treat the chain as invalid', () => {
    const chunks: Buffer[] = []
    const res = {
      statusCode: 0,
      setHeader() {},
      end(body?: unknown) {
        if (typeof body === 'string') {
          chunks.push(Buffer.from(body))
        }
      },
    }
    handleE2eArkadeEsploraMockRequest(
      { method: 'GET' } as never,
      res as never,
      '/api/esplora/default/testnet/blocks',
    )
    const blocks = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Array<{
      height: number
    }>
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0].height).toBe(0)
  })
})
