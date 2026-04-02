import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetBalance = vi.fn()
const mockMakeInvoice = vi.fn()
const mockPayInvoice = vi.fn()
const mockListTransactions = vi.fn()
const mockGetInfo = vi.fn()

vi.mock('@getalby/sdk', () => {
  return {
    NWCClient: class MockNWCClient {
      getBalance = mockGetBalance
      makeInvoice = mockMakeInvoice
      payInvoice = mockPayInvoice
      listTransactions = mockListTransactions
      getInfo = mockGetInfo
    },
  }
})

import {
  createBackendService,
  fetchNwcChainTipBlockHeight,
  isValidNwcConnectionString,
} from '../lightning-backend-service'
import type { NwcConnectionConfig } from '../lightning-backend-service'

const TEST_CONFIG: NwcConnectionConfig = {
  type: 'nwc',
  connectionString:
    'nostr+walletconnect://abc123?relay=wss%3A%2F%2Frelay.example.com&secret=def456',
}

describe('NWC backend service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getBalance', () => {
    it('converts millisatoshis to satoshis', async () => {
      mockGetBalance.mockResolvedValue({ balance: 50_000_000 })

      const service = createBackendService(TEST_CONFIG)
      const result = await service.getBalance()

      expect(result).toEqual({ balanceSats: 50_000 })
      expect(mockGetBalance).toHaveBeenCalledOnce()
    })

    it('floors fractional satoshis', async () => {
      mockGetBalance.mockResolvedValue({ balance: 1_500 })

      const service = createBackendService(TEST_CONFIG)
      const result = await service.getBalance()

      expect(result).toEqual({ balanceSats: 1 })
    })
  })

  describe('createInvoice', () => {
    it('converts sats to msats and passes description and expiry', async () => {
      mockMakeInvoice.mockResolvedValue({
        invoice: 'lntb500n1mock...',
        payment_hash: 'hash123',
        type: 'incoming',
        state: 'pending',
        description: 'test',
        description_hash: '',
        preimage: '',
        amount: 500_000,
        fees_paid: 0,
        settled_at: 0,
        created_at: 1700000000,
        expires_at: 1700003600,
      })

      const service = createBackendService(TEST_CONFIG)
      const result = await service.createInvoice({
        amountSats: 500,
        memo: 'test payment',
        expiry: 3600,
      })

      expect(mockMakeInvoice).toHaveBeenCalledWith({
        amount: 500_000,
        description: 'test payment',
        expiry: 3600,
      })
      expect(result).toEqual({
        bolt11: 'lntb500n1mock...',
        paymentHash: 'hash123',
      })
    })
  })

  describe('payInvoice', () => {
    it('passes invoice string and returns preimage as paymentHash', async () => {
      mockPayInvoice.mockResolvedValue({
        preimage: 'preimage_abc',
        fees_paid: 100,
      })

      const service = createBackendService(TEST_CONFIG)
      const result = await service.payInvoice('lntb500n1invoice...')

      expect(mockPayInvoice).toHaveBeenCalledWith({
        invoice: 'lntb500n1invoice...',
      })
      expect(result).toEqual({ paymentHash: 'preimage_abc' })
    })

    it('passes amount in millisatoshis for amountless invoices (NIP-47)', async () => {
      mockPayInvoice.mockResolvedValue({
        preimage: 'preimage_xyz',
        fees_paid: 0,
      })

      const service = createBackendService(TEST_CONFIG)
      const result = await service.payInvoice('lntb1amountless...', {
        amountMsats: 5_000_000,
      })

      expect(mockPayInvoice).toHaveBeenCalledWith({
        invoice: 'lntb1amountless...',
        amount: 5_000_000,
      })
      expect(result).toEqual({ paymentHash: 'preimage_xyz' })
    })
  })

  describe('listPayments', () => {
    it('maps NWC transactions to LightningPayment format', async () => {
      mockListTransactions.mockResolvedValue({
        transactions: [
          {
            type: 'incoming',
            state: 'settled',
            invoice: 'lntb...',
            description: 'Coffee',
            description_hash: '',
            preimage: 'pre1',
            payment_hash: 'hash1',
            amount: 5_000_000,
            fees_paid: 0,
            settled_at: 1700000100,
            created_at: 1700000000,
            expires_at: 1700003600,
          },
          {
            type: 'outgoing',
            state: 'pending',
            invoice: 'lntb2...',
            description: 'Pizza',
            description_hash: '',
            preimage: '',
            payment_hash: 'hash2',
            amount: 10_000_000,
            fees_paid: 1000,
            settled_at: 0,
            created_at: 1700000050,
            expires_at: 1700003650,
          },
        ],
        total_count: 2,
      })

      const service = createBackendService(TEST_CONFIG)
      const payments = await service.listPayments()

      expect(payments).toHaveLength(2)
      expect(payments[0]).toEqual({
        paymentHash: 'hash1',
        pending: false,
        amountSats: 5_000,
        memo: 'Coffee',
        timestamp: 1700000000,
        bolt11: 'lntb...',
        direction: 'incoming',
        feesPaidSats: 0,
      })
      expect(payments[1]).toEqual({
        paymentHash: 'hash2',
        pending: true,
        amountSats: 10_000,
        memo: 'Pizza',
        timestamp: 1700000050,
        bolt11: 'lntb2...',
        direction: 'outgoing',
        feesPaidSats: 1,
      })
    })
  })

  describe('testConnection', () => {
    it('returns success with alias on getInfo success', async () => {
      mockGetInfo.mockResolvedValue({
        alias: 'My Alby Hub',
        color: '#000000',
        pubkey: 'abc',
        network: 'mainnet',
        block_height: 800000,
        block_hash: 'hash',
        methods: ['pay_invoice', 'make_invoice', 'get_balance'],
      })

      const service = createBackendService(TEST_CONFIG)
      const result = await service.testConnection()

      expect(result).toEqual({
        ok: true,
        walletName: 'My Alby Hub',
        nwcBlockHeight: 800000,
      })
    })

    it('falls back to default name when alias is empty', async () => {
      mockGetInfo.mockResolvedValue({
        alias: '',
        color: '',
        pubkey: 'abc',
        network: 'mainnet',
        block_height: 800000,
        block_hash: 'hash',
        methods: [],
      })

      const service = createBackendService(TEST_CONFIG)
      const result = await service.testConnection()

      expect(result).toEqual({
        ok: true,
        walletName: 'NWC Wallet',
        nwcBlockHeight: 800000,
      })
    })

    it('returns error on connection failure', async () => {
      mockGetInfo.mockRejectedValue(new Error('Relay unreachable'))

      const service = createBackendService(TEST_CONFIG)
      const result = await service.testConnection()

      expect(result).toEqual({ ok: false, error: 'Relay unreachable' })
    })
  })

  describe('fetchNwcChainTipBlockHeight', () => {
    it('returns block_height from getInfo', async () => {
      mockGetInfo.mockResolvedValue({
        alias: 'x',
        block_height: 12345,
        methods: [],
      })

      const height = await fetchNwcChainTipBlockHeight(TEST_CONFIG)
      expect(height).toBe(12345)
    })
  })
})

describe('isValidNwcConnectionString', () => {
  it('accepts valid NWC connection string', () => {
    expect(
      isValidNwcConnectionString(
        'nostr+walletconnect://pubkey?relay=wss%3A%2F%2Frelay.example.com&secret=hex',
      ),
    ).toBe(true)
  })

  it('rejects strings without correct prefix', () => {
    expect(isValidNwcConnectionString('https://demo.lnbits.com')).toBe(false)
    expect(isValidNwcConnectionString('nostr://something')).toBe(false)
    expect(isValidNwcConnectionString('')).toBe(false)
  })
})
