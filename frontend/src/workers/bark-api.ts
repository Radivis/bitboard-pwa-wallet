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
  estimateSendOnchain(address: string, amountSats: number): Promise<BarkExitFeeEstimate>
  sendOnchain(address: string, amountSats: number): Promise<string>
  estimateOffboardAll(address: string): Promise<BarkExitFeeEstimate>
  offboardAll(address: string): Promise<string>
}
