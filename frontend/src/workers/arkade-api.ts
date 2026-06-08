import type { EncryptedBlobForDb } from '@/workers/crypto-api'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import type { ArkadeSdkPersistenceBridge } from '@/lib/arkade/storage/arkade-sdk-persistence-flush'
export interface ArkadeBalanceInfo {
  confirmedSats: number
  totalSats: number
  boardingSpendableSats?: number
  boardingPendingSats?: number
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
  /** Hydrates SDK repos from encrypted wallet secrets (local-first VTXO state). */
  sdkPersistenceJson?: string
}

export interface ArkadeSendParams {
  address: string
  amountSats: number
}

export interface ArkadeBoardingStatus {
  boardingAddress: string
  trackedAddresses: string[]
  spendableSats: number
  pendingSats: number
  expiredSats: number
}

export interface ArkadeExitCandidateRow {
  id: string
  txid: string
  vout: number
  amountSats: number
  virtualStatusState: string
  isRecoverable: boolean
  isUnrolled: boolean
  canStartUnroll: boolean
  canComplete: boolean
}

export interface ArkadeOnchainBumperInfo {
  address: string
  balanceSats: number
}

export interface ArkadeCollaborativeExitParams {
  destinationAddress: string
  /** Omit for full offboard of virtual outputs. */
  amountSats?: number
}

export interface ArkadeUnrollProgressEvent {
  type: 'wait' | 'unroll' | 'done'
  message: string
  txid?: string
  vtxoTxid?: string
}

export interface ArkadeCompleteUnilateralExitParams {
  vtxoTxids: string[]
  destinationAddress: string
}

export interface ArkadeCollaborativeExitFeeEstimate {
  txFeeRate: string
  intentFeeConfigured: {
    offchainInput: boolean
    onchainInput: boolean
    offchainOutput: boolean
    onchainOutput: boolean
  }
  estimatedTotalFeeSats: number | null
  estimatedReceiveSats: number | null
  estimateError?: string
}

export interface ArkadeUnilateralExitFeeEstimate {
  chainTxCount: number
  projectedUnrollSteps: number
  projectedWaitSteps: number
  feeRateSatPerVb: number
  estimatedPackageFeeSats: number
  bumperBalanceSats: number
  bumperSufficient: boolean
  estimateError?: string
}

export interface ArkadeCollaborativeExitFeeEstimateParams {
  destinationAddress: string
  amountSats?: number
}

export interface ArkadeUnilateralExitFeeEstimateParams {
  txid: string
  vout: number
}

export interface ArkadeService {
  ping(): Promise<boolean>
  setSecretsPort(port: MessagePort): Promise<void>
  setSdkPersistenceBridge(bridge: ArkadeSdkPersistenceBridge | null): Promise<void>
  openSession(params: OpenArkadeSessionParams): Promise<{ arkadeAddress: string }>
  hasOpenSession(params: {
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
  }): Promise<boolean>
  flushSdkPersistence(): Promise<void>
  closeSession(): Promise<void>
  getBalance(): Promise<ArkadeBalanceInfo>
  getAddress(): Promise<string>
  getNewAddress(): Promise<string>
  getBoardingAddress(): Promise<string>
  getBoardingStatus(): Promise<ArkadeBoardingStatus>
  sendPayment(params: ArkadeSendParams): Promise<string>
  getTransactionHistory(): Promise<ArkadePaymentRow[]>
  getDelegateInfo(): Promise<ArkadeDelegateInfo>
  getExpiringVtxoCount(): Promise<number>
  renewVtxosNow(): Promise<string | null>
  delegateSpendableVtxos(): Promise<{ delegated: number; failed: number }>
  finalizePendingTransactions(): Promise<{ finalized: number; pending: number }>
  onboardBoardedUtxos(): Promise<string | null>
  listExitCandidates(): Promise<ArkadeExitCandidateRow[]>
  getOnchainBumperInfo(): Promise<ArkadeOnchainBumperInfo>
  collaborativeExit(params: ArkadeCollaborativeExitParams): Promise<string>
  runUnilateralUnroll(
    params: { txid: string; vout: number },
    onProgress: (event: ArkadeUnrollProgressEvent) => void,
  ): Promise<{ vtxoTxid: string }>
  completeUnilateralExit(params: ArkadeCompleteUnilateralExitParams): Promise<string>
  getCollaborativeExitFeeEstimate(
    params: ArkadeCollaborativeExitFeeEstimateParams,
  ): Promise<ArkadeCollaborativeExitFeeEstimate>
  estimateUnilateralExit(
    params: ArkadeUnilateralExitFeeEstimateParams,
  ): Promise<ArkadeUnilateralExitFeeEstimate>
}
