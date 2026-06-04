import { expose } from 'comlink'
import {
  IndexedDBContractRepository,
  IndexedDBWalletRepository,
  MnemonicIdentity,
  Ramps,
  RestDelegatorProvider,
  TxType,
  VtxoManager,
  Wallet,
  type ContractVtxo,
} from '@arkade-os/sdk'
import type { EncryptedBlobMessage } from '@/workers/secrets-channel-types'
import {
  ARKADE_DEFAULT_VTXO_THRESHOLD_SECONDS,
  networkModeToArkadeIsMainnet,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import type {
  ArkadeBalanceInfo,
  ArkadeDelegateInfo,
  ArkadePaymentRow,
  ArkadeSendParams,
  ArkadeService,
  OpenArkadeSessionParams,
} from '@/workers/arkade-api'

let encryptionWasmModule: typeof import('@/wasm-pkg/bitboard_encryption/bitboard_encryption') | null =
  null
let activeWallet: Wallet | null = null
let activeVtxoManager: VtxoManager | null = null
let activeSessionKey: string | null = null

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

function storageDbName(walletId: number, networkMode: ArkadeSupportedNetworkMode): string {
  return `bitboard-arkade-${walletId}-${networkMode}`
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

const arkadeService: ArkadeService = {
  async openSession(params: OpenArkadeSessionParams): Promise<{ arkadeAddress: string }> {
    const key = sessionKey(params.walletId, params.networkMode)
    if (activeSessionKey === key && activeWallet != null) {
      return { arkadeAddress: await activeWallet.getAddress() }
    }

    await arkadeService.closeSession()

    const mnemonic = await requestDecrypt(params.password, params.encryptedMnemonic)
    const isMainnet = networkModeToArkadeIsMainnet(params.networkMode)
    const identity = MnemonicIdentity.fromMnemonic(mnemonic, { isMainnet })
    const dbName = storageDbName(params.walletId, params.networkMode)
    const delegatorProvider = new RestDelegatorProvider(params.delegatorUrl)

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
        walletRepository: new IndexedDBWalletRepository(dbName),
        contractRepository: new IndexedDBContractRepository(dbName),
      },
    })

    activeWallet = wallet
    activeVtxoManager = await wallet.getVtxoManager()
    activeSessionKey = key

    const arkadeAddress = await wallet.getAddress()
    return { arkadeAddress }
  },

  async closeSession(): Promise<void> {
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
    return manager.renewVtxos()
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
    return {
      delegated: result.delegated?.length ?? 0,
      failed: result.failed?.length ?? 0,
    }
  },

  async finalizePendingTransactions(): Promise<{ finalized: number; pending: number }> {
    const wallet = requireWallet()
    const { finalized, pending } = await wallet.finalizePendingTxs()
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
      return txid
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.toLowerCase().includes('nothing') || message.toLowerCase().includes('no ')) {
        return null
      }
      throw error
    }
  },
}

expose(arkadeService)
