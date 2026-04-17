import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LightningPayment } from '@/lib/lightning-backend-service'
import type { WalletSecretsPayload } from '@/lib/wallet-domain-types'
import {
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'

vi.mock('@/db/database', () => ({
  getDatabase: vi.fn(() => ({})),
}))

vi.mock('@/db/wallet-persistence', () => ({
  loadWalletSecretsPayload: vi.fn(),
  updateWalletSecretsPayloadWithRetry: vi.fn(),
}))

vi.mock('@/db/encryption', () => ({
  encryptData: vi.fn(async (_password: string, plaintext: string) => ({
    ciphertext: new TextEncoder().encode(plaintext),
    iv: new Uint8Array(12),
    salt: new Uint8Array(16),
    kdfPhc: '$argon2id$v=19$m=65536,t=3,p=4',
  })),
}))

import {
  applyNwcSnapshotPatchesToPayload,
  batchApplyNwcSnapshotPatches,
  mergeNwcConnectionSnapshot,
} from '@/lib/lightning-wallet-snapshot-persistence'

function sampleLightningPayment(
  overrides: Partial<LightningPayment> = {},
): LightningPayment {
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
    const balanceUpdatedAtIso = '2020-01-01T00:00:00.000Z'
    const mergedSnapshot = mergeNwcConnectionSnapshot(undefined, {
      balance: { balanceSats: 99, balanceUpdatedAt: balanceUpdatedAtIso },
    })
    expect(mergedSnapshot.balanceSats).toBe(99)
    expect(mergedSnapshot.balanceUpdatedAt).toBe(balanceUpdatedAtIso)
    expect(mergedSnapshot.payments).toEqual([])
    expect(mergedSnapshot.paymentsUpdatedAt).toBe(balanceUpdatedAtIso)
  })

  it('preserves balance when patching payments only', () => {
    const snapshotWithBalanceOnly = mergeNwcConnectionSnapshot(undefined, {
      balance: { balanceSats: 50, balanceUpdatedAt: '2020-01-01T00:00:00.000Z' },
    })
    const paymentsUpdatedAtIso = '2020-01-02T00:00:00.000Z'
    const snapshotAfterPaymentsPatch = mergeNwcConnectionSnapshot(
      snapshotWithBalanceOnly,
      {
        payments: {
          payments: [sampleLightningPayment()],
          paymentsUpdatedAt: paymentsUpdatedAtIso,
        },
      },
    )
    expect(snapshotAfterPaymentsPatch.balanceSats).toBe(50)
    expect(snapshotAfterPaymentsPatch.payments).toHaveLength(1)
    expect(snapshotAfterPaymentsPatch.paymentsUpdatedAt).toBe(paymentsUpdatedAtIso)
  })

  it('preserves payments when patching balance only', () => {
    const initialPaymentsUpdatedAtIso = '2020-01-01T00:00:00.000Z'
    const snapshotWithPaymentsOnly = mergeNwcConnectionSnapshot(undefined, {
      payments: {
        payments: [sampleLightningPayment()],
        paymentsUpdatedAt: initialPaymentsUpdatedAtIso,
      },
    })
    const newBalanceUpdatedAtIso = '2020-01-03T00:00:00.000Z'
    const snapshotAfterBalancePatch = mergeNwcConnectionSnapshot(
      snapshotWithPaymentsOnly,
      {
        balance: { balanceSats: 7, balanceUpdatedAt: newBalanceUpdatedAtIso },
      },
    )
    expect(snapshotAfterBalancePatch.balanceSats).toBe(7)
    expect(snapshotAfterBalancePatch.payments).toHaveLength(1)
    expect(snapshotAfterBalancePatch.paymentsUpdatedAt).toBe(
      initialPaymentsUpdatedAtIso,
    )
  })
})

describe('applyNwcSnapshotPatchesToPayload', () => {
  const buildWalletSecretsPayloadFixture = (): WalletSecretsPayload => ({
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
    const balanceUpdatedAtIso = '2020-01-02T00:00:00.000Z'
    const patchedPayload = applyNwcSnapshotPatchesToPayload(
      buildWalletSecretsPayloadFixture(),
      [
        {
          connectionId: 'c1',
          balance: { balanceSats: 42, balanceUpdatedAt: balanceUpdatedAtIso },
        },
      ],
    )
    expect(patchedPayload.lightningNwcConnections).toHaveLength(1)
    expect(patchedPayload.lightningNwcConnections[0].nwcSnapshot?.balanceSats).toBe(
      42,
    )
  })

  it('ignores patches for unknown connection ids', () => {
    const patchedPayload = applyNwcSnapshotPatchesToPayload(
      buildWalletSecretsPayloadFixture(),
      [
        {
          connectionId: 'missing',
          balance: {
            balanceSats: 1,
            balanceUpdatedAt: '2020-01-01T00:00:00.000Z',
          },
        },
      ],
    )
    expect(patchedPayload.lightningNwcConnections[0].nwcSnapshot).toBeUndefined()
  })
})

describe('batchApplyNwcSnapshotPatches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates to shared payload CAS helper', async () => {
    vi.mocked(updateWalletSecretsPayloadWithRetry).mockResolvedValue(undefined)

    await batchApplyNwcSnapshotPatches({
      password: 'pw',
      walletId: 1,
      patches: [
        {
          connectionId: 'c1',
          balance: { balanceSats: 100, balanceUpdatedAt: '2020-01-03T00:00:00.000Z' },
        },
      ],
    })

    expect(updateWalletSecretsPayloadWithRetry).toHaveBeenCalledTimes(1)
    const retryArg = vi.mocked(updateWalletSecretsPayloadWithRetry).mock.calls[0][0]
    expect(retryArg.walletId).toBe(1)
    expect(retryArg.password).toBe('pw')
    expect(typeof retryArg.transform).toBe('function')
  })
})
