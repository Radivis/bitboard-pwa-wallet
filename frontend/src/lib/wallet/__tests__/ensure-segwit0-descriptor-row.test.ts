import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/lib/wallet/wallet-domain-types'

const mockCreateWallet = vi.hoisted(() => vi.fn())
const mockResolveDescriptorWallet = vi.hoisted(() => vi.fn())
const mockCreateDescriptorWalletRowIfMissing = vi.hoisted(() => vi.fn())
const mockFindDescriptorWallet = vi.hoisted(() => vi.fn())
const mockUpdatePayload = vi.hoisted(() => vi.fn())
const mockLoadWalletSecretsPayload = vi.hoisted(() => vi.fn())

vi.mock('@/workers/secrets-channel', () => ({
  ensureSecretsChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/db', () => ({
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
  getDatabase: vi.fn(() => ({})),
  getWalletSecretsEncrypted: vi.fn(async () => ({
    mnemonic: { ciphertext: new Uint8Array(), iv: new Uint8Array(), salt: new Uint8Array(), kdfPhc: 'x' },
    payload: { ciphertext: new Uint8Array(), iv: new Uint8Array(), salt: new Uint8Array(), kdfPhc: 'x' },
  })),
  loadWalletSecretsPayload: (...args: unknown[]) => mockLoadWalletSecretsPayload(...args),
  updateWalletSecretsEncryptedPayloadWithRetry: (...args: unknown[]) =>
    mockUpdatePayload(...args),
}))

vi.mock('@/lib/wallet/descriptor-wallet-manager', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/wallet/descriptor-wallet-manager')
  >()
  return {
    ...actual,
    findDescriptorWallet: (...args: unknown[]) => mockFindDescriptorWallet(...args),
    resolveDescriptorWallet: (...args: unknown[]) => mockResolveDescriptorWallet(...args),
  }
})

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      createWallet: mockCreateWallet,
      resolveDescriptorWallet: mockResolveDescriptorWallet,
      createDescriptorWalletRowIfMissing: mockCreateDescriptorWalletRowIfMissing,
    }),
  },
}))

import { ensureSegwit0DescriptorRow } from '@/lib/wallet/ensure-segwit0-descriptor-row'

const existingRow = {
  network: 'signet' as const,
  addressType: AddressType.SegWit,
  accountId: 0,
  externalDescriptor: 'wpkh(existing)',
  internalDescriptor: 'wpkh(existing-int)',
  changeSet: '{"local":{}}',
  fullScanDone: true,
}

describe('LIFE-ARK-BUMP-02 ensureSegwit0DescriptorRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadWalletSecretsPayload.mockResolvedValue({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeAccounts: [],
      activeArkadeAccountIdByNetwork: {},
    })
    mockUpdatePayload.mockImplementation(async ({ transform }: { transform: (p: unknown) => unknown }) => {
      await transform({ ciphertext: new Uint8Array(), iv: new Uint8Array(), salt: new Uint8Array(), kdfPhc: 'x' })
    })
  })

  it('returns the existing SegWit-0 row without creating a wallet', async () => {
    mockFindDescriptorWallet.mockReturnValue(existingRow)

    const row = await ensureSegwit0DescriptorRow({
      walletId: 1,
      network: 'signet',
    })

    expect(row).toEqual(existingRow)
    expect(mockCreateWallet).not.toHaveBeenCalled()
    expect(mockResolveDescriptorWallet).not.toHaveBeenCalled()
    expect(mockCreateDescriptorWalletRowIfMissing).not.toHaveBeenCalled()
  })

  it('creates a missing row without replacing ACTIVE_WALLET', async () => {
    const createdRow = {
      network: 'signet' as const,
      addressType: AddressType.SegWit,
      accountId: 0,
      externalDescriptor: 'wpkh(new)',
      internalDescriptor: 'wpkh(new-int)',
      changeSet: '{"local":{"new":true}}',
      fullScanDone: false,
    }
    mockFindDescriptorWallet.mockReturnValue(undefined)
    mockCreateDescriptorWalletRowIfMissing.mockResolvedValue({
      descriptorWalletData: createdRow,
      encryptedPayloadToStore: {
        ciphertext: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        salt: new Uint8Array([3]),
        kdfPhc: 'x',
      },
      encryptedMnemonicToStore: null,
    })

    const row = await ensureSegwit0DescriptorRow({
      walletId: 1,
      network: 'signet',
    })

    expect(mockCreateWallet).not.toHaveBeenCalled()
    expect(mockResolveDescriptorWallet).not.toHaveBeenCalled()
    expect(mockCreateDescriptorWalletRowIfMissing).toHaveBeenCalled()
    expect(row).toEqual(
      expect.objectContaining({
        network: 'signet',
        addressType: AddressType.SegWit,
        accountId: 0,
        externalDescriptor: 'wpkh(new)',
        changeSet: '{"local":{"new":true}}',
        fullScanDone: false,
      }),
    )
  })
})
