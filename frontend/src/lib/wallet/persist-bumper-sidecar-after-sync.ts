import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { persistBumperSegwit0SidecarIfAllowed } from '@/lib/wallet/persist-bumper-segwit0-sidecar'
import type { NetworkMode } from '@/stores/walletStore'
import { useWalletStore } from '@/stores/walletStore'
import { getArkadeWorker } from '@/workers/arkade-factory'

export async function persistBumperSidecarAfterWalletSync(params: {
  walletId: number
  networkMode: NetworkMode
}): Promise<boolean> {
  const worker = getArkadeWorker()
  const changesetJson = await worker.exportOnchainWalletChangeset()
  const fullScanDone = await worker.onchainWalletFullScanDone()
  const walletState = useWalletStore.getState()
  const loaded = walletState.loadedDescriptorWallet
  return persistBumperSegwit0SidecarIfAllowed({
    walletId: params.walletId,
    network: toBitcoinNetwork(params.networkMode),
    changesetJson,
    markFullScanDone: fullScanDone,
    lastSuccessfulEsploraSyncAt: new Date().toISOString(),
    loadedAddressType: loaded?.addressType ?? walletState.addressType,
    loadedAccountId: loaded?.accountId ?? walletState.accountId,
  })
}

export async function persistBumperSidecarBestEffort(
  params: { walletId: number; networkMode: NetworkMode },
  context: string,
): Promise<void> {
  try {
    await persistBumperSidecarAfterWalletSync(params)
  } catch (error: unknown) {
    console.warn(`Arkade sidecar SegWit-0 persist ${context} failed`, error)
  }
}

export async function persistBumperSidecarAfterWalletWideSyncIfNeeded(params: {
  walletId: number
  networkMode: NetworkMode
  didWalletWideSync: boolean
}): Promise<void> {
  if (!params.didWalletWideSync) {
    return
  }
  await persistBumperSidecarBestEffort(
    { walletId: params.walletId, networkMode: params.networkMode },
    'after bumper sync',
  )
}
