import { labEntityOwnerKey } from '@/lib/lab-entity-keys'
import type { LabOwner } from '@/lib/lab-owner'
import {
  labOwnerDisplayName,
  labOwnerFromLegacyKey,
  labOwnerFromSortKey,
  labOwnersEqual,
  labOwnerSortKey,
  walletLabOwner,
} from '@/lib/lab-owner'
import type {
  LabEntityRecord,
  LabTxRecord,
  LabTxDetails,
  MempoolEntry,
  LabAddress,
  LabState,
} from '@/workers/lab-api'
import type { TransactionDetails } from '@/workers/crypto-types'

export const WALLET_OWNER_PREFIX = 'wallet:'

/** Returns the wallet owner key used in lab state (e.g. addressToOwner, sender, receiver). */
export function walletOwnerKey(walletId: number): string {
  return `${WALLET_OWNER_PREFIX}${walletId}`
}

/** Case-insensitive equality for bc1/tb1/bcrt1 addresses (matches lab worker / BIP173). */
export function labBitcoinAddressesEqual(a: string, b: string): boolean {
  const x = a.trim()
  const y = b.trim()
  if (x === y) return true
  if (/^(bc|tb|bcrt)1/i.test(x) && /^(bc|tb|bcrt)1/i.test(y)) {
    return x.toLowerCase() === y.toLowerCase()
  }
  return false
}

/**
 * Resolves `addressToOwner` the same way as the lab worker: direct key, then
 * case-insensitive match for bc1/tb1/bcrt1 (BIP173).
 */
export function lookupLabAddressOwner(
  address: string,
  addressToOwner: Record<string, LabOwner>,
): LabOwner | undefined {
  const direct = addressToOwner[address]
  if (direct !== undefined) return direct
  for (const [storedAddr, owner] of Object.entries(addressToOwner)) {
    if (labBitcoinAddressesEqual(storedAddr, address)) return owner
  }
  return undefined
}

/**
 * If the recipient address maps to a dead lab entity, returns its display key; otherwise null.
 */
export function resolveDeadLabEntityRecipient(
  recipientAddress: string,
  addressToOwner: Record<string, LabOwner>,
  entities: readonly LabEntityRecord[],
): { displayName: string; addressType: string } | null {
  const owner = lookupLabAddressOwner(recipientAddress, addressToOwner)
  if (owner?.kind !== 'lab_entity') return null
  const entity = entities.find((e) => e.labEntityId === owner.labEntityId)
  if (entity == null || !entity.isDead) return null
  return { displayName: labEntityOwnerKey(entity), addressType: entity.addressType }
}

/**
 * Owner for UI: map first, then confirmed outputs with a non-empty `owner` field.
 */
export function resolveLabAddressOwnerDisplay(
  address: string,
  addressToOwner: Record<string, LabOwner>,
  txDetails: LabTxDetails[],
  entities: readonly { labEntityId: number; entityName: string | null }[],
  wallets: { wallet_id: number; name: string }[],
): string | undefined {
  const fromMap = lookupLabAddressOwner(address, addressToOwner)
  if (fromMap !== undefined) return labOwnerDisplayName(fromMap, wallets, entities)

  for (const detail of txDetails) {
    for (const output of detail.outputs ?? []) {
      if (!labBitcoinAddressesEqual(output.address, address)) continue
      if (output.owner != null) {
        const o = output.owner
        if (typeof o === 'object' && o !== null && 'kind' in o) {
          return labOwnerDisplayName(o as LabOwner, wallets, entities)
        }
      }
    }
  }
  return undefined
}

/** Stable sort for lab owner group keys (uses {@link labOwnerSortKey}). */
export function sortLabOwnerKeys(ownerKeys: string[]): string[] {
  return [...ownerKeys].sort((a, b) => a.localeCompare(b))
}

/**
 * Lab invariant: every address shown or grouped must have a resolved owner key.
 * Throws immediately if missing (data bug or stale state).
 */
export function assertLabAddressOwnerResolved(
  address: string,
  ownerKey: LabOwner | undefined | null,
  context?: string,
): asserts ownerKey is LabOwner {
  if (ownerKey == null) {
    throw new Error(
      `Lab address has no resolved owner${context ? ` (${context})` : ''}: ${address}`,
    )
  }
}

/**
 * Groups rows by resolved owner (addresses card, UTXOs card). Throws via
 * {@link assertLabAddressOwnerResolved} if any address has no owner.
 */
