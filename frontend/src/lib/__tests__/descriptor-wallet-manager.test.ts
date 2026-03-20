import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database as DbSchema } from '@/db/schema'
import { createTestDatabase } from '@/db/test-helpers'
import {
  saveWalletSecrets,
  loadWalletSecrets,
} from '@/db/wallet-persistence'
import type { WalletSecrets } from '@/db/wallet-persistence'
import { TEST_MNEMONIC_12 } from '@/test-utils/test-providers'
import {
  findDescriptorWallet,
  resolveDescriptorWallet,
  updateDescriptorWalletChangeset,
} from '../descriptor-wallet-manager'
import type { AddressType, BitcoinNetwork } from '@/workers/crypto-types'

/**
 * Descriptor wallet manager tests using mock encryption worker for fast execution.
 *
 * IMPORTANT: The mock uses PBKDF2 + AES-GCM. Production uses the encryption worker with Argon2id WASM.
 */
vi.mock('@/workers/encryption-factory', async () => {
  const { getMockEncryptionWorker } = await import('@/db/__tests__/mock-encryption-worker')
  return {
    getEncryptionWorker: () => getMockEncryptionWorker(),
  }
})

vi.mock('@/workers/secrets-channel', () => ({
  ensureSecretsChannel: vi.fn().mockResolvedValue(undefined),
}))

let testDb: Kysely<DbSchema>

vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>()
  return {
    ...actual,
    getDatabase: () => {
      if (!testDb) throw new Error('testDb not initialized')
      return testDb
    },
    ensureMigrated: vi.fn().mockResolvedValue(undefined),
  }
})

const mockCreateWallet = vi.fn()

async function mockResolveDescriptorWallet(params: {
  password: string
  encryptedBlob: { ciphertext: Uint8Array; iv: Uint8Array; salt: Uint8Array }
  targetNetwork: BitcoinNetwork
  targetAddressType: AddressType
  targetAccountId: number
}) {
  const {
    password,
    encryptedBlob,
    targetNetwork,
    targetAddressType,
    targetAccountId,
  } = params
  const { getEncryptionWorker } = await import('@/workers/encryption-factory')
  const plaintext = await getEncryptionWorker().decryptData(password, encryptedBlob)
  const secrets: WalletSecrets = JSON.parse(plaintext)
  const existing = findDescriptorWallet({
    secrets,
    network: targetNetwork,
    addressType: targetAddressType,
    accountId: targetAccountId,
  })
  if (existing) {
    return { descriptorWalletData: existing, encryptedBlobToStore: null }
  }
  const walletResult = await mockCreateWallet(
    secrets.mnemonic,
    targetNetwork,
    targetAddressType,
    targetAccountId,
  )
  const newDw = {
    network: targetNetwork,
    addressType: targetAddressType,
    accountId: targetAccountId,
    externalDescriptor: walletResult.external_descriptor,
    internalDescriptor: walletResult.internal_descriptor,
    changeSet: walletResult.changeset_json,
  }
  secrets.descriptorWallets.push(newDw)
  const newBlob = await getEncryptionWorker().encryptData(password, JSON.stringify(secrets))
  return {
    descriptorWalletData: newDw,
    encryptedBlobToStore: newBlob,
  }
}

async function mockUpdateDescriptorWalletChangeset(params: {
  password: string
  encryptedBlob: { ciphertext: Uint8Array; iv: Uint8Array; salt: Uint8Array }
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
  changesetJson: string
  markFullScanDone?: boolean
}) {
  const { password, encryptedBlob, network, addressType, accountId, changesetJson } =
    params
  const { getEncryptionWorker } = await import('@/workers/encryption-factory')
  const plaintext = await getEncryptionWorker().decryptData(password, encryptedBlob)
  const secrets: WalletSecrets = JSON.parse(plaintext)
  const dw = findDescriptorWallet({ secrets, network, addressType, accountId })
  if (!dw) {
    throw new Error(`No descriptor wallet found for ${network}/${addressType}/${accountId}`)
  }
  dw.changeSet = changesetJson
  const newBlob = await getEncryptionWorker().encryptData(password, JSON.stringify(secrets))
  return newBlob
}

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      createWallet: mockCreateWallet,
      resolveDescriptorWallet: mockResolveDescriptorWallet,
      updateDescriptorWalletChangeset: mockUpdateDescriptorWalletChangeset,
    }),
  },
}))

