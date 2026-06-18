import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database as DbSchema } from '@/db/schema'
import { createTestDatabase } from '@/db/test-helpers'
import {
  saveWalletSecrets,
  loadWalletSecrets,
} from '@/db/wallet-persistence'
import {
  beginWalletSecretsSession,
  endWalletSecretsSession,
} from '@/lib/wallet/wallet-secrets-session'
import type { WalletSecrets } from '@/db/wallet-persistence'
import { TEST_MNEMONIC_12 } from '@/test-utils/test-providers'
import {
  findDescriptorWallet,
  resolveDescriptorWallet,
  updateDescriptorWalletChangeset,
} from '../descriptor-wallet-manager'
import type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'
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
  encryptedPayload: EncryptedBlob
  encryptedMnemonic: EncryptedBlob
  targetNetwork: BitcoinNetwork
  targetAddressType: AddressType
  targetAccountId: number
}) {
  const {
    encryptedPayload,
    encryptedMnemonic,
    targetNetwork,
    targetAddressType,
    targetAccountId,
  } = params
  const { getEncryptionWorker } = await import('@/workers/encryption-factory')
  const encryptionWorker = getEncryptionWorker()

  const payloadPlain = await encryptionWorker.decryptData(encryptedPayload)
  const walletSecretsPayload = JSON.parse(payloadPlain) as {
    descriptorWallets: WalletSecrets['descriptorWallets']
    lightningNwcConnections: WalletSecrets['lightningNwcConnections']
  }
  const secretsLike: WalletSecrets = {
    mnemonic: '',
    descriptorWallets: walletSecretsPayload.descriptorWallets,
    lightningNwcConnections: walletSecretsPayload.lightningNwcConnections,
  }
  const existing = findDescriptorWallet({
    secretsPayload: secretsLike,
    network: targetNetwork,
    addressType: targetAddressType,
    accountId: targetAccountId,
  })
  if (existing) {
    return {
      descriptorWalletData: existing,
      encryptedPayloadToStore: null,
      encryptedMnemonicToStore: null,
    }
  }
  const mnemonicPlain = await encryptionWorker.decryptData(encryptedMnemonic)
  const walletResult = await mockCreateWallet(
    mnemonicPlain,
    targetNetwork,
    targetAddressType,
    targetAccountId,
  )
  const newDescriptorWallet = {
    network: targetNetwork,
    addressType: targetAddressType,
    accountId: targetAccountId,
    externalDescriptor: walletResult.externalDescriptor,
    internalDescriptor: walletResult.internalDescriptor,
    changeSet: walletResult.changesetJson,
    fullScanDone: false,
  }
  walletSecretsPayload.descriptorWallets.push(newDescriptorWallet)
  const payloadEnc = await encryptionWorker.encryptData(JSON.stringify(walletSecretsPayload))
  return {
    descriptorWalletData: newDescriptorWallet,
    encryptedPayloadToStore: payloadEnc,
    encryptedMnemonicToStore: null,
  }
}

