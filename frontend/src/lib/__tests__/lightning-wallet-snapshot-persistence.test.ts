import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LightningPayment } from '@/lib/lightning-backend-service'
import type { WalletSecretsPayload } from '@/lib/wallet-domain-types'
import {
  loadWalletSecretsPayload,
  putSplitWalletSecretsEncrypted,
} from '@/db/wallet-persistence'

vi.mock('@/db/database', () => ({
  getDatabase: vi.fn(() => ({})),
}))

vi.mock('@/db/wallet-persistence', () => ({
  loadWalletSecretsPayload: vi.fn(),
  putSplitWalletSecretsEncrypted: vi.fn(),
}))

vi.mock('@/db/encryption', () => ({
  encryptData: vi.fn(async (_password: string, plaintext: string) => ({
    ciphertext: new TextEncoder().encode(plaintext),
    iv: new Uint8Array(12),
    salt: new Uint8Array(16),
    kdfVersion: 2 as const,
  })),
}))

import {
  applyNwcSnapshotPatchesToPayload,
  batchApplyNwcSnapshotPatches,
  lightningNwcConnectionIdsFingerprint,
  mergeNwcConnectionSnapshot,
} from '@/lib/lightning-wallet-snapshot-persistence'

function pay(overrides: Partial<LightningPayment> = {}): LightningPayment {
  return {
    paymentHash: 'h1',
    pending: false,
    amountSats: 10,
    memo: 'm',
    timestamp: 1,
    bolt11: 'lnbc1',
    direction: 'incoming',
    feesPaidSats: 0,
    ...overrides,
  }
}

describe('mergeNwcConnectionSnapshot', () => {
  it('applies balance-only on empty prev with empty payments', () => {
    const t = '2020-01-01T00:00:00.000Z'
    const m = mergeNwcConnectionSnapshot(undefined, {
      balance: { balanceSats: 99, balanceUpdatedAt: t },
    })
    expect(m.balanceSats).toBe(99)
    expect(m.balanceUpdatedAt).toBe(t)
    expect(m.payments).toEqual([])
    expect(m.paymentsUpdatedAt).toBe(t)
  })

  it('preserves balance when patching payments only', () => {
    const prev = mergeNwcConnectionSnapshot(undefined, {
      balance: { balanceSats: 50, balanceUpdatedAt: '2020-01-01T00:00:00.000Z' },
    })
    const t2 = '2020-01-02T00:00:00.000Z'
    const next = mergeNwcConnectionSnapshot(prev, {
      payments: { payments: [pay()], paymentsUpdatedAt: t2 },
    })
    expect(next.balanceSats).toBe(50)
    expect(next.payments).toHaveLength(1)
    expect(next.paymentsUpdatedAt).toBe(t2)
  })

  it('preserves payments when patching balance only', () => {
    const t0 = '2020-01-01T00:00:00.000Z'
    const prev = mergeNwcConnectionSnapshot(undefined, {
      payments: { payments: [pay()], paymentsUpdatedAt: t0 },
    })
    const t1 = '2020-01-03T00:00:00.000Z'
    const next = mergeNwcConnectionSnapshot(prev, {
      balance: { balanceSats: 7, balanceUpdatedAt: t1 },
    })
    expect(next.balanceSats).toBe(7)
    expect(next.payments).toHaveLength(1)
    expect(next.paymentsUpdatedAt).toBe(t0)
  })
})

describe('lightningNwcConnectionIdsFingerprint', () => {
  it('is order-insensitive', () => {
    expect(
      lightningNwcConnectionIdsFingerprint([{ id: 'b' }, { id: 'a' }]),
    ).toBe(lightningNwcConnectionIdsFingerprint([{ id: 'a' }, { id: 'b' }]))
  })
})

