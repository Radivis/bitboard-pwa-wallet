import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LnbitsClient } from '../lnbits-client'

const BASE_URL = 'https://demo.lnbits.com'
const API_KEY = 'test-admin-key'

function mockFetchResponse(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

describe('LnbitsClient', () => {
  let client: LnbitsClient

  beforeEach(() => {
    client = new LnbitsClient(BASE_URL, API_KEY)
    vi.restoreAllMocks()
  })

  describe('getWalletInfo', () => {
    it('sends GET to /api/v1/wallet with correct headers', async () => {
      const walletInfo = { id: 'abc123', name: 'Test Wallet', balance: 50000 }
      globalThis.fetch = mockFetchResponse(walletInfo)

      const result = await client.getWalletInfo()

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/wallet`,
        { headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' } },
      )
      expect(result).toEqual(walletInfo)
    })

    it('throws on HTTP error', async () => {
      globalThis.fetch = mockFetchResponse('Unauthorized', 401)

      await expect(client.getWalletInfo()).rejects.toThrow('LNBits API error (401)')
    })
  })

  describe('createInvoice', () => {
    it('sends POST with out:false and amount', async () => {
      const response = {
        payment_hash: 'hash123',
        payment_request: 'lntb500n1...',
      }
      globalThis.fetch = mockFetchResponse(response)

      const result = await client.createInvoice({ amountSats: 500 })

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/payments`,
        {
          method: 'POST',
          headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ out: false, amount: 500 }),
        },
      )
      expect(result).toEqual(response)
    })

    it('includes memo and expiry when provided', async () => {
      const response = {
        payment_hash: 'hash456',
        payment_request: 'lntb1000n1...',
      }
      globalThis.fetch = mockFetchResponse(response)

      await client.createInvoice({
        amountSats: 1000,
        memo: 'Test payment',
        expiry: 3600,
      })

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/payments`,
        {
          method: 'POST',
          headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            out: false,
            amount: 1000,
            memo: 'Test payment',
            expiry: 3600,
          }),
        },
      )
    })
  })

  describe('payInvoice', () => {
    it('sends POST with out:true and bolt11', async () => {
      const response = { payment_hash: 'paid_hash' }
      globalThis.fetch = mockFetchResponse(response)

      const result = await client.payInvoice('lntb500n1mockbolt11...')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/payments`,
        {
          method: 'POST',
          headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ out: true, bolt11: 'lntb500n1mockbolt11...' }),
        },
      )
      expect(result).toEqual(response)
    })
  })

  describe('listPayments', () => {
    it('sends GET to /api/v1/payments', async () => {
      const payments = [
        {
          payment_hash: 'h1',
          pending: false,
          amount: 5000,
          memo: 'Test',
          time: 1700000000,
          bolt11: 'lntb...',
        },
      ]
      globalThis.fetch = mockFetchResponse(payments)

      const result = await client.listPayments()

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/payments`,
        { headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' } },
      )
      expect(result).toEqual(payments)
    })
  })

  describe('checkPaymentStatus', () => {
    it('sends GET to /api/v1/payments/:hash', async () => {
      const payment = {
        payment_hash: 'check_hash',
        pending: false,
        amount: 1000,
        memo: '',
        time: 1700000000,
        bolt11: 'lntb...',
      }
      globalThis.fetch = mockFetchResponse(payment)

      const result = await client.checkPaymentStatus('check_hash')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/payments/check_hash`,
        { headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' } },
      )
      expect(result).toEqual(payment)
    })
  })

  describe('URL trailing slash handling', () => {
    it('strips trailing slashes from base URL', async () => {
      const trailingSlashClient = new LnbitsClient(`${BASE_URL}/`, API_KEY)
      globalThis.fetch = mockFetchResponse({ id: 'x', name: 'W', balance: 0 })

      await trailingSlashClient.getWalletInfo()

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/wallet`,
        expect.any(Object),
      )
    })
  })
})
