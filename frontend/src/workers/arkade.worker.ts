import { expose, wrap, type Remote } from 'comlink'
import type {
  EncryptedBlobMessage,
  SecretsChannelService,
} from '@/workers/secrets-channel-types'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { arkadeSessionKey } from '@/lib/arkade/arkade-session-key'
import {
  ARKADE_PERSIST_SCOPE_CHANGED_ERROR,
  arkadeOpenSessionMatchesSaveTarget,
  assertArkadeOpenSessionMatchesScope,
  stampedPersistScopeStillMatchesOpenSession,
} from '@/lib/arkade/arkade-session-scope'
import { rethrowWasmArkadeErrorForComlink } from '@/lib/shared/wasm-arkade-error'
import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import {
  setConfiguredHistoricalSignetOnchainChain,
  type HistoricalSignetOnchainChain,
} from '@/lib/wallet/historical-signet-onchain-chain'
import {
  ensureArkadeAccountEncrypted,
  extractSdkPersistenceJsonForAccount,
  findActiveAccountSummary,
  listAccountSummaries,
  loadArkadeAccountSdkPersistence,
  persistSdkJsonToEncryptedPayload,
  updateOperatorSyncAtEncrypted,
  type ArkadeEncryptedPayloadDeps,
} from '@/workers/arkade-worker-encrypted-payload'
import type {
  ArkadeBalanceInfo,
  ArkadeBatchJoinResult,
  ArkadeBoardingStatus,
  ArkadeCollaborativeExitFeeEstimate,
  ArkadeCollaborativeExitFeeEstimateParams,
  ArkadeCollaborativeExitParams,
  ArkadeCompleteUnilateralExitParams,
  ArkadeDelegateInfo,
  ArkadeExitCandidateDto,
  ArkadeOnchainBumperInfo,
  ArkadeOperatorSyncResult,
  ArkadePaymentRow,
  ArkadePendingBatchIntentActionParams,
  ArkadeRecoverableVtxoFeeEstimate,
  ArkadeSendParams,
  ArkadeService,
  ArkadeSignerMigrationResult,
  ArkadeUnilateralExitCompletionFeeEstimate,
  ArkadeUnilateralExitTimelock,
  ArkadeUnilateralExitCompletionFeeEstimateParams,
  ArkadeUnilateralExitTopology,
  ArkadeUnilateralExitTopologyParams,
  ArkadeUnilateralExitBatchEstimate,
  ArkadeUnilateralExitBatchEstimateParams,
  ArkadeProceedUnilateralExitStepParams,
  ArkadeProceedUnilateralExitStepResult,
  ArkadeUnilateralExitProgress,
  ArkadeUnilateralExitProgressParams,
  ArkadeUnilateralExitJobViability,
  ArkadeUnilateralExitFrontendPersistence,
  ArkadeUnilateralExitJobPersistence,
  ArkadeUnilateralExitAutomationPrefsPersistence,
  ArkadeUnilateralExitFailurePersistence,
  ArkadeWalletScope,
  ArkadeOperatorScheduledSession,
  ArkadeOperatorTrustStatus,
  ArkadeOperatorConfigDiffResult,
  ArkadeUnilateralExitInProgressDto,
  ArkadeVtxoExitRecordDto,
  ArkadeAutonomousModeStatus,
  BackgroundFullVtxoReconcileOutcome,
  ArkadeVtxoListResult,
  ArkadeVtxoExpiryStatus,
  ArkadePendingBatchIntent,
  EnsureArkadeAccountEncryptedParams,
  OpenArkadeSessionParams,
  OpenArkadeSessionResult,
} from '@/workers/arkade-api'

import {
  persistAfterCriticalWithLightOperatorSync,
  shouldScheduleBackgroundFullVtxoReconcile,
} from '@/lib/arkade/arkade-operator-sync-policy'
import {
  backgroundFullReconcileFinishedOutcome,
  createSingleFlightScheduler,
} from '@/lib/arkade/background-full-vtxo-reconcile'
import { loadBitboardArkadeWasm } from '@/lib/arkade/load-bitboard-arkade-wasm'

type BitboardArkadeWasm = Awaited<ReturnType<typeof loadBitboardArkadeWasm>>

let arkadeWasmModule: BitboardArkadeWasm | null = null
let wasmInitError: string | null = null
let secretsProxy: Remote<SecretsChannelService> | null = null
let encryptedWalletSecretsHost:
  | Remote<EncryptedWalletSecretsHost>
  | EncryptedWalletSecretsHost
  | null = null

let activeSessionKey: string | null = null
let activeSessionParams: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  arkadeAccountId: string
} | null = null
let inFlightPersist: Promise<void> | null = null

type SendPaymentInFlight = {
  fingerprint: string
  promise: Promise<string>
}

