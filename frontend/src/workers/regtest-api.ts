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

export interface RegtestTxDetails {
  txid: string
  blockHeight: number
  blockTime: number
  confirmations: number
  inputs: { address: string; amountSats: number; owner?: string | null }[]
  outputs: { address: string; amountSats: number; isChange?: boolean; owner?: string | null }[]
}

export interface RegtestState {
  blocks: RegtestBlock[]
  utxos: RegtestUtxo[]
  addresses: RegtestAddress[]
  addressToOwner?: Record<string, string>
  mempool: MempoolEntry[]
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
   * Creates a transaction and adds it to the mempool. No mining.
   * Returns the new state.
   */
  createTransaction(
    fromAddress: string,
    toAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
  ): Promise<RegtestState>

  /**
   * Creates a transaction from addresses controlled by an external signer (e.g. wallet).
   * Supports two call patterns:
   * - (fromAddress, wif, toAddress, amountSats, feeRateSatPerVb) for single-address
   * - (walletOwner, addressToWif, toAddress, amountSats, feeRateSatPerVb, walletChangeAddress?) for multi-address
   * When second arg is string, treats as WIF (single-address). When object, treats as addressToWif (multi-address).
   * For multi-address: pass walletChangeAddress (wallet's internal address) so change outputs go to an address
   * the wallet controls; otherwise change goes to a random address the wallet cannot spend from.
   */
  createTransactionFromExternalSigner(
    walletOwnerOrFromAddress: string,
    wifOrAddressToWif: string | Record<string, string>,
    toAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
    walletChangeAddress?: string,
  ): Promise<RegtestState>
}
