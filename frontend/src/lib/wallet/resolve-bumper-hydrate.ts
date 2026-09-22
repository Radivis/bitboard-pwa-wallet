import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import {
  bumperFullScanDoneForHydrate,
  bumperHydrateSource,
  isLoadedSegwit0Triple,
  persistedChangesetIsUsable,
} from '@/lib/wallet/bumper-segwit0-policy'
import { ensureSegwit0DescriptorRow } from '@/lib/wallet/ensure-segwit0-descriptor-row'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore } from '@/stores/walletStore'

export type BumperHydrateBlob = {
  bumperChangesetJson?: string
  bumperFullScanDone: boolean
}

export async function resolveBumperHydrateForSessionOpen(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
}): Promise<BumperHydrateBlob> {
  const network = toBitcoinNetwork(params.networkMode)
  const row = await ensureSegwit0DescriptorRow({
    walletId: params.walletId,
    network,
  })
  const loaded = useWalletStore.getState().loadedDescriptorWallet
  const source = bumperHydrateSource({
    loadedIsSegwit0: isLoadedSegwit0Triple(loaded),
    persistedChangesetUsable: persistedChangesetIsUsable(row.changeSet),
  })

  const bumperFullScanDone = bumperFullScanDoneForHydrate({
    source,
    rowFullScanDone: row.fullScanDone,
  })

  if (source === 'live-export') {
    const changesetJson = await useCryptoStore.getState().exportChangeset()
    return {
      bumperChangesetJson: changesetJson,
      bumperFullScanDone,
    }
  }

  if (source === 'persisted-row') {
    return {
      bumperChangesetJson: row.changeSet,
      bumperFullScanDone,
    }
  }

  return { bumperFullScanDone }
}
