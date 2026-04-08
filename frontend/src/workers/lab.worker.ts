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
  isCoinbaseFromBlockEffectsTx,
  LAB_COINBASE_PREV_TXID_HEX,
  LAB_COINBASE_PREV_VOUT,
  LAB_COINBASE_SEQUENCE,
} from '@/lib/lab-operations'
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

/**
 * Txid -> change output address for txs we create. Used when applying block effects so change
 * is attributed to the same owner as inputs. Rebuilt from persisted mempool on {@link loadState}
 * (the map itself is not part of {@link LabState} JSON).
 */
const txidToChangeAddress = new Map<string, string>()

/** Bech32 (bc1/tb1/bcrt1) addresses can differ by case; BIP173 compares case-insensitively. */
function labAddressesEqual(a: string, b: string): boolean {
  if (a === b) return true
  const x = a.trim()
  const y = b.trim()
  if (x === y) return true
  if (/^(bc|tb|bcrt)1/i.test(x) && /^(bc|tb|bcrt)1/i.test(y)) {
    return x.toLowerCase() === y.toLowerCase()
  }
  return false
}

/** Resolves owner when WASM-reported addresses differ in bech32 casing from stored map keys. */
function lookupOwnerForLabAddress(
  address: string,
  addressToOwner: Record<string, string>,
): string | undefined {
  const direct = addressToOwner[address]
  if (direct !== undefined) return direct
  for (const [storedAddr, owner] of Object.entries(addressToOwner)) {
    if (labAddressesEqual(storedAddr, address)) return owner
  }
  return undefined
}

function rebuildTxidToChangeAddressFromMempool(mempool: MempoolEntry[]): void {
  for (const entry of mempool) {
    const changeOut = entry.outputsDetail.find((o) => o.isChange)
    if (changeOut) {
      txidToChangeAddress.set(entry.txid, changeOut.address)
    }
  }
}

function rebuildTxidToChangeAddressFromState(): void {
  txidToChangeAddress.clear()
  for (const op of state.txOperations ?? []) {
    if (op.changeAddress) {
      txidToChangeAddress.set(op.txid, op.changeAddress)
    }
  }
  rebuildTxidToChangeAddressFromMempool(state.mempool ?? [])
}

/**
 * Fills missing output owners for legacy rows where change was not linked (e.g. mined after
 * reload when txid→change map was empty). Requires one unowned output and at least one owned.
 */
function inferMissingLabOutputOwners(tx: LabTxDetails): LabTxDetails {
  if (tx.isCoinbase) return tx
  const firstOwner = tx.inputs.find((i) => i.owner != null)?.owner ?? null
  if (firstOwner == null) return tx
  if (tx.inputs.some((i) => i.owner != null && i.owner !== firstOwner)) return tx

  const outMissingOwner = tx.outputs.filter((o) => !o.owner)
  const outWithOwner = tx.outputs.filter((o) => o.owner)
  if (outMissingOwner.length !== 1 || outWithOwner.length < 1) return tx

  const patchAddr = outMissingOwner[0].address
  return {
    ...tx,
    outputs: tx.outputs.map((o) => {
      if (o.owner != null) return o
      if (labAddressesEqual(o.address, patchAddr)) {
        return { ...o, owner: firstOwner, isChange: true }
      }
      return o
    }),
  }
}

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
    const isCb = isCoinbaseFromBlockEffectsTx(tx)
    const changeFromOp = state.txOperations?.find((o) => o.txid === tx.txid)?.changeAddress
    const changeAddressForTx =
      txidToChangeAddress.get(tx.txid) ?? changeFromOp ?? undefined

    let inputs: LabTxDetails['inputs']
    let firstInputAddress: string | null = null

    if (isCb) {
      inputs = [
        {
          address: '',
          amountSats: 0,
          owner: null,
          prevTxid: LAB_COINBASE_PREV_TXID_HEX,
          prevVout: LAB_COINBASE_PREV_VOUT,
          sequence: LAB_COINBASE_SEQUENCE,
        },
      ]
    } else {
      inputs = []
      for (const input of tx.inputs) {
        const key = `${input.prev_txid}:${input.prev_vout}`
        const utxo = utxoMap.get(key)
        if (utxo) {
          const owner = lookupOwnerForLabAddress(utxo.address, addressToOwner) ?? null
          inputs.push({ address: utxo.address, amountSats: utxo.amountSats, owner })
          if (firstInputAddress === null) firstInputAddress = utxo.address
        }
      }
    }

    const sender = isCb
      ? null
      : firstInputAddress
        ? lookupOwnerForLabAddress(firstInputAddress, addressToOwner) ?? null
        : null

    const outputs = (tx.outputs ?? []).map((output) => {
      const isChange =
        changeAddressForTx !== undefined && labAddressesEqual(output.address, changeAddressForTx)
      const owner = isChange && sender
        ? sender
        : (lookupOwnerForLabAddress(output.address, addressToOwner) ?? null)
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
      ? (lookupOwnerForLabAddress(firstNonChangeOutput.address, addressToOwner) ?? null)
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
    state.transactions.push({
      txid: tx.txid,
      sender,
      receiver,
      isCoinbase: isCb,
    })
    if (inputs.length > 0 || outputs.length > 0) {
      state.txDetails.push({
        txid: tx.txid,
        blockHeight: height,
        blockTime,
        confirmations: 0,
        isCoinbase: isCb,
        inputs,
        outputs,
      })
    }
    txidToChangeAddress.delete(tx.txid)
  }
}

