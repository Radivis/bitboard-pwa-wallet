import { updateDescriptorWalletChangeset } from '@/lib/wallet/descriptor-wallet-manager'
import { shouldPersistBumperSegwit0Sidecar } from '@/lib/wallet/bumper-segwit0-policy'
import { AddressType } from '@/lib/wallet/wallet-domain-types'
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
    addressType: AddressType.SegWit,
    accountId: 0,
    changesetJson: params.changesetJson,
    markFullScanDone: params.markFullScanDone,
    lastSuccessfulEsploraSyncAt: params.lastSuccessfulEsploraSyncAt,
  })
  return true
}