let sendPaymentInFlight: SendPaymentInFlight | null = null

function assertCallerMatchesOpenSession(walletScope: ArkadeWalletScope): void {
  assertArkadeOpenSessionMatchesScope(activeSessionParams, walletScope)
}

function sendPaymentFingerprint(params: ArkadeSendParams): string {
  return `${params.address}\0${params.amountSats}`
}

function encryptedBlobForDbToMessage(blob: {
  ciphertext: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
  kdfPhc: string
}): EncryptedBlobMessage {
  return {
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    salt: blob.salt,
    kdfPhc: blob.kdfPhc,
  }
}

function getEncryptedPayloadDeps(): ArkadeEncryptedPayloadDeps {
  if (secretsProxy == null || encryptedWalletSecretsHost == null) {
    throw new Error('Arkade encrypted persistence is not configured')
  }
  return {
    secretsProxy,
    encryptedHost: encryptedWalletSecretsHost,
  }
}

async function getArkadeWasm(): Promise<BitboardArkadeWasm> {
  if (wasmInitError) {
    throw new Error(`WASM init failed: ${wasmInitError}`)
  }
  if (!arkadeWasmModule) {
    arkadeWasmModule = await loadBitboardArkadeWasm()
  }
  return arkadeWasmModule
}

/** Ensures WASM failures surface with readable messages through Comlink (mirrors crypto.worker). */
async function invokeWasmArkade<T>(
  run: (wasmModule: BitboardArkadeWasm) => T | Promise<T>,
): Promise<T> {
  try {
    const wasmModule = await getArkadeWasm()
    return await run(wasmModule)
  } catch (err) {
    rethrowWasmArkadeErrorForComlink(err)
  }
}

let bumperWalletSyncInFlight: Promise<void> | null = null

async function syncBumperWalletImpl(): Promise<void> {
  if (bumperWalletSyncInFlight != null) {
    return bumperWalletSyncInFlight
  }
  const work = (async () => {
    await invokeWasmArkade((wasmModule) => wasmModule.arkade_sync_bumper_wallet())
  })()
  bumperWalletSyncInFlight = work
  try {
    await work
  } finally {
    if (bumperWalletSyncInFlight === work) {
      bumperWalletSyncInFlight = null
    }
  }
}

async function initWasm() {
  try {
    arkadeWasmModule = await loadBitboardArkadeWasm()
    console.info('[arkade.worker] WASM module loaded successfully')
  } catch (err) {
    wasmInitError = err instanceof Error ? err.message : String(err)
    console.error('[arkade.worker] WASM init failed:', wasmInitError)
  }
}

initWasm()

function requestDecrypt(encryptedBlob: EncryptedBlobMessage): Promise<string> {
  if (!secretsProxy) {
    return Promise.reject(new Error('Secrets port not set'))
  }
  return secretsProxy.decrypt(encryptedBlob)
}

function legacyIndexedDbName(
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
): string {
  return `bitboard-arkade-${walletId}-${networkMode}`
}

function deleteLegacyArkadeIndexedDb(
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
): void {
  if (typeof indexedDB === 'undefined') return
  try {
    indexedDB.deleteDatabase(legacyIndexedDbName(walletId, networkMode))
  } catch {
    // Ignore — database may not exist.
  }
}

type ArkadePersistScope = {
  walletId: number
  arkadeAccountId: string
}

function captureOpenPersistScope(): ArkadePersistScope | null {
  if (activeSessionParams == null) {
    return null
  }
  return {
    walletId: activeSessionParams.walletId,
    arkadeAccountId: activeSessionParams.arkadeAccountId,
  }
}

async function flushSdkPersistenceNowOrThrow(
  scopeAtStart?: ArkadePersistScope | null,
): Promise<void> {
  const stampedScope = scopeAtStart === undefined ? captureOpenPersistScope() : scopeAtStart
  if (
    stampedScope == null ||
    !stampedPersistScopeStillMatchesOpenSession(stampedScope, activeSessionParams)
  ) {
    if (stampedScope == null && activeSessionParams == null) {
      throw new Error('Arkade SDK persistence flush was skipped (no active session)')
    }
    throw new Error(ARKADE_PERSIST_SCOPE_CHANGED_ERROR)
  }

  if (inFlightPersist != null) {
    await inFlightPersist
    return flushSdkPersistenceNowOrThrow(stampedScope)
  }

  const sessionParams = stampedScope
  inFlightPersist = (async () => {
    if (!stampedPersistScopeStillMatchesOpenSession(sessionParams, activeSessionParams)) {
      throw new Error(ARKADE_PERSIST_SCOPE_CHANGED_ERROR)
    }
    const sdkPersistenceJson = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_export_persistence_json(),
    )
    if (!stampedPersistScopeStillMatchesOpenSession(sessionParams, activeSessionParams)) {
      throw new Error(ARKADE_PERSIST_SCOPE_CHANGED_ERROR)
    }
    await persistSdkJsonToEncryptedPayload(getEncryptedPayloadDeps(), {
      walletId: sessionParams.walletId,
      arkadeAccountId: sessionParams.arkadeAccountId,
      sdkPersistenceJson,
    })
  })()

  try {
    await inFlightPersist
  } finally {
    inFlightPersist = null
  }
}

