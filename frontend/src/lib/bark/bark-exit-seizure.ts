const INVALID_EXIT_CHAIN_NOTICES = 'Bark exit chain notices are invalid'

/** Which exit output was spent. Anchor is the chain anchor; the others are exit transactions. */
export const BARK_EXIT_NODE_SWEEP_KINDS = ['anchor', 'internal', 'leaf', 'checkpoint'] as const

export type BarkExitNodeSweepKind = (typeof BARK_EXIT_NODE_SWEEP_KINDS)[number]

export type BarkExitNodeSweepVtxoItem = {
  vtxoId: string
  nodeKind: BarkExitNodeSweepKind
  /** Absent on a notice stored before the spending transaction was recorded. */
  spenderTxid?: string
}

export type BarkExitNodeSweepVtxoRow = {
  vtxoId: string
  spenderTxids: readonly string[]
}

export const BARK_ANCHOR_SWEEP_WARNING =
  'The on-chain output backing these Bark VTXOs was spent by the server after expiry. These Bark VTXOs are spent, and this wallet cannot recover them.'

export const BARK_CHECKPOINT_SEIZURE_WARNING =
  'A checkpoint from an emergency exit was spent because the exit was not continued. These Bark VTXOs are spent, and this wallet cannot recover them.'

export const BARK_LEAF_SEIZURE_WARNING =
  'A leaf transaction output on the exit path of these Bark VTXOs was spent outside the next exit transaction. These Bark VTXOs are spent, and this wallet cannot recover them.'

export const BARK_INTERNAL_SEIZURE_WARNING =
  'An internal node on the exit path of these Bark VTXOs was spent outside the next exit transaction. These Bark VTXOs are spent, and this wallet cannot recover them.'

const NODE_KIND_RANK: Record<BarkExitNodeSweepKind, number> = {
  anchor: 0,
  internal: 1,
  leaf: 2,
  checkpoint: 3,
}

/** Reads the JSON object from `bark_exit_chain_notices`. */
export function readBarkExitChainNotices(value: unknown): BarkExitNodeSweepVtxoItem[] {
  if (typeof value !== 'string') {
    throw new Error(INVALID_EXIT_CHAIN_NOTICES)
  }
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed)) {
    throw new Error(INVALID_EXIT_CHAIN_NOTICES)
  }
  const items = exitNodeSweepVtxoItemsFromUnknown(parsed.exitNodeSweepVtxoItems)
  if (items == null) {
    throw new Error(INVALID_EXIT_CHAIN_NOTICES)
  }
  return items
}

/** A malformed list is omitted. An empty list is kept as empty. */
export function exitNodeSweepVtxoItemsFromUnknown(
  value: unknown,
): BarkExitNodeSweepVtxoItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items: BarkExitNodeSweepVtxoItem[] = []
  for (const entry of value) {
    if (!isRecord(entry)) return undefined
    if (typeof entry.vtxoId !== 'string' || entry.vtxoId.length === 0) return undefined
    if (!isBarkExitNodeSweepKind(entry.nodeKind)) return undefined
    const spenderTxid = readSpenderTxid(entry.spenderTxid)
    if (spenderTxid === INVALID_SPENDER_TXID) return undefined
    const item: BarkExitNodeSweepVtxoItem = { vtxoId: entry.vtxoId, nodeKind: entry.nodeKind }
    if (spenderTxid != null) item.spenderTxid = spenderTxid
    items.push(item)
  }
  return normalizeExitNodeSweepVtxoItems(items)
}

export function isBarkExitNodeSweepKind(value: unknown): value is BarkExitNodeSweepKind {
  return (
    typeof value === 'string' &&
    (BARK_EXIT_NODE_SWEEP_KINDS as readonly string[]).includes(value)
  )
}

/**
 * Drops duplicate vtxo, kind, and spender triples. When the same vtxo and kind
 * exists both with and without a spender, the one with a spender wins.
 * Kinds are ordered from the anchor toward the checkpoint.
 */
export function normalizeExitNodeSweepVtxoItems(
  items: readonly BarkExitNodeSweepVtxoItem[],
): BarkExitNodeSweepVtxoItem[] {
  const uniqueByKey = new Map<string, BarkExitNodeSweepVtxoItem>()
  for (const item of items) {
    const normalized = normalizedExitNodeSweepVtxoItem(item)
    if (normalized == null) continue
    const key = exitNodeSweepItemKey(normalized)
    if (uniqueByKey.has(key)) continue
    uniqueByKey.set(key, normalized)
  }
  const vtxoKindsWithSpender = new Set(
    [...uniqueByKey.values()]
      .filter((item) => item.spenderTxid != null)
      .map(exitNodeSweepVtxoKindKey),
  )
  return [...uniqueByKey.values()]
    .filter(
      (item) =>
        item.spenderTxid != null || !vtxoKindsWithSpender.has(exitNodeSweepVtxoKindKey(item)),
    )
    .sort(compareExitNodeSweepVtxoItems)
}

