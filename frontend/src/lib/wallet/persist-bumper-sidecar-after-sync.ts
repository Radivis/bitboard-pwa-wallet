import {
  isArkadeSupportedNetworkMode,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { persistBumperSegwit0SidecarIfAllowed } from '@/lib/wallet/persist-bumper-segwit0-sidecar'
import type { NetworkMode } from '@/stores/walletStore'
import { useWalletStore } from '@/stores/walletStore'
import { getArkadeWorker } from '@/workers/arkade-factory'

async function arkadeSessionMatchesPersistTarget(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
}): Promise<boolean> {
  const arkadeAccountId = useWalletStore.getState().activeArkadeAccountId
  if (arkadeAccountId == null) {
    return false
  }
  return getArkadeWorker().hasOpenSession({
    walletId: params.walletId,
    networkMode: params.networkMode,
    arkadeAccountId,
  })
}

export async function persistBumperSidecarAfterWalletSync(params: {
  walletId: number
  networkMode: NetworkMode
}): Promise<boolean> {
  if (!isArkadeSupportedNetworkMode(params.networkMode)) {
    return false
  }
  if (
    !(await arkadeSessionMatchesPersistTarget({
      walletId: params.walletId,
      networkMode: params.networkMode,
    }))
  ) {
    return false
  }
  const worker = getArkadeWorker()
  const exportSyncedAt = new Date().toISOString()
  const changesetJson = await worker.exportOnchainWalletChangeset()
  const fullScanDone = await worker.onchainWalletFullScanDone()
  const walletState = useWalletStore.getState()
  const loaded = walletState.loadedDescriptorWallet
  return persistBumperSegwit0SidecarIfAllowed({
    walletId: params.walletId,
    network: toBitcoinNetwork(params.networkMode),
    changesetJson,
    markFullScanDone: fullScanDone,
    lastSuccessfulEsploraSyncAt: exportSyncedAt,
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
  needsBumperWalletSync: boolean
}): Promise<void> {
  if (!params.needsBumperWalletSync) {
    return
  }
  await persistBumperSidecarBestEffort(
    { walletId: params.walletId, networkMode: params.networkMode },
    'after bumper sync',
  )
}
