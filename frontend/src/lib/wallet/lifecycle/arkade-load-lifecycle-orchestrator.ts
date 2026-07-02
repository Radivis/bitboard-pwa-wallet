import { getDatabase, getWalletSecretsEncrypted } from '@/db'
import { clearArkadeDashboardStore } from '@/lib/arkade/arkade-persistence-store-sync'
import {
  findActiveArkadeConnectionSummary,
} from '@/lib/arkade/arkade-operator-connections'
import {
  ensureSecretsChannel,
} from '@/workers/secrets-channel'
import { ensureArkadeEncryptedSecretsHost } from '@/workers/arkade-persistence-channel'
import { getArkadeWorker, terminateArkadeWorker } from '@/workers/arkade-factory'
import {
  isArkadeDelegatorConfigured,
  isArkadeSupportedNetworkMode,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import {
  hydrateArkadeDashboardAfterSessionOpen,
  openFreshArkadeWorkerSession,
  tryReuseExistingArkadeSession,
  type ArkadeSessionReuseState,
} from '@/lib/wallet/lifecycle/arkade-session-open-helpers'
import type { NetworkMode } from '@/stores/walletStore'
import {
  configureArkadeSyncForLoadedRail,
  orchestrateArkadePostLoadSync,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import type {
  ArkadeLoadLifecycleSnapshot,
  ArkadeLoadParams,
} from '@/lib/wallet/lifecycle/arkade-load-lifecycle-types'
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

export type { ArkadeLoadLifecycleSnapshot, ArkadeLoadParams } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-types'

let snapshot: ArkadeLoadLifecycleSnapshot = {
  loadPhase: 'not-configured',
  networkMode: null,
  errorMessage: null,
}

let lastOpenedSessionKey: string | null = null
let lastLoadedConnectionId: string | null = null

const arkadeSessionReuseState: ArkadeSessionReuseState = {
  get lastOpenedSessionKey() {
    return lastOpenedSessionKey
  },
  setLastOpenedSessionKey(key) {
    lastOpenedSessionKey = key
  },
}

const listeners = new Set<(next: ArkadeLoadLifecycleSnapshot) => void>()
const inFlightLoadTracker = createInFlightLifecycleTracker()
let lastLoadParams: ArkadeLoadParams | null = null

function loadKey(params: ArkadeLoadParams): string {
  return `${params.walletId}:${params.networkMode}`
}

function notifyListeners(): void {
  const current = getArkadeLoadLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
}

function setSnapshot(next: ArkadeLoadLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
}

async function runPostOpenArkadeMaintenance(
  worker: Awaited<ReturnType<typeof getArkadeWorker>>,
  networkMode: ArkadeSupportedNetworkMode,
): Promise<void> {
  try {
    await worker.finalizePendingTransactions()
  } catch (err) {
    console.warn('Arkade finalizePendingTransactions failed after session open', err)
  }

  if (!isArkadeDelegatorConfigured(networkMode)) {
    return
  }

  try {
    const delegateResult = await worker.delegateSpendableVtxos()
    if (delegateResult.failed > 0 && delegateResult.errorMessage != null) {
      console.warn(
        'Arkade delegateSpendableVtxos failed after session open',
        delegateResult.errorMessage,
      )
    }
  } catch (err) {
    console.warn('Arkade delegateSpendableVtxos failed after session open', err)
  }
}

async function runArkadeSessionOpenBody(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
}): Promise<string> {
  const { walletId, networkMode } = params

  await ensureSecretsChannel()
  await ensureArkadeEncryptedSecretsHost()
  const encrypted = await getWalletSecretsEncrypted(getDatabase(), walletId)

  const connection = await findActiveArkadeConnectionSummary({
    walletId,
    networkMode,
    encryptedPayload: encrypted.payload,
  })
  const hadPersistedConnection = connection != null

  if (connection != null) {
    const reusedConnectionId = await tryReuseExistingArkadeSession({
      walletId,
      networkMode,
      connection,
      sessionReuseState: arkadeSessionReuseState,
    })
    if (reusedConnectionId != null) {
      return reusedConnectionId
    }
  }

  const { worker, connection: activeConnection, openResult } =
    await openFreshArkadeWorkerSession({
      walletId,
      networkMode,
      encrypted,
      connection,
      hadPersistedConnection,
    })

  await hydrateArkadeDashboardAfterSessionOpen({
    worker,
    walletId,
    networkMode,
    connectionId: activeConnection.id,
    signerMigrationHint: openResult.signerMigrationHint,
    sessionReuseState: arkadeSessionReuseState,
    runPostOpenMaintenance: runPostOpenArkadeMaintenance,
  })

  return activeConnection.id
}

export function getArkadeLoadLifecycleSnapshot(): ArkadeLoadLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeArkadeLoadLifecycle(
  listener: (next: ArkadeLoadLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function awaitArkadeLoadQuiescence(): Promise<void> {
  await inFlightLoadTracker.awaitQuiescence()
}

/** True when this network's Arkade rail failed to load and should be ignored until network change or retry. */
export function isArkadeLoadFailedForNetwork(networkMode: NetworkMode): boolean {
  const current = getArkadeLoadLifecycleSnapshot()
  return current.loadPhase === 'load-error' && current.networkMode === networkMode
}

/**
 * Clears Arkade load lifecycle after session teardown. Used by {@link closeArkadeSession}
 * so a failed rail does not keep `load-error` / in-flight state from blocking other work.
 */
export function forceResetArkadeLoadLifecycleForTeardown(): void {
  lastOpenedSessionKey = null
  lastLoadedConnectionId = null
  inFlightLoadTracker.clearCurrent()
  setSnapshot({ loadPhase: 'not-configured', networkMode: null, errorMessage: null })
}

export function syncArkadeLoadLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (
    shouldSkipRailLifecycleResetForLockPhase(
      lockPhase,
      inFlightLoadTracker.getCurrent() != null,
    )
  ) {
    return
  }
  lastOpenedSessionKey = null
  lastLoadedConnectionId = null
  setSnapshot({ loadPhase: 'not-configured', networkMode: null, errorMessage: null })
}

export async function orchestrateArkadeLoad(params: ArkadeLoadParams): Promise<void> {
  const { walletId, networkMode } = params

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    const { closeArkadeSession } = await import('@/lib/arkade/arkade-session-service')
    await closeArkadeSession()
    setSnapshot({ loadPhase: 'not-configured', networkMode: null, errorMessage: null })
    return
  }

  if (!isArkadeSupportedNetworkMode(networkMode)) {
    setSnapshot({ loadPhase: 'not-configured', networkMode: null, errorMessage: null })
    return
  }

  if (isArkadeLoadFailedForNetwork(networkMode) && !params.allowRetryFromError) {
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
    setSnapshot({ loadPhase: 'loading', networkMode, errorMessage: null })
    try {
      const connectionId = await runArkadeSessionOpenBody({
        walletId,
        networkMode,
      })
      lastLoadedConnectionId = connectionId
      setSnapshot({ loadPhase: 'loaded', networkMode, errorMessage: null })
      configureArkadeSyncForLoadedRail({
        walletId,
        networkMode,
        connectionId,
      })
      void orchestrateArkadePostLoadSync({
        walletId,
        networkMode,
        connectionId,
      })
    } catch (error) {
      terminateArkadeWorker()
      clearArkadeDashboardStore()
      setSnapshot({
        loadPhase: 'load-error',
        networkMode,
        errorMessage: userFacingLifecycleErrorMessage(error, LIFECYCLE_LOAD_ERROR_FALLBACK),
      })
      throw error
    }
  })
}

export async function orchestrateArkadeRetryLoad(): Promise<void> {
  if (lastLoadParams == null) {
    throw new Error('No Arkade load to retry')
  }
  return orchestrateArkadeLoad({ ...lastLoadParams, allowRetryFromError: true })
}

/** @internal Test-only reset */
export function resetArkadeLoadLifecycleStateForTests(): void {
  snapshot = { loadPhase: 'not-configured', networkMode: null, errorMessage: null }
  inFlightLoadTracker.clearCurrent()
  lastLoadParams = null
  lastOpenedSessionKey = null
  lastLoadedConnectionId = null
  listeners.clear()
}

/** @internal Test-only access */
export function getLastLoadedArkadeConnectionIdForTests(): string | null {
  return lastLoadedConnectionId
}
