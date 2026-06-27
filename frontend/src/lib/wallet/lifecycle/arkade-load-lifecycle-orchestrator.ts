import { getDatabase, getWalletSecretsEncrypted } from '@/db'
import { refreshArkadeStoreFromLoadedWasm, clearArkadeDashboardStore } from '@/lib/arkade/arkade-persistence-store-sync'
import {
  ensureArkadeOperatorConnection,
  findActiveArkadeConnectionSummary,
  resolveArkadeEndpointsForConnection,
} from '@/lib/arkade/arkade-operator-connections'
import {
  ensureArkadeWorkerSecretsChannel,
  ensureSecretsChannel,
} from '@/workers/secrets-channel'
import { ensureArkadeEncryptedSecretsHost } from '@/workers/arkade-persistence-channel'
import { getArkadeWorker, getArkadeWorkerIfExists, terminateArkadeWorker } from '@/workers/arkade-factory'
import {
  getArkadeEndpoints,
  isArkadeDelegatorConfigured,
  isArkadeSupportedNetworkMode,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { arkadeSessionKey } from '@/lib/arkade/arkade-session-key'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { reportArkadeOperatorSyncError } from '@/lib/wallet/rail-sync-error-toast'
import { useWalletStore } from '@/stores/walletStore'
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

export type { ArkadeLoadLifecycleSnapshot, ArkadeLoadParams } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-types'

let snapshot: ArkadeLoadLifecycleSnapshot = {
  loadPhase: 'not-configured',
  networkMode: null,
}

let lastOpenedSessionKey: string | null = null
let lastLoadedConnectionId: string | null = null

const listeners = new Set<(next: ArkadeLoadLifecycleSnapshot) => void>()
const inFlightLoadTracker = createInFlightLifecycleTracker()

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

  let connection = await findActiveArkadeConnectionSummary({
    walletId,
    networkMode,
    encryptedPayload: encrypted.payload,
  })
  const hadPersistedConnection = connection != null
  const provisionalKey = connection
    ? arkadeSessionKey(walletId, networkMode, connection.id)
    : null

  if (provisionalKey != null && lastOpenedSessionKey === provisionalKey) {
    const worker = getArkadeWorkerIfExists()
    if (worker != null && connection != null) {
      try {
        const sessionOpen = await worker.hasOpenSession({
          walletId,
          networkMode,
          connectionId: connection.id,
        })
        if (sessionOpen) {
          await refreshArkadeStoreFromLoadedWasm(connection.id)
          useWalletStore.getState().setActiveArkadeConnectionId(connection.id)
          useWalletStore.getState().setLastOperatorSyncTime(null)
          return connection.id
        }
      } catch {
        // Worker unhealthy — fall through and reopen.
      }
    }
    lastOpenedSessionKey = null
  }

  const defaultEndpoints = getArkadeEndpoints(networkMode)
  const endpoints = connection
    ? resolveArkadeEndpointsForConnection(connection)
    : defaultEndpoints
  const connectionId = connection?.id ?? crypto.randomUUID()

  const worker = getArkadeWorker()
  await ensureArkadeWorkerSecretsChannel()
  const openResult = await worker.openSession({
    encryptedMnemonic: encrypted.mnemonic,
    encryptedPayload: encrypted.payload,
    walletId,
    networkMode,
    connectionId,
    arkServerUrl: endpoints.arkServerUrl,
    delegatorUrl: endpoints.delegatorUrl,
    esploraUrl: endpoints.esploraUrl,
  })

  connection = await ensureArkadeOperatorConnection({
    walletId,
    networkMode,
    connectionId,
    operatorSignerPkHex: openResult.operatorSignerPkHex,
    operatorUrl: endpoints.arkServerUrl,
    delegatorUrl: endpoints.delegatorUrl,
    persistInitialSdkFromWasm: !hadPersistedConnection,
    signerMigrationHint: openResult.signerMigrationHint,
  })

  if (openResult.signerMigrationHint != null) {
    useWalletStore.getState().setArkadeSignerMigrationHint(openResult.signerMigrationHint)
  } else {
    useWalletStore.getState().setArkadeSignerMigrationHint(null)
  }

  await worker.reconcileActiveConnectionId(connection.id)
  useWalletStore.getState().setLastOperatorSyncTime(null)
  await refreshArkadeStoreFromLoadedWasm(connection.id)
  useWalletStore.getState().setActiveArkadeConnectionId(connection.id)
  lastOpenedSessionKey = arkadeSessionKey(walletId, networkMode, connection.id)

  void runPostOpenArkadeMaintenance(worker, networkMode)

  return connection.id
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

export function applyArkadeLoadLifecycleSnapshotFromOtherTab(
  remoteSnapshot: ArkadeLoadLifecycleSnapshot,
): void {
  setSnapshot({ ...remoteSnapshot })
}

export async function awaitArkadeLoadQuiescence(): Promise<void> {
  await inFlightLoadTracker.awaitQuiescence({ swallowError: true })
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
  setSnapshot({ loadPhase: 'not-configured', networkMode: null })
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
  setSnapshot({ loadPhase: 'not-configured', networkMode: null })
}

export async function orchestrateArkadeLoad(params: ArkadeLoadParams): Promise<void> {
  const { walletId, networkMode } = params

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    const { closeArkadeSession } = await import('@/lib/arkade/arkade-session-service')
    await closeArkadeSession()
    setSnapshot({ loadPhase: 'not-configured', networkMode: null })
    return
  }

  if (!isArkadeSupportedNetworkMode(networkMode)) {
    setSnapshot({ loadPhase: 'not-configured', networkMode: null })
    return
  }

  const key = loadKey(params)
  const coalesced = getCoalescedInFlightPromise(inFlightLoadTracker, key)
  if (coalesced != null) {
    return coalesced
  }
  const afterDifferentWork = await awaitDifferentInFlightWork(inFlightLoadTracker, key, {
    swallowError: true,
  })
  if (afterDifferentWork != null) {
    return afterDifferentWork
  }

  return inFlightLoadTracker.begin(key, async () => {
    setSnapshot({ loadPhase: 'loading', networkMode })
    try {
      const connectionId = await runArkadeSessionOpenBody({
        walletId,
        networkMode,
      })
      lastLoadedConnectionId = connectionId
      setSnapshot({ loadPhase: 'loaded', networkMode })
      configureArkadeSyncForLoadedRail({
        walletId,
        networkMode,
        connectionId,
      })
      void orchestrateArkadePostLoadSync({
        walletId,
        networkMode,
        connectionId,
        onSyncError: reportArkadeOperatorSyncError,
      })
    } catch (error) {
      terminateArkadeWorker()
      clearArkadeDashboardStore()
      setSnapshot({ loadPhase: 'load-error', networkMode })
      throw error
    }
  })
}

/** @internal Test-only reset */
export function resetArkadeLoadLifecycleStateForTests(): void {
  snapshot = { loadPhase: 'not-configured', networkMode: null }
  inFlightLoadTracker.clearCurrent()
  lastOpenedSessionKey = null
  lastLoadedConnectionId = null
  listeners.clear()
}

/** @internal Test-only access */
export function getLastLoadedArkadeConnectionIdForTests(): string | null {
  return lastLoadedConnectionId
}
