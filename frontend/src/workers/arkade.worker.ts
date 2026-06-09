import { expose, wrap, type Remote } from 'comlink'
import type {
  EncryptedBlobMessage,
  SecretsChannelService,
} from '@/workers/secrets-channel-types'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { arkadeSessionKey } from '@/lib/arkade/arkade-session-key'
import { rethrowWasmArkErrorForComlink } from '@/lib/shared/wasm-ark-error'
import {
  clearDebouncedSdkPersistenceFlush,
  flushSdkPersistenceNowOrThrow,
  setArkadeSdkPersistenceBridge,
  setArkadeSdkPersistenceExporter,
  setArkadeSdkPersistenceFlushContext,
  type ArkadeSdkPersistenceBridge,
} from '@/lib/arkade/storage/arkade-sdk-persistence-flush'
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
  OpenArkadeSessionParams,
} from '@/workers/arkade-api'

import { loadBitboardArkWasm } from '@/lib/arkade/load-bitboard-ark-wasm'

type BitboardArkWasm = Awaited<ReturnType<typeof loadBitboardArkWasm>>

let arkWasmModule: BitboardArkWasm | null = null
let wasmInitError: string | null = null
let secretsProxy: Remote<SecretsChannelService> | null = null

let activeSessionKey: string | null = null
let activeSessionParams: {
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  connectionId: string
} | null = null
let unrollInFlight = false

type SendPaymentInFlight = {
  fingerprint: string
  promise: Promise<string>
}

let sendPaymentInFlight: SendPaymentInFlight | null = null

function sendPaymentFingerprint(params: ArkadeSendParams): string {
  return `${params.address}\0${params.amountSats}`
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

setArkadeSdkPersistenceExporter(() =>
  invokeWasmArk((wasmModule) => wasmModule.ark_export_persistence_json()),
)

function requestDecrypt(
  password: string,
  encryptedBlob: EncryptedBlobMessage,
): Promise<string> {
  if (!secretsProxy) {
    return Promise.reject(new Error('Secrets port not set'))
  }
  return secretsProxy.decrypt(password, encryptedBlob)
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
  clearDebouncedSdkPersistenceFlush()
  setArkadeSdkPersistenceFlushContext(null)

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

  const mnemonic = await requestDecrypt(params.password, params.encryptedMnemonic)
  activeSessionParams = {
    password: params.password,
    walletId: params.walletId,
    networkMode: params.networkMode,
    connectionId: params.connectionId,
  }
  setArkadeSdkPersistenceFlushContext(activeSessionParams)

  const openResult = await invokeWasmArk((wasmModule) =>
    wasmModule.ark_open_session({
      mnemonic,
      networkMode: params.networkMode,
      arkServerUrl: params.arkServerUrl,
      delegatorUrl: params.delegatorUrl,
      esploraUrl: params.esploraUrl,
      sdkPersistenceJson: params.sdkPersistenceJson,
    }),
  )

  activeSessionKey = key
  return {
    arkadeAddress: openResult.arkadeAddress as string,
    operatorSignerPkHex: openResult.operatorSignerPkHex as string,
  }
}

const arkadeService: ArkadeService = {
  async setSecretsPort(port: MessagePort): Promise<void> {
    secretsProxy = wrap<SecretsChannelService>(port)
  },

  async ping(): Promise<boolean> {
    await getArkWasm()
    return true
  },

  async setSdkPersistenceBridge(bridge: ArkadeSdkPersistenceBridge | null): Promise<void> {
    setArkadeSdkPersistenceBridge(bridge)
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
    setArkadeSdkPersistenceFlushContext({
      password: activeSessionParams.password,
      walletId: activeSessionParams.walletId,
      networkMode: activeSessionParams.networkMode,
      connectionId,
    })
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

  async exportSdkPersistenceJson(): Promise<string> {
    return invokeWasmArk((wasmModule) => wasmModule.ark_export_persistence_json())
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
      throw new Error('A unilateral unroll is already in progress')
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