function synthesizeCoinbaseTxFromNewUtxos(
  newUtxos: BlockEffectsParsed['new_utxos'],
): BlockEffectsTx[] {
  if (!Array.isArray(newUtxos) || newUtxos.length === 0) return []
  const byTxid = new Map<string, BlockEffectsParsed['new_utxos']>()
  for (const u of newUtxos) {
    const txid = String(u.txid)
    const list = byTxid.get(txid) ?? []
    list.push(u)
    byTxid.set(txid, list)
  }
  const firstTxid = String(newUtxos[0].txid)
  const rows = byTxid.get(firstTxid) ?? []
  return [
    {
      txid: firstTxid,
      inputs: [],
      outputs: rows.map((u) => {
        const row = u as unknown as Record<string, unknown>
        return {
          address: String(u.address),
          amount_sats: readSatsFromUtxoRow(row),
        }
      }),
    },
  ]
}

function applyBlockEffects(blockHex: string, height: number, newAddress?: LabAddress): void {
  const wasmModule = labWasmModule!
  const rawEffects = wasmModule.lab_block_effects(blockHex)
  let { spent, new_utxos: newUtxos, transactions, block_time } = parseBlockEffects(rawEffects)
  const blockTime = block_time ?? 0

  if (transactions.length === 0 && newUtxos.length > 0) {
    transactions = synthesizeCoinbaseTxFromNewUtxos(newUtxos)
  }

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
  if (tx.isCoinbase) return 0
  const totalInputs = tx.inputs.reduce((sum, input) => sum + input.amountSats, 0)
  const totalOutputs = tx.outputs.reduce((sum, output) => sum + output.amountSats, 0)
  return Math.max(totalInputs - totalOutputs, 0)
}

function minedByFromBlockTxs(
  blockTxs: LabTxDetails[],
  addressToOwner: Record<string, string>,
): string | null {
  const coinbase = blockTxs.find((tx) => tx.isCoinbase || tx.inputs.length === 0)
  const out0 = coinbase?.outputs[0]
  if (!out0) return null
  const fromStoredDetail = out0.owner ?? null
  if (fromStoredDetail) return fromStoredDetail
  return lookupOwnerForLabAddress(out0.address, addressToOwner) ?? null
}

function minedByForBlockHeight(height: number): string | null {
  const op = state.mineOperations?.find((m) => m.height === height)
  if (op != null && op.minedByKey != null && op.minedByKey !== '') {
    return op.minedByKey
  }
  const blockTxs = state.txDetails.filter((tx) => tx.blockHeight === height)
  return minedByFromBlockTxs(blockTxs, state.addressToOwner ?? {})
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
        isCoinbase: tx.isCoinbase,
      }
    })
}

/**
 * Resolves coinbase recipient and template "mined by" label without mutating lab state.
 * Mirrors {@link mineBlocks} branching (entity → explicit target → anonymous lab entity).
 */
