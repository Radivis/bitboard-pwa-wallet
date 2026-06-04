import { expose } from 'comlink'
import type { EncryptedBlobMessage } from '@/workers/secrets-channel-types'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import {
  clearDebouncedSdkPersistenceFlush,
  flushSdkPersistenceNow,
  setArkadeSdkPersistenceBridge,
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
  OpenArkadeSessionParams,
} from '@/workers/arkade-api'

type BitboardArkWasm = typeof import('@/wasm-pkg/bitboard_ark/bitboard_ark')

let arkWasmModule: BitboardArkWasm | null = null
let encryptionWasmModule: typeof import('@/wasm-pkg/bitboard_encryption/bitboard_encryption') | null =
  null

let activeSessionKey: string | null = null
let activeSessionParams: {
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
} | null = null
let unrollInFlight = false

async function getArkWasm(): Promise<BitboardArkWasm> {
  if (!arkWasmModule) {
    arkWasmModule = await import('@/wasm-pkg/bitboard_ark/bitboard_ark')
  }
  return arkWasmModule
}

async function getEncryptionWasm() {
  if (!encryptionWasmModule) {
    encryptionWasmModule = await import(
      '@/wasm-pkg/bitboard_encryption/bitboard_encryption'
    )
  }
  return encryptionWasmModule
}

async function requestDecrypt(
  password: string,
  encryptedBlob: EncryptedBlobMessage,
): Promise<string> {
  const wasmModule = await getEncryptionWasm()
  const keyBytes = wasmModule.derive_argon2_key_from_phc(
    password,
    encryptedBlob.salt,
    encryptedBlob.kdfPhc,
  )
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes as BufferSource,
      'AES-GCM',
      false,
      ['decrypt'],
    )
    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encryptedBlob.iv as unknown as BufferSource },
      cryptoKey,
      encryptedBlob.ciphertext as unknown as BufferSource,
    )
    return new TextDecoder().decode(plaintextBuffer)
  } catch {
    throw new Error('Decryption failed: incorrect password or corrupted data')
  } finally {
    const cleared = keyBytes as Uint8Array
    cleared.fill(0)
  }
}

