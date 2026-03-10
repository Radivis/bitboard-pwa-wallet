import { expose } from 'comlink'
import type {
  RegtestAddress,
  RegtestBlock,
  RegtestState,
  RegtestTxDetails,
} from './regtest-api'

let wasm: typeof import('@/wasm-pkg/bitboard_crypto') | null = null

async function getWasm() {
  if (!wasm) {
    wasm = await import('@/wasm-pkg/bitboard_crypto')
  }
  return wasm
}

let state: RegtestState = {
  blocks: [],
  utxos: [],
  addresses: [],
  transactions: [],
  txDetails: [],
}

/** Txid -> change address for txs we create (used to mark change outputs). Not persisted. */
const txidToChangeAddress = new Map<string, string>()

function getTip(): RegtestBlock | null {
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

function applyBlockEffects(blockHex: string, height: number, newAddress?: RegtestAddress): void {
  const wasmModule = wasm!
  const rawEffects = wasmModule.regtest_block_effects(blockHex)
  const { spent, new_utxos: newUtxos, transactions, block_time } = parseBlockEffects(rawEffects)

  const utxoMap = new Map(state.utxos.map((u) => [`${u.txid}:${u.vout}`, u]))
  const blockTime = block_time ?? 0

  for (const tx of transactions) {
    const inputs: { address: string; amountSats: number }[] = []
    let largest: { address: string; amountSats: number } | null = null
    for (const inp of tx.inputs) {
      const key = `${inp.prev_txid}:${inp.prev_vout}`
      const utxo = utxoMap.get(key)
      if (utxo) {
        inputs.push({ address: utxo.address, amountSats: utxo.amountSats })
        if (!largest || utxo.amountSats > largest.amountSats) {
          largest = { address: utxo.address, amountSats: utxo.amountSats }
        }
      }
    }
    const changeAddressForTx = txidToChangeAddress.get(tx.txid)
    const outputs = (tx.outputs ?? []).map((o) => ({
      address: o.address,
      amountSats: o.amount_sats,
      isChange: changeAddressForTx !== undefined && o.address === changeAddressForTx,
    }))
    if (largest) {
      state.transactions.push({
        txid: tx.txid,
        largestInputAddress: largest.address,
        largestInputAmountSats: largest.amountSats,
      })
    }
    if (inputs.length > 0 || outputs.length > 0) {
      state.txDetails.push({
        txid: tx.txid,
        blockHeight: height,
        blockTime,
        inputs,
        outputs,
      })
    }
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

const regtestService = {
  async loadState(newState: RegtestState): Promise<void> {
    const cloned = JSON.parse(JSON.stringify(newState)) as RegtestState
    state = {
      blocks: cloned.blocks ?? [],
      utxos: cloned.utxos ?? [],
      addresses: cloned.addresses ?? [],
      transactions: cloned.transactions ?? [],
      txDetails: cloned.txDetails ?? [],
    }
  },

  async getTransaction(txid: string): Promise<RegtestTxDetails | null> {
    return state.txDetails.find((t) => t.txid === txid) ?? null
  },

  async getBlockCount(): Promise<number> {
    const tip = getTip()
    return tip ? tip.height + 1 : 0
  },

  async getAddresses(): Promise<RegtestAddress[]> {
    const controlled = new Map(state.addresses.map((a) => [a.address, a]))
    const fromUtxos = new Set(state.utxos.map((u) => u.address))
    const result: RegtestAddress[] = [...state.addresses]
    for (const addr of fromUtxos) {
      if (!controlled.has(addr)) {
        result.push({ address: addr, wif: '' })
      }
    }
    return result
  },

  async getStateSnapshot(): Promise<RegtestState> {
    return JSON.parse(JSON.stringify(state))
  },

  async mineBlocks(count: number, targetAddress: string): Promise<RegtestState> {
    const wasmModule = await getWasm()
    const tip = getTip()

    let prevHash = ''
    let height = 0
    if (tip) {
      prevHash = tip.blockHash
      height = tip.height + 1
    }

    let coinbaseScriptPubkeyHex: string
    let newAddress: RegtestAddress | null = null

    if (targetAddress.trim()) {
      coinbaseScriptPubkeyHex = wasmModule.regtest_address_to_script_pubkey_hex(
        targetAddress.trim(),
      )
    } else {
      const keypair = wasmModule.regtest_generate_keypair()
      newAddress = { address: keypair.address, wif: keypair.wif }
      coinbaseScriptPubkeyHex = wasmModule.regtest_address_to_script_pubkey_hex(keypair.address)
    }

    for (let i = 0; i < count; i++) {
      const blockHex = wasmModule.regtest_mine_block(
        prevHash,
        height,
        coinbaseScriptPubkeyHex,
        [],
      )
      applyBlockEffects(blockHex, height, i === 0 ? newAddress ?? undefined : undefined)
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
  ): Promise<RegtestState> {
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
    const changeAddress: RegtestAddress = { address: changeKeypair.address, wif: changeKeypair.wif }

    const buildResult = wasmModule.regtest_build_transaction_with_change(
      utxosJson,
      toAddress,
      BigInt(amountSats),
      feeRateSatPerVb,
      changeAddress.address,
    )
    const { tx_hex: unsignedTxHex, fee_sats: _feeSats, has_change } =
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

    const tip = getTip()
    if (!tip) throw new Error('Cannot create transaction: mine at least one block first')
    const prevHash = tip.blockHash
    const height = tip.height + 1

    const keypair = wasmModule.regtest_generate_keypair()
    const newAddr: RegtestAddress = { address: keypair.address, wif: keypair.wif }
    const coinbaseScriptHex = wasmModule.regtest_address_to_script_pubkey_hex(keypair.address)

    const blockHex = wasmModule.regtest_mine_block(
      prevHash,
      height,
      coinbaseScriptHex,
      [signedTxHex],
    )
    applyBlockEffects(blockHex, height, newAddr)
    if (has_change) {
      txidToChangeAddress.delete(wasmModule.regtest_txid(signedTxHex))
    }

    return this.getStateSnapshot()
  },
}

expose(regtestService)
