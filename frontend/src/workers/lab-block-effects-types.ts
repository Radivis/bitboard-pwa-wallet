export interface BlockEffectsTx {
  txid: string
  inputs: { prev_txid: string; prev_vout: number }[]
  outputs?: { address: string; amount_sats: number }[]
}

export interface BlockEffectsParsed {
  spent: { txid: string; vout: number }[]
  new_utxos: {
    txid: string
    vout: number
    address: string
    amount_sats: number
    script_pubkey_hex: string
  }[]
  transactions: BlockEffectsTx[]
  block_time?: number
}
