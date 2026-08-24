import { expose, wrap, type Remote } from 'comlink'
import type {
  EncryptedBlobMessage,
  SecretsChannelService,
} from '@/workers/secrets-channel-types'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { arkadeSessionKey } from '@/lib/arkade/arkade-session-key'
import { assertArkadeOpenSessionMatchesScope } from '@/lib/arkade/arkade-session-scope'
import { rethrowWasmArkErrorForComlink } from '@/lib/shared/wasm-ark-error'
import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import {
  ensureOperatorConnectionEncrypted,
  extractSdkPersistenceJsonForConnection,
  findActiveConnectionSummary,
  listConnectionSummaries,
  persistSdkJsonToEncryptedPayload,
  updateOperatorSyncAtEncrypted,
  type ArkadeEncryptedPayloadDeps,
} from '@/workers/arkade-worker-encrypted-payload'
import { shouldSyncOperatorAfterUnilateralExitOperation } from '@/lib/arkade/unilateral-exit-offline'
import type {
  ArkadeBalanceInfo,
  ArkadeBatchJoinResult,
  ArkadeBoardingStatus,
  ArkadeCollaborativeExitFeeEstimate,
  ArkadeCollaborativeExitFeeEstimateParams,
  ArkadeCollaborativeExitParams,
  ArkadeCompleteUnilateralExitParams,
  ArkadeDelegateInfo,
  ArkadeExitCandidateRow,
  ArkadeOnchainBumperInfo,
  ArkadeOperatorSyncResult,
  ArkadePaymentRow,
  ArkadePendingBatchIntentActionParams,
  ArkadeRecoverableVtxoFeeEstimate,
  ArkadeSendParams,
  ArkadeService,
  ArkadeSignerMigrationResult,
  ArkadeUnilateralExitCompletionFeeEstimate,
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
  ArkadeUnilateralExitInProgressRow,
  ArkadeAutonomousModeStatus,
  ArkadeVtxoListResult,
  ArkadeVtxoExpiryStatus,
  ArkadePendingBatchIntent,
  EnsureArkadeOperatorConnectionEncryptedParams,
  OpenArkadeSessionParams,
  OpenArkadeSessionResult,
} from '@/workers/arkade-api'

import { loadBitboardArkWasm } from '@/lib/arkade/load-bitboard-ark-wasm'

type BitboardArkWasm = Awaited<ReturnType<typeof loadBitboardArkWasm>>

let arkWasmModule: BitboardArkWasm | null = null
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
  connectionId: string
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

async function getArkWasm(): Promise<BitboardArkWasm> {
  if (wasmInitError) {
    throw new Error(`WASM init failed: ${wasmInitError}`)
  }
  if (!arkWasmModule) {
    arkWasmModule = await loadBitboardArkWasm()
  }
  return arkWasmModule
}

/** Ensures WASM failures surface with readable messages through Comlink (mirrors crypto.worker). */
async function invokeWasmArk<T>(
  run: (wasmModule: BitboardArkWasm) => T | Promise<T>,
): Promise<T> {
  try {
    const wasmModule = await getArkWasm()
    return await run(wasmModule)
  } catch (err) {
    rethrowWasmArkErrorForComlink(err)
  }
}