describe('applyNwcSnapshotPatchesToPayload', () => {
  const basePayload = (): WalletSecretsPayload => ({
    descriptorWallets: [
      {
        network: 'testnet',
        addressType: 'taproot',
        accountId: 0,
        externalDescriptor: 'tr(xpub.../0/*)',
        internalDescriptor: 'tr(xpub.../1/*)',
        changeSet: '{}',
        fullScanDone: false,
      },
    ],
    lightningNwcConnections: [
      {
        id: 'c1',
        label: 'LN',
        networkMode: 'signet',
        connectionString:
          'nostr+walletconnect://0000000000000000000000000000000000000000000000000000000000000000?relay=wss%3A%2F%2Frelay.example.com',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
    ],
  })

  it('applies balance patch to matching connection', () => {
    const t = '2020-01-02T00:00:00.000Z'
    const next = applyNwcSnapshotPatchesToPayload(basePayload(), [
      {
        connectionId: 'c1',
        balance: { balanceSats: 42, balanceUpdatedAt: t },
      },
    ])
    expect(next.lightningNwcConnections).toHaveLength(1)
    expect(next.lightningNwcConnections[0].nwcSnapshot?.balanceSats).toBe(42)
  })

  it('ignores patches for unknown connection ids', () => {
    const next = applyNwcSnapshotPatchesToPayload(basePayload(), [
      {
        connectionId: 'missing',
        balance: { balanceSats: 1, balanceUpdatedAt: '2020-01-01T00:00:00.000Z' },
      },
    ])
    expect(next.lightningNwcConnections[0].nwcSnapshot).toBeUndefined()
  })
})

describe('batchApplyNwcSnapshotPatches concurrent payload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function buildBasePayload(): WalletSecretsPayload {
    return {
      descriptorWallets: [
        {
          network: 'testnet',
          addressType: 'taproot',
          accountId: 0,
          externalDescriptor: 'tr(xpub.../0/*)',
          internalDescriptor: 'tr(xpub.../1/*)',
          changeSet: '{}',
          fullScanDone: false,
        },
      ],
      lightningNwcConnections: [],
    }
  }

  it('retries when lightning connections change after first read (no clobber)', async () => {
    const emptyLn = buildBasePayload()
    const withConn: WalletSecretsPayload = {
      ...emptyLn,
      lightningNwcConnections: [
        {
          id: 'new-nwc',
          label: 'Hub',
          networkMode: 'signet',
          connectionString:
            'nostr+walletconnect://1111111111111111111111111111111111111111111111111111111111111111?relay=wss%3A%2F%2Frelay.example.com',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    }

    let loadCount = 0
    vi.mocked(loadWalletSecretsPayload).mockImplementation(async () => {
      loadCount += 1
      if (loadCount === 1) return emptyLn
      return withConn
    })

    await batchApplyNwcSnapshotPatches({
      password: 'pw',
      walletId: 1,
      patches: [
        {
          connectionId: 'new-nwc',
          balance: { balanceSats: 100, balanceUpdatedAt: '2020-01-03T00:00:00.000Z' },
        },
      ],
    })

    expect(putSplitWalletSecretsEncrypted).toHaveBeenCalledTimes(1)
    const putArg = vi.mocked(putSplitWalletSecretsEncrypted).mock.calls[0]
    expect(putArg[1]).toBe(1)
    const enc = new TextDecoder().decode(putArg[2].payload.ciphertext)
    const written = JSON.parse(enc) as WalletSecretsPayload
    expect(written.lightningNwcConnections).toHaveLength(1)
    expect(written.lightningNwcConnections[0].id).toBe('new-nwc')
    expect(written.lightningNwcConnections[0].nwcSnapshot?.balanceSats).toBe(100)
  })

  it('retries when connections change during encryption window', async () => {
    const emptyLn = buildBasePayload()
    const withConn: WalletSecretsPayload = {
      ...emptyLn,
      lightningNwcConnections: [
        {
          id: 'new-nwc',
          label: 'Hub',
          networkMode: 'signet',
          connectionString:
            'nostr+walletconnect://1111111111111111111111111111111111111111111111111111111111111111?relay=wss%3A%2F%2Frelay.example.com',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    }

    const responses: WalletSecretsPayload[] = [
      emptyLn, // attempt 1: payload
      emptyLn, // attempt 1: latest before encrypt
      withConn, // attempt 1: latest before write (race detected, retry)
      withConn, // attempt 2: payload
      withConn, // attempt 2: latest before encrypt
      withConn, // attempt 2: latest before write
    ]
    vi.mocked(loadWalletSecretsPayload).mockImplementation(async () => {
      const next = responses.shift()
      return next ?? withConn
    })

    await batchApplyNwcSnapshotPatches({
      password: 'pw',
      walletId: 1,
      patches: [
        {
          connectionId: 'new-nwc',
          balance: { balanceSats: 100, balanceUpdatedAt: '2020-01-03T00:00:00.000Z' },
        },
      ],
    })

    expect(putSplitWalletSecretsEncrypted).toHaveBeenCalledTimes(1)
    const putArg = vi.mocked(putSplitWalletSecretsEncrypted).mock.calls[0]
    const enc = new TextDecoder().decode(putArg[2].payload.ciphertext)
    const written = JSON.parse(enc) as WalletSecretsPayload
    expect(written.lightningNwcConnections).toHaveLength(1)
    expect(written.lightningNwcConnections[0].id).toBe('new-nwc')
    expect(written.lightningNwcConnections[0].nwcSnapshot?.balanceSats).toBe(100)
  })
})
