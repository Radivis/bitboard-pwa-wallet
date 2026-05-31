import type { LabOwner } from '@/lib/lab/lab-owner'
import { normalizeJsonOwnerToLabOwner } from '@/lib/lab/lab-owner'
import { labBitcoinAddressesEqual } from '@/lib/lab/lab-utils'
import type { LabState, MempoolEntry } from './lab-api'
import { EMPTY_LAB_STATE } from './lab-api'

export let labWorkerState: LabState = { ...EMPTY_LAB_STATE }

export function replaceLabWorkerState(newState: LabState): void {
  labWorkerState = newState
}

/**
 * Txid -> change output address for txs we create. Used when applying block effects so change
 * is attributed to the same owner as inputs. Rebuilt from persisted mempool on loadState
 * (the map itself is not part of LabState JSON).
 */
export const txidToChangeOutput = new Map<string, { address: string; vout: number | null }>()

/** Bech32 (bc1/tb1/bcrt1) addresses can differ by case; BIP173 compares case-insensitively. */
export const labAddressesEqual = labBitcoinAddressesEqual

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
    const changeVout = entry.outputsDetail.findIndex((outputDetail) => outputDetail.isChange)
    if (changeVout >= 0) {
      const changeOut = entry.outputsDetail[changeVout]
      txidToChangeOutput.set(entry.txid, { address: changeOut.address, vout: changeVout })
    }
  }
}

export function rebuildTxidToChangeAddressFromState(): void {
  txidToChangeOutput.clear()
  for (const op of labWorkerState.txOperations ?? []) {
    if (op.changeAddress) {
      txidToChangeOutput.set(op.txid, {
        address: op.changeAddress,
        vout: op.changeVout ?? null,
      })
    }
  }
  rebuildTxidToChangeAddressFromMempool(labWorkerState.mempool ?? [])
}

export function parseWasmObject(wasmValue: unknown): Record<string, unknown> {
  if (wasmValue != null && typeof wasmValue === 'object' && !Array.isArray(wasmValue)) {
    return wasmValue as Record<string, unknown>
  }
  if (typeof wasmValue === 'string') {
    try {
      return JSON.parse(wasmValue) as Record<string, unknown>
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
    const rawReceiverOwner = parsed.receiver
    const receiver =
      rawReceiverOwner === undefined || rawReceiverOwner === null
        ? null
        : normalizeJsonOwnerToLabOwner(rawReceiverOwner, entities)
    return {
      receiver,
      primaryToAddress:
        typeof parsed.primaryToAddress === 'string' ? parsed.primaryToAddress : null,
    }
  } catch {
    return {}
  }
}