async function mockUpdateDescriptorWalletChangeset(params: {
  encryptedPayload: EncryptedBlob
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
  changesetJson: string
  markFullScanDone?: boolean
}) {
  const { encryptedPayload, network, addressType, accountId, changesetJson } = params
  const { getEncryptionWorker } = await import('@/workers/encryption-factory')
  const plaintext = await getEncryptionWorker().decryptData(encryptedPayload)
  const walletSecretsPayload = JSON.parse(plaintext) as {
    descriptorWallets: WalletSecrets['descriptorWallets']
    lightningNwcConnections: WalletSecrets['lightningNwcConnections']
  }
  const secretsLike: WalletSecrets = {
    mnemonic: '',
    descriptorWallets: walletSecretsPayload.descriptorWallets,
    lightningNwcConnections: walletSecretsPayload.lightningNwcConnections ?? [],
  }
  const descriptorWallet = findDescriptorWallet({ secretsPayload: secretsLike, network, addressType, accountId })
  if (!descriptorWallet) {
    throw new Error(`No descriptor wallet found for ${network}/${addressType}/${accountId}`)
  }
  descriptorWallet.changeSet = changesetJson
  const newBlob = await getEncryptionWorker().encryptData(JSON.stringify(walletSecretsPayload))
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
    fullScanDone: false,
  }

  const testnetSegwit: WalletSecrets['descriptorWallets'][0] = {
    network: 'testnet',
    addressType: 'segwit',
    accountId: 0,
    externalDescriptor: 'wpkh(...)',
    internalDescriptor: 'wpkh(...)',
    changeSet: '{}',
    fullScanDone: false,
  }

  const signetTaprootAccount1: WalletSecrets['descriptorWallets'][0] = {
    ...signetTaproot,
    accountId: 1,
  }

  const secrets: WalletSecrets = {
    mnemonic: TEST_MNEMONIC_12,
    descriptorWallets: [signetTaproot, testnetSegwit, signetTaprootAccount1],
    lightningNwcConnections: [],
  }

  it('returns matching descriptor wallet for signet/taproot/0', () => {
    const result = findDescriptorWallet({
      secretsPayload: secrets,
      network: 'signet',
      addressType: 'taproot',
      accountId: 0,
    })
    expect(result).toBe(signetTaproot)
  })

  it('returns matching descriptor wallet for testnet/segwit/0', () => {
    const result = findDescriptorWallet({
      secretsPayload: secrets,
      network: 'testnet',
      addressType: 'segwit',
      accountId: 0,
    })
    expect(result).toBe(testnetSegwit)
  })

  it('returns matching descriptor wallet for signet/taproot/1', () => {
    const result = findDescriptorWallet({
      secretsPayload: secrets,
      network: 'signet',
      addressType: 'taproot',
      accountId: 1,
    })
    expect(result).toBe(signetTaprootAccount1)
  })

  it('returns undefined when no match for network', () => {
    const result = findDescriptorWallet({
      secretsPayload: secrets,
      network: 'mainnet',
      addressType: 'taproot',
      accountId: 0,
    })
    expect(result).toBeUndefined()
  })

  it('returns undefined when no match for address type', () => {
    const result = findDescriptorWallet({
      secretsPayload: secrets,
      network: 'signet',
      addressType: 'segwit',
      accountId: 0,
    })
    expect(result).toBeUndefined()
  })

  it('returns undefined when no match for account id', () => {
    const result = findDescriptorWallet({
      secretsPayload: secrets,
      network: 'signet',
      addressType: 'taproot',
      accountId: 2,
    })
    expect(result).toBeUndefined()
  })

  it('returns undefined when descriptorWallets is empty', () => {
    const emptySecrets: WalletSecrets = { ...secrets, descriptorWallets: [] }
    const result = findDescriptorWallet({
      secretsPayload: emptySecrets,
      network: 'signet',
      addressType: 'taproot',
      accountId: 0,
    })
    expect(result).toBeUndefined()
  })
})

