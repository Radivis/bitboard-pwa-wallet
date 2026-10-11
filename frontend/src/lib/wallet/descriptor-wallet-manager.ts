import {
  getDatabase,
  ensureMigrated,
  getWalletSecretsEncrypted,
  updateWalletSecretsEncryptedPayloadWithRetry,
} from '@/db'
import type {
  DescriptorWalletData,
  EncryptedWalletSecretsBlob,
  WalletSecrets,
  WalletSecretsPayload,
} from '@/db/wallet-persistence'
import type { Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import type { EncryptedBlobForDb, ResolveDescriptorWalletResult } from '@/workers/crypto-api'
import type { AddressType, BitcoinNetwork } from '@/workers/crypto-types'
import { ensureSecretsChannel } from '@/workers/secrets-channel'
import { useCryptoStore } from '@/stores/cryptoStore'

/**
 * Find a descriptor wallet matching the given (network, addressType, accountId)
 * within the wallet secrets array.
 */
export type FindDescriptorWalletInput = {
  secretsPayload: WalletSecretsPayload | Pick<WalletSecrets, 'descriptorWallets'>
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
}

export function findDescriptorWallet({
  secretsPayload,
  network,
  addressType,
  accountId,
}: FindDescriptorWalletInput): DescriptorWalletData | undefined {
  return secretsPayload.descriptorWallets.find(
    (descriptorWallet) =>
      descriptorWallet.network === network &&
      descriptorWallet.addressType === addressType &&
      descriptorWallet.accountId === accountId,
  )
}

function workerBlobToPersistence(blob: EncryptedBlobForDb): EncryptedWalletSecretsBlob {
  return {
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    salt: blob.salt,
    kdfPhc: blob.kdfPhc,
  }
}

/**
 * Resolve (find or lazily create) a descriptor wallet for the given parameters.
 * Decrypt and encrypt run in workers via the secrets channel; mnemonic never touches the main thread.
 *
 * When switching from one descriptor wallet to another, callers must call
 * `updateDescriptorWalletChangeset` with the current (network, addressType, accountId)
 * before calling this function to persist the active WASM wallet state.
 */
export async function resolveDescriptorWallet(params: {
  walletId: number
  targetNetwork: BitcoinNetwork
  targetAddressType: AddressType
  targetAccountId: number
}): Promise<DescriptorWalletData> {
  const { walletId, targetNetwork, targetAddressType, targetAccountId } = params
  await ensureMigrated()
  await ensureSecretsChannel()
  const walletDb = getDatabase()
  const { resolveDescriptorWallet: workerResolve } = useCryptoStore.getState()
  const encryptedBlobs = await getWalletSecretsEncrypted(walletDb, walletId)
  const resolveDescriptorWorkerResponse = await workerResolve({
    encryptedPayload: encryptedBlobs.payload,
    encryptedMnemonic: encryptedBlobs.mnemonic,
    targetNetwork,
    targetAddressType,
    targetAccountId,
  })
  assertNoMnemonicUpdate(resolveDescriptorWorkerResponse, 'resolveDescriptorWallet')
  if (resolveDescriptorWorkerResponse.encryptedPayloadToStore === null) {
    return resolveDescriptorWorkerResponse.descriptorWalletData
  }
  // That payload was built from the read above; add the row to the current one instead.
  return persistDescriptorWalletRowIfMissing({
    walletDb,
    walletId,
    encryptedMnemonic: encryptedBlobs.mnemonic,
    targetNetwork,
    targetAddressType,
    targetAccountId,
  })
}

function assertNoMnemonicUpdate(
  workerResponse: ResolveDescriptorWalletResult,
  workerMethodName: string,
): void {
  if (workerResponse.encryptedMnemonicToStore !== null) {
    throw new Error(
      `${workerMethodName} returned mnemonic update, which is unsupported in payload-only CAS writes`,
    )
  }
}

/**
 * Adds the (network, addressType, accountId) row in a CAS transform on the current payload,
 * without replacing ACTIVE_WALLET. Returns the stored row, which may come from another writer.
 */
export async function persistDescriptorWalletRowIfMissing(params: {
  walletDb: Kysely<Database>
  walletId: number
  encryptedMnemonic: EncryptedWalletSecretsBlob
  targetNetwork: BitcoinNetwork
  targetAddressType: AddressType
  targetAccountId: number
}): Promise<DescriptorWalletData> {
  const { walletDb, walletId, ...rowTarget } = params
  const { createDescriptorWalletRowIfMissing } = useCryptoStore.getState()
  let storedRow: DescriptorWalletData | null = null
  await updateWalletSecretsEncryptedPayloadWithRetry({
    walletDb,
    walletId,
    transform: async (currentPayload) => {
      const createRowResponse = await createDescriptorWalletRowIfMissing({
        encryptedPayload: currentPayload,
        ...rowTarget,
      })
      assertNoMnemonicUpdate(createRowResponse, 'createDescriptorWalletRowIfMissing')
      storedRow = createRowResponse.descriptorWalletData
      if (createRowResponse.encryptedPayloadToStore === null) {
        return currentPayload
      }
      return workerBlobToPersistence(createRowResponse.encryptedPayloadToStore)
    },
  })
  if (storedRow == null) {
    throw new Error('Descriptor wallet row CAS completed without a row')
  }
  return storedRow
}

/**
 * Update the changeset for a specific descriptor wallet in the secrets array.
 * Used after sync/scan/address generation to persist WASM state changes.
 * When markFullScanDone is true, sets that descriptor wallet's fullScanDone flag.
 * Decrypt and encrypt run in workers; mnemonic never touches the main thread.
 */
export async function updateDescriptorWalletChangeset(params: {
  walletId: number
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
  changesetJson: string
  markFullScanDone?: boolean
  lastSuccessfulEsploraSyncAt?: string
}): Promise<void> {
  const {
    walletId,
    network,
    addressType,
    accountId,
    changesetJson,
    markFullScanDone,
    lastSuccessfulEsploraSyncAt,
  } = params
  await ensureMigrated()
  await ensureSecretsChannel()
  const walletDb = getDatabase()
  const { updateDescriptorWalletChangeset: workerUpdate } = useCryptoStore.getState()
  await updateWalletSecretsEncryptedPayloadWithRetry({
    walletDb,
    walletId,
    transform: async (payload) => {
      const newEncrypted = await workerUpdate({
        encryptedPayload: payload,
        network,
        addressType,
        accountId,
        changesetJson,
        markFullScanDone,
        lastSuccessfulEsploraSyncAt,
      })
      return workerBlobToPersistence(newEncrypted)
    },
  })
}
