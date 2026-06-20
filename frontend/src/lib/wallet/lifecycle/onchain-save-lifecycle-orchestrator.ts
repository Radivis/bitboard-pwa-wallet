import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore } from '@/stores/walletStore'
import { invalidateOnchainDashboardQueries } from '@/lib/wallet/onchain-dashboard-sync'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { updateDescriptorWalletChangeset } from '@/lib/wallet/descriptor-wallet-manager'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { errorMessage } from '@/lib/shared/utils'
import type {
  OnchainSaveLifecycleSnapshot,
  OnchainSaveParams,
} from '@/lib/wallet/lifecycle/onchain-save-lifecycle-types'
import type { OnchainRailDescriptorScope } from '@/lib/wallet/lifecycle/onchain-rail-types'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'

export type { OnchainSaveLifecycleSnapshot, OnchainSaveParams } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-types'

export class OnchainSaveBlockingLockError extends Error {
  constructor() {
    super('On-chain save-error blocks lock until retry or forced lock')
    this.name = 'OnchainSaveBlockingLockError'
  }
}

type InFlightSave = {
  key: string
  promise: Promise<void>
}

let snapshot: OnchainSaveLifecycleSnapshot = {
  savePhase: 'not-configured',
  errorMessage: null,
  descriptorScope: null,
}

let lastSaveParams: OnchainSaveParams | null = null
let forcedLockAcknowledged = false
let suppressCrossTabNotify = false

const listeners = new Set<(next: OnchainSaveLifecycleSnapshot) => void>()
let inFlightSave: InFlightSave | null = null

function saveKey(params: OnchainSaveParams): string {
  return `${params.walletId}:${params.networkMode}:${params.addressType}:${params.accountId}`
}

function descriptorScopeFromParams(params: OnchainSaveParams): OnchainRailDescriptorScope {
  return {
    walletId: params.walletId,
    networkMode: params.networkMode,
    addressType: params.addressType,
    accountId: params.accountId,
  }
}

function notifyListeners(): void {
  const current = getOnchainSaveLifecycleSnapshot()
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

function setSnapshot(next: OnchainSaveLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
}

function clearInFlightSave(work: InFlightSave): void {
  if (inFlightSave === work) {
    inFlightSave = null
  }
}

function beginInFlightSave(key: string, run: () => Promise<void>): Promise<void> {
  let resolveWork!: () => void
  let rejectWork!: (error: unknown) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolveWork = resolve
    rejectWork = reject
  })
  const work: InFlightSave = { key, promise }
  inFlightSave = work
  void (async () => {
    try {
      await run()
      resolveWork()
    } catch (error) {
      rejectWork(error)
    } finally {
      clearInFlightSave(work)
    }
  })()
  return promise
}

function invalidateDashboardQueriesAfterOnchainUpdate(): void {
  invalidateOnchainDashboardQueries()
}

async function runPersistPostEsploraSync(params: OnchainSaveParams): Promise<void> {
  const syncedAtIso = new Date().toISOString()
  useWalletStore.getState().setLastSyncTime(new Date(syncedAtIso))

  const { exportChangeset } = useCryptoStore.getState()
  const changesetJson = await exportChangeset()

  if (params.descriptorWalletCoordinates != null) {
    const { network, addressType, accountId } = params.descriptorWalletCoordinates
    await updateDescriptorWalletChangeset({
      walletId: params.walletId,
      network,
      addressType,
      accountId,
      changesetJson,
      markFullScanDone: params.markFullScanDone,
      lastSuccessfulEsploraSyncAt: syncedAtIso,
    })
  } else {
    const { loadedDescriptorWallet, networkMode, addressType, accountId } =
      useWalletStore.getState()
    const descriptorContext = loadedDescriptorWallet ?? {
      networkMode,
      addressType,
      accountId,
    }
    await updateDescriptorWalletChangeset({
      walletId: params.walletId,
      network: toBitcoinNetwork(descriptorContext.networkMode),
      addressType: descriptorContext.addressType,
      accountId: descriptorContext.accountId,
      changesetJson,
      markFullScanDone: params.markFullScanDone,
      lastSuccessfulEsploraSyncAt: syncedAtIso,
    })
  }
  invalidateDashboardQueriesAfterOnchainUpdate()
}

export function getOnchainSaveLifecycleSnapshot(): OnchainSaveLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeOnchainSaveLifecycle(
  listener: (next: OnchainSaveLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isOnchainSaveBlockingLock(): boolean {
  return snapshot.savePhase === 'save-error' && !forcedLockAcknowledged
}

export function acknowledgeOnchainSaveErrorForForcedLock(): void {
  forcedLockAcknowledged = true
  if (snapshot.savePhase === 'save-error') {
    setSnapshot({
      savePhase: 'not-saving',
      errorMessage: null,
      descriptorScope: snapshot.descriptorScope,
    })
  }
}

export async function awaitOnchainSaveQuiescence(): Promise<void> {
  if (inFlightSave != null) {
    await inFlightSave.promise
  }
}

export function configureOnchainSaveForLoadedRail(scope: OnchainRailDescriptorScope): void {
  if (snapshot.savePhase !== 'not-configured') {
    return
  }
  if (scope.networkMode === 'lab') {
    return
  }
  setSnapshot({
    savePhase: 'not-saving',
    errorMessage: null,
    descriptorScope: scope,
  })
}

export function applyOnchainSaveLifecycleSnapshotFromRemote(
  remoteSnapshot: OnchainSaveLifecycleSnapshot,
): void {
  suppressCrossTabNotify = true
  try {
    setSnapshot({ ...remoteSnapshot })
  } finally {
    suppressCrossTabNotify = false
  }
}

export function syncOnchainSaveLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (lockPhase === 'unlocking' || lockPhase === 'unlocked') {
    return
  }
  if (inFlightSave != null) {
    return
  }
  forcedLockAcknowledged = false
  lastSaveParams = null
  setSnapshot({
    savePhase: 'not-configured',
    errorMessage: null,
    descriptorScope: null,
  })
}

export async function orchestrateOnchainSave(params: OnchainSaveParams): Promise<void> {
  const key = saveKey(params)
  if (inFlightSave?.key === key) {
    return inFlightSave.promise
  }

  lastSaveParams = params
  forcedLockAcknowledged = false
  const scope = descriptorScopeFromParams(params)

  return beginInFlightSave(key, async () => {
    setSnapshot({
      savePhase: 'saving',
      errorMessage: null,
      descriptorScope: scope,
    })
    try {
      await runPersistPostEsploraSync(params)
      setSnapshot({
        savePhase: 'not-saving',
        errorMessage: null,
        descriptorScope: scope,
      })
    } catch (error) {
      console.error('Onchain save failed', error)
      const userFacingErrorMessage =
        sanitizeErrorMessageForUi(errorMessage(error) ?? String(error)) ||
        'Save failed'
      setSnapshot({
        savePhase: 'save-error',
        errorMessage: userFacingErrorMessage,
        descriptorScope: scope,
      })
      throw error
    }
  })
}

export async function orchestrateOnchainRetrySave(): Promise<void> {
  if (lastSaveParams == null) {
    throw new Error('No on-chain save to retry')
  }
  return orchestrateOnchainSave(lastSaveParams)
}

/** @internal Test-only reset */
export function resetOnchainSaveLifecycleStateForTests(): void {
  snapshot = {
    savePhase: 'not-configured',
    errorMessage: null,
    descriptorScope: null,
  }
  inFlightSave = null
  lastSaveParams = null
  forcedLockAcknowledged = false
  listeners.clear()
}
