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
import {
  awaitDifferentInFlightWork,
  createInFlightLifecycleTracker,
  getCoalescedInFlightPromise,
} from '@/lib/wallet/lifecycle/lifecycle-in-flight-tracker'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'
import { configureOnchainSyncForLoadedRail } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import {
  LIFECYCLE_LOAD_ERROR_FALLBACK,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'

export type { OnchainLoadLifecycleSnapshot, OnchainLoadParams } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-types'

/**
 * OnchainLoadLifecycle — WASM descriptor load into crypto worker and wallet store hydration.
 *
 * Does not own Esplora sync (L2: OnchainSyncLifecycle) or changeset persist (L2: OnchainSaveLifecycle).
 */

let snapshot: OnchainLoadLifecycleSnapshot = {
  loadPhase: 'not-configured',
  networkMode: null,
  errorMessage: null,
}

const listeners = new Set<(next: OnchainLoadLifecycleSnapshot) => void>()

const inFlightLoadTracker = createInFlightLifecycleTracker()
let lastLoadParams: OnchainLoadParams | null = null

function isOnchainLoadFailedForNetwork(networkMode: OnchainLoadParams['networkMode']): boolean {
  const current = getOnchainLoadLifecycleSnapshot()
  return current.loadPhase === 'load-error' && current.networkMode === networkMode
}

function loadKey(params: OnchainLoadParams): string {
  return `${params.walletId}:${params.networkMode}:${params.addressType}:${params.accountId}`
}

function notifyListeners(): void {
  const current = getOnchainLoadLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
}

function setSnapshot(next: OnchainLoadLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
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

export function syncOnchainLoadLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (
    shouldSkipRailLifecycleResetForLockPhase(
      lockPhase,
      inFlightLoadTracker.getCurrent() != null,
    )
  ) {
    return
  }
  setSnapshot({ loadPhase: 'not-configured', networkMode: null, errorMessage: null })
}

export async function awaitOnchainLoadQuiescence(): Promise<void> {
  await inFlightLoadTracker.awaitQuiescence()
}

/**
 * Import/create paths hydrate WASM outside orchestrateOnchainLoad. Mark the rail loaded and
 * configure sync/save so dashboard controls (e.g. rail-sync-onchain) appear without a second load.
 */
export function markOnchainRailLoadedAfterExternalHydration(params: OnchainLoadParams): void {
  const current = getOnchainLoadLifecycleSnapshot()
  if (
    current.loadPhase === 'loaded' &&
    current.networkMode === params.networkMode &&
    inFlightLoadTracker.getCurrent() == null
  ) {
    return
  }
  if (inFlightLoadTracker.getCurrent() != null) {
    return
  }

  setSnapshot({ loadPhase: 'loaded', networkMode: params.networkMode, errorMessage: null })
  if (params.networkMode !== 'lab') {
    configureOnchainSyncForLoadedRail({
      walletId: params.walletId,
      networkMode: params.networkMode,
      addressType: params.addressType,
      accountId: params.accountId,
    })
  }
}

export async function orchestrateOnchainLoad(params: OnchainLoadParams): Promise<void> {
  if (isOnchainLoadFailedForNetwork(params.networkMode) && !params.allowRetryFromError) {
    return
  }

  const { allowRetryFromError, ...persistedParams } = params
  void allowRetryFromError
  lastLoadParams = persistedParams

  const key = loadKey(params)
  const coalesced = getCoalescedInFlightPromise(inFlightLoadTracker, key)
  if (coalesced != null) {
    return coalesced
  }
  const afterDifferentWork = await awaitDifferentInFlightWork(inFlightLoadTracker, key)
  if (afterDifferentWork != null) {
    return afterDifferentWork
  }

  return inFlightLoadTracker.begin(key, async () => {
    setSnapshot({
      loadPhase: 'loading',
      networkMode: params.networkMode,
      errorMessage: null,
    })
    try {
      await runWasmLoad(params)
      setSnapshot({
        loadPhase: 'loaded',
        networkMode: params.networkMode,
        errorMessage: null,
      })
      if (params.networkMode !== 'lab') {
        configureOnchainSyncForLoadedRail({
          walletId: params.walletId,
          networkMode: params.networkMode,
          addressType: params.addressType,
          accountId: params.accountId,
        })
      }
    } catch (error) {
      setSnapshot({
        loadPhase: 'load-error',
        networkMode: params.networkMode,
        errorMessage: userFacingLifecycleErrorMessage(error, LIFECYCLE_LOAD_ERROR_FALLBACK),
      })
      throw error
    }
  })
}

export async function orchestrateOnchainRetryLoad(): Promise<void> {
  if (lastLoadParams == null) {
    throw new Error('No on-chain load to retry')
  }
  return orchestrateOnchainLoad({ ...lastLoadParams, allowRetryFromError: true })
}

/** @internal Test-only reset */
export function resetOnchainLoadLifecycleStateForTests(): void {
  snapshot = { loadPhase: 'not-configured', networkMode: null, errorMessage: null }
  inFlightLoadTracker.clearCurrent()
  lastLoadParams = null
  listeners.clear()
}
