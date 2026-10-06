import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import type { HistoricalSignetOnchainChain } from '@/lib/wallet/historical-signet-onchain-chain'
import type { EncryptedBlobMessage } from '@/workers/secrets-channel-types'
import type { BarkRefreshStatus } from '@/lib/bark/bark-refresh-status'
import type { BarkRailNetwork, PendingEmergencyClaim } from '@/lib/wallet/wallet-domain-types'

export type { PendingEmergencyClaim }

export type { BarkRefreshStatus }

export type OpenBarkSessionParams = {
  walletId: number
  encryptedMnemonic: EncryptedBlobMessage
  networkMode: BarkRailNetwork
  /**
   * Browser Esplora base for a regtest open. The on-chain wallet uses the
   * same-origin proxy; a direct `localhost:7030` fetch from the dev origin fails.
   */
  regtestEsploraUrl?: string
}

export type OpenBarkSessionResult = {
  fingerprint: string
  receiveKeyIndex: number
  lastSuccessfulSyncAt?: string
}

export type BarkSyncResult = {
  lastSuccessfulSyncAt: string
  refreshStatus: BarkRefreshStatus
}

export type BarkRevealedReceiveAddress = {
  address: string
  index: number
}

export type BarkPreparedBoardFunding = {
  fundingAddress: string
  expiryHeight: number
}

export type BarkBoardFeeEstimate = {
  grossAmountSats: number
  feeSats: number
  netAmountSats: number
}

/** Same shape as a board fee estimate. `netAmountSats` is what arrives on-chain. */
export type BarkExitFeeEstimate = BarkBoardFeeEstimate

export type BarkArkoorSendParams = {
  address: string
  amountSats: number
}

export type BarkArkoorSendResult = {
  feeSats: number
  spendableSats: number
  lastSuccessfulSyncAt: string
}

export type BarkBoardAccepted = {
  fundingTxid: string
  vtxoAmountSats: number
  movementId: number
}

export type BarkMovementStatus = 'pending' | 'successful' | 'failed' | 'canceled'

export const BARK_PENDING_ACTION_KINDS = ['offboard', 'arkoor', 'lightning', 'board'] as const

export type BarkPendingActionKind = (typeof BARK_PENDING_ACTION_KINDS)[number]

export type BarkPendingAction = {
  id: string
  kind: BarkPendingActionKind
  title: string
  status: string
  amountSats: number
  feeSats: number | null
  destination: string | null
  txid: string | null
  /** Set when the last sync could not move this action. The banner turns red. */
  error: string | null
}

export type BarkBalanceParts = {
  spendableSats: number
  lockedSats: number
}

export type BarkMovementRow = {
  id: number
  status: BarkMovementStatus
  subsystemName: string
  subsystemKind: string
  effectiveBalanceSats: number
  offchainFeeSats: number
  createdAtUnixSeconds: number
}

export const BARK_VTXO_STATES = ['spendable', 'locked', 'spent', 'exited'] as const

export type BarkVtxoState = (typeof BARK_VTXO_STATES)[number]

export type BarkVtxoLockHolderKind = 'action' | 'movement'

export type BarkVtxoLockHolder = {
  kind: BarkVtxoLockHolderKind
  id: string
}

export type BarkVtxoRow = {
  id: string
  amountSats: number
  expiryHeight: number
  state: BarkVtxoState
  lockHolder: BarkVtxoLockHolder | null
  registered: boolean
}

export type BarkVtxoList = {
  tipHeight: number | null
  rows: BarkVtxoRow[]
}

export const BARK_EMERGENCY_EXIT_STATES = [
  'start',
  'processing',
  'awaitingDelta',
  'claimable',
  'claimInProgress',
  'claimed',
  'vtxoAlreadySpent',
  'canceled',
] as const

export type BarkEmergencyExitState = (typeof BARK_EMERGENCY_EXIT_STATES)[number]

export type BarkEmergencyExitEstimate = {
  exitBroadcastFeeSats: number
  claimFeeSats: number
  feeRateSatPerVb: number
  txsToBroadcast: number
}

