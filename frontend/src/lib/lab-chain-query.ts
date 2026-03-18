import type { LabState } from '@/workers/lab-api'
import { mergeAddressesWithUtxos } from '@/lib/lab-utils'

export const labChainStateQueryKey = ['lab', 'chainState'] as const

/** Worker/DB snapshot shaped for UI (merged controlled + utxo-derived addresses). */
export function toUiLabState(state: LabState): LabState {
  return {
    blocks: state.blocks,
    utxos: state.utxos,
    addresses: mergeAddressesWithUtxos(state.addresses, state.utxos),
    addressToOwner: state.addressToOwner ?? {},
    mempool: state.mempool ?? [],
    transactions: state.transactions ?? [],
    txDetails: state.txDetails ?? [],
  }
}
