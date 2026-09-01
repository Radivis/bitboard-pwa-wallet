import type { EncryptedBlobForDb } from '@/workers/crypto-api'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import type { ArkadeAccountSummary } from '@/lib/arkade/arkade-payload-merge'
import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import type { ArkadeWalletScope } from '@/lib/arkade/arkade-session-scope'

export type { ArkadeAccountSummary, ArkadeWalletScope }

export interface ArkadeOperatorSyncResult {
  keyDiscoveryWarning?: string
  exitingVtxoWarning?: string
  operatorConfigTrustPending?: boolean
}

export interface ArkadeAutonomousModeStatus {
  active: boolean
  eligibleCount: number
  materialsReadyCount: number
  materialsMissingCount: number
  cachedOperatorInfoPresent: boolean
  operatorTrustPending: boolean
  canExitAutonomous: boolean
}

export interface ArkadeOperatorTrustStatus {
  operatorTrustPending: boolean
  reviewingInAutonomous: boolean
  acceptedDigest?: string
  pendingDigest?: string
}

export interface ArkadeOperatorConfigDiffEntry {
  fieldKey: string
  fieldLabel: string
  acceptedValue: string
  pendingValue: string
}

export interface ArkadeOperatorConfigDiffResult {
  entries: ArkadeOperatorConfigDiffEntry[]
}

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
  pendingRecoveryDueToExpiredSignerSats?: number
  /** Swept or sub-dust VTXOs the user can batch-settle now. */
  recoverableSettleableSats?: number
  recoverableSettleableVtxoCount?: number
  /** Client-expired VTXOs awaiting operator sweep before batch settlement is safe. */
  recoverablePendingOperatorSweepSats?: number
  recoverablePendingOperatorSweepVtxoCount?: number
  pendingBatchIntents?: ArkadePendingBatchIntent[]
}

export interface ArkadePendingBatchOutpoint {
  txid: string
  vout: number
}

export interface ArkadePendingBatchIntent {
  kind: string
  intentId?: string
  amountSats: number
  registeredAt: number
  onchainOutpoints: ArkadePendingBatchOutpoint[]
  vtxoOutpoints: ArkadePendingBatchOutpoint[]
  lifecyclePhase?: 'processing' | 'timed_out'
  destinationAddress?: string
}

export type ArkadeBatchJoinStatus = 'completed' | 'waiting_for_operator'

export interface ArkadeBatchJoinResult {
  status: ArkadeBatchJoinStatus
  commitmentTxid?: string
  pendingIntent?: ArkadePendingBatchIntent
}

export interface ArkadePendingBatchIntentActionParams {
  onchainOutpoints: ArkadePendingBatchOutpoint[]
  vtxoOutpoints: ArkadePendingBatchOutpoint[]
}

export type ArkadeSignerMigrationDeprecatedStatus = 'migratable' | 'due_now' | 'expired'

export interface ArkadeSignerMigrationHint {
  previousSignerPkHex: string
  deprecatedStatus: ArkadeSignerMigrationDeprecatedStatus
  cutoffUnix: number
}

export interface ArkadeSignerMigrationLegResult {
  migratedCount: number
  migratedSats: number
  deferredCount: number
  deferredSats: number
  oversizedCount: number
  oversizedSats: number
  settleTxid?: string
  error?: string
}

