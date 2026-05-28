import type {
  BlockEffectsNewUtxo,
  BlockEffectsParsed,
  BlockEffectsTx,
  BlockEffectsTxInput,
  BlockEffectsTxOutput,
  WireBlockEffectsNewUtxo,
  WireBlockEffectsParsed,
  WireBlockEffectsTx,
  WireBlockEffectsTxInput,
  WireBlockEffectsTxOutput,
} from './lab-block-effects-types'

function mapWireBlockEffectsTxInputToDomain(
  wire: WireBlockEffectsTxInput,
): BlockEffectsTxInput {
  return {
    prevTxid: wire.prev_txid,
    prevVout: wire.prev_vout,
  }
}

function mapWireBlockEffectsTxOutputToDomain(
  wire: WireBlockEffectsTxOutput,
): BlockEffectsTxOutput {
  return {
    address: wire.address,
    amountSats: wire.amount_sats,
  }
}

function mapWireBlockEffectsTxToDomain(wire: WireBlockEffectsTx): BlockEffectsTx {
  return {
    txid: wire.txid,
    inputs: (wire.inputs ?? []).map(mapWireBlockEffectsTxInputToDomain),
    outputs: wire.outputs?.map(mapWireBlockEffectsTxOutputToDomain),
  }
}

function mapWireBlockEffectsNewUtxoToDomain(
  wire: WireBlockEffectsNewUtxo,
): BlockEffectsNewUtxo {
  return {
    txid: wire.txid,
    vout: wire.vout,
    address: wire.address,
    amountSats: wire.amount_sats,
    scriptPubkeyHex: wire.script_pubkey_hex,
  }
}

export function mapBlockEffectsWireToDomain(wire: WireBlockEffectsParsed): BlockEffectsParsed {
  return {
    spent: Array.isArray(wire.spent) ? wire.spent : [],
    newUtxos: Array.isArray(wire.new_utxos)
      ? wire.new_utxos.map(mapWireBlockEffectsNewUtxoToDomain)
      : [],
    transactions: Array.isArray(wire.transactions)
      ? wire.transactions.map(mapWireBlockEffectsTxToDomain)
      : [],
    blockTime: typeof wire.block_time === 'number' ? wire.block_time : 0,
  }
}

export function emptyBlockEffectsParsed(): BlockEffectsParsed {
  return { spent: [], newUtxos: [], transactions: [], blockTime: 0 }
}