export function groupLabRowsByResolvedOwner<T>(
  items: T[],
  getAddress: (item: T) => string,
  resolveOwner: (address: string) => LabOwner | undefined,
  assertContext: string,
): { byOwner: Map<string, T[]>; sortedOwnerKeys: string[] } {
  const byOwner = new Map<string, T[]>()
  for (const item of items) {
    const address = getAddress(item)
    const owner = resolveOwner(address)
    assertLabAddressOwnerResolved(address, owner, assertContext)
    const key = labOwnerSortKey(owner)
    const list = byOwner.get(key) ?? []
    list.push(item)
    byOwner.set(key, list)
  }
  return {
    byOwner,
    sortedOwnerKeys: sortLabOwnerKeys([...byOwner.keys()]),
  }
}

/** Bech32 addresses are compared case-insensitively for deduplication (BIP173). */
function canonicalLabAddressKey(address: string): string {
  const t = address.trim()
  return /^(bc|tb|bcrt)1/i.test(t) ? t.toLowerCase() : t
}

/** Merge controlled addresses with any addresses that appear in UTXOs but are not yet in the list. */
export function mergeAddressesWithUtxos(
  addresses: LabAddress[],
  utxos: LabState['utxos'],
): LabAddress[] {
  const byKey = new Map<string, LabAddress>()
  for (const labAddress of addresses) {
    const key = canonicalLabAddressKey(labAddress.address)
    if (!byKey.has(key)) byKey.set(key, labAddress)
  }
  for (const utxo of utxos) {
    const key = canonicalLabAddressKey(utxo.address)
    if (!byKey.has(key)) {
      byKey.set(key, { address: utxo.address, wif: '' })
    }
  }
  return [...byKey.values()]
}

export function labTransactionsForWallet(
  labState: {
    transactions: LabTxRecord[]
    txDetails: LabTxDetails[]
    mempool: MempoolEntry[]
  },
  activeWalletId: number,
): TransactionDetails[] {
  const walletOwner = walletLabOwner(activeWalletId)
  const txDetailsByTxid = new Map(
    labState.txDetails.map((detail) => [detail.txid, detail]),
  )

  const result: TransactionDetails[] = []

  for (const entry of labState.mempool ?? []) {
    const isSender = labOwnersEqual(entry.sender, walletOwner)
    const isReceiver = labOwnersEqual(entry.receiver, walletOwner)
    if (!isSender && !isReceiver) continue

    const sentSats = isSender
      ? (entry.outputsDetail ?? [])
          .filter((output) => !output.isChange)
          .reduce((sumSats, output) => sumSats + output.amountSats, 0)
      : 0
    const receivedSats = isReceiver
      ? (entry.outputsDetail ?? [])
          .filter((output) => labOwnersEqual(output.owner ?? null, walletOwner))
          .reduce((sumSats, output) => sumSats + output.amountSats, 0)
      : 0

    result.push({
      txid: entry.txid,
      sent_sats: sentSats,
      received_sats: receivedSats,
      fee_sats: entry.feeSats,
      confirmation_block_height: null,
      confirmation_time: null,
      is_confirmed: false,
    })
  }

  for (const record of labState.transactions ?? []) {
    const isSender = labOwnersEqual(record.sender, walletOwner)
    const isReceiver = labOwnersEqual(record.receiver, walletOwner)
    if (!isSender && !isReceiver) continue

    const details = txDetailsByTxid.get(record.txid)
    if (!details) continue

    if (details.isCoinbase) {
      const receivedSatsCoinbase = (details.outputs ?? [])
        .filter((output) => labOwnersEqual(output.owner ?? null, walletOwner))
        .reduce((sumSats, output) => sumSats + output.amountSats, 0)
      result.push({
        txid: record.txid,
        sent_sats: 0,
        received_sats: receivedSatsCoinbase,
        fee_sats: 0,
        confirmation_block_height: details.blockHeight,
        confirmation_time: details.blockTime,
        is_confirmed: true,
      })
      continue
    }

    const sentSats = isSender
      ? (details.outputs ?? [])
          .filter((output) => !output.isChange)
          .reduce((sumSats, output) => sumSats + output.amountSats, 0)
      : 0
    const receivedSats = isReceiver
      ? (details.outputs ?? [])
          .filter((output) => labOwnersEqual(output.owner ?? null, walletOwner))
          .reduce((sumSats, output) => sumSats + output.amountSats, 0)
      : 0

    const totalInput = (details.inputs ?? []).reduce(
      (sumSats, input) => sumSats + input.amountSats,
      0,
    )
    const totalOutput = (details.outputs ?? []).reduce(
      (sumSats, output) => sumSats + output.amountSats,
      0,
    )
    const feeSats = totalInput - totalOutput

    result.push({
      txid: record.txid,
      sent_sats: sentSats,
      received_sats: receivedSats,
      fee_sats: feeSats,
      confirmation_block_height: details.blockHeight,
      confirmation_time: details.blockTime,
      is_confirmed: true,
    })
  }

  result.sort((txA, txB) => {
    if (!txA.is_confirmed && txB.is_confirmed) return -1
    if (txA.is_confirmed && !txB.is_confirmed) return 1
    if (txA.is_confirmed && txB.is_confirmed) {
      const timeA = txA.confirmation_time ?? 0
      const timeB = txB.confirmation_time ?? 0
      return timeB - timeA
    }
    return 0
  })

  return result
}

