import { ensureMigrated, getDatabase } from '@/db/database'
import {
  getWalletSecretsEncrypted,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'
import { assertIso8601LastSuccessfulEsploraSyncAt } from '@/lib/wallet/wallet-domain-types'
import type { AddressType, BitcoinNetwork } from '@/workers/crypto-types'
import { ensureSecretsChannel } from '@/workers/secrets-channel'
import { useCryptoStore } from '@/stores/cryptoStore'

export function descriptorWalletKey(params: {
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
}): string {
  return `${params.network}:${params.addressType}:${params.accountId}`
}

export function applyLastSuccessfulEsploraSyncAtToPayload(
  payload: WalletSecretsPayload,
  patch: {
    network: BitcoinNetwork
    addressType: AddressType
    accountId: number
    syncedAtIso: string
  },
): WalletSecretsPayload {
  assertIso8601LastSuccessfulEsploraSyncAt(patch.syncedAtIso)
  return {
    ...payload,
    descriptorWallets: payload.descriptorWallets.map((descriptorWallet) => {
      if (
        descriptorWallet.network !== patch.network ||
        descriptorWallet.addressType !== patch.addressType ||
        descriptorWallet.accountId !== patch.accountId
      ) {
        return descriptorWallet
      }
      return {
        ...descriptorWallet,
        lastSuccessfulEsploraSyncAt: patch.syncedAtIso,
      }
    }),
  }
}

/**
 * Persist only `lastSuccessfulEsploraSyncAt` without updating the changeset.
 * Prefer {@link persistPostEsploraSyncDescriptorWalletState} in `wallet-utils.ts`
 * after Esplora sync so changeset and timestamp are written together.
 */
export async function persistLastSuccessfulEsploraSyncAt(params: {
  password: string
  walletId: number
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
  syncedAtIso: string
}): Promise<void> {
  const { password, walletId, network, addressType, accountId, syncedAtIso } =
    params

  await updateWalletSecretsPayloadWithRetry({
    walletDb: getDatabase(),
    walletId,
    password,
    transform: async (payload) =>
      applyLastSuccessfulEsploraSyncAtToPayload(payload, {
        network,
        addressType,
        accountId,
        syncedAtIso,
      }),
  })
}

/**
 * Load persisted Esplora sync timestamp for one descriptor wallet.
 * Decrypt and payload parse run in the crypto worker; the main thread receives
 * only the ISO string (or undefined).
 */
export async function loadLastSuccessfulEsploraSyncAtForDescriptorWallet(params: {
  password: string
  walletId: number
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
}): Promise<string | undefined> {
  const { password, walletId, network, addressType, accountId } = params
  await ensureMigrated()
  await ensureSecretsChannel()
  const encryptedBlobs = await getWalletSecretsEncrypted(getDatabase(), walletId)
  const { readLastSuccessfulEsploraSyncAtForDescriptorWallet } =
    useCryptoStore.getState()
  return readLastSuccessfulEsploraSyncAtForDescriptorWallet({
    password,
    encryptedPayload: encryptedBlobs.payload,
    network,
    addressType,
    accountId,
  })
}
