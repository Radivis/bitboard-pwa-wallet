import { expose } from 'comlink'
import type {
  LabAddress,
  LabBlock,
  LabState,
  LabTxDetails,
  MempoolEntry,
} from './lab-api'

let wasm: typeof import('@/wasm-pkg/bitboard_crypto') | null = null

async function getWasm() {
  if (!wasm) {
    wasm = await import('@/wasm-pkg/bitboard_crypto')
  }
  return wasm
}

let state: LabState = {
  blocks: [],
  utxos: [],
  addresses: [],
  addressToOwner: {},
  mempool: [],
  transactions: [],
  txDetails: [],
}

/** Txid -> change address for txs we create (used to mark change outputs). Not persisted. */
const txidToChangeAddress = new Map<string, string>()

function selectMempoolTxsForBlock(mempool: MempoolEntry[]): MempoolEntry[] {
  const sorted = [...mempool].sort((a, b) => {
    if (b.feeSats !== a.feeSats) return b.feeSats - a.feeSats
    return Math.random() - 0.5
  })
  const spentBySelected = new Set<string>()
  const selected: MempoolEntry[] = []
  for (const entry of sorted) {
    const overlaps = entry.inputs.some((i) => spentBySelected.has(`${i.txid}:${i.vout}`))
    if (!overlaps) {
      selected.push(entry)
      for (const i of entry.inputs) spentBySelected.add(`${i.txid}:${i.vout}`)
    }
  }
  return selected
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

function applyBlockEffects(blockHex: string, height: number, newAddress?: LabAddress): void {
  const wasmModule = wasm!
  const rawEffects = wasmModule.regtest_block_effects(blockHex)
  const { spent, new_utxos: newUtxos, transactions, block_time } = parseBlockEffects(rawEffects)

  const utxoMap = new Map(state.utxos.map((u) => [`${u.txid}:${u.vout}`, u]))
  const addressToOwner = state.addressToOwner ?? {}
  const blockTime = block_time ?? 0

  for (const tx of transactions) {
    const inputs: { address: string; amountSats: number; owner?: string | null }[] = []
    let firstInputAddress: string | null = null
    for (const inp of tx.inputs) {
      const key = `${inp.prev_txid}:${inp.prev_vout}`
      const utxo = utxoMap.get(key)
      if (utxo) {
        const owner = addressToOwner[utxo.address] ?? null
        inputs.push({ address: utxo.address, amountSats: utxo.amountSats, owner })
        if (firstInputAddress === null) firstInputAddress = utxo.address
      }
    }
    const sender = firstInputAddress ? (addressToOwner[firstInputAddress] ?? null) : null
    const changeAddressForTx = txidToChangeAddress.get(tx.txid)
    const outputs = (tx.outputs ?? []).map((o) => {
      const isChange = changeAddressForTx !== undefined && o.address === changeAddressForTx
      const owner = isChange && sender
        ? sender
        : (addressToOwner[o.address] ?? null)
      if (isChange && sender) {
        state.addressToOwner = state.addressToOwner ?? {}
        state.addressToOwner[o.address] = sender
      }
      return {
        address: o.address,
        amountSats: o.amount_sats,
        isChange,
        owner,
      }
    })
    const firstNonChangeOutput = outputs.find((o) => !o.isChange)
    const receiver = firstNonChangeOutput
      ? (addressToOwner[firstNonChangeOutput.address] ?? null)
      : null
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

  for (const s of spent) {
    state.utxos = state.utxos.filter((u) => !(u.txid === s.txid && u.vout === s.vout))
  }
  for (const u of newUtxos) {
    state.utxos.push({
      txid: u.txid,
      vout: u.vout,
      address: u.address,
      amountSats: u.amount_sats,
      scriptPubkeyHex: u.script_pubkey_hex,
    })
  }
  if (newAddress) {
    state.addresses.push(newAddress)
  }

  const blockHash = wasmModule.regtest_block_hash(blockHex)
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
    const mempoolEntry = state.mempool.find((e) => e.txid === txid)
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
    const details = state.txDetails.find((t) => t.txid === txid)
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
    const controlled = new Map(state.addresses.map((a) => [a.address, a]))
    const fromUtxos = new Set(state.utxos.map((u) => u.address))
    const result: LabAddress[] = [...state.addresses]
    for (const addr of fromUtxos) {
      if (!controlled.has(addr)) {
        result.push({ address: addr, wif: '' })
      }
    }
    return result
  },

  async getStateSnapshot(): Promise<LabState> {
    return JSON.parse(JSON.stringify(state))
  },

  async mineBlocks(
    count: number,
    targetAddress: string,
    ownerName?: string,
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
      coinbaseScriptPubkeyHex = wasmModule.regtest_address_to_script_pubkey_hex(coinbaseAddress)
    } else {
      const keypair = wasmModule.regtest_generate_keypair()
      newAddress = { address: keypair.address, wif: keypair.wif }
      coinbaseAddress = keypair.address
      coinbaseScriptPubkeyHex = wasmModule.regtest_address_to_script_pubkey_hex(keypair.address)
    }

    if (ownerName?.trim()) {
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[coinbaseAddress] = ownerName.trim()
    }

    const mempoolCopy = [...(state.mempool ?? [])]
    const selectedEntries = selectMempoolTxsForBlock(mempoolCopy)
    const mempoolTxHexes = selectedEntries.map((e) => e.signedTxHex)
    const totalFeesSats = selectedEntries.reduce((s, e) => s + e.feeSats, 0)
    const spentByIncluded = new Set(
      selectedEntries.flatMap((e) => e.inputs.map((i) => `${i.txid}:${i.vout}`)),
    )

    for (let i = 0; i < count; i++) {
      const txsForBlock = i === 0 ? mempoolTxHexes : []
      const feesForBlock = BigInt(i === 0 ? totalFeesSats : 0)
      const blockHex = wasmModule.regtest_mine_block(
        prevHash,
        height,
        coinbaseScriptPubkeyHex,
        txsForBlock,
        feesForBlock,
      )
      applyBlockEffects(blockHex, height, i === 0 ? newAddress ?? undefined : undefined)
      if (i === 0) {
        state.mempool = (state.mempool ?? []).filter(
          (e) =>
            !selectedEntries.some((s) => s.txid === e.txid) &&
            !e.inputs.some((inp) => spentByIncluded.has(`${inp.txid}:${inp.vout}`)),
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
      fromUtxos.map((u) => ({
        txid: u.txid,
        vout: u.vout,
        amount_sats: u.amountSats,
        script_pubkey_hex: u.scriptPubkeyHex,
      })),
    )

    const changeKeypair = wasmModule.regtest_generate_keypair()
    const changeAddress: LabAddress = { address: changeKeypair.address, wif: changeKeypair.wif }

    const buildResult = wasmModule.regtest_build_transaction_with_change(
      utxosJson,
      toAddress,
      BigInt(amountSats),
      feeRateSatPerVb,
      changeAddress.address,
    )
    const { tx_hex: unsignedTxHex, fee_sats: feeSats, has_change } =
      typeof buildResult === 'string' ? JSON.parse(buildResult) : buildResult

    const signedTxHex = wasmModule.regtest_sign_transaction(
      unsignedTxHex,
      controlled.wif,
      utxosJson,
    )

    if (has_change) {
      state.addresses.push(changeAddress)
      const createdTxid = wasmModule.regtest_txid(signedTxHex)
      txidToChangeAddress.set(createdTxid, changeAddress.address)
    }

    const addressToOwner = state.addressToOwner ?? {}
    const sender = addressToOwner[fromAddress] ?? null
    const receiver = addressToOwner[toAddress] ?? null

    const inputsDetail = fromUtxos.map((u) => ({
      address: u.address,
      amountSats: u.amountSats,
      owner: addressToOwner[u.address] ?? null,
    }))

    const totalInput = fromUtxos.reduce((s, u) => s + u.amountSats, 0)
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

    const txid = wasmModule.regtest_txid(signedTxHex)
    const inputs = fromUtxos.map((u) => ({ txid: u.txid, vout: u.vout }))

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

  async createTransactionFromExternalSigner(
    walletOwnerOrFromAddress: string,
    wifOrAddressToWif: string | Record<string, string>,
    toAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
    walletChangeAddress?: string,
  ): Promise<LabState> {
    const wasmModule = await getWasm()
    const addressToOwner = state.addressToOwner ?? {}

    const isMultiAddress = typeof wifOrAddressToWif === 'object' && wifOrAddressToWif !== null
    let fromUtxos: typeof state.utxos
    let addressToWif: Record<string, string>

    if (isMultiAddress) {
      const addressToWifMap = wifOrAddressToWif as Record<string, string>
      fromUtxos = state.utxos.filter(
        (u) =>
          addressToOwner[u.address] === walletOwnerOrFromAddress &&
          addressToWifMap[u.address] !== undefined,
      )
      addressToWif = addressToWifMap
    } else {
      const fromAddress = walletOwnerOrFromAddress
      const wif = wifOrAddressToWif as string
      fromUtxos = state.utxos.filter((u) => u.address === fromAddress)
      if (fromUtxos.length === 0) {
        throw new Error('No UTXOs available for the from address')
      }
      addressToWif = { [fromAddress]: wif }
    }

    if (fromUtxos.length === 0) {
      throw new Error(
        'No UTXOs available for the wallet. Ensure addresses have WIFs and UTXOs are owned by the wallet.',
      )
    }

    const utxosJson = JSON.stringify(
      fromUtxos.map((u) => ({
        txid: u.txid,
        vout: u.vout,
        amount_sats: u.amountSats,
        script_pubkey_hex: u.scriptPubkeyHex,
        address: u.address,
      })),
    )

    const useWalletChange =
      isMultiAddress &&
      walletChangeAddress &&
      addressToWif[walletChangeAddress] !== undefined

    let changeAddress: LabAddress
    if (useWalletChange) {
      changeAddress = {
        address: walletChangeAddress,
        wif: addressToWif[walletChangeAddress]!,
      }
    } else {
      const changeKeypair = wasmModule.regtest_generate_keypair()
      changeAddress = { address: changeKeypair.address, wif: changeKeypair.wif }
    }

    const buildResult = wasmModule.regtest_build_transaction_with_change(
      utxosJson,
      toAddress,
      BigInt(amountSats),
      feeRateSatPerVb,
      changeAddress.address,
    )
    const { tx_hex: unsignedTxHex, fee_sats: feeSats, has_change } =
      typeof buildResult === 'string' ? JSON.parse(buildResult) : buildResult

    const addressToWifJson = JSON.stringify(addressToWif)
    const signedTxHex = wasmModule.regtest_sign_transaction_multi(
      unsignedTxHex,
      utxosJson,
      addressToWifJson,
    )

    if (has_change) {
      if (!useWalletChange) {
        state.addresses.push(changeAddress)
      }
      const createdTxid = wasmModule.regtest_txid(signedTxHex)
      txidToChangeAddress.set(createdTxid, changeAddress.address)
    }

    const sender = isMultiAddress ? walletOwnerOrFromAddress : (addressToOwner[fromUtxos[0]!.address] ?? null)
    const receiver = addressToOwner[toAddress] ?? null

    const inputsDetail = fromUtxos.map((u) => ({
      address: u.address,
      amountSats: u.amountSats,
      owner: addressToOwner[u.address] ?? null,
    }))

    const totalInput = fromUtxos.reduce((s, u) => s + u.amountSats, 0)
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

    const txid = wasmModule.regtest_txid(signedTxHex)
    const inputs = fromUtxos.map((u) => ({ txid: u.txid, vout: u.vout }))

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
}

expose(labService)
