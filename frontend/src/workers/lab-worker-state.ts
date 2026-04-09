import type { LabState, LabTxDetails, MempoolEntry } from './lab-api'
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
  addressToOwner: Record<string, string>,
): string | undefined {
  const direct = addressToOwner[address]
  if (direct !== undefined) return direct
  for (const [storedAddr, owner] of Object.entries(addressToOwner)) {
    if (labAddressesEqual(storedAddr, address)) return owner
  }
  return undefined
}

/** Every lab transaction summary row must have a non-empty receiver (list UI + invariants). */
export function assertLabReceiverNonNull(
  receiver: string | null | undefined,
  context: string,
): asserts receiver is string {
  if (receiver == null || receiver === '') {
    throw new Error(`${context}: receiver must not be null or empty`)
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

/**
 * Fills missing output owners for legacy rows where change was not linked (e.g. mined after
 * reload when txid→change map was empty). Requires one unowned output and at least one owned.
 */
export function inferMissingLabOutputOwners(tx: LabTxDetails): LabTxDetails {
  if (tx.isCoinbase) return tx
  const firstOwner = tx.inputs.find((i) => i.owner != null)?.owner ?? null
  if (firstOwner == null) return tx
  if (tx.inputs.some((i) => i.owner != null && i.owner !== firstOwner)) return tx

  const outMissingOwner = tx.outputs.filter((o) => !o.owner)
  const outWithOwner = tx.outputs.filter((o) => o.owner)
  const existingChangeCount = tx.outputs.filter((o) => o.isChange).length
  if (outMissingOwner.length !== 1 || outWithOwner.length < 1) return tx

  const patchAddr = outMissingOwner[0].address
  return {
    ...tx,
    outputs: tx.outputs.map((o) => {
      if (o.owner != null) return o
      if (labAddressesEqual(o.address, patchAddr)) {
        // Legacy repair: only backfill missing owner. Do not mark additional outputs as change
        // when a change output is already present, otherwise self-sends can show two "Change" badges.
        if (existingChangeCount > 0) {
          return { ...o, owner: firstOwner }
        }
        return { ...o, owner: firstOwner, isChange: true }
      }
      return o
    }),
  }
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

export function parseTxOperationPayload(payloadJson: string | null | undefined): {
  receiver?: string | null
  primaryToAddress?: string | null
} {
  if (!payloadJson) return {}
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>
    return {
      receiver: typeof parsed.receiver === 'string' ? parsed.receiver : null,
      primaryToAddress:
        typeof parsed.primaryToAddress === 'string' ? parsed.primaryToAddress : null,
    }
  } catch {
    return {}
  }
}
