import type { LabOwner } from '@/lib/lab-owner'
import { normalizeJsonOwnerToLabOwner } from '@/lib/lab-owner'
import type { LabState, MempoolEntry } from './lab-api'
import { EMPTY_LAB_STATE } from './lab-api'

export let state: LabState = { ...EMPTY_LAB_STATE }

export function replaceLabWorkerState(newState: LabState): void {
  state = newState
}

/**
 * Txid -> change output address for txs we create. Used when applying block effects so change
 * is attributed to the same owner as inputs. Rebuilt from persisted mempool on loadState
 * (the map itself is not part of LabState JSON).
 */
export const txidToChangeOutput = new Map<string, { address: string; vout: number | null }>()

/** Bech32 (bc1/tb1/bcrt1) addresses can differ by case; BIP173 compares case-insensitively. */
export function labAddressesEqual(a: string, b: string): boolean {
  if (a === b) return true
  const x = a.trim()
  const y = b.trim()
  if (x === y) return true
  if (/^(bc|tb|bcrt)1/i.test(x) && /^(bc|tb|bcrt)1/i.test(y)) {
    return x.toLowerCase() === y.toLowerCase()
  }
  return false
}

/** Resolves owner when WASM-reported addresses differ in bech32 casing from stored map keys. */
export function lookupOwnerForLabAddress(
  address: string,
  addressToOwner: Record<string, LabOwner>,
): LabOwner | undefined {
  const direct = addressToOwner[address]
  if (direct !== undefined) return direct
  for (const [storedAddr, owner] of Object.entries(addressToOwner)) {
    if (labAddressesEqual(storedAddr, address)) return owner
  }
  return undefined
}

/** Every lab transaction summary row must have a non-empty receiver (list UI + invariants). */
export function assertLabReceiverNonNull(
  receiver: LabOwner | null | undefined,
  context: string,
): asserts receiver is LabOwner {
  if (receiver == null) {
    throw new Error(`${context}: receiver must not be null`)
  }
}

export function rebuildTxidToChangeAddressFromMempool(mempool: MempoolEntry[]): void {
  for (const entry of mempool) {
    const changeVout = entry.outputsDetail.findIndex((o) => o.isChange)
    if (changeVout >= 0) {
      const changeOut = entry.outputsDetail[changeVout]
      txidToChangeOutput.set(entry.txid, { address: changeOut.address, vout: changeVout })
    }
  }
}

export function rebuildTxidToChangeAddressFromState(): void {
  txidToChangeOutput.clear()
  for (const op of state.txOperations ?? []) {
    if (op.changeAddress) {
      txidToChangeOutput.set(op.txid, {
        address: op.changeAddress,
        vout: op.changeVout ?? null,
      })
    }
  }
  rebuildTxidToChangeAddressFromMempool(state.mempool ?? [])
}

export function parseWasmObject(val: unknown): Record<string, unknown> {
  if (val != null && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>
  }
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

export function parseTxOperationPayload(
  payloadJson: string | null | undefined,
  entities: readonly { labEntityId: number; entityName: string | null }[],
): {
  receiver?: LabOwner | null
  primaryToAddress?: string | null
} {
  if (!payloadJson) return {}
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>
    const rawRecv = parsed.receiver
    const receiver =
      rawRecv === undefined || rawRecv === null
        ? null
        : normalizeJsonOwnerToLabOwner(rawRecv, entities)
    return {
      receiver,
      primaryToAddress:
        typeof parsed.primaryToAddress === 'string' ? parsed.primaryToAddress : null,
    }
  } catch {
    return {}
  }
}
