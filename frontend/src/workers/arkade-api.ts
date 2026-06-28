import type { EncryptedBlobForDb } from '@/workers/crypto-api'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import type { ArkadeOperatorConnectionSummary } from '@/lib/arkade/arkade-payload-merge'
import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'

export type { ArkadeOperatorConnectionSummary }

export interface ArkadeBalanceInfo {
  confirmedSats: number
  /** Offchain VTXO spendable balance (excludes bumper/boarding). */
  offchainSpendableSats?: number
  /** On-chain bumper wallet (P2A fees for unilateral exit only). */
  onchainBumperSats?: number
  totalSats: number
  boardingSpendableSats?: number
  boardingPendingSats?: number
  unilateralExitInProgressSats?: number
  collaborativeExitInProgressSats?: number
  pendingRecoverySats?: number
  recoverableSats?: number
  recoverableVtxoCount?: number
}

export type ArkadeSignerMigrationDeprecatedStatus = 'migratable' | 'due_now' | 'expired'

export interface ArkadeSignerMigrationHint {
  previousSignerPkHex: string
  deprecatedStatus: ArkadeSignerMigrationDeprecatedStatus
  cutoffUnix: number
}

export interface ArkadeDelegateInfo {
  pubkey: string
  fee: number
  delegatorAddress: string
}

export interface ArkadeVtxoExpiryStatus {
  /** Unix seconds; earliest expiry among active unspent VTXOs. */
  earliestExpiresAt: number | null
  expiringSoonCount: number
}

export interface ArkadePaymentRow {
  direction: 'incoming' | 'outgoing'
  amountSats: number
  timestamp: number
  txid: string
  memo?: string
}

export interface OpenArkadeSessionParams {
  encryptedMnemonic: EncryptedBlobForDb
  encryptedPayload: EncryptedBlobForDb
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  connectionId: string
  arkServerUrl: string
  delegatorUrl: string
  esploraUrl: string
}

export interface OpenArkadeSessionResult {
  arkadeAddress: string
  operatorSignerPkHex: string
  signerMigrationHint?: ArkadeSignerMigrationHint
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

export type ArkadeCollaborativeExitEstimateErrorCode = 'insufficient_cooperative_inputs'

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
  estimateErrorCode?: ArkadeCollaborativeExitEstimateErrorCode
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

export interface ArkadeRecoverableVtxoFeeEstimate {
  recoverableVtxoCount: number
  recoverableTotalSats: number
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

export interface ArkadeCollaborativeExitFeeEstimateParams {
  destinationAddress: string
  amountSats?: number
}

export interface ArkadeUnilateralExitFeeEstimateParams {
  txid: string
  vout: number
}

export interface EnsureArkadeOperatorConnectionEncryptedParams {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  connectionId: string
  operatorSignerPkHex: string
  operatorUrl: string
  delegatorUrl: string
  signerMigrationHint?: ArkadeSignerMigrationHint
  /** When true, export SDK JSON from WASM inside the worker (never on main thread). */
  persistInitialSdkFromWasm?: boolean
}

export interface ArkadeService {
  ping(): Promise<boolean>
  setSecretsPort(port: MessagePort): Promise<void>
  setEncryptedWalletSecretsHost(host: EncryptedWalletSecretsHost): Promise<void>
  openSession(params: OpenArkadeSessionParams): Promise<OpenArkadeSessionResult>
  syncWithOperator(): Promise<void>
  hasOpenSession(params: {
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
    connectionId: string
  }): Promise<boolean>
  reconcileActiveConnectionId(connectionId: string): Promise<void>
  flushSdkPersistence(): Promise<void>
  /** @internal E2E / DevTools only — live WASM export; not wallet-secrets persistence. */
  exportSdkPersistenceJsonForE2e(): Promise<string>
  /** @internal E2E / DevTools only — reads sdkPersistenceJson from encrypted wallet_secrets via secrets channel. */
  readPersistedSdkPersistenceJsonForE2e(params: {
    walletId: number
    connectionId: string
  }): Promise<string | undefined>
  findActiveConnectionSummary(params: {
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
    encryptedPayload: EncryptedBlobForDb
  }): Promise<ArkadeOperatorConnectionSummary | undefined>
  listConnectionSummaries(params: {
    walletId: number
  }): Promise<ArkadeOperatorConnectionSummary[]>
  ensureOperatorConnectionEncrypted(
    params: EnsureArkadeOperatorConnectionEncryptedParams,
  ): Promise<ArkadeOperatorConnectionSummary>
  updateOperatorSyncAtEncrypted(params: {
    walletId: number
    connectionId: string
    lastSuccessfulOperatorSyncAt: string
  }): Promise<void>
  closeSession(): Promise<void>
  migrateDeprecatedSignerVtxos(): Promise<void>
  getBalance(): Promise<ArkadeBalanceInfo>
  getAddress(): Promise<string>
  getNewAddress(): Promise<string>
  getBoardingAddress(): Promise<string>
  getBoardingStatus(): Promise<ArkadeBoardingStatus>
  sendPayment(params: ArkadeSendParams): Promise<string>
  getTransactionHistory(): Promise<ArkadePaymentRow[]>
  getDelegateInfo(): Promise<ArkadeDelegateInfo>
  getExpiringVtxoCount(): Promise<number>
  getVtxoExpiryStatus(): Promise<ArkadeVtxoExpiryStatus>
  renewVtxosNow(): Promise<string | null>
  delegateSpendableVtxos(): Promise<{
    delegated: number
    failed: number
    errorMessage?: string
  }>
  finalizePendingTransactions(): Promise<{ finalized: number; pending: number }>
  onboardBoardedUtxos(): Promise<string | null>
  getRecoverableVtxoFeeEstimate(): Promise<ArkadeRecoverableVtxoFeeEstimate>
  recoverRecoverableVtxos(): Promise<string | null>
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