function compareExitNodeSweepVtxoItems(
  left: BarkExitNodeSweepVtxoItem,
  right: BarkExitNodeSweepVtxoItem,
): number {
  const kindOrder = NODE_KIND_RANK[left.nodeKind] - NODE_KIND_RANK[right.nodeKind]
  if (kindOrder !== 0) return kindOrder
  if (left.vtxoId < right.vtxoId) return -1
  if (left.vtxoId > right.vtxoId) return 1
  const leftSpender = left.spenderTxid ?? ''
  const rightSpender = right.spenderTxid ?? ''
  if (leftSpender < rightSpender) return -1
  if (leftSpender > rightSpender) return 1
  return 0
}

export function mergeExitNodeSweepVtxoItems(
  existing: readonly BarkExitNodeSweepVtxoItem[],
  incoming: readonly BarkExitNodeSweepVtxoItem[],
): BarkExitNodeSweepVtxoItem[] {
  return normalizeExitNodeSweepVtxoItems([...existing, ...incoming])
}

export function exitNodeSweepVtxoItemsWithoutKind(
  items: readonly BarkExitNodeSweepVtxoItem[],
  kind: BarkExitNodeSweepKind,
): BarkExitNodeSweepVtxoItem[] {
  return items.filter((item) => item.nodeKind !== kind)
}

export function vtxoIdsForExitNodeSweepKind(
  items: readonly BarkExitNodeSweepVtxoItem[],
  kind: BarkExitNodeSweepKind,
): string[] {
  return vtxoRowsForExitNodeSweepKind(items, kind).map((row) => row.vtxoId)
}

/** One row per VTXO in a banner section, with every spending transaction of that kind. */
export function vtxoRowsForExitNodeSweepKind(
  items: readonly BarkExitNodeSweepVtxoItem[],
  kind: BarkExitNodeSweepKind,
): BarkExitNodeSweepVtxoRow[] {
  const spenderTxidsByVtxoId = new Map<string, string[]>()
  for (const item of items) {
    if (item.nodeKind !== kind) continue
    const spenderTxids = spenderTxidsByVtxoId.get(item.vtxoId) ?? []
    if (item.spenderTxid != null && !spenderTxids.includes(item.spenderTxid)) {
      spenderTxids.push(item.spenderTxid)
    }
    spenderTxidsByVtxoId.set(item.vtxoId, spenderTxids)
  }
  return [...spenderTxidsByVtxoId.entries()].map(([vtxoId, spenderTxids]) => ({
    vtxoId,
    spenderTxids,
  }))
}

export function exitNodeSweepKindsByVtxoId(
  items: readonly BarkExitNodeSweepVtxoItem[],
): Map<string, ReadonlySet<BarkExitNodeSweepKind>> {
  const kindsByVtxoId = new Map<string, Set<BarkExitNodeSweepKind>>()
  for (const item of items) {
    const kinds = kindsByVtxoId.get(item.vtxoId) ?? new Set<BarkExitNodeSweepKind>()
    kinds.add(item.nodeKind)
    kindsByVtxoId.set(item.vtxoId, kinds)
  }
  return kindsByVtxoId
}

const INVALID_SPENDER_TXID = Symbol('invalid-spender-txid')
const ITEM_KEY_SEPARATOR = '\0'

function readSpenderTxid(value: unknown): string | null | typeof INVALID_SPENDER_TXID {
  if (value === undefined) return null
  if (typeof value !== 'string' || value.length === 0) return INVALID_SPENDER_TXID
  return value
}

function normalizedExitNodeSweepVtxoItem(
  item: BarkExitNodeSweepVtxoItem,
): BarkExitNodeSweepVtxoItem | null {
  if (item.vtxoId.length === 0) return null
  if (item.spenderTxid == null || item.spenderTxid.length === 0) {
    return { vtxoId: item.vtxoId, nodeKind: item.nodeKind }
  }
  return { vtxoId: item.vtxoId, nodeKind: item.nodeKind, spenderTxid: item.spenderTxid }
}

function exitNodeSweepVtxoKindKey(item: BarkExitNodeSweepVtxoItem): string {
  return `${item.nodeKind}${ITEM_KEY_SEPARATOR}${item.vtxoId}`
}

function exitNodeSweepItemKey(item: BarkExitNodeSweepVtxoItem): string {
  return `${exitNodeSweepVtxoKindKey(item)}${ITEM_KEY_SEPARATOR}${item.spenderTxid ?? ''}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}
