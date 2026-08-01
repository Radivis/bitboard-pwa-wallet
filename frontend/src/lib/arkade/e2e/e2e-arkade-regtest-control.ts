import { getDatabase, getWalletSecretsEncrypted } from '@/db'
import { findActiveArkadeConnectionSummary } from '@/lib/arkade/arkade-encrypted-persistence-manager'
import { getArkadeEndpoints, isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { getUnilateralExitAutomationSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit-automation-controller'
import { getPersistedUnilateralExitJob } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import { getUnilateralExitLifecycleSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-orchestrator'
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
  const lifecycle = getUnilateralExitLifecycleSnapshot()
  const automation = getUnilateralExitAutomationSnapshot()
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
  if (vtxoOutpoints.length > 0) {
    try {
      const topology = await worker.getUnilateralExitTopology({ vtxoOutpoints })
      exitBranchTxids = topology.exitBranchTxids
    } catch {
      exitBranchTxids = progress?.nodeStatuses.map((node) => node.txid) ?? []
    }
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
}
