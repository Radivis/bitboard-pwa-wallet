import { useWalletStore } from '@/stores/walletStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { resolveDescriptorWallet } from '@/lib/wallet/descriptor-wallet-manager'
import { withPersistedChainMismatchRetry } from '@/lib/wallet/persisted-chain-mismatch'
import { refreshWalletStoreFromLoadedBdk } from '@/lib/wallet/onchain-bdk-store-sync'
import { invalidateOnchainDashboardQueries } from '@/lib/wallet/onchain-dashboard-sync'
import { waitForCryptoWorkerHealthy } from '@/workers/crypto-factory'
import type { LoadWalletParams } from '@/workers/crypto-api'
import type {
  OnchainLoadLifecycleSnapshot,
  OnchainLoadParams,
} from '@/lib/wallet/lifecycle/onchain-load-lifecycle-types'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import { configureOnchainSyncForLoadedRail } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'

export type { OnchainLoadLifecycleSnapshot, OnchainLoadParams } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-types'

/**
 * OnchainLoadLifecycle — WASM descriptor load into crypto worker and wallet store hydration.
 *
 * Does not own Esplora sync (L2: OnchainSyncLifecycle) or changeset persist (L2: OnchainSaveLifecycle).
 */

type InFlightLoad = {
  key: string
  promise: Promise<void>
}

let snapshot: OnchainLoadLifecycleSnapshot = {
  loadPhase: 'not-configured',
  networkMode: null,
}

let suppressCrossTabNotify = false

const listeners = new Set<(next: OnchainLoadLifecycleSnapshot) => void>()

let inFlightLoad: InFlightLoad | null = null

function loadKey(params: OnchainLoadParams): string {
  return `${params.walletId}:${params.networkMode}:${params.addressType}:${params.accountId}`
}

function notifyListeners(): void {
  const current = getOnchainLoadLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
  if (!suppressCrossTabNotify) {
    void import('@/lib/wallet/lifecycle/onchain-rail-lifecycle-cross-tab-sync').then(
      ({ notifyOnchainRailLifecycleChangedFromThisTab }) => {
        notifyOnchainRailLifecycleChangedFromThisTab()
      },
    )
  }
}

function setSnapshot(next: OnchainLoadLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
}

function clearInFlightLoad(work: InFlightLoad): void {
  if (inFlightLoad === work) {
    inFlightLoad = null
  }
}

function beginInFlightLoad(key: string, run: () => Promise<void>): Promise<void> {
  let resolveWork!: () => void
  let rejectWork!: (error: unknown) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolveWork = resolve
    rejectWork = reject
  })
  const work: InFlightLoad = { key, promise }
  inFlightLoad = work
  void (async () => {
    try {
      await run()
      resolveWork()
    } catch (error) {
      rejectWork(error)
    } finally {
      clearInFlightLoad(work)
    }
  })()
  return promise
}

async function loadWalletHandlingPersistedChainMismatch(
  loadWallet: (params: LoadWalletParams) => Promise<boolean>,
  params: LoadWalletParams,
): Promise<void> {
  await withPersistedChainMismatchRetry(loadWallet, params)
}

async function runWasmLoad(params: OnchainLoadParams): Promise<void> {
  const { walletId, networkMode, addressType, accountId } = params
  const clearLastSyncTime = params.clearLastSyncTime ?? false

  await waitForCryptoWorkerHealthy()
  const network = toBitcoinNetwork(networkMode)
  const descriptorWallet = await resolveDescriptorWallet({
    walletId,
    targetNetwork: network,
    targetAddressType: addressType,
    targetAccountId: accountId,
  })

  const { loadWallet, getCurrentAddress } = useCryptoStore.getState()
  const {
    setWalletStatus,
    setBalance,
    setTransactions,
    setCurrentAddress,
    setLastSyncTime,
    commitLoadedDescriptorWallet,
  } = useWalletStore.getState()

  setCurrentAddress(null)
  setBalance(null)
  setTransactions([])
  if (clearLastSyncTime) {
    setLastSyncTime(null)
  }

  await loadWalletHandlingPersistedChainMismatch(loadWallet, {
    externalDescriptor: descriptorWallet.externalDescriptor,
    internalDescriptor: descriptorWallet.internalDescriptor,
    network,
    changesetJson: descriptorWallet.changeSet,
    useEmptyChain: false,
  })

  const address = await getCurrentAddress()
  setCurrentAddress(address)
  commitLoadedDescriptorWallet({
    networkMode,
    addressType,
    accountId,
  })
  setWalletStatus('unlocked')

  if (networkMode !== 'lab') {
    await refreshWalletStoreFromLoadedBdk()
    invalidateOnchainDashboardQueries()
  }

  const { startAutoLockTimer } = await import('@/stores/sessionStore')
  startAutoLockTimer(async () => {
    const { orchestrateLock } = await import(
      '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'
    )
    const { reportWalletSaveBlockingLock } = await import(
      '@/lib/wallet/wallet-save-error-toast'
    )
    try {
      await orchestrateLock()
    } catch (error) {
      reportWalletSaveBlockingLock(error)
    }
  })
}

export function getOnchainLoadLifecycleSnapshot(): OnchainLoadLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeOnchainLoadLifecycle(
  listener: (next: OnchainLoadLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function applyOnchainLoadLifecycleSnapshotFromOtherTab(
  remoteSnapshot: OnchainLoadLifecycleSnapshot,
): void {
  suppressCrossTabNotify = true
  try {
    setSnapshot({ ...remoteSnapshot })
  } finally {
    suppressCrossTabNotify = false
  }
}

export function syncOnchainLoadLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (lockPhase === 'unlocking' || lockPhase === 'unlocked') {
    return
  }
  if (inFlightLoad != null) {
    return
  }
  setSnapshot({ loadPhase: 'not-configured', networkMode: null })
}

export async function orchestrateOnchainLoad(params: OnchainLoadParams): Promise<void> {
  const key = loadKey(params)
  if (inFlightLoad?.key === key) {
    return inFlightLoad.promise
  }

  if (inFlightLoad != null) {
    await inFlightLoad.promise
    if (inFlightLoad?.key === key) {
      return inFlightLoad.promise
    }
  }

  return beginInFlightLoad(key, async () => {
    setSnapshot({ loadPhase: 'loading', networkMode: params.networkMode })
    try {
      await runWasmLoad(params)
      setSnapshot({ loadPhase: 'loaded', networkMode: params.networkMode })
      if (params.networkMode !== 'lab') {
        configureOnchainSyncForLoadedRail({
          walletId: params.walletId,
          networkMode: params.networkMode,
          addressType: params.addressType,
          accountId: params.accountId,
        })
      }
    } catch (error) {
      setSnapshot({ loadPhase: 'load-error', networkMode: params.networkMode })
      throw error
    }
  })
}

/** @internal Test-only reset */
export function resetOnchainLoadLifecycleStateForTests(): void {
  snapshot = { loadPhase: 'not-configured', networkMode: null }
  inFlightLoad = null
  listeners.clear()
}
