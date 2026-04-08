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

export interface LabBlockHeaderDetails {
  version: number
  previousBlockHash: string
  merkleRoot: string
  timestamp: number
  targetBits: string
  targetExpanded: string
  nonce: number
  blockHeaderHash: string
}

export interface LabBlockTransactionSummary {
  txid: string
  sender: string | null
  receiver: string | null
  feeSats: number
}

export interface LabBlockMetadataDetails {
  height: number
  minedOn: number
  minedBy: string | null
  numberOfTransactions: number
  totalFeesSats: number
}

export interface LabBlockDetails {
  isTemplate: boolean
  header: LabBlockHeaderDetails
  metadata: LabBlockMetadataDetails
  transactions: LabBlockTransactionSummary[]
}

export interface LabCurrentBlockTemplateParams {
  ownerType: 'name' | 'wallet'
  targetAddress: string
  ownerName?: string
  ownerWalletId?: number
  walletCurrentAddress?: string | null
}

/** Simulated BDK-backed lab participant (plaintext in lab DB). */
export interface LabEntityRecord {
  entityName: string
  mnemonic: string
  changesetJson: string
  externalDescriptor: string
  internalDescriptor: string
  network: string
  addressType: string
  accountId: number
  createdAt: string
  updatedAt: string
}

export interface LabState {
  blocks: LabBlock[]
  utxos: LabUtxo[]
  addresses: LabAddress[]
  /** Lab Entities with simulated descriptor wallets (not user wallets). */
  entities: LabEntityRecord[]
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

export interface PrepareLabEntityTransactionParams {
  entityName: string
  fromAddress: string
  toAddress: string
  amountSats: number
  feeRateSatPerVb: number
}

/** Payload for crypto worker after prepareLabEntityTransaction. */
export interface LabEntityTransactionCryptoParams {
  mnemonic: string
  changesetJson: string
  network: string
  addressType: string
  accountId: number
  utxosJson: string
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
  entities: [],
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

  /** Returns mined block details by exact height, or null if missing. */
  getBlockByHeight(height: number): Promise<LabBlockDetails | null>

  /** Returns an unmined current block template preview for current mining controls. */
  getCurrentBlockTemplate(params: LabCurrentBlockTemplateParams): Promise<LabBlockDetails>

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
    options?: {
      ownerName?: string
      ownerWalletId?: number
      labAddressType?: string
      labNetwork?: string
    },
  ): Promise<LabState>

  /**
   * Build lab-entity tx inputs/metadata for signing on the crypto worker.
   */
  prepareLabEntityTransaction(
    params: PrepareLabEntityTransactionParams,
  ): Promise<{
    crypto: LabEntityTransactionCryptoParams
    mempoolMetadata: LabMempoolMetadata
    totalInput: number
  }>

  /**
   * Push signed lab-entity tx to mempool and persist updated entity changeset.
   */
  finalizeLabEntityMempoolTransaction(params: {
    signedTxHex: string
    mempoolMetadata: LabMempoolMetadata
    entityName: string
    newChangesetJson: string
  }): Promise<LabState>

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