describe('findDescriptorWallet', () => {
  const signetTaproot: WalletSecrets['descriptorWallets'][0] = {
    network: 'signet',
    addressType: 'taproot',
    accountId: 0,
    externalDescriptor: 'tr(...)',
    internalDescriptor: 'tr(...)',
    changeSet: '{}',
  }

  const testnetSegwit: WalletSecrets['descriptorWallets'][0] = {
    network: 'testnet',
    addressType: 'segwit',
    accountId: 0,
    externalDescriptor: 'wpkh(...)',
    internalDescriptor: 'wpkh(...)',
    changeSet: '{}',
  }

  const signetTaprootAccount1: WalletSecrets['descriptorWallets'][0] = {
    ...signetTaproot,
    accountId: 1,
  }

  const secrets: WalletSecrets = {
    mnemonic: TEST_MNEMONIC_12,
    descriptorWallets: [signetTaproot, testnetSegwit, signetTaprootAccount1],
  }

  it('returns matching descriptor wallet for signet/taproot/0', () => {
    const result = findDescriptorWallet({
      secrets,
      network: 'signet',
      addressType: 'taproot',
      accountId: 0,
    })
    expect(result).toBe(signetTaproot)
  })

  it('returns matching descriptor wallet for testnet/segwit/0', () => {
    const result = findDescriptorWallet({
      secrets,
      network: 'testnet',
      addressType: 'segwit',
      accountId: 0,
    })
    expect(result).toBe(testnetSegwit)
  })

  it('returns matching descriptor wallet for signet/taproot/1', () => {
    const result = findDescriptorWallet({
      secrets,
      network: 'signet',
      addressType: 'taproot',
      accountId: 1,
    })
    expect(result).toBe(signetTaprootAccount1)
  })

  it('returns undefined when no match for network', () => {
    const result = findDescriptorWallet({
      secrets,
      network: 'mainnet',
      addressType: 'taproot',
      accountId: 0,
    })
    expect(result).toBeUndefined()
  })

  it('returns undefined when no match for address type', () => {
    const result = findDescriptorWallet({
      secrets,
      network: 'signet',
      addressType: 'segwit',
      accountId: 0,
    })
    expect(result).toBeUndefined()
  })

  it('returns undefined when no match for account id', () => {
    const result = findDescriptorWallet({
      secrets,
      network: 'signet',
      addressType: 'taproot',
      accountId: 2,
    })
    expect(result).toBeUndefined()
  })

  it('returns undefined when descriptorWallets is empty', () => {
    const emptySecrets: WalletSecrets = { ...secrets, descriptorWallets: [] }
    const result = findDescriptorWallet({
      secrets: emptySecrets,
      network: 'signet',
      addressType: 'taproot',
      accountId: 0,
    })
    expect(result).toBeUndefined()
  })
})

