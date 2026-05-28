/** WASM `lab_block_effects` JSON shapes (snake_case). */

export interface WireBlockEffectsTxInput {
  prev_txid: string
  prev_vout: number
}

export interface WireBlockEffectsTxOutput {
  address: string
  amount_sats: number
}

export interface WireBlockEffectsTx {
  txid: string
  inputs: WireBlockEffectsTxInput[]
  outputs?: WireBlockEffectsTxOutput[]
}

export interface WireBlockEffectsNewUtxo {
  txid: string
  vout: number
  address: string
  amount_sats: number
  script_pubkey_hex: string
}

export interface WireBlockEffectsParsed {
  spent: { txid: string; vout: number }[]
  new_utxos: WireBlockEffectsNewUtxo[]
  transactions: WireBlockEffectsTx[]
  block_time?: number
}

/** Domain block-effects shapes (camelCase). Mapped once after WASM parse. */

export interface BlockEffectsTxInput {
  prevTxid: string
  prevVout: number
}

export interface BlockEffectsTxOutput {
  address: string
  amountSats: number
}

export interface BlockEffectsTx {
  txid: string
  inputs: BlockEffectsTxInput[]
  outputs?: BlockEffectsTxOutput[]
}

export interface BlockEffectsNewUtxo {
  txid: string
  vout: number
  address: string
  amountSats: number
  scriptPubkeyHex: string
}

export interface BlockEffectsParsed {
  spent: { txid: string; vout: number }[]
  newUtxos: BlockEffectsNewUtxo[]
  transactions: BlockEffectsTx[]
  blockTime?: number
}
