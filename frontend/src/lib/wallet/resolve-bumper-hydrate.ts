import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import {
  bumperHydrateSource,
  isLoadedSegwit0Triple,
  persistedChangesetIsUsable,
} from '@/lib/wallet/bumper-segwit0-policy'
import { ensureSegwit0DescriptorRow } from '@/lib/wallet/ensure-segwit0-descriptor-row'
import {
  getOnchainLoadHydrationForPostUnlock,
  getOnchainLoadLifecycleSnapshot,
} from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
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
    onchainLoadPhaseLoaded:
      getOnchainLoadLifecycleSnapshot().loadPhase === 'loaded',
    persistedChangesetUsable: persistedChangesetIsUsable(row.changeSet),
  })

  if (source === 'live-export') {
    const changesetJson = await useCryptoStore.getState().exportChangeset()
    const fullScanDone =
      getOnchainLoadHydrationForPostUnlock()?.fullScanDone ?? row.fullScanDone
    return {
      bumperChangesetJson: changesetJson,
      bumperFullScanDone: fullScanDone,
    }
  }

  if (source === 'persisted-row') {
    return {
      bumperChangesetJson: row.changeSet,
      bumperFullScanDone: row.fullScanDone,
    }
  }

  return { bumperFullScanDone: false }
}
