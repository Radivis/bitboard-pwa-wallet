import type { LabState } from '@/workers/lab-api'
import { mergeAddressesWithUtxos } from '@/lib/lab-utils'
import { labOpLoadChainFromDatabase } from '@/lib/lab-worker-operations'

export const labChainStateQueryKey = ['lab', 'chainState'] as const

/** Shared query body: load lab state from DB/worker and shape it for the UI. */
export async function fetchLabChainStateForQuery(): Promise<LabState> {
  const raw = await labOpLoadChainFromDatabase()
  return toUiLabState(raw)
}

/** Worker/DB snapshot shaped for UI (merged controlled + utxo-derived addresses). */
export function toUiLabState(state: LabState): LabState {
  return {
    blocks: state.blocks,
    utxos: state.utxos,
    addresses: mergeAddressesWithUtxos(state.addresses, state.utxos),
    entities: state.entities ?? [],
    addressToOwner: state.addressToOwner ?? {},
    mempool: state.mempool ?? [],
    transactions: state.transactions ?? [],
    txDetails: state.txDetails ?? [],
    mineOperations: state.mineOperations ?? [],
    txOperations: state.txOperations ?? [],
  }
}