async function initWasm() {
  try {
    arkWasmModule = await loadBitboardArkWasm()
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

async function flushSdkPersistenceNowOrThrow(): Promise<void> {
  if (activeSessionParams == null) {
    throw new Error('Arkade SDK persistence flush was skipped (no active session)')
  }

  if (inFlightPersist != null) {
    await inFlightPersist
    return flushSdkPersistenceNowOrThrow()
  }

  const sessionParams = activeSessionParams
  inFlightPersist = (async () => {
    const sdkPersistenceJson = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_export_persistence_json(),
    )
    await persistSdkJsonToEncryptedPayload(getEncryptedPayloadDeps(), {
      walletId: sessionParams.walletId,
      connectionId: sessionParams.connectionId,
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
    const status = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_autonomous_mode_status(),
    )
    return Boolean((status as ArkadeAutonomousModeStatus | undefined)?.active)
  } catch {
    return false
  }
}

/** WASM operator sync + SDK flush only — store refresh runs on the main thread. */
async function syncWithOperatorCore(): Promise<ArkadeOperatorSyncResult> {
  const result = await invokeWasmArk((wasmModule) => wasmModule.ark_sync_with_operator())
  await flushSdkPersistenceNowOrThrow()
  return (result ?? {}) as ArkadeOperatorSyncResult
}

async function persistAfterUnilateralExitOperation(): Promise<void> {
  const { awaitArkadeSyncQuiescence } = await import(
    '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
  )
  await awaitArkadeSyncQuiescence()
  if (shouldSyncOperatorAfterUnilateralExitOperation() && activeSessionParams != null) {
    await syncWithOperatorCore()
    return
  }
  await flushSdkPersistenceNowOrThrow()
}

async function persistAfterCriticalOperation(): Promise<void> {
  const { awaitArkadeSyncQuiescence } = await import(
    '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
  )
  await awaitArkadeSyncQuiescence()
  if (activeSessionParams != null) {
    const autonomousActive = await getAutonomousModeActive()
    if (!autonomousActive) {
      await syncWithOperatorCore()
      return
    }
  }
  await flushSdkPersistenceNowOrThrow()
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
    wasmModule: BitboardArkWasm,
    onRegistered: (intent: ArkadePendingBatchIntent) => Promise<void>,
  ) => unknown | Promise<unknown>,
  onRegistered?: (intent: ArkadePendingBatchIntent) => void,
): Promise<ArkadeBatchJoinResult> {
  const wasmOnRegistered = createOnRegisteredWasmCallback(onRegistered)
  try {
    const result = (await invokeWasmArk((wasmModule) =>
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
    await invokeWasmArk((wasmModule) => wasmModule.ark_close_session())
  } catch {
    // Module may not be loaded yet.
  }

  activeSessionKey = null
  activeSessionParams = null
  sendPaymentInFlight = null
}

async function openSessionImpl(
  params: OpenArkadeSessionParams,
): Promise<OpenArkadeSessionResult> {
  const key = arkadeSessionKey(params.walletId, params.networkMode, params.connectionId)

  if (activeSessionKey === key) {
    try {
      const address = await invokeWasmArk((wasmModule) => wasmModule.ark_get_address())
      const operatorSignerPkHex = await invokeWasmArk((wasmModule) =>
        wasmModule.ark_operator_signer_pk_hex(),
      )
      return { arkadeAddress: address, operatorSignerPkHex }
    } catch {
      // Fall through to full open.
    }
  }

  await closeSessionImpl()
  deleteLegacyArkadeIndexedDb(params.walletId, params.networkMode)

  const encryptedPayloadMessage = encryptedBlobForDbToMessage(params.encryptedPayload)
  const sdkPersistenceJson = await extractSdkPersistenceJsonForConnection(
    getEncryptedPayloadDeps(),
    {
      encryptedPayload: encryptedPayloadMessage,
      connectionId: params.connectionId,
    },
  )

  const mnemonic = await requestDecrypt(encryptedBlobForDbToMessage(params.encryptedMnemonic))
  activeSessionParams = {
    walletId: params.walletId,
    networkMode: params.networkMode,
    connectionId: params.connectionId,
  }

  try {
    const openResult = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_open_session({
        mnemonic,
        networkMode: params.networkMode,
        arkServerUrl: params.arkServerUrl,
        delegatorUrl: params.delegatorUrl,
        esploraUrl: params.esploraUrl,
        sdkPersistenceJson,
      }),
    )

    activeSessionKey = key
    return {
      arkadeAddress: openResult.arkadeAddress as string,
      operatorSignerPkHex: openResult.operatorSignerPkHex as string,
      signerMigrationHint: openResult.signerMigrationHint as
        | OpenArkadeSessionResult['signerMigrationHint']
        | undefined,
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
    await getArkWasm()
    return true
  },

  async openSession(params: OpenArkadeSessionParams) {
    return openSessionImpl(params)
  },

  async hasOpenSession(params: {
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
    connectionId: string
  }): Promise<boolean> {
    return activeSessionKey === arkadeSessionKey(
      params.walletId,
      params.networkMode,
      params.connectionId,
    )
  },

  async reconcileActiveConnectionId(connectionId: string): Promise<void> {
    if (activeSessionParams == null) {
      return
    }
    activeSessionParams = {
      ...activeSessionParams,
      connectionId,
    }
    activeSessionKey = arkadeSessionKey(
      activeSessionParams.walletId,
      activeSessionParams.networkMode,
      connectionId,
    )
  },

  async syncWithOperator(): Promise<ArkadeOperatorSyncResult> {
    const { awaitArkadeSyncQuiescence } = await import(
      '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
    )
    await awaitArkadeSyncQuiescence()
    return syncWithOperatorCore()
  },

  async enterAutonomousMode(): Promise<void> {
    await invokeWasmArk((wasmModule) => wasmModule.ark_enter_autonomous_mode())
    await flushSdkPersistenceNowOrThrow()
  },

  async exitAutonomousMode(): Promise<void> {
    await invokeWasmArk((wasmModule) => wasmModule.ark_exit_autonomous_mode())
    await flushSdkPersistenceNowOrThrow()
  },

  async getAutonomousModeStatus(): Promise<ArkadeAutonomousModeStatus> {
    const status = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_autonomous_mode_status(),
    )
    return status as ArkadeAutonomousModeStatus
  },

  async getOperatorTrustStatus(): Promise<ArkadeOperatorTrustStatus> {
    const status = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_operator_trust_status(),
    )
    return status as ArkadeOperatorTrustStatus
  },

  async getOperatorConfigDiff(): Promise<ArkadeOperatorConfigDiffResult> {
    const diff = await invokeWasmArk((wasmModule) => wasmModule.ark_operator_config_diff())
    return diff as ArkadeOperatorConfigDiffResult
  },

  async acceptPendingOperatorConfig(): Promise<void> {
    await invokeWasmArk((wasmModule) => wasmModule.ark_accept_pending_operator_config())
    await flushSdkPersistenceNowOrThrow()
  },

  async reviewOperatorConfigInAutonomousMode(): Promise<void> {
    await invokeWasmArk((wasmModule) =>
      wasmModule.ark_review_operator_config_in_autonomous_mode(),
    )
    await flushSdkPersistenceNowOrThrow()
  },

  async migrateDeprecatedSignerVtxos(
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeSignerMigrationResult> {
    const wasmOnRegistered = createOnRegisteredWasmCallback(onRegistered)
    const result = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_migrate_deprecated_signer_vtxos(wasmOnRegistered),
    )
    await flushSdkPersistenceNowOrThrow()
    return result as ArkadeSignerMigrationResult
  },

  async flushSdkPersistence(): Promise<void> {
    await flushSdkPersistenceNowOrThrow()
  },

  async exportSdkPersistenceJsonForE2e(): Promise<string> {
    return invokeWasmArk((wasmModule) => wasmModule.ark_export_persistence_json())
  },

  async readPersistedSdkPersistenceJsonForE2e(params: {
    walletId: number
    connectionId: string
  }): Promise<string | undefined> {
    const encryptedPayload = await getEncryptedPayloadDeps().encryptedHost.readEncryptedPayload(
      params.walletId,
    )
    return extractSdkPersistenceJsonForConnection(getEncryptedPayloadDeps(), {
      encryptedPayload: encryptedBlobForDbToMessage(encryptedPayload),
      connectionId: params.connectionId,
    })
  },

  async findActiveConnectionSummary(params) {
    return findActiveConnectionSummary(getEncryptedPayloadDeps(), {
      walletId: params.walletId,
      networkMode: params.networkMode,
      encryptedPayload: encryptedBlobForDbToMessage(params.encryptedPayload),
    })
  },

  async listConnectionSummaries(params) {
    return listConnectionSummaries(getEncryptedPayloadDeps(), params)
  },

  async ensureOperatorConnectionEncrypted(params: EnsureArkadeOperatorConnectionEncryptedParams) {
    const { persistInitialSdkFromWasm, ...connectionParams } = params
    return ensureOperatorConnectionEncrypted(
      getEncryptedPayloadDeps(),
      connectionParams,
      persistInitialSdkFromWasm
        ? {
            exportInitialSdkFromWasm: () =>
              invokeWasmArk((wasmModule) => wasmModule.ark_export_persistence_json()),
          }
        : undefined,
    )
  },

  async updateOperatorSyncAtEncrypted(params) {
    return updateOperatorSyncAtEncrypted(getEncryptedPayloadDeps(), params)
  },

  async closeSession(): Promise<void> {
    return closeSessionImpl()
  },

  async getBalance(): Promise<ArkadeBalanceInfo> {
    return invokeWasmArk(
      (wasmModule) => wasmModule.ark_get_balance() as Promise<ArkadeBalanceInfo>,
    )
  },

  async getAddress(): Promise<string> {
    return invokeWasmArk((wasmModule) => wasmModule.ark_get_address())
  },

  async getNewAddress(): Promise<string> {
    const address = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_reveal_next_receive_address(),
    )
    await persistAfterCriticalOperation()
    return address
  },

  async getBoardingAddress(): Promise<string> {
    const address = await invokeWasmArk((wasmModule) => wasmModule.ark_get_boarding_address())
    try {
      await persistAfterCriticalOperation()
    } catch {
      try {
        await flushSdkPersistenceNowOrThrow()
      } catch {
        // Keep returning the address so funding is not blocked if save/sync fails.
      }
    }
    return address
  },

  async getBoardingStatus() {
    const status = (await invokeWasmArk((wasmModule) =>
      wasmModule.ark_get_boarding_status(),
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
      const txid = await invokeWasmArk((wasmModule) => wasmModule.ark_send_payment(params))
      await persistAfterCriticalOperation()
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
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_get_transaction_history() as Promise<ArkadePaymentRow[]>,
    )
  },

  async getDelegateInfo(): Promise<ArkadeDelegateInfo> {
    return invokeWasmArk(
      (wasmModule) => wasmModule.ark_get_delegate_info() as Promise<ArkadeDelegateInfo>,
    )
  },

  async getExpiringVtxoCount(): Promise<number> {
    return invokeWasmArk((wasmModule) => wasmModule.ark_get_expiring_vtxo_count())
  },

  async getVtxoExpiryStatus(): Promise<ArkadeVtxoExpiryStatus> {
    const result = await invokeWasmArk((wasmModule) => wasmModule.ark_get_vtxo_expiry_status())
    return result as ArkadeVtxoExpiryStatus
  },

  async getOperatorScheduledSession(): Promise<ArkadeOperatorScheduledSession | null> {
    const result = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_operator_scheduled_session(),
    )
    return (result as ArkadeOperatorScheduledSession | null) ?? null
  },

  async renewVtxosNow(
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult> {
    return runBatchJoinAndPersist(
      (wasmModule, wasmOnRegistered) => wasmModule.ark_renew_vtxos_now(wasmOnRegistered),
      onRegistered,
    )
  },

  async delegateSpendableVtxos(): Promise<{
    delegated: number
    failed: number
    errorMessage?: string
  }> {
    const result = await invokeWasmArk((wasmModule) => wasmModule.ark_delegate_spendable_vtxos())
    await persistAfterCriticalOperation()
    return result as { delegated: number; failed: number }
  },

  async finalizePendingTransactions(): Promise<{ finalized: number; pending: number }> {
    const result = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_finalize_pending_transactions(),
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
      (wasmModule, wasmOnRegistered) => wasmModule.ark_onboard_boarded_utxos(wasmOnRegistered),
      onRegistered,
    )
  },

  async cancelPendingBatchIntent(
    params: ArkadePendingBatchIntentActionParams,
  ): Promise<ArkadeBatchJoinResult> {
    return runBatchJoinAndPersist((wasmModule) =>
      wasmModule.ark_cancel_pending_batch_intent(params),
    )
  },

  async retryPendingBatchIntent(
    params: ArkadePendingBatchIntentActionParams,
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult> {
    return runBatchJoinAndPersist(
      (wasmModule, wasmOnRegistered) =>
        wasmModule.ark_retry_pending_batch_intent(params, wasmOnRegistered),
      onRegistered,
    )
  },

  async abortInFlightBatchJoin(): Promise<void> {
    await invokeWasmArk((wasmModule) => wasmModule.ark_abort_in_flight_batch_join())
  },

  async getRecoverableVtxoFeeEstimate(): Promise<ArkadeRecoverableVtxoFeeEstimate> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_get_recoverable_vtxo_fee_estimate() as Promise<ArkadeRecoverableVtxoFeeEstimate>,
    )
  },

  async recoverRecoverableVtxos(
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult> {
    return runBatchJoinAndPersist(
      (wasmModule, wasmOnRegistered) =>
        wasmModule.ark_recover_recoverable_vtxos(wasmOnRegistered),
      onRegistered,
    )
  },

  async listExitCandidates(): Promise<ArkadeExitCandidateRow[]> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_list_exit_candidates() as Promise<ArkadeExitCandidateRow[]>,
    )
  },

  async listVtxos(): Promise<ArkadeVtxoListResult> {
    return invokeWasmArk(
      (wasmModule) => wasmModule.ark_list_vtxos() as Promise<ArkadeVtxoListResult>,
    )
  },

  async listUnilateralExitsInProgress(): Promise<ArkadeUnilateralExitInProgressRow[]> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_list_unilateral_exits_in_progress() as Promise<
          ArkadeUnilateralExitInProgressRow[]
        >,
    )
  },

  async getOnchainBumperInfo(): Promise<ArkadeOnchainBumperInfo> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_get_onchain_bumper_info() as Promise<ArkadeOnchainBumperInfo>,
    )
  },

  async collaborativeExit(
    params: ArkadeCollaborativeExitParams,
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult> {
    return runBatchJoinAndPersist(
      (wasmModule, wasmOnRegistered) =>
        wasmModule.ark_collaborative_exit(params, wasmOnRegistered),
      onRegistered,
    )
  },

  async completeUnilateralExit(
    params: ArkadeCompleteUnilateralExitParams,
  ): Promise<string> {
    const txid = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_complete_unilateral_exit(params),
    )
    await persistAfterUnilateralExitOperation()
    return txid
  },

  async getCollaborativeExitFeeEstimate(
    params: ArkadeCollaborativeExitFeeEstimateParams,
  ): Promise<ArkadeCollaborativeExitFeeEstimate> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_get_collaborative_exit_fee_estimate(
          params,
        ) as Promise<ArkadeCollaborativeExitFeeEstimate>,
    )
  },

  async estimateUnilateralExitCompletion(
    params: ArkadeUnilateralExitCompletionFeeEstimateParams,
  ): Promise<ArkadeUnilateralExitCompletionFeeEstimate> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_estimate_unilateral_exit_completion(
          params,
        ) as Promise<ArkadeUnilateralExitCompletionFeeEstimate>,
    )
  },

  async getUnilateralExitTopology(
    params: ArkadeUnilateralExitTopologyParams,
  ): Promise<ArkadeUnilateralExitTopology> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_get_unilateral_exit_topology(
          params,
        ) as Promise<ArkadeUnilateralExitTopology>,
    )
  },

  async estimateUnilateralExitBatch(
    params: ArkadeUnilateralExitBatchEstimateParams,
  ): Promise<ArkadeUnilateralExitBatchEstimate> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_estimate_unilateral_exit_batch(
          params,
        ) as Promise<ArkadeUnilateralExitBatchEstimate>,
    )
  },

  async proceedUnilateralExitStep(
    params: ArkadeProceedUnilateralExitStepParams,
  ): Promise<ArkadeProceedUnilateralExitStepResult> {
    const { walletScope, ...wasmParams } = params
    assertCallerMatchesOpenSession(walletScope)
    const result = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_proceed_unilateral_exit_step(
        wasmParams,
      ) as Promise<ArkadeProceedUnilateralExitStepResult>,
    )
    await persistAfterUnilateralExitOperation()
    return result
  },

  async getUnilateralExitProgress(
    params: ArkadeUnilateralExitProgressParams,
  ): Promise<ArkadeUnilateralExitProgress> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_get_unilateral_exit_progress(
          params,
        ) as Promise<ArkadeUnilateralExitProgress>,
    )
  },

  async evaluateUnilateralExitJobViability(
    params: ArkadeUnilateralExitProgressParams,
  ): Promise<ArkadeUnilateralExitJobViability> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_evaluate_unilateral_exit_job_viability(
          params,
        ) as Promise<ArkadeUnilateralExitJobViability>,
    )
  },

  async getUnilateralExitFrontendPersistence(
    walletScope: ArkadeWalletScope,
  ): Promise<ArkadeUnilateralExitFrontendPersistence | null> {
    assertCallerMatchesOpenSession(walletScope)
    const result = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_get_unilateral_exit_frontend(),
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
    await invokeWasmArk((wasmModule) =>
      wasmModule.ark_set_unilateral_exit_frontend(bundle),
    )
    await flushSdkPersistenceNowOrThrow()
  },

  async setUnilateralExitJob(
    walletScope: ArkadeWalletScope,
    job: ArkadeUnilateralExitJobPersistence,
  ): Promise<void> {
    assertCallerMatchesOpenSession(walletScope)
    await invokeWasmArk((wasmModule) => wasmModule.ark_set_unilateral_exit_job(job))
    await flushSdkPersistenceNowOrThrow()
  },

  async setUnilateralExitAutomationPrefs(
    walletScope: ArkadeWalletScope,
    prefs: ArkadeUnilateralExitAutomationPrefsPersistence,
  ): Promise<void> {
    assertCallerMatchesOpenSession(walletScope)
    await invokeWasmArk((wasmModule) =>
      wasmModule.ark_set_unilateral_exit_automation_prefs(prefs),
    )
    await flushSdkPersistenceNowOrThrow()
  },

  async setUnilateralExitFailure(
    walletScope: ArkadeWalletScope,
    failure: ArkadeUnilateralExitFailurePersistence | null,
  ): Promise<void> {
    assertCallerMatchesOpenSession(walletScope)
    await invokeWasmArk((wasmModule) => wasmModule.ark_set_unilateral_exit_failure(failure))
    await flushSdkPersistenceNowOrThrow()
  },
}

expose(arkadeService)