export interface ArkadeSignerMigrationResult {
  vtxoLeg: ArkadeSignerMigrationLegResult
  boardingLeg: ArkadeSignerMigrationLegResult
  passCount: number
  migrationComplete: boolean
  passCapReached: boolean
  remainingPreCutoffVtxoCount: number
  remainingPreCutoffSats: number
  remainingPreCutoffBoardingCount: number
  settleTxids: string[]
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

/** Operator batch round schedule from getInfo `scheduledSession` (unix seconds). */
export interface ArkadeOperatorScheduledSession {
  nextStartTime: number
  nextEndTime: number
  period: number
  duration: number
  inProgress: boolean
}

export type ArkadeVtxoClassification =
  | 'pre_confirmed'
  | 'confirmed'
  | 'recoverable_settleable'
  | 'recoverable_pending_operator_sweep'
  | 'pending_recovery_due_to_expired_signer'
  | 'exiting'
  | 'finalized'

export interface ArkadeVtxoRowBase {
  id: string
  amountSats: number
  createdAt: number
  expiresAt: number
  classification: ArkadeVtxoClassification
  isPreconfirmed: boolean
  isRecoverable: boolean
  isUnrolled: boolean
  isSwept: boolean
  isSpent: boolean
  isUnilateralExitPrepared: boolean
}

export interface ArkadeVtxoListResult {
  rows: ArkadeVtxoRowBase[]
  /** Unix seconds from offchain_vtxo_snapshot.synced_at when served from local fallback. */
  fromSnapshotSyncedAt: number | null
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
  arkadeAccountId: string
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
  pendingBatchIntents?: ArkadePendingBatchIntent[]
  finalizedCommitmentTxid?: string
}

export type ArkadeVirtualStatusState =
  | 'spent'
  | 'unrolled'
  | 'preconfirmed'
  | 'recoverable'
  | 'settled'

export interface ArkadeExitCandidateDto {
  id: string
  txid: string
  vout: number
  amountSats: number
  virtualStatusState: ArkadeVirtualStatusState
  isRecoverable: boolean
  isUnrolled: boolean
  canStartUnroll: boolean
  canComplete: boolean
}

export interface ArkadeUnilateralExitInProgressDto {
  id: string
  txid: string
  vout: number
  amountSats: number
  virtualStatusState: ArkadeVirtualStatusState
  canComplete: boolean
  startedAt?: number
}

export interface ArkadeMissingBlocktimeCompletionInput {
  virtualTxid: string
  onChainTxid: string
  onChainVout: number
  amountSats: number
}

export interface ArkadeUnilateralExitCompletionFeeEstimate {
  selectedTotalSats: number
  estimatedFeeSats: number
  estimatedReceiveSats: number
  feeRateSatPerVb: number
  estimateError?: string
  missingBlocktimeInputs?: ArkadeMissingBlocktimeCompletionInput[]
}

export interface ArkadeVtxoOutpoint {
  txid: string
  vout: number
}

export function arkadeVtxoOutpointsEqual(
  left: ArkadeVtxoOutpoint,
  right: ArkadeVtxoOutpoint,
): boolean {
  return left.txid === right.txid && left.vout === right.vout
}

export function arkadeVtxoOutpointListsEqual(
  left: ArkadeVtxoOutpoint[],
  right: ArkadeVtxoOutpoint[],
): boolean {
  if (left.length !== right.length) {
    return false
  }
  return left.every((outpoint, index) => arkadeVtxoOutpointsEqual(outpoint, right[index]!))
}

export function includesArkadeVtxoOutpoint(
  outpoints: ArkadeVtxoOutpoint[],
  candidate: ArkadeVtxoOutpoint,
): boolean {
  return outpoints.some((outpoint) => arkadeVtxoOutpointsEqual(outpoint, candidate))
}

export function sortArkadeVtxoOutpoints<T extends ArkadeVtxoOutpoint>(
  outpoints: T[],
): T[] {
  return [...outpoints].sort((left, right) => {
    const txidCompare = left.txid.localeCompare(right.txid)
    return txidCompare !== 0 ? txidCompare : left.vout - right.vout
  })
}

export function arkadeVtxoOutpointCacheKey(outpoints: ArkadeVtxoOutpoint[]): string {
  return sortArkadeVtxoOutpoints(outpoints)
    .map((outpoint) => `${outpoint.txid}:${outpoint.vout}`)
    .join(',')
}

export interface ArkadeUnilateralExitCompletionFeeEstimateParams {
  vtxoOutpoints: ArkadeVtxoOutpoint[]
  destinationAddress: string
  feeRateSatPerVb?: number
}

export interface ArkadeOnchainBumperInfo {
  address: string
  balanceSats: number
  unilateralExitTimelockBlocks?: number
  unilateralExitTimelockSeconds?: number
}

export interface ArkadeCollaborativeExitParams {
  destinationAddress: string
  /** Omit for full offboard of virtual outputs. */
  amountSats?: number
}

export interface ArkadeCompleteUnilateralExitParams {
  vtxoOutpoints: ArkadeVtxoOutpoint[]
  destinationAddress: string
  feeRateSatPerVb?: number
}

export type ArkadeCollaborativeExitEstimateErrorCode = 'insufficient_cooperative_inputs'

export interface ArkadeCollaborativeExitFeeEstimate {
  /** getInfo `txFeeRate` echo — informational only; fee math uses CEL intent programs + Esplora. */
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

export interface ArkadeRecoverableVtxoFeeEstimate {
  recoverableVtxoCount: number
  recoverableTotalSats: number
  /** getInfo `txFeeRate` echo — informational only; see `ArkadeCollaborativeExitFeeEstimate.txFeeRate`. */
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

export interface ArkadeUnilateralExitTopologyNode {
  txid: string
  txType: string
  spends: string[]
}

export interface ArkadeUnilateralExitHostOutpoint {
  txid: string
  vout: number
  amountSats: number
}

export interface ArkadeUnilateralExitTopology {
  nodes: ArkadeUnilateralExitTopologyNode[]
  leafOutpoints: ArkadeVtxoOutpoint[]
  hostOutpoints: ArkadeUnilateralExitHostOutpoint[]
  exitBranchTxids: string[]
  commitmentTxids: string[]
}

export interface ArkadeUnilateralExitTopologyParams {
  vtxoOutpoints?: ArkadeVtxoOutpoint[]
}

export interface ArkadeUnilateralExitBatchEstimate {
  projectedUnrollSteps: number
  estimatedPackageFeeSats: number
  feeRateSatPerVb: number
  bumperBalanceSats: number
  bumperSufficient: boolean
  estimateError?: string
}

export interface ArkadeUnilateralExitBatchEstimateParams {
  vtxoOutpoints: ArkadeVtxoOutpoint[]
  feeRateSatPerVb?: number
}

export type ArkadeUnilateralExitPhaseKind =
  | 'idle'
  | 'broadcasting'
  | 'waiting'
  | 'complete'

export type ArkadeUnilateralExitNodeStatusKind = 'pending' | 'inProgress' | 'confirmed'

export interface ArkadeUnilateralExitNodeStatus {
  txid: string
  confirmations: number
  status: ArkadeUnilateralExitNodeStatusKind
}

export interface ArkadeUnilateralExitLeafStatus {
  txid: string
  vout: number
  confirmations: number
  isUnrolled: boolean
}

export interface ArkadeProceedUnilateralExitStepParams {
  walletScope: ArkadeWalletScope
  vtxoOutpoints: ArkadeVtxoOutpoint[]
  feeRateSatPerVb: number
}

export interface ArkadeProceedUnilateralExitStepResult {
  stepTxid?: string
  stepIndex: number
  totalSteps: number
  phase: ArkadeUnilateralExitPhaseKind
  currentStepWaitingSince?: number
  /** True when `/tx/{step_txid}/raw` is available for the active step. */
  currentStepTxRelayed: boolean
  nodeStatuses: ArkadeUnilateralExitNodeStatus[]
  leafStatuses: ArkadeUnilateralExitLeafStatus[]
}

export interface ArkadeUnilateralExitProgressParams {
  vtxoOutpoints: ArkadeVtxoOutpoint[]
}

export interface ArkadeUnilateralExitProgress {
  stepIndex: number
  totalSteps: number
  phase: ArkadeUnilateralExitPhaseKind
  currentStepWaitingSince?: number
  currentStepTxRelayed: boolean
  nodeStatuses: ArkadeUnilateralExitNodeStatus[]
  leafStatuses: ArkadeUnilateralExitLeafStatus[]
}

export type ArkadeUnilateralExitJobViabilityStatus =
  | 'ok'
  | 'aspSweptTargets'
  | 'branchFundingLost'

export type ArkadeUnilateralExitFailureReasonCode =
  | 'asp_swept_targets'
  | 'branch_funding_lost'
  /** Frontend-only: user aborted orchestration without deleting WASM materials. */
  | 'user_aborted'

export type ArkadeUnilateralExitJobPersistence = {
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  currentStepRelayedSinceUnix?: number | null
  jobStartedAtUnix?: number | null
}

export type ArkadeUnilateralExitAutomationPrefsPersistence = {
  enabled: boolean
  feePresetLabel: string
  maxFeeRateSatPerVb: number
}

export type ArkadeUnilateralExitFailurePersistence = {
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  jobStartedAtUnix: number
  detectedAtUnix: number
  reasonCode: string
  detailMessage: string
  vtxoIds: string[]
}

export type ArkadeUnilateralExitFrontendPersistence = {
  job: ArkadeUnilateralExitJobPersistence
  automationPrefs: ArkadeUnilateralExitAutomationPrefsPersistence
  lastFailure?: ArkadeUnilateralExitFailurePersistence | null
}

export interface ArkadeUnilateralExitJobViability {
  status: ArkadeUnilateralExitJobViabilityStatus
  reasonCode: string
  detailMessage?: string
  offendingOutpoints: ArkadeVtxoOutpoint[]
}

export interface EnsureArkadeAccountEncryptedParams {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  arkadeAccountId: string
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
  syncWithOperator(): Promise<ArkadeOperatorSyncResult>
  getOperatorTrustStatus(): Promise<ArkadeOperatorTrustStatus>
  getOperatorConfigDiff(): Promise<ArkadeOperatorConfigDiffResult>
  acceptPendingOperatorConfig(): Promise<void>
  reviewOperatorConfigInAutonomousMode(): Promise<void>
  enterAutonomousMode(): Promise<void>
  exitAutonomousMode(): Promise<void>
  getAutonomousModeStatus(): Promise<ArkadeAutonomousModeStatus>
  hasOpenSession(params: {
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
    arkadeAccountId: string
  }): Promise<boolean>
  reconcileActiveAccountId(arkadeAccountId: string): Promise<void>
  flushSdkPersistence(): Promise<void>
  /** @internal E2E / DevTools only — live WASM export; not wallet-secrets persistence. */
  exportSdkPersistenceJsonForE2e(): Promise<string>
  /** @internal E2E / DevTools only — reads sdkPersistenceJson from encrypted wallet_secrets via secrets channel. */
  readPersistedSdkPersistenceJsonForE2e(params: {
    walletId: number
    arkadeAccountId: string
  }): Promise<string | undefined>
  findActiveAccountSummary(params: {
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
    encryptedPayload: EncryptedBlobForDb
  }): Promise<ArkadeAccountSummary | undefined>
  listAccountSummaries(params: {
    walletId: number
  }): Promise<ArkadeAccountSummary[]>
  ensureArkadeAccountEncrypted(
    params: EnsureArkadeAccountEncryptedParams,
  ): Promise<ArkadeAccountSummary>
  updateOperatorSyncAtEncrypted(params: {
    walletId: number
    arkadeAccountId: string
    lastSuccessfulOperatorSyncAt: string
  }): Promise<void>
  closeSession(): Promise<void>
  migrateDeprecatedSignerVtxos(
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeSignerMigrationResult>
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
  getOperatorScheduledSession(): Promise<ArkadeOperatorScheduledSession | null>
  renewVtxosNow(
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult>
  delegateSpendableVtxos(): Promise<{
    delegated: number
    failed: number
    errorMessage?: string
  }>
  finalizePendingTransactions(): Promise<{ finalized: number; pending: number }>
  onboardBoardedUtxos(
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult>
  cancelPendingBatchIntent(params: ArkadePendingBatchIntentActionParams): Promise<ArkadeBatchJoinResult>
  retryPendingBatchIntent(
    params: ArkadePendingBatchIntentActionParams,
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult>
  abortInFlightBatchJoin(): Promise<void>
  getRecoverableVtxoFeeEstimate(): Promise<ArkadeRecoverableVtxoFeeEstimate>
  recoverRecoverableVtxos(
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult>
  listExitCandidates(): Promise<ArkadeExitCandidateDto[]>
  listVtxos(): Promise<ArkadeVtxoListResult>
  listUnilateralExitsInProgress(): Promise<ArkadeUnilateralExitInProgressDto[]>
  getOnchainBumperInfo(): Promise<ArkadeOnchainBumperInfo>
  collaborativeExit(
    params: ArkadeCollaborativeExitParams,
    onRegistered?: (intent: ArkadePendingBatchIntent) => void,
  ): Promise<ArkadeBatchJoinResult>
  completeUnilateralExit(params: ArkadeCompleteUnilateralExitParams): Promise<string>
  getCollaborativeExitFeeEstimate(
    params: ArkadeCollaborativeExitFeeEstimateParams,
  ): Promise<ArkadeCollaborativeExitFeeEstimate>
  estimateUnilateralExitCompletion(
    params: ArkadeUnilateralExitCompletionFeeEstimateParams,
  ): Promise<ArkadeUnilateralExitCompletionFeeEstimate>
  getUnilateralExitTopology(
    params: ArkadeUnilateralExitTopologyParams,
  ): Promise<ArkadeUnilateralExitTopology>
  estimateUnilateralExitBatch(
    params: ArkadeUnilateralExitBatchEstimateParams,
  ): Promise<ArkadeUnilateralExitBatchEstimate>
  proceedUnilateralExitStep(
    params: ArkadeProceedUnilateralExitStepParams,
  ): Promise<ArkadeProceedUnilateralExitStepResult>
  getUnilateralExitProgress(
    params: ArkadeUnilateralExitProgressParams,
  ): Promise<ArkadeUnilateralExitProgress>
  evaluateUnilateralExitJobViability(
    params: ArkadeUnilateralExitProgressParams,
  ): Promise<ArkadeUnilateralExitJobViability>
  getUnilateralExitFrontendPersistence(
    walletScope: ArkadeWalletScope,
  ): Promise<ArkadeUnilateralExitFrontendPersistence | null>
  setUnilateralExitFrontendPersistence(
    walletScope: ArkadeWalletScope,
    bundle: ArkadeUnilateralExitFrontendPersistence,
  ): Promise<void>
  setUnilateralExitJob(
    walletScope: ArkadeWalletScope,
    job: ArkadeUnilateralExitJobPersistence,
  ): Promise<void>
  setUnilateralExitAutomationPrefs(
    walletScope: ArkadeWalletScope,
    prefs: ArkadeUnilateralExitAutomationPrefsPersistence,
  ): Promise<void>
  setUnilateralExitFailure(
    walletScope: ArkadeWalletScope,
    failure: ArkadeUnilateralExitFailurePersistence | null,
  ): Promise<void>
}
