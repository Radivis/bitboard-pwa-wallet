import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import type { HistoricalSignetOnchainChain } from '@/lib/wallet/historical-signet-onchain-chain'
import type { EncryptedBlobMessage } from '@/workers/secrets-channel-types'

export type OpenBarkSessionParams = {
  walletId: number
  encryptedMnemonic: EncryptedBlobMessage
}

export type OpenBarkSessionResult = {
  fingerprint: string
  receiveKeyIndex: number
  lastSuccessfulSyncAt?: string
}

export type BarkSyncResult = {
  lastSuccessfulSyncAt: string
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
  feeRateSatPerVb: number
  requests: BarkEmergencyCpfpRequest[]
}

export type BarkEmergencyExitDrain = {
  psbtHex: string
  rawTxHex: string
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
  readSpendableBalance(): Promise<number>
  estimateBoardOffchainFee(amountSats: number): Promise<BarkBoardFeeEstimate>
  prepareBoardFunding(): Promise<BarkPreparedBoardFunding>
  boardPsbt(psbtBase64: string): Promise<BarkBoardAccepted>
  history(): Promise<BarkMovementRow[]>
  listVtxos(): Promise<BarkVtxoRow[]>
  estimateSendOnchain(address: string, amountSats: number): Promise<BarkExitFeeEstimate>
  sendOnchain(address: string, amountSats: number): Promise<string>
  estimateOffboardAll(address: string): Promise<BarkExitFeeEstimate>
  offboardAll(address: string): Promise<string>
  sendArkoorPayment(params: BarkArkoorSendParams): Promise<BarkArkoorSendResult>
  estimateEmergencyExit(vtxoIds: string[]): Promise<BarkEmergencyExitEstimate>
  startEmergencyExit(vtxoIds: string[]): Promise<void>
  listEmergencyExits(): Promise<BarkEmergencyExitRow[]>
  progressEmergencyExits(): Promise<BarkEmergencyExitProgress>
  provideEmergencyExitCpfp(exitTxid: string, childTxHex: string): Promise<void>
  cancelEmergencyExit(vtxoId: string): Promise<void>
  drainEmergencyExits(address: string): Promise<BarkEmergencyExitDrain>
}