async function getAutonomousModeActive(): Promise<boolean> {
  try {
    const status = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_autonomous_mode_status(),
    )
    return Boolean((status as ArkadeAutonomousModeStatus | undefined)?.active)
  } catch {
    return false
  }
}

let onBackgroundFullReconcileFinished:
  | ((outcome: BackgroundFullVtxoReconcileOutcome) => void | Promise<void>)
  | null = null

const scheduleBackgroundFullVtxoReconcileSingleFlight = createSingleFlightScheduler(async () => {
  const reconcileScope = captureOpenPersistScope()
  try {
    const reconcileResult: unknown = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_reconcile_full_offchain_vtxo_list() as Promise<unknown>,
    )
    if (!stampedPersistScopeStillMatchesOpenSession(reconcileScope, activeSessionParams)) {
      await onBackgroundFullReconcileFinished?.({
        ok: false,
        warningMessage:
          'Full VTXO reconcile was discarded because the wallet session changed',
      })
      return
    }
    await flushSdkPersistenceNowOrThrow(reconcileScope)
    await onBackgroundFullReconcileFinished?.(
      backgroundFullReconcileFinishedOutcome(reconcileResult),
    )
  } catch (error) {
    const warningMessage =
      error instanceof Error ? error.message : 'Full VTXO reconcile failed'
    await onBackgroundFullReconcileFinished?.({ ok: false, warningMessage })
  }
})

function scheduleBackgroundFullFromSyncResult(result: ArkadeOperatorSyncResult): void {
  if (shouldScheduleBackgroundFullVtxoReconcile(result.fullReconcileDue)) {
    scheduleBackgroundFullVtxoReconcileSingleFlight()
  }
}

/** WASM operator sync + SDK flush only — store refresh runs on the main thread. */
async function syncWithOperatorCore(
  scheduleBackgroundFull = false,
): Promise<ArkadeOperatorSyncResult> {
  const result = await invokeWasmArkade((wasmModule) =>
    wasmModule.arkade_sync_with_operator(scheduleBackgroundFull),
  )
  await flushSdkPersistenceNowOrThrow()
  return (result ?? {}) as ArkadeOperatorSyncResult
}

async function persistAfterUnilateralExitOperation(): Promise<void> {
  const { awaitArkadeSyncQuiescence } = await import(
    '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
  )
  await awaitArkadeSyncQuiescence()
  // Unilateral exit never syncs with the ASP after proceed/complete/unroll.
  await flushSdkPersistenceNowOrThrow()
}

async function persistAfterCriticalOperation(): Promise<void> {
  const { awaitArkadeSyncQuiescence } = await import(
    '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
  )
  const autonomousActive =
    activeSessionParams != null ? await getAutonomousModeActive() : true
  await persistAfterCriticalWithLightOperatorSync({
    awaitUserFacingQuiescence: awaitArkadeSyncQuiescence,
    autonomousActive,
    runLightOperatorSync: () => syncWithOperatorCore(false),
    scheduleBackgroundFullReconcile: scheduleBackgroundFullVtxoReconcileSingleFlight,
    flushPersistence: flushSdkPersistenceNowOrThrow,
  })
}

function createOnRegisteredWasmCallback(
  onRegistered?: (intent: ArkadePendingBatchIntent) => void,
): (intent: ArkadePendingBatchIntent) => Promise<void> {
  return async (intent) => {
    await flushSdkPersistenceNowOrThrow()
    await Promise.resolve(onRegistered?.(intent))
  }
}

async function persistBatchJoinResult(result: ArkadeBatchJoinResult): Promise<void> {
  if (result.status === 'waiting_for_operator') {
    await flushSdkPersistenceNowOrThrow()
    return
  }
  await persistAfterCriticalOperation()
}

async function runBatchJoinAndPersist(
  run: (
    wasmModule: BitboardArkadeWasm,
    onRegistered: (intent: ArkadePendingBatchIntent) => Promise<void>,
  ) => unknown | Promise<unknown>,
  onRegistered?: (intent: ArkadePendingBatchIntent) => void,
): Promise<ArkadeBatchJoinResult> {
  const wasmOnRegistered = createOnRegisteredWasmCallback(onRegistered)
  try {
    const result = (await invokeWasmArkade((wasmModule) =>
      run(wasmModule, wasmOnRegistered),
    )) as unknown as ArkadeBatchJoinResult
    await persistBatchJoinResult(result)
    return result
  } catch (error) {
    try {
      await flushSdkPersistenceNowOrThrow()
    } catch {
      // Best-effort flush if RegisterIntent succeeded before the WASM call threw.
    }
    throw error
  }
}

