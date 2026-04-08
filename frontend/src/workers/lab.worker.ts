import { expose } from 'comlink'
import type {
  LabAddress,
  LabBlockDetails,
  LabBlockHeaderDetails,
  LabBlockTransactionSummary,
  LabCurrentBlockTemplateParams,
  LabBlock,
  LabState,
  LabTxDetails,
  MempoolEntry,
} from './lab-api'
import {
  EMPTY_LAB_STATE,
  LAB_MAX_BLOCKS_PER_MINE,
  LAB_MIN_BLOCKS_PER_MINE,
} from './lab-api'
import {
  mergeAddressesWithUtxos,
  walletOwnerKey,
  WALLET_OWNER_PREFIX,
} from '@/lib/lab-utils'

let labWasmModule: typeof import('@/wasm-pkg/bitboard_crypto') | null = null

async function getWasm() {
  if (!labWasmModule) {
    labWasmModule = await import('@/wasm-pkg/bitboard_crypto')
  }
  return labWasmModule
}

let state: LabState = { ...EMPTY_LAB_STATE }

/** Txid -> change address for txs we create (used to mark change outputs). Not persisted. */
const txidToChangeAddress = new Map<string, string>()

function parseWasmObject(val: unknown): Record<string, unknown> {
  if (val != null && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>
  }
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

function selectMempoolTxsForBlock(mempool: MempoolEntry[]): MempoolEntry[] {
  const sortedEntries = [...mempool].sort((a, b) => {
    if (b.feeSats !== a.feeSats) return b.feeSats - a.feeSats
    return Math.random() - 0.5
  })
  const spentBySelected = new Set<string>()
  const selectedEntries: MempoolEntry[] = []
  // Check for double spends
  for (const entry of sortedEntries) {
    const overlaps = entry.inputs.some((input) => spentBySelected.has(`${input.txid}:${input.vout}`))
    if (!overlaps) {
      selectedEntries.push(entry)
      for (const input of entry.inputs) spentBySelected.add(`${input.txid}:${input.vout}`)
    }
  }
  return selectedEntries
}

function getTip(): LabBlock | null {
  if (state.blocks.length === 0) return null
  return state.blocks[state.blocks.length - 1]
}

function hexToBytes(hex: string): Uint8Array {
  const normalizedHex = hex.length % 2 === 0 ? hex : `0${hex}`
  const out = new Uint8Array(normalizedHex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(normalizedHex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function reverseHexByteOrder(hex: string): string {
  return bytesToHex(hexToBytes(hex).reverse())
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(digest)
}

async function doubleSha256(data: Uint8Array): Promise<Uint8Array> {
  const first = await sha256(data)
  return sha256(first)
}

function expandTargetFromBits(bits: number): string {
  const exponent = bits >>> 24
  const mantissa = bits & 0x007fffff
  if (mantissa === 0) return '0'.repeat(64)
  const shiftBytes = exponent - 3
  const value = shiftBytes >= 0
    ? BigInt(mantissa) << BigInt(8 * shiftBytes)
    : BigInt(mantissa) >> BigInt(8 * -shiftBytes)
  return value.toString(16).padStart(64, '0')
}

async function parseBlockHeader(blockHex: string): Promise<LabBlockHeaderDetails> {
  const headerHex = blockHex.slice(0, 160)
  const headerBytes = hexToBytes(headerHex)
  if (headerBytes.length < 80) {
    throw new Error('Block header must be 80 bytes')
  }
  const version = readUint32Le(headerBytes, 0)
  const previousBlockHash = reverseHexByteOrder(headerHex.slice(8, 72))
  const merkleRoot = reverseHexByteOrder(headerHex.slice(72, 136))
  const timestamp = readUint32Le(headerBytes, 68)
  const bits = readUint32Le(headerBytes, 72)
  const nonce = readUint32Le(headerBytes, 76)
  const targetBits = bits.toString(16).padStart(8, '0')
  const targetExpanded = expandTargetFromBits(bits)
  const blockHeaderHash = bytesToHex((await doubleSha256(headerBytes)).reverse())

  return {
    version,
    previousBlockHash,
    merkleRoot,
    timestamp,
    targetBits,
    targetExpanded,
    nonce,
    blockHeaderHash,
  }
}

interface BlockEffectsTx {
  txid: string
  inputs: { prev_txid: string; prev_vout: number }[]
  outputs?: { address: string; amount_sats: number }[]
}

interface BlockEffectsParsed {
  spent: { txid: string; vout: number }[]
  new_utxos: { txid: string; vout: number; address: string; amount_sats: number; script_pubkey_hex: string }[]
  transactions: BlockEffectsTx[]
  block_time?: number
}

function parseBlockEffects(raw: unknown): BlockEffectsParsed {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as BlockEffectsParsed
      return {
        spent: Array.isArray(parsed?.spent) ? parsed.spent : [],
        new_utxos: Array.isArray(parsed?.new_utxos) ? parsed.new_utxos : [],
        transactions: Array.isArray(parsed?.transactions) ? parsed.transactions : [],
        block_time: typeof parsed?.block_time === 'number' ? parsed.block_time : 0,
      }
    } catch {
      return { spent: [], new_utxos: [], transactions: [], block_time: 0 }
    }
  }
  const effects = raw as Record<string, unknown>
  const spent = Array.isArray(effects?.spent) ? effects.spent : []
  const new_utxos = Array.isArray(effects?.new_utxos) ? effects.new_utxos : []
  const transactions = Array.isArray(effects?.transactions) ? effects.transactions : []
  const block_time = typeof effects?.block_time === 'number' ? effects.block_time : 0
  return { spent, new_utxos, transactions, block_time }
}

function removeSpentUtxos(spent: { txid: string; vout: number }[]): void {
  for (const stxo of spent) {
    state.utxos = state.utxos.filter((utxo) => !(utxo.txid === stxo.txid && utxo.vout === stxo.vout))
  }
}

function readSatsFromUtxoRow(row: Record<string, unknown>): number {
  const v = row.amount_sats ?? row.amountSats
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  return 0
}

function addNewUtxos(
  newUtxos: {
    txid: string
    vout: number
    address: string
    amount_sats?: number
    script_pubkey_hex?: string
    amountSats?: number
    scriptPubkeyHex?: string
  }[],
): void {
  for (const utxo of newUtxos) {
    const row = utxo as unknown as Record<string, unknown>
    const addressStr = String(utxo.address)
    state.utxos.push({
      txid: String(utxo.txid),
      vout: Number(utxo.vout),
      address: addressStr,
      amountSats: readSatsFromUtxoRow(row),
      scriptPubkeyHex: String(
        utxo.script_pubkey_hex ?? utxo.scriptPubkeyHex ?? '',
      ),
    })
  }
}

function applyTransactionsAndDetailsFromBlock(
  transactions: BlockEffectsTx[],
  height: number,
  blockTime: number,
): void {
  const utxoMap = new Map(state.utxos.map((utxo) => [`${utxo.txid}:${utxo.vout}`, utxo]))
  const addressToOwner = state.addressToOwner ?? {}

  for (const tx of transactions) {
    const inputs: { address: string; amountSats: number; owner?: string | null }[] = []
    let firstInputAddress: string | null = null
    for (const input of tx.inputs) {
      const key = `${input.prev_txid}:${input.prev_vout}`
      const utxo = utxoMap.get(key)
      if (utxo) {
        const owner = addressToOwner[utxo.address] ?? null
        inputs.push({ address: utxo.address, amountSats: utxo.amountSats, owner })
        if (firstInputAddress === null) firstInputAddress = utxo.address
      }
    }
    const sender = firstInputAddress ? (addressToOwner[firstInputAddress] ?? null) : null
    const changeAddressForTx = txidToChangeAddress.get(tx.txid)
    const outputs = (tx.outputs ?? []).map((output) => {
      const isChange = changeAddressForTx !== undefined && output.address === changeAddressForTx
      const owner = isChange && sender
        ? sender
        : (addressToOwner[output.address] ?? null)
      if (isChange && sender) {
        state.addressToOwner = state.addressToOwner ?? {}
        state.addressToOwner[output.address] = sender
      }
      return {
        address: output.address,
        amountSats: output.amount_sats,
        isChange,
        owner,
      }
    })
    const firstNonChangeOutput = outputs.find((output) => !output.isChange)
    let receiver = firstNonChangeOutput
      ? (addressToOwner[firstNonChangeOutput.address] ?? null)
      : null
    if (
      firstNonChangeOutput &&
      receiver === null &&
      sender !== null &&
      sender.startsWith(WALLET_OWNER_PREFIX)
    ) {
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[firstNonChangeOutput.address] = sender
      receiver = sender
    }
    state.transactions.push({ txid: tx.txid, sender, receiver })
    if (inputs.length > 0 || outputs.length > 0) {
      state.txDetails.push({
        txid: tx.txid,
        blockHeight: height,
        blockTime,
        confirmations: 0,
        inputs,
        outputs,
      })
    }
    txidToChangeAddress.delete(tx.txid)
  }
}

function applyBlockEffects(blockHex: string, height: number, newAddress?: LabAddress): void {
  const wasmModule = labWasmModule!
  const rawEffects = wasmModule.lab_block_effects(blockHex)
  const { spent, new_utxos: newUtxos, transactions, block_time } = parseBlockEffects(rawEffects)
  const blockTime = block_time ?? 0

  applyTransactionsAndDetailsFromBlock(transactions, height, blockTime)
  removeSpentUtxos(spent)
  addNewUtxos(newUtxos)
  if (newAddress) {
    state.addresses.push(newAddress)
  }

  const blockHash = wasmModule.lab_block_hash(blockHex)
  state.blocks.push({
    blockHash,
    height,
    blockData: blockHex,
  })
}

function feeFromTxDetails(tx: LabTxDetails): number {
  const totalInputs = tx.inputs.reduce((sum, input) => sum + input.amountSats, 0)
  const totalOutputs = tx.outputs.reduce((sum, output) => sum + output.amountSats, 0)
  return Math.max(totalInputs - totalOutputs, 0)
}

function minedByFromBlockTxs(blockTxs: LabTxDetails[]): string | null {
  const coinbase = blockTxs.find((tx) => tx.inputs.length === 0)
  const firstCoinbaseOutputOwner = coinbase?.outputs[0]?.owner
  return firstCoinbaseOutputOwner ?? null
}

function blockTransactionsForHeight(height: number): LabBlockTransactionSummary[] {
  const txRecordByTxid = new Map(state.transactions.map((tx) => [tx.txid, tx]))
  return state.txDetails
    .filter((tx) => tx.blockHeight === height)
    .map((tx) => {
      const txRecord = txRecordByTxid.get(tx.txid)
      return {
        txid: tx.txid,
        sender: txRecord?.sender ?? null,
        receiver: txRecord?.receiver ?? null,
        feeSats: feeFromTxDetails(tx),
      }
    })
}

async function buildMinedBlockDetails(block: LabBlock): Promise<LabBlockDetails> {
  const header = await parseBlockHeader(block.blockData)
  const blockTxDetails = state.txDetails.filter((tx) => tx.blockHeight === block.height)
  const transactions = blockTransactionsForHeight(block.height)
  const totalFeesSats = transactions.reduce((sum, tx) => sum + tx.feeSats, 0)

  return {
    isTemplate: false,
    header,
    metadata: {
      height: block.height,
      minedOn: blockTxDetails[0]?.blockTime ?? header.timestamp,
      minedBy: minedByFromBlockTxs(blockTxDetails),
      numberOfTransactions: transactions.length,
      totalFeesSats,
    },
    transactions,
  }
}

async function buildCurrentBlockTemplate(
  params: LabCurrentBlockTemplateParams,
): Promise<LabBlockDetails> {
  const wasmModule = await getWasm()
  const tip = getTip()
  const previewHeight = tip ? tip.height + 1 : 0
  const previousHash = tip?.blockHash ?? ''

  const selectedEntries = selectMempoolTxsForBlock([...(state.mempool ?? [])])
  const mempoolTxHexes = selectedEntries.map((entry) => entry.signedTxHex)
  const totalFeesSats = selectedEntries.reduce((sum, entry) => sum + entry.feeSats, 0)

  const effectiveTargetAddress = params.ownerType === 'wallet'
    ? (params.walletCurrentAddress ?? '').trim()
    : params.targetAddress.trim()

  const entityNameOpt = params.ownerName?.trim()

  let targetAddress: string
  if (
    params.ownerType === 'name' &&
    entityNameOpt != null &&
    entityNameOpt !== '' &&
    params.ownerWalletId == null
  ) {
    const entity = state.entities.find((e) => e.entityName === entityNameOpt)
    if (entity) {
      targetAddress = wasmModule.lab_entity_get_current_external_address(
        entity.mnemonic,
        entity.changesetJson,
        entity.network,
        entity.addressType,
        entity.accountId,
      )
    } else {
      targetAddress = effectiveTargetAddress || wasmModule.lab_generate_keypair().address
    }
  } else {
    targetAddress = effectiveTargetAddress || wasmModule.lab_generate_keypair().address
  }

  const coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(targetAddress)
  const blockHex = wasmModule.lab_mine_block(
    previousHash,
    previewHeight,
    coinbaseScriptPubkeyHex,
    mempoolTxHexes,
    BigInt(totalFeesSats),
  )
  const header = await parseBlockHeader(blockHex)
  const rawEffects = wasmModule.lab_block_effects(blockHex)
  const previewEffects = parseBlockEffects(rawEffects)
  const entryByTxid = new Map(selectedEntries.map((entry) => [entry.txid, entry]))

  const minedBy = params.ownerType === 'wallet' && params.ownerWalletId != null
    ? walletOwnerKey(params.ownerWalletId)
    : params.ownerName?.trim()
      ? params.ownerName.trim()
      : null

  const transactions: LabBlockTransactionSummary[] = previewEffects.transactions.map((tx) => {
    const matchedEntry = entryByTxid.get(tx.txid)
    const isCoinbase = tx.inputs.length === 0
    return {
      txid: tx.txid,
      sender: matchedEntry?.sender ?? null,
      receiver: isCoinbase ? minedBy : (matchedEntry?.receiver ?? null),
      feeSats: matchedEntry?.feeSats ?? 0,
    }
  })

  return {
    isTemplate: true,
    header,
    metadata: {
      height: previewHeight,
      minedOn: header.timestamp,
      minedBy,
      numberOfTransactions: transactions.length,
      totalFeesSats,
    },
    transactions,
  }
}

const labService = {
  async loadState(newState: LabState): Promise<void> {
    const cloned = JSON.parse(JSON.stringify(newState)) as LabState
    state = {
      blocks: cloned.blocks ?? [],
      utxos: cloned.utxos ?? [],
      addresses: cloned.addresses ?? [],
      entities: cloned.entities ?? [],
      addressToOwner: cloned.addressToOwner ?? {},
      mempool: cloned.mempool ?? [],
      transactions: cloned.transactions ?? [],
      txDetails: cloned.txDetails ?? [],
    }
  },

  async getTransaction(txid: string): Promise<LabTxDetails | null> {
    const mempoolEntry = state.mempool.find((entry) => entry.txid === txid)
    if (mempoolEntry) {
      return {
        txid: mempoolEntry.txid,
        blockHeight: -1,
        blockTime: 0,
        confirmations: 0,
        inputs: mempoolEntry.inputsDetail,
        outputs: mempoolEntry.outputsDetail,
      }
    }
    const details = state.txDetails.find((tx) => tx.txid === txid)
    if (!details) return null
    const blockCount = getTip() ? getTip()!.height + 1 : 0
    return {
      ...details,
      confirmations: blockCount - details.blockHeight,
    }
  },

  async getBlockByHeight(height: number): Promise<LabBlockDetails | null> {
    const block = state.blocks.find((candidate) => candidate.height === height)
    if (!block) return null
    return buildMinedBlockDetails(block)
  },

  async getCurrentBlockTemplate(
    params: LabCurrentBlockTemplateParams,
  ): Promise<LabBlockDetails> {
    return buildCurrentBlockTemplate(params)
  },

  async getBlockCount(): Promise<number> {
    const tip = getTip()
    return tip ? tip.height + 1 : 0
  },

  async getAddresses(): Promise<LabAddress[]> {
    return mergeAddressesWithUtxos(state.addresses, state.utxos)
  },

  async getStateSnapshot(): Promise<LabState> {
    return JSON.parse(JSON.stringify(state))
  },

  async mineBlocks(
    blockCountToMine: number,
    targetAddress: string,
    options?: {
      ownerName?: string
      ownerWalletId?: number
      labAddressType?: string
      labNetwork?: string
    },
  ): Promise<LabState> {
    if (
      !Number.isInteger(blockCountToMine) ||
      blockCountToMine < LAB_MIN_BLOCKS_PER_MINE ||
      blockCountToMine > LAB_MAX_BLOCKS_PER_MINE
    ) {
      throw new Error(
        `Block count must be an integer from ${LAB_MIN_BLOCKS_PER_MINE} to ${LAB_MAX_BLOCKS_PER_MINE} (inclusive)`,
      )
    }

    const wasmModule = await getWasm()
    const tip = getTip()

    let prevHash = ''
    let height = 0
    if (tip) {
      prevHash = tip.blockHash
      height = tip.height + 1
    }

    const labNetwork = options?.labNetwork ?? 'regtest'
    const labAddressType = options?.labAddressType ?? 'segwit'
    const entityNameOpt = options?.ownerName?.trim()

    let coinbaseScriptPubkeyHex: string
    let newAddress: LabAddress | null = null
    let coinbaseAddress: string

    if (entityNameOpt != null && entityNameOpt !== '' && options?.ownerWalletId == null) {
      let entity = state.entities.find((e) => e.entityName === entityNameOpt)
      const now = new Date().toISOString()
      if (!entity) {
        const mnemonic = wasmModule.generate_mnemonic(12)
        const createdRaw = wasmModule.create_lab_entity_wallet(
          mnemonic,
          labNetwork,
          labAddressType,
          0,
        )
        const cr = parseWasmObject(createdRaw)
        entity = {
          entityName: entityNameOpt,
          mnemonic,
          changesetJson: String(cr.changeset_json ?? ''),
          externalDescriptor: String(cr.external_descriptor ?? ''),
          internalDescriptor: String(cr.internal_descriptor ?? ''),
          network: labNetwork,
          addressType: labAddressType,
          accountId: 0,
          createdAt: now,
          updatedAt: now,
        }
        state.entities.push(entity)
        coinbaseAddress = String(cr.first_address ?? '')
        if (!coinbaseAddress) {
          throw new Error('Lab entity wallet creation failed (no first address)')
        }
      } else {
        coinbaseAddress = wasmModule.lab_entity_get_current_external_address(
          entity.mnemonic,
          entity.changesetJson,
          entity.network,
          entity.addressType,
          entity.accountId,
        )
      }
      coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(coinbaseAddress)
      newAddress = null
    } else if (targetAddress.trim()) {
      coinbaseAddress = targetAddress.trim()
      coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(coinbaseAddress)
      newAddress = null
    } else {
      const keypair = wasmModule.lab_generate_keypair()
      newAddress = { address: keypair.address, wif: keypair.wif }
      coinbaseAddress = keypair.address
      coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(keypair.address)
    }

    if (options?.ownerWalletId != null) {
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[coinbaseAddress] = walletOwnerKey(options.ownerWalletId)
    } else if (entityNameOpt != null && entityNameOpt !== '' && options?.ownerWalletId == null) {
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[coinbaseAddress] = entityNameOpt
    }

    const mempoolCopy = [...(state.mempool ?? [])]
    const selectedEntries = selectMempoolTxsForBlock(mempoolCopy)
    const mempoolTxHexes = selectedEntries.map((entry) => entry.signedTxHex)
    const totalFeesSats = selectedEntries.reduce((sum, entry) => sum + entry.feeSats, 0)
    const spentByIncluded = new Set(
      selectedEntries.flatMap((entry) => entry.inputs.map((input) => `${input.txid}:${input.vout}`)),
    )

    for (let i = 0; i < blockCountToMine; i++) {
      const txsForBlock = i === 0 ? mempoolTxHexes : []
      const feesForBlock = BigInt(i === 0 ? totalFeesSats : 0)
      const blockHex = wasmModule.lab_mine_block(
        prevHash,
        height,
        coinbaseScriptPubkeyHex,
        txsForBlock,
        feesForBlock,
      )
      applyBlockEffects(blockHex, height, i === 0 ? newAddress ?? undefined : undefined)
      if (i === 0) {
        state.mempool = (state.mempool ?? []).filter(
          (entry) =>
            !selectedEntries.some((selectedEntry) => selectedEntry.txid === entry.txid) &&
            !entry.inputs.some((input) => spentByIncluded.has(`${input.txid}:${input.vout}`)),
        )
      }
      if (i > 0) newAddress = null
      const newTip = getTip()!
      prevHash = newTip.blockHash
      height = newTip.height + 1
    }

    return this.getStateSnapshot()
  },

  async prepareLabEntityTransaction(params: {
    entityName: string
    fromAddress: string
    toAddress: string
    amountSats: number
    feeRateSatPerVb: number
  }): Promise<{
    crypto: import('./lab-api').LabEntityTransactionCryptoParams
    mempoolMetadata: import('./lab-api').LabMempoolMetadata
    totalInput: number
  }> {
    const { entityName, fromAddress, toAddress, amountSats, feeRateSatPerVb } = params
    const addressToOwner = state.addressToOwner ?? {}
    const ownerAtFrom = addressToOwner[fromAddress] ?? null
    if (ownerAtFrom !== entityName) {
      throw new Error('From address does not belong to this lab entity')
    }
    if (ownerAtFrom != null && ownerAtFrom.startsWith(WALLET_OWNER_PREFIX)) {
      throw new Error('Use the wallet Send flow for user-wallet lab spends')
    }

    const entity = state.entities.find((e) => e.entityName === entityName)
    if (!entity) {
      throw new Error(`Unknown lab entity "${entityName}"`)
    }

    const fromUtxos = state.utxos.filter((u) => u.address === fromAddress)
    if (fromUtxos.length === 0) {
      throw new Error('No UTXOs for the selected from address')
    }

    const utxosJson = JSON.stringify(
      fromUtxos.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        amount_sats: utxo.amountSats,
        script_pubkey_hex: utxo.scriptPubkeyHex,
        address: utxo.address,
      })),
    )

    const sender = entityName
    const receiver = addressToOwner[toAddress] ?? null

    const inputsDetail = fromUtxos.map((utxo) => ({
      address: utxo.address,
      amountSats: utxo.amountSats,
      owner: addressToOwner[utxo.address] ?? null,
    }))

    const totalInput = fromUtxos.reduce((sum, utxo) => sum + utxo.amountSats, 0)
    const inputs = fromUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout }))

    return {
      crypto: {
        mnemonic: entity.mnemonic,
        changesetJson: entity.changesetJson,
        network: entity.network,
        addressType: entity.addressType,
        accountId: entity.accountId,
        utxosJson,
        toAddress,
        amountSats,
        feeRateSatPerVb,
      },
      mempoolMetadata: {
        sender,
        receiver,
        feeSats: 0,
        inputs,
        inputsDetail,
        outputsDetail: [{ address: toAddress, amountSats, owner: receiver }],
        hasChange: false,
        walletChangeAddress: '',
      },
      totalInput,
    }
  },

  async finalizeLabEntityMempoolTransaction(params: {
    signedTxHex: string
    mempoolMetadata: import('./lab-api').LabMempoolMetadata
    entityName: string
    newChangesetJson: string
  }): Promise<LabState> {
    const wasmModule = await getWasm()
    const { signedTxHex, mempoolMetadata, entityName, newChangesetJson } = params

    const entity = state.entities.find((e) => e.entityName === entityName)
    if (!entity) {
      throw new Error(`Unknown lab entity "${entityName}"`)
    }
    entity.changesetJson = newChangesetJson
    entity.updatedAt = new Date().toISOString()

    const txid = wasmModule.lab_txid(signedTxHex)
    if (mempoolMetadata.hasChange) {
      const changeOut = mempoolMetadata.outputsDetail.find((o) => o.isChange)
      if (changeOut) {
        txidToChangeAddress.set(txid, changeOut.address)
      }
    }

    state.mempool = state.mempool ?? []
    state.mempool.push({
      signedTxHex,
      txid,
      sender: mempoolMetadata.sender,
      receiver: mempoolMetadata.receiver,
      feeSats: mempoolMetadata.feeSats,
      inputs: mempoolMetadata.inputs,
      inputsDetail: mempoolMetadata.inputsDetail,
      outputsDetail: mempoolMetadata.outputsDetail,
    })

    return this.getStateSnapshot()
  },

  async prepareLabWalletTransaction(params: {
    walletOwner: string
    toAddress: string
    amountSats: number
    feeRateSatPerVb: number
    walletChangeAddress: string
  }): Promise<{
    utxosJson: string
    mempoolMetadata: import('./lab-api').LabMempoolMetadata
    totalInput: number
  }> {
    const { walletOwner, toAddress, amountSats, walletChangeAddress } = params
    const addressToOwner = state.addressToOwner ?? {}

    const fromUtxos = state.utxos.filter(
      (utxo) => addressToOwner[utxo.address] === walletOwner,
    )
    if (fromUtxos.length === 0) {
      throw new Error(
        `No UTXOs available for the wallet. Owner="${walletOwner}". ` +
          `Ensure the wallet is loaded for lab (regtest) and you have mined to it.`,
      )
    }

    const utxosJson = JSON.stringify(
      fromUtxos.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        amount_sats: utxo.amountSats,
        script_pubkey_hex: utxo.scriptPubkeyHex,
        address: utxo.address,
      })),
    )

    const sender = walletOwner
    const receiver = addressToOwner[toAddress] ?? null

    const inputsDetail = fromUtxos.map((utxo) => ({
      address: utxo.address,
      amountSats: utxo.amountSats,
      owner: addressToOwner[utxo.address] ?? null,
    }))

    const totalInput = fromUtxos.reduce((sum, utxo) => sum + utxo.amountSats, 0)
    const inputs = fromUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout }))

    return {
      utxosJson,
      mempoolMetadata: {
        sender,
        receiver,
        feeSats: 0,
        inputs,
        inputsDetail,
        outputsDetail: [{ address: toAddress, amountSats, owner: receiver }],
        hasChange: false,
        walletChangeAddress,
      },
      totalInput,
    }
  },

  async addSignedTransactionToMempool(
    signedTxHex: string,
    mempoolMetadata: import('./lab-api').LabMempoolMetadata,
  ): Promise<LabState> {
    const wasmModule = await getWasm()

    if (mempoolMetadata.hasChange) {
      const createdTxid = wasmModule.lab_txid(signedTxHex)
      txidToChangeAddress.set(createdTxid, mempoolMetadata.walletChangeAddress)
    }

    const txid = wasmModule.lab_txid(signedTxHex)

    state.mempool = state.mempool ?? []
    state.mempool.push({
      signedTxHex,
      txid,
      sender: mempoolMetadata.sender,
      receiver: mempoolMetadata.receiver,
      feeSats: mempoolMetadata.feeSats,
      inputs: mempoolMetadata.inputs,
      inputsDetail: mempoolMetadata.inputsDetail,
      outputsDetail: mempoolMetadata.outputsDetail,
    })

    return this.getStateSnapshot()
  },
}

expose(labService)
