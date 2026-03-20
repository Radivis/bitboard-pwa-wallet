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

/** Minimum blocks per single "Mine blocks" operation in the lab UI and worker. */
export const LAB_MIN_BLOCKS_PER_MINE = 1

/**
 * Maximum blocks per single mining run. Larger batches block the worker for a long time
 * (WASM mining loop) and make the app feel stuck.
 */
export const LAB_MAX_BLOCKS_PER_MINE = 100

export interface LabCreateTransactionParams {
  fromAddress: string
  toAddress: string
  amountSats: number
  feeRateSatPerVb: number
}

export interface PrepareLabWalletTransactionParams {
  walletOwner: string
  toAddress: string
  amountSats: number
  feeRateSatPerVb: number
  walletChangeAddress: string
}

/** Single source of truth for empty lab state. Use in store, worker, and lab-factory. */
export const EMPTY_LAB_STATE: LabState = {
  blocks: [],
  utxos: [],
  addresses: [],
  addressToOwner: {},
  mempool: [],
  transactions: [],
  txDetails: [],
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
   * If `ownerName` is provided, associates the coinbase address with that name.
   * If `ownerWalletId` is provided, associates the coinbase address with that wallet.
   * `count` must be an integer from LAB_MIN_BLOCKS_PER_MINE to LAB_MAX_BLOCKS_PER_MINE inclusive.
   * Returns the new state after mining.
   */
  mineBlocks(
    count: number,
    targetAddress: string,
    options?: { ownerName?: string; ownerWalletId?: number },
  ): Promise<LabState>

  /**
   * Creates a transaction and adds it to the mempool. No mining.
   * Returns the new state.
   */
  createTransaction(params: LabCreateTransactionParams): Promise<LabState>

  /**
   * Prepares lab UTXOs for a wallet transaction. Returns utxosJson and partial metadata.
   * Main thread calls crypto.buildAndSignLabTransaction, then merges feeSats/hasChange
   * and calls addSignedTransactionToMempool.
   */
  prepareLabWalletTransaction(
    params: PrepareLabWalletTransactionParams,
  ): Promise<{
    utxosJson: string
    mempoolMetadata: LabMempoolMetadata
    totalInput: number
  }>

  /**
   * Adds a signed transaction to the mempool. Call after buildAndSignLabTransaction.
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