async function resolveTemplateCoinbase(
  params: LabCurrentBlockTemplateParams,
  wasmModule: Awaited<ReturnType<typeof getWasm>>,
): Promise<{ address: string; minedBy: string | null }> {
  const labNetwork = params.labNetwork ?? 'regtest'
  const labAddressType = params.labAddressType ?? 'segwit'

  const targetArg =
    params.ownerType === 'wallet'
      ? (params.walletCurrentAddress ?? '').trim()
      : params.targetAddress.trim()

  const entityNameOpt =
    params.ownerType === 'name' ? (params.ownerName?.trim() ?? '') : ''

  const firstAddressFromNewEntityWallet = (): string => {
    const mnemonic = wasmModule.generate_mnemonic(12)
    const createdRaw = wasmModule.create_lab_entity_wallet(
      mnemonic,
      labNetwork,
      labAddressType,
      0,
    )
    const cr = parseWasmObject(createdRaw)
    const first = String(cr.first_address ?? '')
    if (!first) {
      throw new Error('Lab entity wallet creation failed (no first address)')
    }
    return first
  }

  if (entityNameOpt !== '') {
    const entity = state.entities.find((e) => e.entityName === entityNameOpt)
    if (entity) {
      return {
        address: wasmModule.lab_entity_get_current_external_address(
          entity.mnemonic,
          entity.changesetJson,
          entity.network,
          entity.addressType,
          entity.accountId,
        ),
        minedBy: entityNameOpt,
      }
    }
    return {
      address: firstAddressFromNewEntityWallet(),
      minedBy: entityNameOpt,
    }
  }

  if (targetArg !== '') {
    const minedBy =
      params.ownerType === 'wallet' && params.ownerWalletId != null
        ? walletOwnerKey(params.ownerWalletId)
        : null
    return { address: targetArg, minedBy }
  }

  const anonymousName = `Anonymous-${crypto.randomUUID()}`
  return {
    address: firstAddressFromNewEntityWallet(),
    minedBy: anonymousName,
  }
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
      minedBy: minedByForBlockHeight(block.height),
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

  const { address: targetAddress, minedBy } = await resolveTemplateCoinbase(params, wasmModule)

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

  const transactions: LabBlockTransactionSummary[] = previewEffects.transactions.map((tx) => {
    const matchedEntry = entryByTxid.get(tx.txid)
    const isCoinbase = isCoinbaseFromBlockEffectsTx(tx)
    return {
      txid: tx.txid,
      sender: matchedEntry?.sender ?? null,
      receiver: isCoinbase ? minedBy : (matchedEntry?.receiver ?? null),
      feeSats: matchedEntry?.feeSats ?? 0,
      isCoinbase,
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
      mineOperations: cloned.mineOperations ?? [],
      txOperations: cloned.txOperations ?? [],
    }
    rebuildTxidToChangeAddressFromState()
  },

  async getTransaction(txid: string): Promise<LabTxDetails | null> {
    const mempoolEntry = state.mempool.find((entry) => entry.txid === txid)
    if (mempoolEntry) {
      return inferMissingLabOutputOwners({
        txid: mempoolEntry.txid,
        blockHeight: -1,
        blockTime: 0,
        confirmations: 0,
        isCoinbase: false,
        inputs: mempoolEntry.inputsDetail,
        outputs: mempoolEntry.outputsDetail,
      })
    }
    const details = state.txDetails.find((tx) => tx.txid === txid)
    if (!details) return null
    const blockCount = getTip() ? getTip()!.height + 1 : 0
    return inferMissingLabOutputOwners({
      ...details,
      confirmations: blockCount - details.blockHeight,
    })
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
    /** Lab entity name to record for coinbase ownership (not used for wallet or bare target). */
    let ownerForCoinbase: string | undefined

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
      ownerForCoinbase = entityNameOpt
    } else if (targetAddress.trim()) {
      coinbaseAddress = targetAddress.trim()
      coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(coinbaseAddress)
      newAddress = null
    } else {
      const anonymousName = `Anonymous-${crypto.randomUUID()}`
      const now = new Date().toISOString()
      const mnemonic = wasmModule.generate_mnemonic(12)
      const createdRaw = wasmModule.create_lab_entity_wallet(
        mnemonic,
        labNetwork,
        labAddressType,
        0,
      )
      const cr = parseWasmObject(createdRaw)
      const entity = {
        entityName: anonymousName,
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
        throw new Error('Anonymous lab entity wallet creation failed (no first address)')
      }
      coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(coinbaseAddress)
      newAddress = null
      ownerForCoinbase = anonymousName
    }

    if (options?.ownerWalletId != null) {
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[coinbaseAddress] = walletOwnerKey(options.ownerWalletId)
    } else if (ownerForCoinbase != null) {
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[coinbaseAddress] = ownerForCoinbase
    }

    const minedByKey: string | null =
      options?.ownerWalletId != null
        ? walletOwnerKey(options.ownerWalletId)
        : ownerForCoinbase ?? null

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
      const minedAtHeight = height
      const tipAfter = getTip()!
      const coinbaseDetail = state.txDetails.find(
        (d) => d.blockHeight === minedAtHeight && d.isCoinbase,
      )
      state.mineOperations = state.mineOperations ?? []
      state.mineOperations.push({
        height: minedAtHeight,
        blockHash: tipAfter.blockHash,
        minedByKey,
        coinbaseTxid: coinbaseDetail?.txid ?? null,
        coinbaseVout: 0,
        createdAt: new Date().toISOString(),
      })
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
    const changeOut = mempoolMetadata.hasChange
      ? mempoolMetadata.outputsDetail.find((o) => o.isChange)
      : undefined

    state.txOperations = state.txOperations ?? []
    state.txOperations.push({
      txid,
      senderKey: entityName,
      changeAddress: changeOut?.address ?? null,
      changeVout: null,
      payloadJson: '{}',
    })
    rebuildTxidToChangeAddressFromState()

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

    const txid = wasmModule.lab_txid(signedTxHex)

    const senderKey = mempoolMetadata.sender ?? ''
    state.txOperations = state.txOperations ?? []
    state.txOperations.push({
      txid,
      senderKey,
      changeAddress: mempoolMetadata.hasChange ? mempoolMetadata.walletChangeAddress : null,
      changeVout: null,
      payloadJson: '{}',
    })
    rebuildTxidToChangeAddressFromState()

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
