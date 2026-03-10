import { expose } from 'comlink'
import type { RegtestAddress, RegtestBlock, RegtestState } from './regtest-api'

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
}

function getTip(): RegtestBlock | null {
  if (state.blocks.length === 0) return null
  return state.blocks[state.blocks.length - 1]
}

function applyBlockEffects(blockHex: string, height: number, newAddress?: RegtestAddress): void {
  const wasmModule = wasm!
  const effects = wasmModule.regtest_block_effects(blockHex) as {
    new_utxos: { txid: string; vout: number; address: string; amount_sats: number; script_pubkey_hex: string }[]
    spent: { txid: string; vout: number }[]
  }

  for (const s of effects.spent) {
    state.utxos = state.utxos.filter((u) => !(u.txid === s.txid && u.vout === s.vout))
  }
  for (const u of effects.new_utxos) {
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
    state = JSON.parse(JSON.stringify(newState))
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
    const outputsJson = JSON.stringify([
      { address: toAddress, amount_sats: amountSats },
    ])

    const unsignedTxHex = wasmModule.regtest_build_transaction(
      utxosJson,
      outputsJson,
      feeRateSatPerVb,
    )
    const signedTxHex = wasmModule.regtest_sign_transaction(
      unsignedTxHex,
      controlled.wif,
      utxosJson,
    )

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

    return this.getStateSnapshot()
  },
}

expose(regtestService)