async function closeSessionImpl(): Promise<void> {
  try {
    await flushSdkPersistenceNowOrThrow()
  } catch {
    // Best-effort flush before teardown when session was never fully opened.
  }

  try {
    await invokeWasmArkade((wasmModule) => wasmModule.arkade_close_session())
  } catch {
    // Module may not be loaded yet.
  }

  activeSessionKey = null
  activeSessionParams = null
  bumperWalletSyncInFlight = null
  sendPaymentInFlight = null
}

async function openSessionImpl(
  params: OpenArkadeSessionParams,
): Promise<OpenArkadeSessionResult> {
  const key = arkadeSessionKey(params.walletId, params.networkMode, params.arkadeAccountId)

  if (activeSessionKey === key) {
    try {
      const address = await invokeWasmArkade((wasmModule) => wasmModule.arkade_get_address())
      const operatorSignerPkHex = await invokeWasmArkade((wasmModule) =>
        wasmModule.arkade_operator_signer_pk_hex(),
      )
      return { arkadeAddress: address, operatorSignerPkHex }
    } catch {
      // Fall through to full open.
    }
  }

  await closeSessionImpl()
  deleteLegacyArkadeIndexedDb(params.walletId, params.networkMode)

  const encryptedPayloadMessage = encryptedBlobForDbToMessage(params.encryptedPayload)
  const { accountFound, sdkPersistenceJson } = await loadArkadeAccountSdkPersistence(
    getEncryptedPayloadDeps(),
    {
      encryptedPayload: encryptedPayloadMessage,
      arkadeAccountId: params.arkadeAccountId,
    },
  )

  const mnemonic = await requestDecrypt(encryptedBlobForDbToMessage(params.encryptedMnemonic))
  activeSessionParams = {
    walletId: params.walletId,
    networkMode: params.networkMode,
    arkadeAccountId: params.arkadeAccountId,
  }

  try {
    const openResult = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_open_session({
        mnemonic,
        networkMode: params.networkMode,
        arkadeServerUrl: params.arkadeServerUrl,
        delegatorUrl: params.delegatorUrl,
        esploraUrl: params.esploraUrl,
        sdkPersistenceJson,
        bumperChangesetJson: params.bumperChangesetJson,
        bumperFullScanDone: params.bumperFullScanDone ?? false,
      }),
    )

    activeSessionKey = key
    if (accountFound) {
      await persistAfterUnilateralExitOperation()
    }
    return {
      arkadeAddress: openResult.arkadeAddress as string,
      operatorSignerPkHex: openResult.operatorSignerPkHex as string,
      signerMigrationHint: openResult.signerMigrationHint as
        | OpenArkadeSessionResult['signerMigrationHint']
        | undefined,
      bumperHydrateFellBackToEmpty: openResult.bumperHydrateFellBackToEmpty === true,
    }
  } catch (error) {
    activeSessionKey = null
    activeSessionParams = null
    throw error
  }
}

