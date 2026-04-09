import type { LabUtxo } from './lab-api'

/** JSON shape expected by lab WASM signing helpers from {@link LabUtxo} rows. */
export function utxosToJsonForLabWasm(utxos: LabUtxo[]): string {
  return JSON.stringify(
    utxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      amount_sats: utxo.amountSats,
      script_pubkey_hex: utxo.scriptPubkeyHex,
      address: utxo.address,
    })),
  )
}
