import { getDatabase, getWalletSecretsEncrypted } from '@/db'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { isBarkReceiveKeyIndex } from '@/lib/wallet/wallet-domain-types'
import {
  forceResetBarkSyncLifecycleForTeardown,
  orchestrateBarkPostLoadSync,
  prepareBarkSyncForSessionOpen,
  rememberBarkPersistedSyncTime,
} from '@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator'
import { ensureBarkEncryptedSecretsHost } from '@/workers/bark-persistence-channel'
import { getBarkWorker, terminateBarkWorker } from '@/workers/bark-factory'
import { ensureSecretsChannel } from '@/workers/secrets-channel'
import type { NetworkMode } from '@/stores/walletStore'
import type {
  BarkLoadLifecycleSnapshot,
  BarkLoadParams,
} from '@/lib/wallet/lifecycle/bark-load-lifecycle-types'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import {
  awaitDifferentInFlightWork,
  createInFlightLifecycleTracker,
  getCoalescedInFlightPromise,
} from '@/lib/wallet/lifecycle/lifecycle-in-flight-tracker'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'
import {
  LIFECYCLE_LOAD_ERROR_FALLBACK,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'

export type { BarkLoadLifecycleSnapshot, BarkLoadParams } from '@/lib/wallet/lifecycle/bark-load-lifecycle-types'

function idleBarkLoadSnapshot(): BarkLoadLifecycleSnapshot {
  return {
    loadPhase: 'not-configured',
    networkMode: null,
    errorMessage: null,
    receiveKeyIndex: null,
  }
}

let snapshot: BarkLoadLifecycleSnapshot = idleBarkLoadSnapshot()

let sessionGeneration = 0

const listeners = new Set<(next: BarkLoadLifecycleSnapshot) => void>()
const inFlightLoadTracker = createInFlightLifecycleTracker()

function loadKey(params: BarkLoadParams): string {
  return `${params.walletId}:${params.networkMode}`
}

function notifyListeners(): void {
  const current = getBarkLoadLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
}

function setSnapshot(next: BarkLoadLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
}

function bumpSessionGeneration(): void {
  sessionGeneration += 1
}

export function getBarkLoadLifecycleSnapshot(): BarkLoadLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeBarkLoadLifecycle(
  listener: (next: BarkLoadLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function awaitBarkLoadQuiescence(): Promise<void> {
  await inFlightLoadTracker.awaitQuiescence()
}

export function isBarkLoadFailedForNetwork(networkMode: NetworkMode): boolean {
  const current = getBarkLoadLifecycleSnapshot()
  return current.loadPhase === 'load-error' && current.networkMode === networkMode
}

/** Clears Bark load lifecycle after the worker is gone. */
export function forceResetBarkLoadLifecycleForTeardown(): void {
  bumpSessionGeneration()
  inFlightLoadTracker.clearCurrent()
  setSnapshot(idleBarkLoadSnapshot())
}

export function syncBarkLoadLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (
    shouldSkipRailLifecycleResetForLockPhase(
      lockPhase,
      inFlightLoadTracker.getCurrent() != null,
    )
  ) {
    return
  }
  setSnapshot(idleBarkLoadSnapshot())
}

/** After Generate new address persists a cursor, keep the in-memory index aligned. */
export function rememberBarkReceiveKeyIndex(receiveKeyIndex: number): void {
  if (!isBarkReceiveKeyIndex(receiveKeyIndex)) {
    throw new Error('Bark receive key index is invalid')
  }
  const current = getBarkLoadLifecycleSnapshot()
  if (current.loadPhase !== 'loaded') {
    throw new Error('Bark session is not open')
  }
  setSnapshot({ ...current, receiveKeyIndex })
}

async function openBarkWorkerSession(
  walletId: number,
  networkMode: 'signet' | 'mainnet',
): Promise<{
  receiveKeyIndex: number
  lastSuccessfulSyncAt?: string
}> {
  const worker = getBarkWorker()
  await ensureSecretsChannel()
  await ensureBarkEncryptedSecretsHost()
  const encrypted = await getWalletSecretsEncrypted(getDatabase(), walletId)
  const opened = await worker.openSession({
    walletId,
    encryptedMnemonic: encrypted.mnemonic,
    networkMode,
  })
  if (!isBarkReceiveKeyIndex(opened.receiveKeyIndex)) {
    throw new Error('Bark session opened without a receive key index')
  }
  return {
    receiveKeyIndex: opened.receiveKeyIndex,
    lastSuccessfulSyncAt: opened.lastSuccessfulSyncAt,
  }
}

export async function orchestrateBarkLoad(params: BarkLoadParams): Promise<void> {
  const { walletId, networkMode } = params

  if (!isBarkActiveForNetworkMode(networkMode)) {
    const { closeBarkSession } = await import('@/lib/bark/bark-session-service')
    forceResetBarkSyncLifecycleForTeardown()
    await closeBarkSession()
    setSnapshot(idleBarkLoadSnapshot())
    return
  }

  if (isBarkLoadFailedForNetwork(networkMode) && !params.allowRetryFromError) {
    return
  }

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
    const generation = sessionGeneration
    prepareBarkSyncForSessionOpen(networkMode)
    setSnapshot({
      loadPhase: 'loading',
      networkMode,
      errorMessage: null,
      receiveKeyIndex: null,
    })
    try {
      if (networkMode !== 'signet' && networkMode !== 'mainnet') {
        throw new Error('Bark network is not supported')
      }
      const opened = await openBarkWorkerSession(walletId, networkMode)
      if (generation !== sessionGeneration) {
        return
      }
      setSnapshot({
        loadPhase: 'loaded',
        networkMode,
        errorMessage: null,
        receiveKeyIndex: opened.receiveKeyIndex,
      })
      rememberBarkPersistedSyncTime(opened.lastSuccessfulSyncAt ?? null)
      orchestrateBarkPostLoadSync({ walletId, networkMode })
    } catch (error) {
      if (generation !== sessionGeneration) {
        return
      }
      terminateBarkWorker()
      forceResetBarkSyncLifecycleForTeardown()
      setSnapshot({
        loadPhase: 'load-error',
        networkMode,
        errorMessage: userFacingLifecycleErrorMessage(error, LIFECYCLE_LOAD_ERROR_FALLBACK),
        receiveKeyIndex: null,
      })
      throw error
    }
  })
}

/** @internal Test-only reset */
export function resetBarkLoadLifecycleStateForTests(): void {
  snapshot = idleBarkLoadSnapshot()
  sessionGeneration = 0
  inFlightLoadTracker.clearCurrent()
  listeners.clear()
}

/** @internal Test-only snapshot replacement */
export function replaceBarkLoadLifecycleSnapshotForTests(
  next: BarkLoadLifecycleSnapshot,
): void {
  setSnapshot(next)
}