describe('resolveDescriptorWallet', () => {
  let walletId: number
  const password = 'test-password'

  const existingDescriptorWallet = {
    network: 'signet' as const,
    addressType: 'taproot' as const,
    accountId: 0,
    externalDescriptor: 'tr(existing...)',
    internalDescriptor: 'tr(existing...)',
    changeSet: '{"last_reveal":{"0":3}}',
  }

  const mockSecrets: WalletSecrets = {
    mnemonic: TEST_MNEMONIC_12,
    descriptorWallets: [existingDescriptorWallet],
  }

  beforeEach(async () => {
    testDb = await createTestDatabase()
    const result = await testDb
      .insertInto('wallets')
      .values({ name: 'Test Wallet', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    walletId = Number(result.insertId)
    mockCreateWallet.mockReset()
  })

  afterEach(async () => {
    await testDb.destroy()
  })

  it('returns existing descriptor wallet when found', async () => {
    await saveWalletSecrets({
      walletDb: testDb,
      password,
      walletId,
      secrets: mockSecrets,
    })

    const result = await resolveDescriptorWallet({
      password,
      walletId,
      targetNetwork: 'signet',
      targetAddressType: 'taproot',
      targetAccountId: 0,
    })

    expect(result).toEqual(existingDescriptorWallet)
    expect(mockCreateWallet).not.toHaveBeenCalled()
  })

  it('creates and persists new descriptor wallet when not found', async () => {
    const newWalletResult = {
      external_descriptor: 'tr(new...)',
      internal_descriptor: 'tr(new...)',
      changeset_json: '{"last_reveal":{"0":0}}',
    }
    mockCreateWallet.mockResolvedValue(newWalletResult)

    await saveWalletSecrets({
      walletDb: testDb,
      password,
      walletId,
      secrets: mockSecrets,
    })

    const result = await resolveDescriptorWallet({
      password,
      walletId,
      targetNetwork: 'testnet',
      targetAddressType: 'segwit',
      targetAccountId: 0,
    })

    expect(result).toEqual({
      network: 'testnet',
      addressType: 'segwit',
      accountId: 0,
      externalDescriptor: newWalletResult.external_descriptor,
      internalDescriptor: newWalletResult.internal_descriptor,
      changeSet: newWalletResult.changeset_json,
    })
    expect(mockCreateWallet).toHaveBeenCalledWith(
      mockSecrets.mnemonic,
      'testnet',
      'segwit',
      0,
    )

    const loaded = await loadWalletSecrets(testDb, password, walletId)
    expect(loaded.descriptorWallets).toHaveLength(2)
    expect(loaded.descriptorWallets[1]).toEqual(result)
  })
})

describe('updateDescriptorWalletChangeset', () => {
  let walletId: number
  const password = 'test-password'

  const sampleSecrets: WalletSecrets = {
    mnemonic: TEST_MNEMONIC_12,
    descriptorWallets: [
      {
        network: 'signet',
        addressType: 'taproot',
        accountId: 0,
        externalDescriptor: "tr([fingerprint/86'/1'/0']xpub.../0/*)",
        internalDescriptor: "tr([fingerprint/86'/1'/0']xpub.../1/*)",
        changeSet: '{"last_reveal":{"0":5}}',
      },
    ],
  }

  beforeEach(async () => {
    testDb = await createTestDatabase()
    const result = await testDb
      .insertInto('wallets')
      .values({ name: 'Test Wallet', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    walletId = Number(result.insertId)
  })

  afterEach(async () => {
    await testDb.destroy()
  })

  it('updates changeset for existing descriptor wallet', async () => {
    await saveWalletSecrets({
      walletDb: testDb,
      password,
      walletId,
      secrets: sampleSecrets,
    })

    const newChangeset = '{"last_reveal":{"0":10}}'
    await updateDescriptorWalletChangeset({
      password,
      walletId,
      network: 'signet',
      addressType: 'taproot',
      accountId: 0,
      changesetJson: newChangeset,
    })

    const loaded = await loadWalletSecrets(testDb, password, walletId)
    expect(loaded.descriptorWallets[0].changeSet).toBe(newChangeset)
  })

  it('throws when descriptor wallet not found', async () => {
    await saveWalletSecrets({
      walletDb: testDb,
      password,
      walletId,
      secrets: sampleSecrets,
    })

    await expect(
      updateDescriptorWalletChangeset({
        password,
        walletId,
        network: 'mainnet',
        addressType: 'taproot',
        accountId: 0,
        changesetJson: '{}',
      }),
    ).rejects.toThrow(/No descriptor wallet found for mainnet\/taproot\/0/)
  })
})
