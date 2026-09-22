import { updateDescriptorWalletChangeset } from '@/lib/wallet/descriptor-wallet-manager'
import {
  BUMPER_ACCOUNT_ID,
  BUMPER_ADDRESS_TYPE,
  shouldPersistBumperSegwit0Sidecar,
} from '@/lib/wallet/bumper-segwit0-policy'
import type { BitcoinNetwork } from '@/lib/wallet/wallet-domain-types'

export async function persistBumperSegwit0SidecarIfAllowed(params: {
  walletId: number
  network: BitcoinNetwork
  changesetJson: string
  markFullScanDone: boolean
  lastSuccessfulEsploraSyncAt?: string
  loadedAddressType: string | null
  loadedAccountId: number | null
}): Promise<boolean> {
  if (
    !shouldPersistBumperSegwit0Sidecar({
      loadedAddressType: params.loadedAddressType,
      loadedAccountId: params.loadedAccountId,
    })
  ) {
    return false
  }
  await updateDescriptorWalletChangeset({
    walletId: params.walletId,
    network: params.network,
    addressType: BUMPER_ADDRESS_TYPE,
    accountId: BUMPER_ACCOUNT_ID,
    changesetJson: params.changesetJson,
    markFullScanDone: params.markFullScanDone,
    lastSuccessfulEsploraSyncAt: params.lastSuccessfulEsploraSyncAt,
  })
  return true
}
