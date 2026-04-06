import {
  getDatabase,
  ensureMigrated,
  getWalletSecretsEncrypted,
  putSplitWalletSecretsEncrypted,
} from '@/db'
import type { DescriptorWalletData, EncryptedWalletSecretsBlob, WalletSecrets } from '@/db/wallet-persistence'
import type { EncryptedBlobForDb } from '@/workers/crypto-api'
import type { AddressType, BitcoinNetwork } from '@/workers/crypto-types'
import { ensureSecretsChannel } from '@/workers/secrets-channel'
import { useCryptoStore } from '@/stores/cryptoStore'

/**
 * Find a descriptor wallet matching the given (network, addressType, accountId)
 * within the wallet secrets array.
 */
export function findDescriptorWallet(params: {
  secrets: WalletSecrets
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
}): DescriptorWalletData | undefined {
  const { secrets, network, addressType, accountId } = params
  return secrets.descriptorWallets.find(
    (dw) =>
      dw.network === network &&
      dw.addressType === addressType &&
      dw.accountId === accountId,
  )
}

function workerBlobToPersistence(blob: EncryptedBlobForDb): EncryptedWalletSecretsBlob {
  return {
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    salt: blob.salt,
    kdfVersion: blob.kdfVersion as EncryptedWalletSecretsBlob['kdfVersion'],
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
  password: string
  walletId: number
  targetNetwork: BitcoinNetwork
  targetAddressType: AddressType
  targetAccountId: number
}): Promise<DescriptorWalletData> {
  const { password, walletId, targetNetwork, targetAddressType, targetAccountId } =
    params
  await ensureMigrated()
  await ensureSecretsChannel()
  const walletDb = getDatabase()
  const encryptedBlobs = await getWalletSecretsEncrypted(walletDb, walletId)
  const { resolveDescriptorWallet: workerResolve } = useCryptoStore.getState()
  const result = await workerResolve({
    password,
    encryptedPayload: encryptedBlobs.payload,
    encryptedMnemonic: encryptedBlobs.mnemonic,
    targetNetwork,
    targetAddressType,
    targetAccountId,
  })
  if (
    result.encryptedPayloadToStore !== null ||
    result.encryptedMnemonicToStore !== null
  ) {
    const current = await getWalletSecretsEncrypted(walletDb, walletId)
    await putSplitWalletSecretsEncrypted(walletDb, walletId, {
      payload:
        result.encryptedPayloadToStore !== null
          ? workerBlobToPersistence(result.encryptedPayloadToStore)
          : current.payload,
      mnemonic:
        result.encryptedMnemonicToStore !== null
          ? workerBlobToPersistence(result.encryptedMnemonicToStore)
          : undefined,
    })
  }
  return result.descriptorWalletData
}

/**
 * Update the changeset for a specific descriptor wallet in the secrets array.
 * Used after sync/scan/address generation to persist WASM state changes.
 * When markFullScanDone is true, sets that sub-wallet's fullScanDone flag.
 * Decrypt and encrypt run in workers; mnemonic never touches the main thread.
 */
export async function updateDescriptorWalletChangeset(params: {
  password: string
  walletId: number
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
  changesetJson: string
  markFullScanDone?: boolean
}): Promise<void> {
  const {
    password,
    walletId,
    network,
    addressType,
    accountId,
    changesetJson,
    markFullScanDone,
  } = params
  await ensureMigrated()
  await ensureSecretsChannel()
  const walletDb = getDatabase()
  const { payload } = await getWalletSecretsEncrypted(walletDb, walletId)
  const { updateDescriptorWalletChangeset: workerUpdate } = useCryptoStore.getState()
  const newEncrypted = await workerUpdate({
    password,
    encryptedPayload: payload,
    network,
    addressType,
    accountId,
    changesetJson,
    markFullScanDone,
  })
  await putSplitWalletSecretsEncrypted(walletDb, walletId, {
    payload: workerBlobToPersistence(newEncrypted),
  })
}