const arkadeService: ArkadeService = {
  async setSecretsPort(port: MessagePort): Promise<void> {
    secretsProxy = wrap<SecretsChannelService>(port)
  },

  async setEncryptedWalletSecretsHost(host: EncryptedWalletSecretsHost): Promise<void> {
    encryptedWalletSecretsHost = host
  },

  async ping(): Promise<boolean> {
    await getArkadeWasm()
    return true
  },

  async configureHistoricalSignetOnchainChain(
    chain: HistoricalSignetOnchainChain | null,
  ): Promise<void> {
    setConfiguredHistoricalSignetOnchainChain(chain)
  },

  async openSession(params: OpenArkadeSessionParams) {
    return openSessionImpl(params)
  },

  async syncBumperWallet(): Promise<void> {
    await syncBumperWalletImpl()
  },

  async exportBumperWalletChangeset(): Promise<string> {
    return invokeWasmArkade((wasmModule) => wasmModule.arkade_export_bumper_wallet_changeset())
  },

  async bumperWalletFullScanDone(): Promise<boolean> {
    return invokeWasmArkade((wasmModule) => wasmModule.arkade_bumper_wallet_full_scan_done())
  },

  async hasOpenSession(params: {
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
    arkadeAccountId: string
  }): Promise<boolean> {
    return activeSessionKey === arkadeSessionKey(
      params.walletId,
      params.networkMode,
      params.arkadeAccountId,
    )
  },

  async reconcileActiveAccountId(arkadeAccountId: string): Promise<void> {
    if (activeSessionParams == null) {
      return
    }
    activeSessionParams = {
      ...activeSessionParams,
      arkadeAccountId,
    }
    activeSessionKey = arkadeSessionKey(
      activeSessionParams.walletId,
      activeSessionParams.networkMode,
      arkadeAccountId,
    )
  },

  async syncWithOperator(
    scheduleBackgroundFull = false,
  ): Promise<ArkadeOperatorSyncResult> {
    const { awaitArkadeSyncQuiescence } = await import(
      '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
    )
    await awaitArkadeSyncQuiescence()
    return syncWithOperatorCore(scheduleBackgroundFull)
  },

  scheduleBackgroundFullVtxoReconcile(): void {
    scheduleBackgroundFullVtxoReconcileSingleFlight()
  },

  setOnBackgroundFullReconcileFinished(
    onFinished: (outcome: BackgroundFullVtxoReconcileOutcome) => void | Promise<void>,
  ): void {
    onBackgroundFullReconcileFinished = onFinished
  },

  async enterAutonomousMode(): Promise<void> {
    await invokeWasmArkade((wasmModule) => wasmModule.arkade_enter_autonomous_mode())
    await flushSdkPersistenceNowOrThrow()
  },

  async exitAutonomousMode(): Promise<void> {
    const result = (await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_exit_autonomous_mode(),
    )) as ArkadeOperatorSyncResult
    await flushSdkPersistenceNowOrThrow()
    scheduleBackgroundFullFromSyncResult(result ?? {})
  },

  async getAutonomousModeStatus(): Promise<ArkadeAutonomousModeStatus> {
    const status = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_autonomous_mode_status(),
    )
    return status as ArkadeAutonomousModeStatus
  },

  async getOperatorTrustStatus(): Promise<ArkadeOperatorTrustStatus> {
    const status = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_operator_trust_status(),
    )
    return status as ArkadeOperatorTrustStatus
  },

  async getOperatorConfigDiff(): Promise<ArkadeOperatorConfigDiffResult> {
    const diff = await invokeWasmArkade((wasmModule) => wasmModule.arkade_operator_config_diff())
    return diff as ArkadeOperatorConfigDiffResult
  },

  async acceptPendingOperatorConfig(): Promise<void> {
    const result = (await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_accept_pending_operator_config(),
    )) as ArkadeOperatorSyncResult
    await flushSdkPersistenceNowOrThrow()
    scheduleBackgroundFullFromSyncResult(result ?? {})
  },

  async reviewOperatorConfigInAutonomousMode(): Promise<void> {
    await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_review_operator_config_in_autonomous_mode(),
    )
    await flushSdkPersistenceNowOrThrow()
  },

  async migrateDeprecatedSignerVtxos(
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeSignerMigrationResult> {
    const wasmOnRegistered = createOnRegisteredWasmCallback(onRegistered)
    const result = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_migrate_deprecated_signer_vtxos(wasmOnRegistered),
    )
    await flushSdkPersistenceNowOrThrow()
    return result as ArkadeSignerMigrationResult
  },

  async flushSdkPersistence(): Promise<void> {
    await flushSdkPersistenceNowOrThrow()
  },

  async exportSdkPersistenceJsonForE2e(): Promise<string> {
    return invokeWasmArkade((wasmModule) => wasmModule.arkade_export_persistence_json())
  },

  async readPersistedSdkPersistenceJsonForE2e(params: {
    walletId: number
    arkadeAccountId: string
  }): Promise<string | undefined> {
    const encryptedPayload = await getEncryptedPayloadDeps().encryptedHost.readEncryptedPayload(
      params.walletId,
    )
    return extractSdkPersistenceJsonForAccount(getEncryptedPayloadDeps(), {
      encryptedPayload: encryptedBlobForDbToMessage(encryptedPayload),
      arkadeAccountId: params.arkadeAccountId,
    })
  },

  async findActiveAccountSummary(params) {
    return findActiveAccountSummary(getEncryptedPayloadDeps(), {
      walletId: params.walletId,
      networkMode: params.networkMode,
      encryptedPayload: encryptedBlobForDbToMessage(params.encryptedPayload),
    })
  },

  async listAccountSummaries(params) {
    return listAccountSummaries(getEncryptedPayloadDeps(), params)
  },

  async ensureArkadeAccountEncrypted(params: EnsureArkadeAccountEncryptedParams) {
    const { persistInitialSdkFromWasm, ...connectionParams } = params
    return ensureArkadeAccountEncrypted(
      getEncryptedPayloadDeps(),
      connectionParams,
      persistInitialSdkFromWasm
        ? {
            exportInitialSdkFromWasm: () =>
              invokeWasmArkade((wasmModule) => wasmModule.arkade_export_persistence_json()),
          }
        : undefined,
    )
  },

  async updateOperatorSyncAtEncrypted(params) {
    if (!arkadeOpenSessionMatchesSaveTarget(activeSessionParams, params)) {
      return
    }
    return updateOperatorSyncAtEncrypted(getEncryptedPayloadDeps(), params)
  },

  async closeSession(): Promise<void> {
    return closeSessionImpl()
  },

  async getBalance(): Promise<ArkadeBalanceInfo> {
    return invokeWasmArkade(
      (wasmModule) => wasmModule.arkade_get_balance() as Promise<ArkadeBalanceInfo>,
    )
  },

  async getAddress(): Promise<string> {
    return invokeWasmArkade((wasmModule) => wasmModule.arkade_get_address())
  },

  async getNewAddress(): Promise<string> {
    const address = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_reveal_next_receive_address(),
    )
    await persistAfterCriticalOperation()
    return address
  },

  async getBoardingAddress(): Promise<string> {
    const address = await invokeWasmArkade((wasmModule) => wasmModule.arkade_get_boarding_address())
    try {
      // Persist the boarding-output row only. A full operator list here races the
      // dashboard indexer scan and saturates the browser connection pool (Failed to fetch).
      await flushSdkPersistenceNowOrThrow()
    } catch {
      // Keep returning the address so funding is not blocked if save fails.
    }
    return address
  },

  async getBoardingStatus() {
    const status = (await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_get_boarding_status(),
    )) as ArkadeBoardingStatus
    if (status.finalizedCommitmentTxid) {
      await persistAfterCriticalOperation()
    }
    return status
  },

  async sendPayment(params: ArkadeSendParams): Promise<string> {
    const fingerprint = sendPaymentFingerprint(params)
    if (sendPaymentInFlight != null) {
      if (sendPaymentInFlight.fingerprint === fingerprint) {
        return sendPaymentInFlight.promise
      }
      throw new Error('Another Arkade payment is already in progress')
    }

    const promise = (async () => {
      const txid = await invokeWasmArkade((wasmModule) => wasmModule.arkade_send_payment(params))
      await flushSdkPersistenceNowOrThrow()
      return txid
    })()

    sendPaymentInFlight = { fingerprint, promise }
    try {
      return await promise
    } finally {
      if (sendPaymentInFlight?.promise === promise) {
        sendPaymentInFlight = null
      }
    }
  },

  async getTransactionHistory(): Promise<ArkadePaymentRow[]> {
    return invokeWasmArkade(
      (wasmModule) =>
        wasmModule.arkade_get_transaction_history() as Promise<ArkadePaymentRow[]>,
    )
  },

  async getDelegateInfo(): Promise<ArkadeDelegateInfo> {
    return invokeWasmArkade(
      (wasmModule) => wasmModule.arkade_get_delegate_info() as Promise<ArkadeDelegateInfo>,
    )
  },

  async getExpiringVtxoCount(): Promise<number> {
    return invokeWasmArkade((wasmModule) => wasmModule.arkade_get_expiring_vtxo_count())
  },

  async getVtxoExpiryStatus(): Promise<ArkadeVtxoExpiryStatus> {
    const result = await invokeWasmArkade((wasmModule) => wasmModule.arkade_get_vtxo_expiry_status())
    return result as ArkadeVtxoExpiryStatus
  },

  async getOperatorScheduledSession(): Promise<ArkadeOperatorScheduledSession | null> {
    const result = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_operator_scheduled_session(),
    )
    return (result as ArkadeOperatorScheduledSession | null) ?? null
  },

  async renewVtxosNow(
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult> {
    return runBatchJoinAndPersist(
      (wasmModule, wasmOnRegistered) => wasmModule.arkade_renew_vtxos_now(wasmOnRegistered),
      onRegistered,
    )
  },

  async delegateSpendableVtxos(): Promise<{
    delegated: number
    failed: number
    errorMessage?: string
  }> {
    const result = await invokeWasmArkade((wasmModule) => wasmModule.arkade_delegate_spendable_vtxos())
    await persistAfterCriticalOperation()
    return result as { delegated: number; failed: number }
  },

  async finalizePendingTransactions(): Promise<{ finalized: number; pending: number }> {
    const result = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_finalize_pending_transactions(),
    )
    if ((result.finalized ?? 0) > 0) {
      await persistAfterCriticalOperation()
    }
    return result as { finalized: number; pending: number }
  },

  async onboardBoardedUtxos(
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult> {
    await this.getBoardingAddress()
    return runBatchJoinAndPersist(
      (wasmModule, wasmOnRegistered) => wasmModule.arkade_onboard_boarded_utxos(wasmOnRegistered),
      onRegistered,
    )
  },

  async cancelPendingBatchIntent(
    params: ArkadePendingBatchIntentActionParams,
  ): Promise<ArkadeBatchJoinResult> {
    return runBatchJoinAndPersist((wasmModule) =>
      wasmModule.arkade_cancel_pending_batch_intent(params),
    )
  },

  async retryPendingBatchIntent(
    params: ArkadePendingBatchIntentActionParams,
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult> {
    return runBatchJoinAndPersist(
      (wasmModule, wasmOnRegistered) =>
        wasmModule.arkade_retry_pending_batch_intent(params, wasmOnRegistered),
      onRegistered,
    )
  },

  async abortInFlightBatchJoin(): Promise<void> {
    await invokeWasmArkade((wasmModule) => wasmModule.arkade_abort_in_flight_batch_join())
  },

  async getRecoverableVtxoFeeEstimate(): Promise<ArkadeRecoverableVtxoFeeEstimate> {
    return invokeWasmArkade(
      (wasmModule) =>
        wasmModule.arkade_get_recoverable_vtxo_fee_estimate() as Promise<ArkadeRecoverableVtxoFeeEstimate>,
    )
  },

  async recoverRecoverableVtxos(
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult> {
    return runBatchJoinAndPersist(
      (wasmModule, wasmOnRegistered) =>
        wasmModule.arkade_recover_recoverable_vtxos(wasmOnRegistered),
      onRegistered,
    )
  },

  async listExitCandidates(): Promise<ArkadeExitCandidateDto[]> {
    return invokeWasmArkade(
      (wasmModule) =>
        wasmModule.arkade_list_exit_candidates() as Promise<ArkadeExitCandidateDto[]>,
    )
  },

  async listVtxos(): Promise<ArkadeVtxoListResult> {
    return invokeWasmArkade(
      (wasmModule) => wasmModule.arkade_list_vtxos() as Promise<ArkadeVtxoListResult>,
    )
  },

  async listUnilateralExitsInProgress(): Promise<ArkadeUnilateralExitInProgressDto[]> {
    const rows = await invokeWasmArkade(
      (wasmModule) =>
        wasmModule.arkade_list_unilateral_exits_in_progress() as Promise<
          ArkadeUnilateralExitInProgressDto[]
        >,
    )
    await persistAfterUnilateralExitOperation()
    return rows
  },

  async listVtxoExitRecords(): Promise<ArkadeVtxoExitRecordDto[]> {
    return invokeWasmArkade(
      (wasmModule) => wasmModule.arkade_list_vtxo_exit_records() as ArkadeVtxoExitRecordDto[],
    )
  },

  async getOnchainBumperInfo(): Promise<ArkadeOnchainBumperInfo> {
    return invokeWasmArkade(
      (wasmModule) =>
        wasmModule.arkade_get_onchain_bumper_info() as Promise<ArkadeOnchainBumperInfo>,
    )
  },

  async unilateralExitTimelock(): Promise<ArkadeUnilateralExitTimelock> {
    return invokeWasmArkade(
      (wasmModule) =>
        wasmModule.arkade_unilateral_exit_timelock() as ArkadeUnilateralExitTimelock,
    )
  },

  async peekOnchainBumperAddress(): Promise<string> {
    return invokeWasmArkade(
      (wasmModule) => wasmModule.arkade_peek_onchain_bumper_address() as string,
    )
  },

  async collaborativeExit(
    params: ArkadeCollaborativeExitParams,
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult> {
    return runBatchJoinAndPersist(
      (wasmModule, wasmOnRegistered) =>
        wasmModule.arkade_collaborative_exit(params, wasmOnRegistered),
      onRegistered,
    )
  },

  async completeUnilateralExit(
    params: ArkadeCompleteUnilateralExitParams,
  ): Promise<string> {
    const txid = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_complete_unilateral_exit(params),
    )
    await persistAfterUnilateralExitOperation()
    return txid
  },

  async getCollaborativeExitFeeEstimate(
    params: ArkadeCollaborativeExitFeeEstimateParams,
  ): Promise<ArkadeCollaborativeExitFeeEstimate> {
    return invokeWasmArkade(
      (wasmModule) =>
        wasmModule.arkade_get_collaborative_exit_fee_estimate(
          params,
        ) as Promise<ArkadeCollaborativeExitFeeEstimate>,
    )
  },

  async estimateUnilateralExitCompletion(
    params: ArkadeUnilateralExitCompletionFeeEstimateParams,
  ): Promise<ArkadeUnilateralExitCompletionFeeEstimate> {
    return invokeWasmArkade(
      (wasmModule) =>
        wasmModule.arkade_estimate_unilateral_exit_completion(
          params,
        ) as Promise<ArkadeUnilateralExitCompletionFeeEstimate>,
    )
  },

  async getUnilateralExitTopology(
    params: ArkadeUnilateralExitTopologyParams,
  ): Promise<ArkadeUnilateralExitTopology> {
    return invokeWasmArkade(
      (wasmModule) =>
        wasmModule.arkade_get_unilateral_exit_topology(
          params,
        ) as Promise<ArkadeUnilateralExitTopology>,
    )
  },

  async estimateUnilateralExitBatch(
    params: ArkadeUnilateralExitBatchEstimateParams,
  ): Promise<ArkadeUnilateralExitBatchEstimate> {
    return invokeWasmArkade(
      (wasmModule) =>
        wasmModule.arkade_estimate_unilateral_exit_batch(
          params,
        ) as Promise<ArkadeUnilateralExitBatchEstimate>,
    )
  },

  async proceedUnilateralExitStep(
    params: ArkadeProceedUnilateralExitStepParams,
  ): Promise<ArkadeProceedUnilateralExitStepResult> {
    const { walletScope, ...wasmParams } = params
    assertCallerMatchesOpenSession(walletScope)
    const result = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_proceed_unilateral_exit_step(
        wasmParams,
      ) as Promise<ArkadeProceedUnilateralExitStepResult>,
    )
    await persistAfterUnilateralExitOperation()
    return result
  },

  async getUnilateralExitProgress(
    params: ArkadeUnilateralExitProgressParams,
  ): Promise<ArkadeUnilateralExitProgress> {
    const progress = await invokeWasmArkade(
      (wasmModule) =>
        wasmModule.arkade_get_unilateral_exit_progress(
          params,
        ) as Promise<ArkadeUnilateralExitProgress>,
    )
    await persistAfterUnilateralExitOperation()
    return progress
  },

  async tagUnilateralExitPlan(
    params: ArkadeUnilateralExitProgressParams,
  ): Promise<void> {
    await invokeWasmArkade((wasmModule) => wasmModule.arkade_tag_unilateral_exit_plan(params))
    await persistAfterUnilateralExitOperation()
  },

  async untagUnilateralExitPlanIfSafe(
    params: ArkadeUnilateralExitProgressParams,
  ): Promise<void> {
    await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_untag_unilateral_exit_plan_if_safe(params),
    )
    await persistAfterUnilateralExitOperation()
  },

  async evaluateUnilateralExitJobViability(
    params: ArkadeUnilateralExitProgressParams,
  ): Promise<ArkadeUnilateralExitJobViability> {
    return invokeWasmArkade(
      (wasmModule) =>
        wasmModule.arkade_evaluate_unilateral_exit_job_viability(
          params,
        ) as Promise<ArkadeUnilateralExitJobViability>,
    )
  },

  async getUnilateralExitFrontendPersistence(
    walletScope: ArkadeWalletScope,
  ): Promise<ArkadeUnilateralExitFrontendPersistence | null> {
    assertCallerMatchesOpenSession(walletScope)
    const result = await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_get_unilateral_exit_frontend(),
    )
    if (result == null) {
      return null
    }
    return result as ArkadeUnilateralExitFrontendPersistence
  },

  async setUnilateralExitFrontendPersistence(
    walletScope: ArkadeWalletScope,
    bundle: ArkadeUnilateralExitFrontendPersistence,
  ): Promise<void> {
    assertCallerMatchesOpenSession(walletScope)
    await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_set_unilateral_exit_frontend(bundle),
    )
    await flushSdkPersistenceNowOrThrow()
  },

  async setUnilateralExitJob(
    walletScope: ArkadeWalletScope,
    job: ArkadeUnilateralExitJobPersistence,
  ): Promise<void> {
    assertCallerMatchesOpenSession(walletScope)
    await invokeWasmArkade((wasmModule) => wasmModule.arkade_set_unilateral_exit_job(job))
    await flushSdkPersistenceNowOrThrow()
  },

  async setUnilateralExitAutomationPrefs(
    walletScope: ArkadeWalletScope,
    prefs: ArkadeUnilateralExitAutomationPrefsPersistence,
  ): Promise<void> {
    assertCallerMatchesOpenSession(walletScope)
    await invokeWasmArkade((wasmModule) =>
      wasmModule.arkade_set_unilateral_exit_automation_prefs(prefs),
    )
    await flushSdkPersistenceNowOrThrow()
  },

  async setUnilateralExitFailure(
    walletScope: ArkadeWalletScope,
    failure: ArkadeUnilateralExitFailurePersistence | null,
  ): Promise<void> {
    assertCallerMatchesOpenSession(walletScope)
    await invokeWasmArkade((wasmModule) => wasmModule.arkade_set_unilateral_exit_failure(failure))
    await flushSdkPersistenceNowOrThrow()
  },
}

expose(arkadeService)
