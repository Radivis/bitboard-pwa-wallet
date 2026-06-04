import { expose } from 'comlink'
import {
  MnemonicIdentity,
  Ramps,
  RestDelegatorProvider,
  TxType,
  Unroll,
  VtxoManager,
  Wallet,
  type ContractVtxo,
  type Identity,
  type OnchainWallet,
} from '@arkade-os/sdk'
import {
  createArkadeIndexerProvider,
  createOnchainBumperWallet,
} from '@/lib/arkade/arkade-onchain-bumper'
import { mapVirtualCoinsToExitCandidates } from '@/lib/arkade/arkade-exit-candidates'
import type { EncryptedBlobMessage } from '@/workers/secrets-channel-types'
import {
  ARKADE_DEFAULT_VTXO_THRESHOLD_SECONDS,
  networkModeToArkadeIsMainnet,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { createPersistingArkadeStorage } from '@/lib/arkade/storage/create-persisting-arkade-storage'
import {
  flushSdkPersistenceNow,
  setArkadeSdkPersistenceBridge,
  setArkadeSdkPersistenceFlushContext,
  clearDebouncedSdkPersistenceFlush,
  type ArkadeSdkPersistenceBridge,
} from '@/lib/arkade/storage/arkade-sdk-persistence-flush'
import type {
  ArkadeBalanceInfo,
  ArkadeCollaborativeExitParams,
  ArkadeCompleteUnilateralExitParams,
  ArkadeDelegateInfo,
  ArkadeExitCandidateRow,
  ArkadeOnchainBumperInfo,
  ArkadePaymentRow,
  ArkadeSendParams,
  ArkadeService,
  ArkadeUnrollProgressEvent,
  OpenArkadeSessionParams,
} from '@/workers/arkade-api'
let encryptionWasmModule: typeof import('@/wasm-pkg/bitboard_encryption/bitboard_encryption') | null =
  null
let activeWallet: Wallet | null = null
let activeVtxoManager: VtxoManager | null = null
let activeSessionKey: string | null = null
let activeSessionParams: {
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
} | null = null
let activeSessionContext: {
  identity: Identity
  networkMode: ArkadeSupportedNetworkMode
  esploraUrl: string
  arkServerUrl: string
} | null = null
let cachedOnchainBumper: OnchainWallet | null = null
let unrollInFlight = false

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

function legacyIndexedDbName(
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
): string {
  return `bitboard-arkade-${walletId}-${networkMode}`
}

/** Best-effort dev hygiene for removed IndexedDB persistence. */
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

function sessionKey(walletId: number, networkMode: ArkadeSupportedNetworkMode): string {
  return `${walletId}:${networkMode}`
}

function mapBalance(raw: { confirmed?: bigint | number; total?: bigint | number }): ArkadeBalanceInfo {
  const confirmed = raw.confirmed ?? 0n
  const total = raw.total ?? confirmed
  return {
    confirmedSats: Number(confirmed),
    totalSats: Number(total),
  }
}

function requireWallet(): Wallet {
  if (!activeWallet) {
    throw new Error('Arkade session is not open')
  }
  return activeWallet
}

async function getSpendableVtxos(wallet: Wallet) {
  const vtxos = await wallet.getVtxos({ withRecoverable: true })
  return vtxos.filter((vtxo) => {
    const state = vtxo.virtualStatus?.state
    return (
      state != null &&
      (state === 'settled' || state === 'preconfirmed') &&
      vtxo.isSpent !== true
    )
  })
}

async function persistAfterCriticalOperation(): Promise<void> {
  await flushSdkPersistenceNow()
}

function clearSessionContext(): void {
  activeSessionContext = null
  cachedOnchainBumper = null
  unrollInFlight = false
}

async function getOrCreateOnchainBumper(): Promise<OnchainWallet> {
  if (cachedOnchainBumper != null) return cachedOnchainBumper
  if (activeSessionContext == null) {
    throw new Error('Arkade session context is not available')
  }
  cachedOnchainBumper = await createOnchainBumperWallet({
    identity: activeSessionContext.identity,
    networkMode: activeSessionContext.networkMode,
    esploraUrl: activeSessionContext.esploraUrl,
  })
  return cachedOnchainBumper
}

const arkadeService: ArkadeService = {
  async setSdkPersistenceBridge(bridge: ArkadeSdkPersistenceBridge | null): Promise<void> {
    setArkadeSdkPersistenceBridge(bridge)
  },

  async openSession(params: OpenArkadeSessionParams): Promise<{ arkadeAddress: string }> {
    const key = sessionKey(params.walletId, params.networkMode)
    if (activeSessionKey === key && activeWallet != null) {
      return { arkadeAddress: await activeWallet.getAddress() }
    }

    await arkadeService.closeSession()
    deleteLegacyArkadeIndexedDb(params.walletId, params.networkMode)

    const mnemonic = await requestDecrypt(params.password, params.encryptedMnemonic)
    const isMainnet = networkModeToArkadeIsMainnet(params.networkMode)
    const identity = MnemonicIdentity.fromMnemonic(mnemonic, { isMainnet })
    const delegatorProvider = new RestDelegatorProvider(params.delegatorUrl)

    const storage = createPersistingArkadeStorage(params.sdkPersistenceJson)
    activeSessionParams = {
      password: params.password,
      walletId: params.walletId,
      networkMode: params.networkMode,
    }
    // Flush snapshots the inner repos; Wallet.create uses the proxies (same underlying data).
    setArkadeSdkPersistenceFlushContext({
      ...activeSessionParams,
      walletRepository: storage.innerWalletRepository,
      contractRepository: storage.innerContractRepository,
    })

    const wallet = await Wallet.create({
      identity,
      esploraUrl: params.esploraUrl,
      arkServerUrl: params.arkServerUrl,
      delegatorProvider,
      settlementConfig: {
        vtxoThreshold: ARKADE_DEFAULT_VTXO_THRESHOLD_SECONDS,
        boardingUtxoSweep: true,
      },
      storage: {
        walletRepository: storage.walletRepository,
        contractRepository: storage.contractRepository,
      },
    })

    activeWallet = wallet
    activeVtxoManager = await wallet.getVtxoManager()
    activeSessionKey = key
    activeSessionContext = {
      identity,
      networkMode: params.networkMode,
      esploraUrl: params.esploraUrl,
      arkServerUrl: params.arkServerUrl,
    }
    cachedOnchainBumper = null

    const arkadeAddress = await wallet.getAddress()
    return { arkadeAddress }
  },

  async closeSession(): Promise<void> {
    try {
      await flushSdkPersistenceNow()
    } catch {
      // Best-effort flush before teardown.
    }
    clearDebouncedSdkPersistenceFlush()
    setArkadeSdkPersistenceFlushContext(null)

    if (activeWallet != null) {
      try {
        await activeWallet.dispose?.()
      } catch {
        // Best-effort cleanup.
      }
    }
    activeWallet = null
    activeVtxoManager = null
    activeSessionKey = null
    activeSessionParams = null
    clearSessionContext()
  },

  async getBalance(): Promise<ArkadeBalanceInfo> {
    const wallet = requireWallet()
    const balance = await wallet.getBalance()
    return mapBalance(balance)
  },

  async getAddress(): Promise<string> {
    return requireWallet().getAddress()
  },

  async getBoardingAddress(): Promise<string> {
    return requireWallet().getBoardingAddress()
  },

  async sendPayment(params: ArkadeSendParams): Promise<string> {
    const wallet = requireWallet()
    const txid = await wallet.send({
      address: params.address,
      amount: params.amountSats,
    })
    await persistAfterCriticalOperation()
    return txid
  },

  async getTransactionHistory(): Promise<ArkadePaymentRow[]> {
    const wallet = requireWallet()
    const history = await wallet.getTransactionHistory()
    return history.map((entry) => {
      const direction =
        entry.type === TxType.TxReceived ? 'incoming' : 'outgoing'
      const txid =
        entry.key.commitmentTxid ||
        entry.key.arkTxid ||
        entry.key.boardingTxid ||
        ''
      return {
        direction,
        amountSats: Math.abs(entry.amount),
        timestamp: entry.createdAt,
        txid,
        memo: undefined,
      }
    })
  },

  async getDelegateInfo(): Promise<ArkadeDelegateInfo> {
    const wallet = requireWallet()
    const delegatorManager = await wallet.getDelegatorManager()
    if (delegatorManager == null) {
      throw new Error('Delegator provider not configured')
    }
    const info = await delegatorManager.getDelegateInfo()
    return {
      pubkey: info.pubkey,
      fee: Number(info.fee ?? 0),
      delegatorAddress: info.delegatorAddress,
    }
  },

  async getExpiringVtxoCount(): Promise<number> {
    const manager = activeVtxoManager ?? (await requireWallet().getVtxoManager())
    const expiring = await manager.getExpiringVtxos()
    return expiring.length
  },

  async renewVtxosNow(): Promise<string | null> {
    const manager = activeVtxoManager ?? (await requireWallet().getVtxoManager())
    const expiring = await manager.getExpiringVtxos()
    if (expiring.length === 0) return null
    const txid = await manager.renewVtxos()
    await persistAfterCriticalOperation()
    return txid
  },

  async delegateSpendableVtxos(): Promise<{ delegated: number; failed: number }> {
    const wallet = requireWallet()
    const spendable = await getSpendableVtxos(wallet)
    if (spendable.length === 0) {
      return { delegated: 0, failed: 0 }
    }
    const delegatorManager = await wallet.getDelegatorManager()
    if (delegatorManager == null) {
      throw new Error('Delegator provider not configured')
    }
    const renewalAddress = await wallet.getAddress()
    const result = await delegatorManager.delegate(
      spendable as ContractVtxo[],
      renewalAddress,
    )
    await persistAfterCriticalOperation()
    return {
      delegated: result.delegated?.length ?? 0,
      failed: result.failed?.length ?? 0,
    }
  },

  async finalizePendingTransactions(): Promise<{ finalized: number; pending: number }> {
    const wallet = requireWallet()
    const { finalized, pending } = await wallet.finalizePendingTxs()
    if ((finalized?.length ?? 0) > 0) {
      await persistAfterCriticalOperation()
    }
    return {
      finalized: finalized?.length ?? 0,
      pending: pending?.length ?? 0,
    }
  },

  async onboardBoardedUtxos(): Promise<string | null> {
    const wallet = requireWallet()
    const info = await wallet.arkProvider.getInfo()
    const fees = info.fees
    try {
      const txid = await new Ramps(wallet).onboard(fees)
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
    const wallet = requireWallet()
    const vtxos = await wallet.getVtxos({ withRecoverable: true })
    return mapVirtualCoinsToExitCandidates(vtxos)
  },

  async getOnchainBumperInfo(): Promise<ArkadeOnchainBumperInfo> {
    const bumper = await getOrCreateOnchainBumper()
    const balanceSats = await bumper.getBalance()
    return {
      address: bumper.address,
      balanceSats,
    }
  },

  async collaborativeExit(params: ArkadeCollaborativeExitParams): Promise<string> {
    const wallet = requireWallet()
    const info = await wallet.arkProvider.getInfo()
    const amount =
      params.amountSats != null ? BigInt(params.amountSats) : undefined
    const txid = await new Ramps(wallet).offboard(
      params.destinationAddress,
      info.fees,
      amount,
    )
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
    if (activeSessionContext == null) {
      throw new Error('Arkade session context is not available')
    }

    unrollInFlight = true
    let doneVtxoTxid = params.txid

    try {
      requireWallet()
      const bumper = await getOrCreateOnchainBumper()
      const indexer = createArkadeIndexerProvider(activeSessionContext.arkServerUrl)
      const session = await Unroll.Session.create(
        { txid: params.txid, vout: params.vout },
        bumper,
        bumper.provider,
        indexer,
      )

      for await (const step of session) {
        switch (step.type) {
          case Unroll.StepType.WAIT:
            onProgress({
              type: 'wait',
              message: `Waiting for confirmation of ${step.txid}`,
              txid: step.txid,
            })
            break
          case Unroll.StepType.UNROLL:
            onProgress({
              type: 'unroll',
              message: `Broadcasting unroll ${step.tx.id}`,
              txid: step.tx.id,
            })
            break
          case Unroll.StepType.DONE:
            doneVtxoTxid = step.vtxoTxid
            onProgress({
              type: 'done',
              message: `Unroll complete for ${step.vtxoTxid}`,
              vtxoTxid: step.vtxoTxid,
            })
            break
          default:
            break
        }
      }

      await persistAfterCriticalOperation()
      return { vtxoTxid: doneVtxoTxid }
    } finally {
      unrollInFlight = false
    }
  },

  async completeUnilateralExit(
    params: ArkadeCompleteUnilateralExitParams,
  ): Promise<string> {
    const wallet = requireWallet()
    const txid = await Unroll.completeUnroll(
      wallet,
      params.vtxoTxids,
      params.destinationAddress,
    )
    await persistAfterCriticalOperation()
    return txid
  },
}

expose(arkadeService)
