const INVALID_EXIT_CHAIN_NOTICES = 'Bark exit chain notices are invalid'

/** Which exit output was spent. Anchor is the chain anchor; the others are exit transactions. */
export const BARK_EXIT_NODE_SWEEP_KINDS = ['anchor', 'internal', 'leaf', 'checkpoint'] as const

export type BarkExitNodeSweepKind = (typeof BARK_EXIT_NODE_SWEEP_KINDS)[number]

export type BarkExitNodeSweepVtxoItem = {
  vtxoId: string
  nodeKind: BarkExitNodeSweepKind
}

export const BARK_ANCHOR_SWEEP_WARNING =
  'The on-chain output backing these VTXOs was spent by the server after expiry. These VTXOs are spent, and this wallet cannot recover them.'

export const BARK_CHECKPOINT_SEIZURE_WARNING =
  'A checkpoint from an emergency exit was spent because the exit was not continued. These VTXOs are spent, and this wallet cannot recover them.'

export const BARK_LEAF_SEIZURE_WARNING =
  'A leaf transaction output on the exit path of these VTXOs was spent outside the next exit transaction. These VTXOs are spent, and this wallet cannot recover them.'

export const BARK_INTERNAL_SEIZURE_WARNING =
  'An internal node on the exit path of these VTXOs was spent outside the next exit transaction. These VTXOs are spent, and this wallet cannot recover them.'

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
    items.push({ vtxoId: entry.vtxoId, nodeKind: entry.nodeKind })
  }
  return normalizeExitNodeSweepVtxoItems(items)
}

export function isBarkExitNodeSweepKind(value: unknown): value is BarkExitNodeSweepKind {
  return (
    typeof value === 'string' &&
    (BARK_EXIT_NODE_SWEEP_KINDS as readonly string[]).includes(value)
  )
}

/** Drops duplicate vtxo-and-kind pairs and orders kinds from the anchor toward the checkpoint. */
export function normalizeExitNodeSweepVtxoItems(
  items: readonly BarkExitNodeSweepVtxoItem[],
): BarkExitNodeSweepVtxoItem[] {
  const seenVtxoIdsByKind = new Map<BarkExitNodeSweepKind, Set<string>>()
  const unique: BarkExitNodeSweepVtxoItem[] = []
  for (const item of items) {
    if (item.vtxoId.length === 0) continue
    const seenVtxoIds = seenVtxoIdsByKind.get(item.nodeKind) ?? new Set<string>()
    if (seenVtxoIds.has(item.vtxoId)) continue
    seenVtxoIds.add(item.vtxoId)
    seenVtxoIdsByKind.set(item.nodeKind, seenVtxoIds)
    unique.push(item)
  }
  return unique.sort(compareExitNodeSweepVtxoItems)
}

function compareExitNodeSweepVtxoItems(
  left: BarkExitNodeSweepVtxoItem,
  right: BarkExitNodeSweepVtxoItem,
): number {
  const kindOrder = NODE_KIND_RANK[left.nodeKind] - NODE_KIND_RANK[right.nodeKind]
  if (kindOrder !== 0) return kindOrder
  if (left.vtxoId < right.vtxoId) return -1
  if (left.vtxoId > right.vtxoId) return 1
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
  return items.filter((item) => item.nodeKind === kind).map((item) => item.vtxoId)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}
