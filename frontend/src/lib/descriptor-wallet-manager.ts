import { getDatabase, ensureMigrated, getWalletSecretsEncrypted, putWalletSecretsEncrypted } from '@/db'
import type { DescriptorWalletData, WalletSecrets } from '@/db/wallet-persistence'
import type { AddressType, BitcoinNetwork } from '@/workers/crypto-types'
import { ensureSecretsChannel } from '@/workers/secrets-channel'
import { useCryptoStore } from '@/stores/cryptoStore'

/**
 * Find a descriptor wallet matching the given (network, addressType, accountId)
 * within the wallet secrets array.
 */
export function findDescriptorWallet(
  secrets: WalletSecrets,
  network: BitcoinNetwork,
  addressType: AddressType,
  accountId: number,
): DescriptorWalletData | undefined {
  return secrets.descriptorWallets.find(
    (dw) =>
      dw.network === network &&
      dw.addressType === addressType &&
      dw.accountId === accountId,
  )
}

/**
 * Resolve (find or lazily create) a descriptor wallet for the given parameters.
 * Decrypt and encrypt run in workers via the secrets channel; mnemonic never touches the main thread.
 *
 * When switching from one descriptor wallet to another, callers must call
 * `updateDescriptorWalletChangeset` with the current (network, addressType, accountId)
 * before calling this function to persist the active WASM wallet state.
 */
export async function resolveDescriptorWallet(
  password: string,
  walletId: number,
  targetNetwork: BitcoinNetwork,
  targetAddressType: AddressType,
  targetAccountId: number,
): Promise<DescriptorWalletData> {
  await ensureMigrated()
  await ensureSecretsChannel()
  const walletDb = getDatabase()
  const encryptedBlob = await getWalletSecretsEncrypted(walletDb, walletId)
  const { resolveDescriptorWallet: workerResolve } = useCryptoStore.getState()
  const result = await workerResolve(
    password,
    encryptedBlob,
    targetNetwork,
    targetAddressType,
    targetAccountId,
  )
  if (result.encryptedBlobToStore) {
    await putWalletSecretsEncrypted(walletDb, walletId, result.encryptedBlobToStore)
  }
  return result.descriptorWalletData
}

/**
 * Update the changeset for a specific descriptor wallet in the secrets array.
 * Used after sync/scan/address generation to persist WASM state changes.
 * Decrypt and encrypt run in workers; mnemonic never touches the main thread.
 */
export async function updateDescriptorWalletChangeset(
  password: string,
  walletId: number,
  network: BitcoinNetwork,
  addressType: AddressType,
  accountId: number,
  changesetJson: string,
): Promise<void> {
  await ensureMigrated()
  await ensureSecretsChannel()
  const walletDb = getDatabase()
  const encryptedBlob = await getWalletSecretsEncrypted(walletDb, walletId)
  const { updateDescriptorWalletChangeset: workerUpdate } = useCryptoStore.getState()
  const newEncrypted = await workerUpdate(
    password,
    encryptedBlob,
    network,
    addressType,
    accountId,
    changesetJson,
  )
  await putWalletSecretsEncrypted(walletDb, walletId, newEncrypted)
}
