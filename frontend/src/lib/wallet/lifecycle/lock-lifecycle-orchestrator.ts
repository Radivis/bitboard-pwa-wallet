import type { AddressType, NetworkMode } from '@/stores/walletStore'
import { useWalletStore } from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { useCryptoStore } from '@/stores/cryptoStore'
import {
  orchestrateOnchainLoad,
  awaitOnchainLoadQuiescence,
} from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import {
  orchestrateArkadeLoad,
  awaitArkadeLoadQuiescence,
} from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import {
  awaitArkadeSaveQuiescence,
  isArkadeSaveBlockingLock,
  ArkadeSaveBlockingLockError,
} from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import {
  awaitArkadeSyncQuiescence,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import {
  orchestrateLightningLoad,
  awaitLightningLoadQuiescence,
} from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'
import {
  awaitLightningSaveQuiescence,
  isLightningSaveBlockingLock,
  LightningSaveBlockingLockError,
} from '@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator'
import {
  awaitLightningSyncQuiescence,
} from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { orchestrateOnchainPostUnlockSync } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import {
  awaitOnchainSaveQuiescence,
  isOnchainSaveBlockingLock,
  OnchainSaveBlockingLockError,
} from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import {
  awaitOnchainSyncQuiescence,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import { syncAllRailLifecyclesWithLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-handoff'
import { awaitInFlightWalletSecretsWrites } from '@/db/wallet-secrets-write-tracker'
import {
  ensureWalletSecretsSession,
  endWalletSecretsSession,
  isWalletSecretsSessionActive,
} from '@/lib/wallet/wallet-secrets-session'
import { waitForCryptoWorkerHealthy } from '@/workers/crypto-factory'
import type {
  LockLifecycleOperation,
  LockLifecyclePhase,
  LockLifecycleSnapshot,
} from '@/lib/wallet/lifecycle/lock-lifecycle-types'

export type { LockLifecyclePhase, LockLifecycleOperation, LockLifecycleSnapshot } from '@/lib/wallet/lifecycle/lock-lifecycle-types'

/**
 * LockLifecycle orchestrator — serializes lock, manual unlock, and bootstrap unlock.
 *
 * Unlock delegates on-chain WASM load to OnchainLoadLifecycle and post-unlock Esplora
 * sync to OnchainSyncLifecycle + OnchainSaveLifecycle. Arkade and Lightning load/sync/save
 * quiescence on lock is LIFE-LOCK-02.
 */

type UnlockLoadParams = {
  walletId: number
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
  onSyncError?: (err: unknown) => void
}

export type ManualUnlockParams = UnlockLoadParams & {
  password: string
}

export type BootstrapUnlockParams = UnlockLoadParams

type InFlightWork = {
  kind: Exclude<LockLifecycleOperation, 'none'>
  promise: Promise<void>
  key: string
}

let snapshot: LockLifecycleSnapshot = {
  phase: 'no-lock',
  operation: 'none',
}

const listeners = new Set<(next: LockLifecycleSnapshot) => void>()

let inFlightWork: InFlightWork | null = null

function notifyListeners(): void {
  const current = getLockLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
}

function setSnapshot(next: LockLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
}

function setPhase(phase: LockLifecyclePhase): void {
  snapshot = { ...snapshot, phase }
  notifyListeners()
}

function setOperation(operation: LockLifecycleOperation): void {
  snapshot = { ...snapshot, operation }
  notifyListeners()
}

function unlockLoadKey(params: UnlockLoadParams): string {
  return `${params.walletId}:${params.networkMode}:${params.addressType}:${params.accountId}`
}

function clearInFlightWork(work: InFlightWork): void {
  if (inFlightWork === work) {
    inFlightWork = null
  }
}

async function awaitInFlightWork(): Promise<void> {
  if (inFlightWork != null) {
    await inFlightWork.promise
  }
}

function revertAfterUnlockFailure(): void {
  const activeWalletId = useWalletStore.getState().activeWalletId
  if (activeWalletId === null) {
    setSnapshot({ phase: 'no-lock', operation: 'none' })
    return
  }
  setSnapshot({ phase: 'locked', operation: 'none' })
}

async function runUnlockLoad(params: UnlockLoadParams): Promise<void> {
  await waitForCryptoWorkerHealthy()
  await orchestrateOnchainLoad({
    walletId: params.walletId,
    networkMode: params.networkMode,
    addressType: params.addressType,
    accountId: params.accountId,
    clearLastSyncTime: params.networkMode !== 'lab',
    allowRetryFromError: true,
  })
  if (isArkadeActiveForNetworkMode(params.networkMode)) {
    void orchestrateArkadeLoad({
      walletId: params.walletId,
      networkMode: params.networkMode,
      allowRetryFromError: true,
    }).catch((err) => {
      void import('@/lib/arkade/arkade-session-open-error-toast').then(
        ({ reportArkadeSessionOpenError }) => reportArkadeSessionOpenError(err),
      )
    })
  }
  void orchestrateLightningLoad({
    walletId: params.walletId,
    networkMode: params.networkMode,
    allowRetryFromError: true,
  }).catch((err) => {
    void import('@/lib/wallet/rail-sync-error-toast').then(({ reportLightningLoadError }) =>
      reportLightningLoadError(err),
    )
  })
  if (params.networkMode !== 'lab') {
    void orchestrateOnchainPostUnlockSync({
      walletId: params.walletId,
      networkMode: params.networkMode,
      addressType: params.addressType,
      accountId: params.accountId,
      onSyncError: params.onSyncError,
    })
  }
}

export function getLockLifecycleSnapshot(): LockLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeLockLifecycle(
  listener: (next: LockLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Keep `no-lock` aligned with `activeWalletId === null`. When a wallet appears while still
 * in `no-lock`, move to `locked` until an unlock operation or wallet store sync runs.
 */
export function syncLockLifecycleWithActiveWallet(activeWalletId: number | null): void {
  if (activeWalletId === null) {
    if (inFlightWork != null) {
      return
    }
    setSnapshot({ phase: 'no-lock', operation: 'none' })
    return
  }
  if (snapshot.phase === 'no-lock' && snapshot.operation === 'none') {
    setSnapshot({ phase: 'locked', operation: 'none' })
  }
}

/**
 * Align phase with wallet store when no LockLifecycle operation is in flight (e.g. create
 * wallet sets `walletStatus: 'unlocked'` without going through orchestrateManualUnlock).
 */
export function syncLockLifecycleFromWalletStore(): void {
  if (snapshot.operation !== 'none') {
    return
  }
  const { activeWalletId, walletStatus } = useWalletStore.getState()
  if (activeWalletId === null) {
    setSnapshot({ phase: 'no-lock', operation: 'none' })
    return
  }
  if (walletIsUnlockedOrSyncing(walletStatus)) {
    if (snapshot.phase !== 'unlocked') {
      setPhase('unlocked')
    }
    return
  }
  if (snapshot.phase === 'no-lock' || snapshot.phase === 'unlocked') {
    setPhase('locked')
  }
}

export function canStartBootstrapUnlock(): boolean {
  if (snapshot.phase === 'no-lock') {
    return false
  }
  if (snapshot.operation === 'manual_unlock' || snapshot.operation === 'locking') {
    return false
  }
  const walletStatus = useWalletStore.getState().walletStatus
  const unlockedOrSyncing = walletIsUnlockedOrSyncing(walletStatus)
  if (unlockedOrSyncing && snapshot.operation !== 'bootstrap_unlock') {
    return false
  }
  return true
}

export function isLockUnlockOperation(operation: LockLifecycleOperation): boolean {
  return operation === 'manual_unlock' || operation === 'bootstrap_unlock'
}

export function isLockUnlockInProgress(): boolean {
  return isLockUnlockOperation(snapshot.operation)
}

function isWalletStoreUnlocked(): boolean {
  return useWalletStore.getState().walletStatus === 'unlocked'
}

function beginInFlightWork(
  kind: InFlightWork['kind'],
  key: string,
  run: () => Promise<void>,
): Promise<void> {
  let resolveWork!: () => void
  let rejectWork!: (error: unknown) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolveWork = resolve
    rejectWork = reject
  })
  const work: InFlightWork = { kind, key, promise }
  inFlightWork = work
  void (async () => {
    try {
      await run()
      resolveWork()
    } catch (error) {
      rejectWork(error)
    } finally {
      clearInFlightWork(work)
    }
  })()
  return promise
}

export async function orchestrateLock(): Promise<void> {
  if (snapshot.phase === 'no-lock') {
    return
  }
  const lockWorkBeforeWait = inFlightWork
  if (lockWorkBeforeWait?.kind === 'locking') {
    return lockWorkBeforeWait.promise
  }

  await awaitInFlightWork()

  const lockWorkAfterWait = inFlightWork
  if (lockWorkAfterWait?.kind === 'locking') {
    return lockWorkAfterWait.promise
  }

  return beginInFlightWork('locking', 'lock', async () => {
    if (isOnchainSaveBlockingLock()) {
      throw new OnchainSaveBlockingLockError()
    }
    if (isArkadeSaveBlockingLock()) {
      throw new ArkadeSaveBlockingLockError()
    }
    if (isLightningSaveBlockingLock()) {
      throw new LightningSaveBlockingLockError()
    }

    await awaitOnchainLoadQuiescence()
    await awaitArkadeLoadQuiescence()
    await awaitLightningLoadQuiescence()
    await awaitOnchainSyncQuiescence()
    await awaitOnchainSaveQuiescence()
    await awaitArkadeSyncQuiescence()
    await awaitArkadeSaveQuiescence()
    await awaitLightningSyncQuiescence()
    await awaitLightningSaveQuiescence()

    if (isOnchainSaveBlockingLock()) {
      throw new OnchainSaveBlockingLockError()
    }
    if (isArkadeSaveBlockingLock()) {
      throw new ArkadeSaveBlockingLockError()
    }
    if (isLightningSaveBlockingLock()) {
      throw new LightningSaveBlockingLockError()
    }

    await awaitInFlightWalletSecretsWrites()

    setPhase('locking')
    setOperation('locking')
    let lockPurgeError: unknown
    try {
      await useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState()
    } catch (error) {
      lockPurgeError = error
    } finally {
      syncAllRailLifecyclesWithLockPhase('locked')
      setSnapshot({ phase: 'locked', operation: 'none' })
    }
    if (lockPurgeError != null) {
      throw lockPurgeError
    }
  })
}

async function runManualUnlockWork(params: ManualUnlockParams): Promise<void> {
  const { appQueryClient } = await import('@/lib/shared/app-query-client')
  const { activeWalletLoadQueryKeyPrefix } = await import(
    '@/lib/wallet/wallet-load-query-keys'
  )
  await appQueryClient.cancelQueries({ queryKey: [...activeWalletLoadQueryKeyPrefix] })
  appQueryClient.removeQueries({ queryKey: [...activeWalletLoadQueryKeyPrefix] })

  setPhase('unlocking')
  setOperation('manual_unlock')
  try {
    await ensureWalletSecretsSession(params.password)
    try {
      await runUnlockLoad(params)
    } catch (error) {
      await endWalletSecretsSession()
      throw error
    }
    if (!isWalletStoreUnlocked()) {
      await endWalletSecretsSession()
      throw new Error('Wallet unlock did not complete')
    }
    setSnapshot({ phase: 'unlocked', operation: 'none' })
  } catch (error) {
    revertAfterUnlockFailure()
    throw error
  }
}

export async function orchestrateManualUnlock(params: ManualUnlockParams): Promise<void> {
  if (params.walletId == null) {
    throw new Error('No active wallet')
  }
  const key = `manual:${unlockLoadKey(params)}`
  if (inFlightWork?.kind === 'manual_unlock' && inFlightWork.key === key) {
    return inFlightWork.promise
  }

  await awaitInFlightWork()

  if (inFlightWork?.kind === 'manual_unlock' && inFlightWork.key === key) {
    return inFlightWork.promise
  }

  return beginInFlightWork('manual_unlock', key, () => runManualUnlockWork(params))
}

async function runBootstrapUnlockWork(params: BootstrapUnlockParams): Promise<void> {
  if (params.walletId == null) {
    throw new Error('Bootstrap unlock ran without wallet')
  }
  if (!(await isWalletSecretsSessionActive())) {
    throw new Error('Bootstrap unlock ran without wallet secrets session')
  }
  if (isWalletStoreUnlocked()) {
    return
  }
  setPhase('unlocking')
  setOperation('bootstrap_unlock')
  try {
    await runUnlockLoad(params)
    setSnapshot({ phase: 'unlocked', operation: 'none' })
  } catch (error) {
    revertAfterUnlockFailure()
    throw error
  }
}

export async function orchestrateBootstrapUnlock(params: BootstrapUnlockParams): Promise<void> {
  const key = `bootstrap:${unlockLoadKey(params)}`
  if (inFlightWork?.kind === 'bootstrap_unlock' && inFlightWork.key === key) {
    return inFlightWork.promise
  }

  await awaitInFlightWork()

  if (isWalletStoreUnlocked()) {
    return
  }

  if (isLockUnlockInProgress()) {
    return
  }

  if (inFlightWork?.kind === 'bootstrap_unlock' && inFlightWork.key === key) {
    return inFlightWork.promise
  }

  return beginInFlightWork('bootstrap_unlock', key, () => runBootstrapUnlockWork(params))
}

/** @internal Test-only reset */
export function resetLockLifecycleStateForTests(): void {
  snapshot = { phase: 'no-lock', operation: 'none' }
  inFlightWork = null
  listeners.clear()
}
