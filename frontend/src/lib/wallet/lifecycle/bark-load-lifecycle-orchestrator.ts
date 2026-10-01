import { getDatabase, getWalletSecretsEncrypted } from '@/db'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
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

let snapshot: BarkLoadLifecycleSnapshot = {
  loadPhase: 'not-configured',
  networkMode: null,
  errorMessage: null,
}

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
  setSnapshot({ loadPhase: 'not-configured', networkMode: null, errorMessage: null })
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
  setSnapshot({ loadPhase: 'not-configured', networkMode: null, errorMessage: null })
}

async function openBarkWorkerSession(walletId: number): Promise<void> {
  const worker = getBarkWorker()
  await ensureSecretsChannel()
  await ensureBarkEncryptedSecretsHost()
  const encrypted = await getWalletSecretsEncrypted(getDatabase(), walletId)
  await worker.openSession({
    walletId,
    encryptedMnemonic: encrypted.mnemonic,
  })
}

export async function orchestrateBarkLoad(params: BarkLoadParams): Promise<void> {
  const { walletId, networkMode } = params

  if (!isBarkActiveForNetworkMode(networkMode)) {
    const { closeBarkSession } = await import('@/lib/bark/bark-session-service')
    await closeBarkSession()
    setSnapshot({ loadPhase: 'not-configured', networkMode: null, errorMessage: null })
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
    setSnapshot({ loadPhase: 'loading', networkMode, errorMessage: null })
    try {
      await openBarkWorkerSession(walletId)
      if (generation !== sessionGeneration) {
        return
      }
      setSnapshot({ loadPhase: 'loaded', networkMode, errorMessage: null })
    } catch (error) {
      if (generation !== sessionGeneration) {
        return
      }
      terminateBarkWorker()
      setSnapshot({
        loadPhase: 'load-error',
        networkMode,
        errorMessage: userFacingLifecycleErrorMessage(error, LIFECYCLE_LOAD_ERROR_FALLBACK),
      })
      throw error
    }
  })
}

/** @internal Test-only reset */
export function resetBarkLoadLifecycleStateForTests(): void {
  snapshot = { loadPhase: 'not-configured', networkMode: null, errorMessage: null }
  sessionGeneration = 0
  inFlightLoadTracker.clearCurrent()
  listeners.clear()
}
