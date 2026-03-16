import { getDatabase, ensureMigrated, loadWalletSecrets, saveWalletSecrets } from '@/db'
import type { DescriptorWalletData, WalletSecrets } from '@/db/wallet-persistence'
import type { AddressType, BitcoinNetwork } from '@/workers/crypto-types'
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
 *
 * 1. Decrypts wallet secrets
 * 2. Looks up the target descriptor wallet in the array
 * 3. If not found, creates one via WASM and appends it
 * 4. Re-encrypts and persists updated secrets
 * 5. Returns the resolved descriptor wallet data
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
  const walletDb = getDatabase()
  const secrets = await loadWalletSecrets(walletDb, password, walletId)

  const existing = findDescriptorWallet(
    secrets,
    targetNetwork,
    targetAddressType,
    targetAccountId,
  )
  if (existing) {
    return existing
  }

  return await createAndPersistDescriptorWallet(
    secrets,
    password,
    walletId,
    targetNetwork,
    targetAddressType,
    targetAccountId,
  )
}

/**
 * Create a new descriptor wallet via WASM, append it to the secrets array,
 * persist the updated secrets, and return the new entry.
 */
async function createAndPersistDescriptorWallet(
  secrets: WalletSecrets,
  password: string,
  walletId: number,
  network: BitcoinNetwork,
  addressType: AddressType,
  accountId: number,
): Promise<DescriptorWalletData> {
  const { createWallet } = useCryptoStore.getState()
  const walletResult = await createWallet(
    secrets.mnemonic,
    network,
    addressType,
    accountId,
  )

  const descriptorWallet: DescriptorWalletData = {
    network,
    addressType,
    accountId,
    externalDescriptor: walletResult.external_descriptor,
    internalDescriptor: walletResult.internal_descriptor,
    changeSet: walletResult.changeset_json,
  }

  secrets.descriptorWallets.push(descriptorWallet)

  await ensureMigrated()
  const walletDb = getDatabase()
  await saveWalletSecrets(walletDb, password, walletId, secrets)

  return descriptorWallet
}

/**
 * Update the changeset for a specific descriptor wallet in the secrets array.
 * Used after sync/scan/address generation to persist WASM state changes.
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
  const walletDb = getDatabase()
  const secrets = await loadWalletSecrets(walletDb, password, walletId)

  const descriptorWallet = findDescriptorWallet(
    secrets,
    network,
    addressType,
    accountId,
  )
  if (!descriptorWallet) {
    throw new Error(
      `No descriptor wallet found for ${network}/${addressType}/${accountId}`,
    )
  }

  descriptorWallet.changeSet = changesetJson
  await saveWalletSecrets(walletDb, password, walletId, secrets)
}
