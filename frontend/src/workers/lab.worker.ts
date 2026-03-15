import { expose } from 'comlink'
import type {
  LabAddress,
  LabBlock,
  LabState,
  LabTxDetails,
  MempoolEntry,
} from './lab-api'
import { EMPTY_LAB_STATE } from './lab-api'
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

function addNewUtxos(
  newUtxos: {
    txid: string
    vout: number
    address: string
    amount_sats: number
    script_pubkey_hex: string
  }[],
): void {
  for (const utxo of newUtxos) {
    state.utxos.push({
      txid: utxo.txid,
      vout: utxo.vout,
      address: utxo.address,
      amountSats: utxo.amount_sats,
      scriptPubkeyHex: utxo.script_pubkey_hex,
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

const labService = {
  async loadState(newState: LabState): Promise<void> {
    const cloned = JSON.parse(JSON.stringify(newState)) as LabState
    state = {
      blocks: cloned.blocks ?? [],
      utxos: cloned.utxos ?? [],
      addresses: cloned.addresses ?? [],
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
    options?: { ownerName?: string; ownerWalletId?: number },
  ): Promise<LabState> {
    const wasmModule = await getWasm()
    const tip = getTip()

    let prevHash = ''
    let height = 0
    if (tip) {
      prevHash = tip.blockHash
      height = tip.height + 1
    }

    let coinbaseScriptPubkeyHex: string
    let newAddress: LabAddress | null = null
    let coinbaseAddress: string

    if (targetAddress.trim()) {
      coinbaseAddress = targetAddress.trim()
      coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(coinbaseAddress)
    } else {
      const keypair = wasmModule.lab_generate_keypair()
      newAddress = { address: keypair.address, wif: keypair.wif }
      coinbaseAddress = keypair.address
      coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(keypair.address)
    }

    if (options?.ownerWalletId != null) {
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[coinbaseAddress] = walletOwnerKey(options.ownerWalletId)
    } else if (options?.ownerName?.trim()) {
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[coinbaseAddress] = options.ownerName.trim()
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

  async createTransaction(
    fromAddress: string,
    toAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
  ): Promise<LabState> {
    const wasmModule = await getWasm()

    const fromUtxos = state.utxos.filter((u) => u.address === fromAddress)
    const controlled = state.addresses.find((a) => a.address === fromAddress)
    if (!controlled) {
      throw new Error('From address must be a controlled address (mined with random target)')
    }

    const utxosJson = JSON.stringify(
      fromUtxos.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        amount_sats: utxo.amountSats,
        script_pubkey_hex: utxo.scriptPubkeyHex,
      })),
    )

    const changeKeypair = wasmModule.lab_generate_keypair()
    const changeAddress: LabAddress = { address: changeKeypair.address, wif: changeKeypair.wif }

    const buildResult = wasmModule.lab_build_transaction_with_change(
      utxosJson,
      toAddress,
      BigInt(amountSats),
      feeRateSatPerVb,
      changeAddress.address,
    )
    const { tx_hex: unsignedTxHex, fee_sats: feeSats, has_change } =
      typeof buildResult === 'string' ? JSON.parse(buildResult) : buildResult

    const signedTxHex = wasmModule.lab_sign_transaction(
      unsignedTxHex,
      controlled.wif,
      utxosJson,
    )

    if (has_change) {
      state.addresses.push(changeAddress)
      const createdTxid = wasmModule.lab_txid(signedTxHex)
      txidToChangeAddress.set(createdTxid, changeAddress.address)
    }

    const addressToOwner = state.addressToOwner ?? {}
    const sender = addressToOwner[fromAddress] ?? null
    const receiver = addressToOwner[toAddress] ?? null

    const inputsDetail = fromUtxos.map((utxo) => ({
      address: utxo.address,
      amountSats: utxo.amountSats,
      owner: addressToOwner[utxo.address] ?? null,
    }))

    const totalInput = fromUtxos.reduce((sum, utxo) => sum + utxo.amountSats, 0)
    const outputsDetail: {
      address: string
      amountSats: number
      isChange?: boolean
      owner?: string | null
    }[] = has_change
      ? [
          { address: toAddress, amountSats, owner: receiver },
          {
            address: changeAddress.address,
            amountSats: totalInput - amountSats - feeSats,
            isChange: true,
            owner: sender,
          },
        ]
      : [{ address: toAddress, amountSats: totalInput - feeSats, owner: receiver }]

    const txid = wasmModule.lab_txid(signedTxHex)
    const inputs = fromUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout }))

    state.mempool = state.mempool ?? []
    state.mempool.push({
      signedTxHex,
      txid,
      sender,
      receiver,
      feeSats,
      inputs,
      inputsDetail,
      outputsDetail,
    })

    return this.getStateSnapshot()
  },

  async prepareLabWalletTransaction(
    walletOwner: string,
    toAddress: string,
    amountSats: number,
    _feeRateSatPerVb: number,
    walletChangeAddress: string,
  ): Promise<{
    utxosJson: string
    mempoolMetadata: import('./lab-api').LabMempoolMetadata
    totalInput: number
  }> {
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