export type BarkEmergencyExitRow = {
  vtxoId: string
  state: BarkEmergencyExitState
  cancelable: boolean
}

export type BarkEmergencyCpfpRequest = {
  vtxoId: string
  parentTxid: string
  parentTxHex: string
  rbfMinFeeRateSatPerKwu: number | null
  currentPackageFeeSats: number | null
}

export type BarkEmergencyExitProgress = {
  requests: BarkEmergencyCpfpRequest[]
}

export type BarkEmergencyExitDrain = {
  psbtHex: string
  rawTxHex: string
  vtxoIds: string[]
}

export const BARK_EXIT_GRAPH_NODE_STATUSES = ['pending', 'inProgress', 'confirmed'] as const

export type BarkExitGraphNodeStatus = (typeof BARK_EXIT_GRAPH_NODE_STATUSES)[number]

export const BARK_EXIT_GRAPH_TX_TYPES = ['tree', 'checkpoint', 'commitment'] as const

export type BarkExitGraphTxType = (typeof BARK_EXIT_GRAPH_TX_TYPES)[number]

export type BarkExitGraphNode = {
  txid: string
  spends: string[]
  leafVtxoIds: string[]
  status: BarkExitGraphNodeStatus
  needsChild: boolean
  waitingOnTxids: string[]
  txType: BarkExitGraphTxType
}

export type BarkExitGraph = {
  nodes: BarkExitGraphNode[]
}

export interface BarkService {
  configureHistoricalSignetOnchainChain(
    chain: HistoricalSignetOnchainChain | null,
  ): Promise<void>
  setSecretsPort(port: MessagePort): Promise<void>
  setEncryptedWalletSecretsHost(host: EncryptedWalletSecretsHost): Promise<void>
  ping(): Promise<boolean>
  openSession(params: OpenBarkSessionParams): Promise<OpenBarkSessionResult>
  closeSession(): Promise<void>
  peekReceiveAddress(index: number): Promise<string>
  revealNextReceiveAddress(): Promise<BarkRevealedReceiveAddress>
  sync(): Promise<BarkSyncResult>
  readSpendableBalance(): Promise<BarkBalanceParts>
  listPendingActions(): Promise<BarkPendingAction[]>
  estimateBoardOffchainFee(amountSats: number): Promise<BarkBoardFeeEstimate>
  prepareBoardFunding(): Promise<BarkPreparedBoardFunding>
  boardPsbt(psbtBase64: string): Promise<BarkBoardAccepted>
  history(): Promise<BarkMovementRow[]>
  listVtxos(): Promise<BarkVtxoList>
  estimateSendOnchain(address: string, amountSats: number): Promise<BarkExitFeeEstimate>
  sendOnchain(address: string, amountSats: number): Promise<string>
  estimateOffboardAll(address: string): Promise<BarkExitFeeEstimate>
  offboardAll(address: string): Promise<string>
  sendArkoorPayment(params: BarkArkoorSendParams): Promise<BarkArkoorSendResult>
  estimateEmergencyExit(
    vtxoIds: string[],
    feeRateSatPerVb: number,
  ): Promise<BarkEmergencyExitEstimate>
  startEmergencyExit(vtxoIds: string[]): Promise<void>
  listEmergencyExits(): Promise<BarkEmergencyExitRow[]>
  exitTopology(vtxoIds: string[]): Promise<BarkExitGraph>
  progressEmergencyExits(): Promise<BarkEmergencyExitProgress>
  provideEmergencyExitCpfp(exitTxid: string, childTxHex: string): Promise<void>
  cancelEmergencyExit(vtxoId: string): Promise<void>
  drainEmergencyExits(
    address: string,
    feeRateSatPerVb: number,
    excludeVtxoIds: string[],
  ): Promise<BarkEmergencyExitDrain>
  readPendingEmergencyClaim(): Promise<PendingEmergencyClaim | null>
  writePendingEmergencyClaim(pending: PendingEmergencyClaim | null): Promise<void>
  syncEmergencyExits(): Promise<BarkEmergencyExitRow[]>
  broadcastEmergencyExitClaim(rawTxHex: string): Promise<void>
}
