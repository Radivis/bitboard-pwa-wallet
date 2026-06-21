import { expose, wrap, type Remote } from 'comlink'
import type {
  EncryptedBlobMessage,
  SecretsChannelService,
} from '@/workers/secrets-channel-types'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { arkadeSessionKey } from '@/lib/arkade/arkade-session-key'
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
import type {
  ArkadeBalanceInfo,
  ArkadeCollaborativeExitFeeEstimate,
  ArkadeCollaborativeExitFeeEstimateParams,
  ArkadeCollaborativeExitParams,
  ArkadeCompleteUnilateralExitParams,
  ArkadeDelegateInfo,
  ArkadeExitCandidateRow,
  ArkadeOnchainBumperInfo,
  ArkadePaymentRow,
  ArkadeSendParams,
  ArkadeService,
  ArkadeUnilateralExitFeeEstimate,
  ArkadeUnilateralExitFeeEstimateParams,
  ArkadeUnrollProgressEvent,
  ArkadeVtxoExpiryStatus,
  EnsureArkadeOperatorConnectionEncryptedParams,
  OpenArkadeSessionParams,
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
let unrollInFlight = false
let inFlightPersist: Promise<void> | null = null

type SendPaymentInFlight = {
  fingerprint: string
  promise: Promise<string>
}

let sendPaymentInFlight: SendPaymentInFlight | null = null

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

/** WASM operator sync + SDK flush only — store refresh runs on the main thread. */
async function syncWithOperatorCore(): Promise<void> {
  await invokeWasmArk((wasmModule) => wasmModule.ark_sync_with_operator())
  await flushSdkPersistenceNowOrThrow()
}

async function persistAfterCriticalOperation(): Promise<void> {
  const { awaitBackgroundArkadeOperatorSync } = await import(
    '@/lib/arkade/arkade-operator-sync'
  )
  await awaitBackgroundArkadeOperatorSync()
  if (activeSessionParams != null) {
    await syncWithOperatorCore()
    return
  }
  await flushSdkPersistenceNowOrThrow()
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
  unrollInFlight = false
  sendPaymentInFlight = null
}

async function openSessionImpl(
  params: OpenArkadeSessionParams,
): Promise<{ arkadeAddress: string; operatorSignerPkHex: string }> {
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

  async syncWithOperator(): Promise<void> {
    const { awaitBackgroundArkadeOperatorSync } = await import(
      '@/lib/arkade/arkade-operator-sync'
    )
    await awaitBackgroundArkadeOperatorSync()
    await syncWithOperatorCore()
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
    await persistAfterCriticalOperation()
    return address
  },

  async getBoardingStatus() {
    return invokeWasmArk((wasmModule) => wasmModule.ark_get_boarding_status())
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

  async renewVtxosNow(): Promise<string | null> {
    const txid =
      (await invokeWasmArk((wasmModule) => wasmModule.ark_renew_vtxos_now())) ?? null
    if (txid != null) {
      await persistAfterCriticalOperation()
    }
    return txid
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

  async onboardBoardedUtxos(): Promise<string | null> {
    await this.getBoardingAddress()
    const txid =
      (await invokeWasmArk((wasmModule) => wasmModule.ark_onboard_boarded_utxos())) ?? null
    if (txid != null) {
      await persistAfterCriticalOperation()
    }
    return txid
  },

  async listExitCandidates(): Promise<ArkadeExitCandidateRow[]> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_list_exit_candidates() as Promise<ArkadeExitCandidateRow[]>,
    )
  },

  async getOnchainBumperInfo(): Promise<ArkadeOnchainBumperInfo> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_get_onchain_bumper_info() as Promise<ArkadeOnchainBumperInfo>,
    )
  },

  async collaborativeExit(params: ArkadeCollaborativeExitParams): Promise<string> {
    const txid = await invokeWasmArk((wasmModule) => wasmModule.ark_collaborative_exit(params))
    await persistAfterCriticalOperation()
    return txid
  },

  async runUnilateralUnroll(
    params: { txid: string; vout: number },
    onProgress: (event: ArkadeUnrollProgressEvent) => void,
  ): Promise<{ vtxoTxid: string }> {
    if (unrollInFlight) {
      throw new Error('Unilateral unroll is already in progress')
    }

    unrollInFlight = true
    try {
      const result = await invokeWasmArk((wasmModule) =>
        wasmModule.ark_run_unilateral_unroll(
          params.txid,
          params.vout,
          (event: ArkadeUnrollProgressEvent) => {
            onProgress(event)
          },
        ),
      )
      await persistAfterCriticalOperation()
      return result as { vtxoTxid: string }
    } finally {
      unrollInFlight = false
    }
  },

  async completeUnilateralExit(
    params: ArkadeCompleteUnilateralExitParams,
  ): Promise<string> {
    const txid = await invokeWasmArk((wasmModule) =>
      wasmModule.ark_complete_unilateral_exit(params),
    )
    await persistAfterCriticalOperation()
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

  async estimateUnilateralExit(
    params: ArkadeUnilateralExitFeeEstimateParams,
  ): Promise<ArkadeUnilateralExitFeeEstimate> {
    return invokeWasmArk(
      (wasmModule) =>
        wasmModule.ark_estimate_unilateral_exit(params) as Promise<ArkadeUnilateralExitFeeEstimate>,
    )
  },
}

expose(arkadeService)
