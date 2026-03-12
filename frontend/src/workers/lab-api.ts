export interface LabBlock {
  blockHash: string
  height: number
  blockData: string
}

export interface LabUtxo {
  txid: string
  vout: number
  address: string
  amountSats: number
  scriptPubkeyHex: string
}

export interface LabAddress {
  address: string
  wif: string
}

export interface LabTxRecord {
  txid: string
  sender: string | null
  receiver: string | null
}

export interface MempoolEntry {
  signedTxHex: string
  txid: string
  sender: string | null
  receiver: string | null
  feeSats: number
  inputs: { txid: string; vout: number }[]
  inputsDetail: { address: string; amountSats: number; owner?: string | null }[]
  outputsDetail: {
    address: string
    amountSats: number
    isChange?: boolean
    owner?: string | null
  }[]
}

export interface LabTxDetails {
  txid: string
  blockHeight: number
  blockTime: number
  confirmations: number
  inputs: { address: string; amountSats: number; owner?: string | null }[]
  outputs: { address: string; amountSats: number; isChange?: boolean; owner?: string | null }[]
}

export interface LabState {
  blocks: LabBlock[]
  utxos: LabUtxo[]
  addresses: LabAddress[]
  addressToOwner?: Record<string, string>
  mempool: MempoolEntry[]
  transactions: LabTxRecord[]
  txDetails: LabTxDetails[]
}

export interface LabService {
  /** Load state from main thread (called after worker spawn). */
  loadState(state: LabState): Promise<void>

  /** Returns current block count (height of tip + 1, or 0 if empty). */
  getBlockCount(): Promise<number>

  /** Returns addresses that have interacted with the network. */
  getAddresses(): Promise<LabAddress[]>

  /** Returns full state for persistence. */
  getStateSnapshot(): Promise<LabState>

  /** Returns full transaction details by txid, or null if not found. */
  getTransaction(txid: string): Promise<LabTxDetails | null>

  /**
   * Mines `count` blocks. If `targetAddress` is empty, generates a new key and uses its address.
   * If `ownerName` is provided, associates it with the coinbase address.
   * Returns the new state after mining.
   */
  mineBlocks(count: number, targetAddress: string, ownerName?: string): Promise<LabState>

  /**
   * Creates a transaction and adds it to the mempool. No mining.
   * Returns the new state.
   */
  createTransaction(
    fromAddress: string,
    toAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
  ): Promise<LabState>

  /**
   * Builds an unsigned transaction from UTXOs owned by walletOwner.
   * Returns unsignedTxHex, utxosJson, and metadata for adding to mempool after signing.
   * Main thread signs via crypto worker, then calls addSignedTransactionToMempool.
   */
  buildUnsignedLabTransaction(
    walletOwner: string,
    toAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
    walletChangeAddress: string,
  ): Promise<{
    unsignedTxHex: string
    utxosJson: string
    mempoolMetadata: LabMempoolMetadata
  }>

  /**
   * Adds a signed transaction to the mempool. Call after signing via signLabTransaction.
   */
  addSignedTransactionToMempool(
    signedTxHex: string,
    mempoolMetadata: LabMempoolMetadata,
  ): Promise<LabState>
}

export interface LabMempoolMetadata {
  sender: string | null
  receiver: string | null
  feeSats: number
  inputs: { txid: string; vout: number }[]
  inputsDetail: { address: string; amountSats: number; owner?: string | null }[]
  outputsDetail: {
    address: string
    amountSats: number
    isChange?: boolean
    owner?: string | null
  }[]
  hasChange: boolean
  walletChangeAddress: string
}