function sessionKey(walletId: number, networkMode: ArkadeSupportedNetworkMode): string {
  return `${walletId}:${networkMode}`
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

async function persistAfterCriticalOperation(): Promise<void> {
  await flushSdkPersistenceNow()
}

const arkadeService: ArkadeService = {
  async setSdkPersistenceBridge(bridge: ArkadeSdkPersistenceBridge | null): Promise<void> {
    setArkadeSdkPersistenceBridge(bridge)
  },

  async openSession(params: OpenArkadeSessionParams): Promise<{ arkadeAddress: string }> {
    const key = sessionKey(params.walletId, params.networkMode)
    const wasm = await getArkWasm()

    if (activeSessionKey === key) {
      try {
        const address = wasm.ark_get_address()
        return { arkadeAddress: address }
      } catch {
        // Fall through to full open.
      }
    }

    await arkadeService.closeSession()
    deleteLegacyArkadeIndexedDb(params.walletId, params.networkMode)

    const mnemonic = await requestDecrypt(params.password, params.encryptedMnemonic)
    activeSessionParams = {
      password: params.password,
      walletId: params.walletId,
      networkMode: params.networkMode,
    }
    setArkadeSdkPersistenceFlushContext(activeSessionParams)

    const openResult = await wasm.ark_open_session({
      mnemonic,
      networkMode: params.networkMode,
      arkServerUrl: params.arkServerUrl,
      delegatorUrl: params.delegatorUrl,
      esploraUrl: params.esploraUrl,
      sdkPersistenceJson: params.sdkPersistenceJson,
    })

    activeSessionKey = key
    return { arkadeAddress: openResult.arkadeAddress as string }
  },

  async closeSession(): Promise<void> {
    try {
      await flushSdkPersistenceNow()
    } catch {
      // Best-effort flush before teardown.
    }
    clearDebouncedSdkPersistenceFlush()
    setArkadeSdkPersistenceFlushContext(null)

    try {
      const wasm = await getArkWasm()
      await wasm.ark_close_session()
    } catch {
      // Module may not be loaded yet.
    }

    activeSessionKey = null
    activeSessionParams = null
    unrollInFlight = false
  },

  async getBalance(): Promise<ArkadeBalanceInfo> {
    const wasm = await getArkWasm()
    return wasm.ark_get_balance() as Promise<ArkadeBalanceInfo>
  },

  async getAddress(): Promise<string> {
    const wasm = await getArkWasm()
    return wasm.ark_get_address()
  },

  async getBoardingAddress(): Promise<string> {
    const wasm = await getArkWasm()
    return wasm.ark_get_boarding_address()
  },

  async sendPayment(params: ArkadeSendParams): Promise<string> {
    const wasm = await getArkWasm()
    const txid = await wasm.ark_send_payment(params)
    await persistAfterCriticalOperation()
    return txid
  },

  async getTransactionHistory(): Promise<ArkadePaymentRow[]> {
    const wasm = await getArkWasm()
    return wasm.ark_get_transaction_history() as Promise<ArkadePaymentRow[]>
  },

  async getDelegateInfo(): Promise<ArkadeDelegateInfo> {
    const wasm = await getArkWasm()
    return wasm.ark_get_delegate_info() as Promise<ArkadeDelegateInfo>
  },

  async getExpiringVtxoCount(): Promise<number> {
    const wasm = await getArkWasm()
    return wasm.ark_get_expiring_vtxo_count()
  },

  async renewVtxosNow(): Promise<string | null> {
    const wasm = await getArkWasm()
    const txid = (await wasm.ark_renew_vtxos_now()) ?? null
    if (txid != null) {
      await persistAfterCriticalOperation()
    }
    return txid
  },

  async delegateSpendableVtxos(): Promise<{ delegated: number; failed: number }> {
    const wasm = await getArkWasm()
    const result = await wasm.ark_delegate_spendable_vtxos()
    await persistAfterCriticalOperation()
    return result as { delegated: number; failed: number }
  },

  async finalizePendingTransactions(): Promise<{ finalized: number; pending: number }> {
    const wasm = await getArkWasm()
    const result = await wasm.ark_finalize_pending_transactions()
    if ((result.finalized ?? 0) > 0) {
      await persistAfterCriticalOperation()
    }
    return result as { finalized: number; pending: number }
  },

  async onboardBoardedUtxos(): Promise<string | null> {
    const wasm = await getArkWasm()
    try {
      const txid = (await wasm.ark_onboard_boarded_utxos()) ?? null
      if (txid != null) {
        await persistAfterCriticalOperation()
      }
      return txid
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.toLowerCase().includes('nothing') || message.toLowerCase().includes('no ')) {
        return null
      }
      throw error
    }
  },

  async listExitCandidates(): Promise<ArkadeExitCandidateRow[]> {
    const wasm = await getArkWasm()
    return wasm.ark_list_exit_candidates() as Promise<ArkadeExitCandidateRow[]>
  },

  async getOnchainBumperInfo(): Promise<ArkadeOnchainBumperInfo> {
    const wasm = await getArkWasm()
    return wasm.ark_get_onchain_bumper_info() as Promise<ArkadeOnchainBumperInfo>
  },

  async collaborativeExit(params: ArkadeCollaborativeExitParams): Promise<string> {
    const wasm = await getArkWasm()
    const txid = await wasm.ark_collaborative_exit(params)
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
      const wasm = await getArkWasm()
      const result = await wasm.ark_run_unilateral_unroll(
        params.txid,
        params.vout,
        (event: ArkadeUnrollProgressEvent) => {
          onProgress(event)
        },
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
    const wasm = await getArkWasm()
    const txid = await wasm.ark_complete_unilateral_exit(params)
    await persistAfterCriticalOperation()
    return txid
  },

  async getCollaborativeExitFeeEstimate(
    params: ArkadeCollaborativeExitFeeEstimateParams,
  ): Promise<ArkadeCollaborativeExitFeeEstimate> {
    const wasm = await getArkWasm()
    return wasm.ark_get_collaborative_exit_fee_estimate(
      params,
    ) as Promise<ArkadeCollaborativeExitFeeEstimate>
  },

  async estimateUnilateralExit(
    params: ArkadeUnilateralExitFeeEstimateParams,
  ): Promise<ArkadeUnilateralExitFeeEstimate> {
    const wasm = await getArkWasm()
    return wasm.ark_estimate_unilateral_exit(params) as Promise<ArkadeUnilateralExitFeeEstimate>
  },
}

expose(arkadeService)
