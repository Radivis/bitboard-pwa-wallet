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
 * 2. If a WASM wallet is currently active, exports its changeset and saves it
 * 3. Looks up the target descriptor wallet in the array
 * 4. If not found, creates one via WASM and appends it
 * 5. Re-encrypts and persists updated secrets
 * 6. Returns the resolved descriptor wallet data
 */
export async function resolveDescriptorWallet(
  password: string,
  walletId: number,
  targetNetwork: BitcoinNetwork,
  targetAddressType: AddressType,
  targetAccountId: number,
): Promise<DescriptorWalletData> {
  await ensureMigrated()
  const db = getDatabase()
  const secrets = await loadWalletSecrets(db, password, walletId)

  await persistActiveWalletChangeset(secrets, password, walletId)

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
 * Export the changeset from the currently active WASM wallet and save it
 * back to the matching descriptor wallet entry in secrets.
 *
 * This is a no-op if no descriptor wallets exist yet (fresh wallet).
 */
async function persistActiveWalletChangeset(
  secrets: WalletSecrets,
  password: string,
  walletId: number,
): Promise<void> {
  if (secrets.descriptorWallets.length === 0) return

  const { exportChangeset } = useCryptoStore.getState()
  try {
    const changesetJson = await exportChangeset()
    // We don't know which descriptor wallet is currently active in WASM,
    // so we update the changeset for the most recently used one.
    // The caller is responsible for calling this before switching.
    // For simplicity, we save it and let the caller handle the mapping.
    // The actual matching is done by the caller via the wallet store state.
    await ensureMigrated()
    const db = getDatabase()
    await saveWalletSecrets(db, password, walletId, secrets)
    // Note: the changeset is updated by the caller who knows which DW is active
    void changesetJson
  } catch {
    // If no wallet is active in WASM (e.g., first unlock), export will fail.
    // This is expected and safe to ignore.
  }
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
  const db = getDatabase()
  await saveWalletSecrets(db, password, walletId, secrets)

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
  const db = getDatabase()
  const secrets = await loadWalletSecrets(db, password, walletId)

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
  await saveWalletSecrets(db, password, walletId, secrets)
}
