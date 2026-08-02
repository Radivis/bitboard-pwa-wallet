import { getDatabase, getWalletSecretsEncrypted } from '@/db'
import { findActiveArkadeConnectionSummary } from '@/lib/arkade/arkade-encrypted-persistence-manager'
import { arkadeBumperInfoQueryKey } from '@/lib/arkade/arkade-query-keys'
import { getArkadeEndpoints, isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { getPersistedUnilateralExitJob } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import {
  clearAutomaticUnilateralExitPause,
  getUnilateralExitActorSnapshot,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime'
import {
  selectUnilateralExitAutomationSnapshot,
  selectUnilateralExitDebugSnapshot,
  selectUnilateralExitLifecycleSnapshot,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-selectors'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { ensureArkadeEncryptedSecretsHost } from '@/workers/arkade-persistence-channel'
import { ensureArkadeWorkerSecretsChannel, ensureSecretsChannel } from '@/workers/secrets-channel'
import { useWalletStore } from '@/stores/walletStore'
import { useUnilateralExitControlStore } from '@/stores/unilateralExitControlStore'
import type {
  ArkadeOperatorTrustStatus,
  ArkadeUnilateralExitBatchEstimate,
  ArkadeUnilateralExitProgress,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'

export function isE2eArkadeRegtestControlEnabled(): boolean {
  return import.meta.env.VITE_E2E_ARKADE_REGTEST === 'true' && import.meta.env.DEV
}

/**
 * Full SDK persistence JSON for Rust `ARKADE_REGTEST_BOARDED_FIXTURE` export.
 * Reads from encrypted wallet secrets (after flush), not via a second worker import in Playwright.
 */
export async function exportBoardedWalletSdkPersistenceJsonForE2e(): Promise<string> {
  const walletId = useWalletStore.getState().activeWalletId
  const networkMode = useWalletStore.getState().networkMode
  if (walletId == null || !isArkadeSupportedNetworkMode(networkMode)) {
    throw new Error('Wallet must be unlocked on an Arkade network to export boarded fixture')
  }

  await ensureSecretsChannel()
  await ensureArkadeEncryptedSecretsHost()
  await ensureArkadeWorkerSecretsChannel()

  const worker = getArkadeWorker()
  await worker.flushSdkPersistence()

  const encrypted = await getWalletSecretsEncrypted(getDatabase(), walletId)
  const connection = await findActiveArkadeConnectionSummary({
    walletId,
    networkMode,
    encryptedPayload: encrypted.payload,
  })
  if (connection == null) {
    throw new Error('No active Arkade operator connection in wallet secrets')
  }

  const sdkPersistenceJson = await worker.readPersistedSdkPersistenceJsonForE2e({
    walletId,
    connectionId: connection.id,
  })
  if (sdkPersistenceJson == null || sdkPersistenceJson.trim() === '') {
    throw new Error('Persisted Arkade SDK JSON missing after boarding — sync or flush failed')
  }

  return sdkPersistenceJson
}

export async function readOperatorTrustStatusForE2e(): Promise<ArkadeOperatorTrustStatus> {
  return getArkadeWorker().getOperatorTrustStatus()
}

export type E2eUnilateralExitDebugSnapshot = {
  networkMode: string
  esploraUrl: string
  walletStatus: string
  arkadeLoadPhase: string
  arkadeLoadError: string | null
  controlStore: {
    selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  }
  lifecycle: {
    phase: string
    walletScope: { walletId: number; networkMode: string; connectionId: string } | null
    selectedLeafOutpoints: ArkadeVtxoOutpoint[]
    lastErrorMessage: string | null
  }
  automation: {
    enabled: boolean
    pausedReason: string | null
    lastErrorMessage: string | null
    scheduling: string
  }
  persistedJob: {
    jobActive: boolean
    selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  }
  progress: ArkadeUnilateralExitProgress | null
  progressError: string | null
  batchEstimate: ArkadeUnilateralExitBatchEstimate | null
  batchEstimateError: string | null
  exitBranchTxids: string[]
  machineState: string
  exitCandidates: {
    total: number
    startable: number
    error: string | null
  }
  topologyError: string | null
}

export async function exportUnilateralExitDebugSnapshotForE2e(): Promise<E2eUnilateralExitDebugSnapshot> {
  const walletId = useWalletStore.getState().activeWalletId
  const networkMode = useWalletStore.getState().networkMode
  const activeArkadeConnectionId = useWalletStore.getState().activeArkadeConnectionId
  if (
    walletId == null ||
    activeArkadeConnectionId == null ||
    !isArkadeSupportedNetworkMode(networkMode)
  ) {
    throw new Error('Wallet must be unlocked on an Arkade network to export unilateral-exit debug snapshot')
  }

  const controlStore = useUnilateralExitControlStore.getState()
  const actorSnapshot = getUnilateralExitActorSnapshot()
  const machineDebug = selectUnilateralExitDebugSnapshot(actorSnapshot)
  const lifecycle = selectUnilateralExitLifecycleSnapshot(actorSnapshot)
  const automation = selectUnilateralExitAutomationSnapshot(actorSnapshot)
  const persistedJob = getPersistedUnilateralExitJob({
    walletId,
    networkMode,
    connectionId: activeArkadeConnectionId,
  })
  const esploraUrl = getArkadeEndpoints(networkMode).esploraUrl
  const loadSnapshot = getArkadeLoadLifecycleSnapshot()
  const worker = getArkadeWorker()
  const vtxoOutpoints =
    lifecycle.selectedLeafOutpoints.length > 0
      ? lifecycle.selectedLeafOutpoints
      : controlStore.selectedLeafOutpoints

  let progress: ArkadeUnilateralExitProgress | null = lifecycle.progress
  let progressError: string | null = null
  if (vtxoOutpoints.length > 0 && progress == null) {
    try {
      progress = await worker.getUnilateralExitProgress({ vtxoOutpoints })
    } catch (error) {
      progressError = error instanceof Error ? error.message : String(error)
    }
  }

  let batchEstimate: ArkadeUnilateralExitBatchEstimate | null = null
  let batchEstimateError: string | null = null
  if (vtxoOutpoints.length > 0) {
    try {
      batchEstimate = await worker.estimateUnilateralExitBatch({
        vtxoOutpoints,
        feeRateSatPerVb: 2,
      })
    } catch (error) {
      batchEstimateError = error instanceof Error ? error.message : String(error)
    }
  }

  let exitBranchTxids: string[] = []
  let topologyError: string | null = null

  let exitCandidatesTotal = 0
  let exitCandidatesStartable = 0
  let exitCandidatesError: string | null = null
  try {
    const candidates = await worker.listExitCandidates()
    exitCandidatesTotal = candidates.length
    exitCandidatesStartable = candidates.filter((row) => row.canStartUnroll).length
    const topologyOutpointsForProbe =
      vtxoOutpoints.length > 0
        ? vtxoOutpoints
        : candidates
            .filter((row) => row.canStartUnroll)
            .map((row) => ({ txid: row.txid, vout: row.vout }))
    if (topologyOutpointsForProbe.length > 0) {
      try {
        const topology = await worker.getUnilateralExitTopology({
          vtxoOutpoints: topologyOutpointsForProbe,
        })
        exitBranchTxids = topology.exitBranchTxids
      } catch (error) {
        topologyError = error instanceof Error ? error.message : String(error)
        exitBranchTxids = progress?.nodeStatuses.map((node) => node.txid) ?? []
      }
    }
  } catch (error) {
    exitCandidatesError = error instanceof Error ? error.message : String(error)
  }

  return {
    networkMode,
    esploraUrl,
    walletStatus: useWalletStore.getState().walletStatus,
    arkadeLoadPhase: loadSnapshot.loadPhase,
    arkadeLoadError: loadSnapshot.errorMessage,
    controlStore: {
      selectedLeafOutpoints: controlStore.selectedLeafOutpoints,
    },
    lifecycle: {
      phase: lifecycle.phase,
      walletScope: lifecycle.walletScope,
      selectedLeafOutpoints: lifecycle.selectedLeafOutpoints,
      lastErrorMessage: lifecycle.lastErrorMessage,
    },
    automation: {
      enabled: automation.prefs.enabled,
      pausedReason: automation.pausedReason,
      lastErrorMessage: automation.lastErrorMessage,
      scheduling: automation.scheduling,
    },
    persistedJob: {
      jobActive: persistedJob.jobActive,
      selectedLeafOutpoints: persistedJob.selectedLeafOutpoints,
    },
    progress,
    progressError,
    batchEstimate,
    batchEstimateError,
    exitBranchTxids,
    machineState: String(machineDebug.machineState),
    exitCandidates: {
      total: exitCandidatesTotal,
      startable: exitCandidatesStartable,
      error: exitCandidatesError,
    },
    topologyError,
  }
}

export function ensureE2eArkadeRegtestControl(): void {
  if (!isE2eArkadeRegtestControlEnabled() || typeof window === 'undefined') {
    return
  }
  if (window.__e2eExportBoardedWalletSdkPersistenceJson != null) {
    return
  }

  window.__e2eExportBoardedWalletSdkPersistenceJson = exportBoardedWalletSdkPersistenceJsonForE2e
  window.__e2eGetOperatorTrustStatus = readOperatorTrustStatusForE2e
  window.__e2eExportUnilateralExitDebugSnapshot = exportUnilateralExitDebugSnapshotForE2e
  window.__e2eResumeUnilateralExitAutomation = resumeUnilateralExitAutomationForE2e
  window.__e2eRefreshOnchainBumperInfo = refreshOnchainBumperInfoForE2e
}

/** Re-sync bumper wallet via WASM and push balance into React Query (E2E funding gate). */
export async function refreshOnchainBumperInfoForE2e(): Promise<number> {
  const walletId = useWalletStore.getState().activeWalletId
  const networkMode = useWalletStore.getState().networkMode
  const connectionId = useWalletStore.getState().activeArkadeConnectionId
  if (
    walletId == null ||
    connectionId == null ||
    !isArkadeSupportedNetworkMode(networkMode)
  ) {
    return 0
  }

  const info = await getArkadeWorker().getOnchainBumperInfo()
  appQueryClient.setQueryData(
    arkadeBumperInfoQueryKey(walletId, networkMode, connectionId),
    info,
  )
  await appQueryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) && query.queryKey.includes('unilateral-batch'),
  })
  return info.balanceSats
}

export function resumeUnilateralExitAutomationForE2e(): void {
  const walletId = useWalletStore.getState().activeWalletId
  const networkMode = useWalletStore.getState().networkMode
  const connectionId = useWalletStore.getState().activeArkadeConnectionId
  if (
    walletId == null ||
    connectionId == null ||
    !isArkadeSupportedNetworkMode(networkMode)
  ) {
    return
  }
  clearAutomaticUnilateralExitPause({
    walletId,
    networkMode,
    connectionId,
  })
}
