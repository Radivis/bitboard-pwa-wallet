import type { EncryptedBlobForDb } from '@/workers/crypto-api'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import type { ArkadeConnectionSnapshot } from '@/lib/wallet/wallet-domain-types'

export interface ArkadeBalanceInfo {
  confirmedSats: number
  totalSats: number
}

export interface ArkadeDelegateInfo {
  pubkey: string
  fee: number
  delegatorAddress: string
}

export interface ArkadePaymentRow {
  direction: 'incoming' | 'outgoing'
  amountSats: number
  timestamp: number
  txid: string
  memo?: string
}

export interface OpenArkadeSessionParams {
  password: string
  encryptedMnemonic: EncryptedBlobForDb
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  arkServerUrl: string
  delegatorUrl: string
  esploraUrl: string
}

export interface ArkadeSendParams {
  address: string
  amountSats: number
}

export interface ArkadeBoardingInfo {
  boardingAddress: string
}

export interface ArkadeService {
  openSession(params: OpenArkadeSessionParams): Promise<{ arkadeAddress: string }>
  closeSession(): Promise<void>
  getBalance(): Promise<ArkadeBalanceInfo>
  getAddress(): Promise<string>
  getBoardingAddress(): Promise<string>
  sendPayment(params: ArkadeSendParams): Promise<string>
  getTransactionHistory(): Promise<ArkadePaymentRow[]>
  getDelegateInfo(): Promise<ArkadeDelegateInfo>
  getExpiringVtxoCount(): Promise<number>
  renewVtxosNow(): Promise<string | null>
  delegateSpendableVtxos(): Promise<{ delegated: number; failed: number }>
  finalizePendingTransactions(): Promise<{ finalized: number; pending: number }>
  onboardBoardedUtxos(): Promise<string | null>
}

export function buildArkadeSnapshotFromWorkerData(params: {
  balance: ArkadeBalanceInfo
  payments: ArkadePaymentRow[]
}): ArkadeConnectionSnapshot {
  const now = new Date().toISOString()
  return {
    balance: {
      confirmedSats: params.balance.confirmedSats,
      totalSats: params.balance.totalSats,
      updatedAt: now,
    },
    payments: params.payments.map((payment) => ({ ...payment })),
    paymentsUpdatedAt: now,
  }
}
