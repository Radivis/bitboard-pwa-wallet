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

export interface RegtestState {
  blocks: RegtestBlock[]
  utxos: RegtestUtxo[]
  addresses: RegtestAddress[]
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

  /**
   * Mines `count` blocks. If `targetAddress` is empty, generates a new key and uses its address.
   * Returns the new state after mining.
   */
  mineBlocks(count: number, targetAddress: string): Promise<RegtestState>

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
