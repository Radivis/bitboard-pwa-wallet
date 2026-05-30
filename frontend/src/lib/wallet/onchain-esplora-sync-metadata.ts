import { getDatabase } from '@/db/database'
import {
  loadWalletSecretsPayload,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'
import type { AddressType, BitcoinNetwork } from '@/workers/crypto-types'

export function subWalletKey(params: {
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

export async function loadLastSuccessfulEsploraSyncAtForSubWallet(params: {
  password: string
  walletId: number
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
}): Promise<string | undefined> {
  const { password, walletId, network, addressType, accountId } = params
  const payload = await loadWalletSecretsPayload(getDatabase(), password, walletId)
  const descriptorWallet = payload.descriptorWallets.find(
    (row) =>
      row.network === network &&
      row.addressType === addressType &&
      row.accountId === accountId,
  )
  return descriptorWallet?.lastSuccessfulEsploraSyncAt
}
