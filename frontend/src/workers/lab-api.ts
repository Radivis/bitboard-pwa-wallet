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

export interface LabTxInputDetail {
  address: string
  amountSats: number
  owner?: string | null
  /** Populated for coinbase inputs (Bitcoin prevout conventions). */
  prevTxid?: string
  prevVout?: number
  sequence?: number
}

export interface LabTxRecord {
  txid: string
  sender: string | null
  receiver: string | null
  /** Denormalized; coinbase txs have no spend sender in the usual sense. */
  isCoinbase?: boolean
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
  isCoinbase?: boolean
  inputs: LabTxInputDetail[]
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
  isCoinbase?: boolean
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
  /** Matches lab mining defaults; omit to use worker default (segwit). */
  labAddressType?: string
  labNetwork?: string
}

/** Simulated BDK-backed lab participant (plaintext in lab DB). */
export interface LabEntityRecord {
  labEntityId: number
  /** User-provided name, or null for anonymous (use `Anonymous-{labEntityId}` as owner/display key). */
  entityName: string | null
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

/** Persisted: one row per mined block / coinbase (see lab_mine_operations). */
export interface LabMineOperationRecord {
  mineOperationId?: number
  height: number
  blockHash: string
  minedByKey: string | null
  coinbaseTxid: string | null
  createdAt: string
}

/** Persisted: metadata for entity/wallet spends (see lab_tx_operations). */
export interface LabTxOperationRecord {
  txOperationId?: number
  txid: string
  senderKey: string
  changeAddress: string | null
  changeVout: number | null
  payloadJson: string
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
  mineOperations: LabMineOperationRecord[]
  txOperations: LabTxOperationRecord[]
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
  /** UI may supply when payee is not yet in lab `addressToOwner` (e.g. wallet receive address). */
  knownRecipientOwner?: string | null
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
  /** When the payee is not in `addressToOwner` yet (e.g. newly generated receive address). */
  knownRecipientOwner?: string | null
}

export interface PrepareRandomLabEntityTransactionParams {
  maxAttempts?: number
}

export interface PrepareRandomLabEntityTransactionResult {
  prepareParams: PrepareLabEntityTransactionParams
  entityName: string
  crypto: LabEntityTransactionCryptoParams
  mempoolMetadata: LabMempoolMetadata
  totalInput: number
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
  mineOperations: [],
  txOperations: [],
}

/** Result of {@link LabService.mineBlocks}. Mempool counts exclude coinbase (mempool-only). */
export interface LabMineBlocksResult {
  state: LabState
  /** Non-coinbase mempool txs included in the first block of this mining run. */
  includedMempoolTxCount: number
  /** Mempool txs removed without inclusion (double-spend losers vs higher-fee selection). */
  discardedConflictTxCount: number
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
   * Returns the new state and mempool inclusion/discard stats for the first block mined.
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
  ): Promise<LabMineBlocksResult>

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
   * Selects randomized lab-entity transaction parameters and prepares signing payload.
   */
  prepareRandomLabEntityTransaction(
    params?: PrepareRandomLabEntityTransactionParams,
  ): Promise<PrepareRandomLabEntityTransactionResult | null>

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
