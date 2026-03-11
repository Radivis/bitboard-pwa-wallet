export interface RegtestBlock {
  blockHash: string
  height: number
  blockData: string
}

export interface RegtestUtxo {
  txid: string
  vout: number
  address: string
  amountSats: number
  scriptPubkeyHex: string
}

export interface RegtestAddress {
  address: string
  wif: string
}

export interface RegtestTxRecord {
  txid: string
  sender: string | null
  receiver: string | null
}

export interface RegtestTxDetails {
  txid: string
  blockHeight: number
  blockTime: number
  inputs: { address: string; amountSats: number; owner?: string | null }[]
  outputs: { address: string; amountSats: number; isChange?: boolean; owner?: string | null }[]
}

export interface RegtestState {
  blocks: RegtestBlock[]
  utxos: RegtestUtxo[]
  addresses: RegtestAddress[]
  addressToOwner?: Record<string, string>
  transactions: RegtestTxRecord[]
  txDetails: RegtestTxDetails[]
}

export interface RegtestService {
  /** Load state from main thread (called after worker spawn). */
  loadState(state: RegtestState): Promise<void>

  /** Returns current block count (height of tip + 1, or 0 if empty). */
  getBlockCount(): Promise<number>

  /** Returns addresses that have interacted with the network. */
  getAddresses(): Promise<RegtestAddress[]>

  /** Returns full state for persistence. */
  getStateSnapshot(): Promise<RegtestState>

  /** Returns full transaction details by txid, or null if not found. */
  getTransaction(txid: string): Promise<RegtestTxDetails | null>

  /**
   * Mines `count` blocks. If `targetAddress` is empty, generates a new key and uses its address.
   * If `ownerName` is provided, associates it with the coinbase address.
   * Returns the new state after mining.
   */
  mineBlocks(count: number, targetAddress: string, ownerName?: string): Promise<RegtestState>

  /**
   * Creates a transaction and mines 1 block to confirm it.
   * Returns the new state.
   */
  createTransaction(
    fromAddress: string,
    toAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
  ): Promise<RegtestState>
}