/**
 * Resolves a display-time owner reference to {@link LabOwner}, or null if unknown.
 */
export function resolveLabOwnerForDisplay(
  owner: LabOwner | string,
  _wallets: { wallet_id: number; name: string }[],
  entities: readonly { labEntityId: number; entityName: string | null }[],
): LabOwner | null {
  if (typeof owner === 'object' && owner !== null && 'kind' in owner) {
    return owner
  }
  const fromSort = labOwnerFromSortKey(owner)
  if (fromSort) return fromSort
  if (typeof owner === 'string' && owner.startsWith(WALLET_OWNER_PREFIX)) {
    const id = parseInt(owner.slice(WALLET_OWNER_PREFIX.length), 10)
    if (!Number.isNaN(id)) return { kind: 'wallet', walletId: id }
  }
  return labOwnerFromLegacyKey(owner, entities)
}

/**
 * Returns `addressType` for a lab-entity owner, or null for wallets / unknown owners.
 */
export function labEntityAddressTypeForOwner(
  owner: LabOwner | string,
  entities: readonly { labEntityId: number; entityName: string | null; addressType: string }[],
): string | null {
  const resolved = resolveLabOwnerForDisplay(owner, [], entities)
  if (resolved?.kind !== 'lab_entity') return null
  const entity = entities.find((e) => e.labEntityId === resolved.labEntityId)
  return entity?.addressType ?? null
}

/**
 * Accessible label including address type for lab entities (matches {@link LabOwnerDisplayWithAddressType}).
 */
export function getOwnerDisplayNameWithAddressTypeAria(
  owner: LabOwner | string,
  wallets: { wallet_id: number; name: string }[],
  entities: readonly { labEntityId: number; entityName: string | null; addressType: string }[],
): string {
  const base = getOwnerDisplayName(owner, wallets, entities)
  const addrType = labEntityAddressTypeForOwner(owner, entities)
  if (addrType == null) return base
  if (addrType.toLowerCase() === 'taproot') return `${base}, Taproot experimental`
  return `${base}, SegWit`
}

/**
 * Display label for a lab owner: {@link LabOwner}, grouped-list sort key (`e:` / `w:`), or legacy string.
 */
export function getOwnerDisplayName(
  owner: LabOwner | string,
  wallets: { wallet_id: number; name: string }[],
  entities: readonly { labEntityId: number; entityName: string | null }[],
): string {
  if (typeof owner === 'object' && owner !== null && 'kind' in owner) {
    return labOwnerDisplayName(owner, wallets, entities)
  }
  const fromSort = labOwnerFromSortKey(owner)
  if (fromSort) return labOwnerDisplayName(fromSort, wallets, entities)
  if (typeof owner === 'string' && owner.startsWith(WALLET_OWNER_PREFIX)) {
    const id = parseInt(owner.slice(WALLET_OWNER_PREFIX.length), 10)
    return wallets.find((w) => w.wallet_id === id)?.name ?? 'Unknown wallet'
  }
  const o = labOwnerFromLegacyKey(owner, entities)
  if (o) return labOwnerDisplayName(o, wallets, entities)
  return owner
}

export function getLabOwnerDisplayName(
  owner: LabOwner,
  wallets: { wallet_id: number; name: string }[],
  entities: readonly { labEntityId: number; entityName: string | null }[],
): string {
  return labOwnerDisplayName(owner, wallets, entities)
}

export function getOwnerIcon(owner: LabOwner | string): 'wallet' | 'flask' {
  if (typeof owner === 'object' && owner !== null && 'kind' in owner) {
    return getLabOwnerIcon(owner)
  }
  const fromSort = labOwnerFromSortKey(owner)
  if (fromSort) return getLabOwnerIcon(fromSort)
  return owner.startsWith(WALLET_OWNER_PREFIX) ? 'wallet' : 'flask'
}

export function getLabOwnerIcon(owner: LabOwner): 'wallet' | 'flask' {
  return owner.kind === 'wallet' ? 'wallet' : 'flask'
}
