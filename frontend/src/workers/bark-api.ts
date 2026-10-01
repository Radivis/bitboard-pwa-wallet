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
}