describe('resolveDescriptorWallet', () => {
  let walletId: number

  const existingDescriptorWallet = {
    network: 'signet' as const,
    addressType: 'taproot' as const,
    accountId: 0,
    externalDescriptor: 'tr(existing...)',
    internalDescriptor: 'tr(existing...)',
    changeSet: '{"last_reveal":{"0":3}}',
    fullScanDone: false,
  }

  const mockSecrets: WalletSecrets = {
    mnemonic: TEST_MNEMONIC_12,
    descriptorWallets: [existingDescriptorWallet],
    lightningNwcConnections: [],
  }

  beforeEach(async () => {
    testDb = await createTestDatabase()
    await beginWalletSecretsSession('test-password')
    const result = await testDb
      .insertInto('wallets')
      .values({ name: 'Test Wallet', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    walletId = Number(result.insertId)
    mockCreateWallet.mockReset()
  })

  afterEach(async () => {
    await endWalletSecretsSession()
    await testDb.destroy()
  })

  it('returns existing descriptor wallet when found', async () => {
    await saveWalletSecrets({
      walletDb: testDb,
      walletId,
      secrets: mockSecrets,
    })

    const result = await resolveDescriptorWallet({
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
      externalDescriptor: 'tr(new...)',
      internalDescriptor: 'tr(new...)',
      firstAddress: 'tb1qnewaddress',
      changesetJson: '{"last_reveal":{"0":0}}',
    }
    mockCreateWallet.mockResolvedValue(newWalletResult)

    await saveWalletSecrets({
      walletDb: testDb,
      walletId,
      secrets: mockSecrets,
    })

    const result = await resolveDescriptorWallet({
      walletId,
      targetNetwork: 'testnet',
      targetAddressType: 'segwit',
      targetAccountId: 0,
    })

    expect(result).toEqual({
      network: 'testnet',
      addressType: 'segwit',
      accountId: 0,
      externalDescriptor: newWalletResult.externalDescriptor,
      internalDescriptor: newWalletResult.internalDescriptor,
      changeSet: newWalletResult.changesetJson,
      fullScanDone: false,
    })
    expect(mockCreateWallet).toHaveBeenCalledWith(
      mockSecrets.mnemonic,
      'testnet',
      'segwit',
      0,
    )

    const loaded = await loadWalletSecrets(testDb, walletId)
    expect(loaded.descriptorWallets).toHaveLength(2)
    expect(loaded.descriptorWallets[1]).toEqual(result)
  })
})

describe('updateDescriptorWalletChangeset', () => {
  let walletId: number

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
        fullScanDone: false,
      },
    ],
    lightningNwcConnections: [
      {
        id: 'conn-1',
        label: 'LN',
        networkMode: 'signet',
        connectionString:
          'nostr+walletconnect://abc?relay=wss%3A%2F%2Frelay.example.com',
        createdAt: '2020-01-01T00:00:00.000Z',
        nwcSnapshot: {
          balanceSats: 50,
          balanceUpdatedAt: '2020-01-01T00:00:00.000Z',
          payments: [],
          paymentsUpdatedAt: '2020-01-01T00:00:00.000Z',
        },
      },
    ],
  }

  beforeEach(async () => {
    testDb = await createTestDatabase()
    await beginWalletSecretsSession('test-password')
    const result = await testDb
      .insertInto('wallets')
      .values({ name: 'Test Wallet', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    walletId = Number(result.insertId)
  })

  afterEach(async () => {
    await endWalletSecretsSession()
    await testDb.destroy()
  })

  it('updates changeset for existing descriptor wallet', async () => {
    await saveWalletSecrets({
      walletDb: testDb,
      walletId,
      secrets: sampleSecrets,
    })

    const newChangeset = '{"last_reveal":{"0":10}}'
    await updateDescriptorWalletChangeset({
      walletId,
      network: 'signet',
      addressType: 'taproot',
      accountId: 0,
      changesetJson: newChangeset,
    })

    const loaded = await loadWalletSecrets(testDb, walletId)
    expect(loaded.descriptorWallets[0].changeSet).toBe(newChangeset)
    expect(loaded.lightningNwcConnections).toHaveLength(1)
    expect(loaded.lightningNwcConnections[0].id).toBe('conn-1')
  })

  it('throws when descriptor wallet not found', async () => {
    await saveWalletSecrets({
      walletDb: testDb,
      walletId,
      secrets: sampleSecrets,
    })

    await expect(
      updateDescriptorWalletChangeset({
        walletId,
        network: 'mainnet',
        addressType: 'taproot',
        accountId: 0,
        changesetJson: '{}',
      }),
    ).rejects.toThrow(/No descriptor wallet found for mainnet\/taproot\/0/)
  })
})
