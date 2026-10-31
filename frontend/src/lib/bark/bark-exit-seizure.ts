const INVALID_EXIT_CHAIN_NOTICES = 'Bark exit chain notices are invalid'

/** Which exit output was spent. Anchor is the chain anchor; the others are exit transactions. */
export const BARK_EXIT_NODE_SWEEP_KINDS = ['anchor', 'internal', 'leaf', 'checkpoint'] as const

export type BarkExitNodeSweepKind = (typeof BARK_EXIT_NODE_SWEEP_KINDS)[number]

export type BarkExitNodeSweepVtxoItem = {
  vtxoId: string
  nodeKind: BarkExitNodeSweepKind
  /** Absent on a notice stored before the spending transaction was recorded. */
  spenderTxid?: string
  /** Absent together with `spentVout` on a notice stored before the spent output was recorded. */
  spentTxid?: string
  spentVout?: number
}

export type BarkExitSpentOutput = {
  spentTxid: string
  spentVout: number
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

const LEGACY_SEIZURE_WARNING: Record<BarkExitNodeSweepKind, string> = {
  anchor: BARK_ANCHOR_SWEEP_WARNING,
  internal: BARK_INTERNAL_SEIZURE_WARNING,
  leaf: BARK_LEAF_SEIZURE_WARNING,
  checkpoint: BARK_CHECKPOINT_SEIZURE_WARNING,
}

const SEIZURE_SECTION_TEST_ID: Record<BarkExitNodeSweepKind, string> = {
  anchor: 'bark-exit-anchor-sweep',
  internal: 'bark-exit-internal-seizure',
  leaf: 'bark-exit-leaf-seizure',
  checkpoint: 'bark-exit-checkpoint-seizure',
}

export type BarkExitSeizureSection = {
  kind: BarkExitNodeSweepKind
  spentTxid: string | null
  spentVout: number | null
  vtxoIds: readonly string[]
  testId: string
}

export type BarkExitSeizureWarningParts = {
  beforeTxid: string
  txid: string | null
  afterTxid: string
}

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
    const spentOutput = readSpentOutput(entry.spentTxid, entry.spentVout)
    if (spentOutput === INVALID_SPENT_OUTPUT) return undefined
    const item: BarkExitNodeSweepVtxoItem = { vtxoId: entry.vtxoId, nodeKind: entry.nodeKind }
    if (spenderTxid != null) item.spenderTxid = spenderTxid
    if (spentOutput != null) {
      item.spentTxid = spentOutput.spentTxid
      item.spentVout = spentOutput.spentVout
    }
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
 * Drops duplicate vtxo, kind, spender, and spent-output keys. When the same
 * vtxo and kind exists both with and without a spender, the one with a spender
 * wins. When that spend exists both with and without a spent output, the one
 * with a spent output wins. Kinds are ordered from the anchor toward the checkpoint.
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
  const unique = [...uniqueByKey.values()]
  const vtxoKindsWithSpender = new Set(
    unique.filter((item) => item.spenderTxid != null).map(exitNodeSweepVtxoKindKey),
  )
  const spendKeysWithOutput = new Set(
    unique.filter((item) => item.spentTxid != null).map(exitNodeSweepSpendKey),
  )
  return unique
    .filter(
      (item) =>
        (item.spenderTxid != null || !vtxoKindsWithSpender.has(exitNodeSweepVtxoKindKey(item))) &&
        (item.spentTxid != null || !spendKeysWithOutput.has(exitNodeSweepSpendKey(item))),
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
  const leftSpentTxid = left.spentTxid ?? ''
  const rightSpentTxid = right.spentTxid ?? ''
  if (leftSpentTxid < rightSpentTxid) return -1
  if (leftSpentTxid > rightSpentTxid) return 1
  return (left.spentVout ?? -1) - (right.spentVout ?? -1)
}

/** VTXOs whose stored notice still has no spent output. A later sync can fill those in. */
export function vtxoIdsMissingSpentOutput(
  items: readonly BarkExitNodeSweepVtxoItem[],
): string[] {
  const vtxoIds: string[] = []
  for (const item of items) {
    if (item.spentTxid != null && item.spentVout != null) continue
    if (vtxoIds.includes(item.vtxoId)) continue
    vtxoIds.push(item.vtxoId)
  }
  return vtxoIds
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
  return exitNodeSweepVtxoItemsWithoutSpend(items, kind, null)
}

/** Drops one spent output. A missing output drops the whole kind. */
export function exitNodeSweepVtxoItemsWithoutSpend(
  items: readonly BarkExitNodeSweepVtxoItem[],
  kind: BarkExitNodeSweepKind,
  spentOutput: BarkExitSpentOutput | null,
): BarkExitNodeSweepVtxoItem[] {
  if (spentOutput == null) return items.filter((item) => item.nodeKind !== kind)
  return items.filter(
    (item) =>
      item.nodeKind !== kind ||
      item.spentTxid !== spentOutput.spentTxid ||
      item.spentVout !== spentOutput.spentVout,
  )
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

/** One section per spent exit output. Items without a spent output stay one section per kind. */
export function seizureBannerSections(
  items: readonly BarkExitNodeSweepVtxoItem[],
): BarkExitSeizureSection[] {
  const legacyVtxoIds = new Map<BarkExitNodeSweepKind, string[]>()
  const spentSections = new Map<string, BarkExitSeizureSection>()
  for (const item of items) {
    if (item.spentTxid == null || item.spentVout == null) {
      const vtxoIds = legacyVtxoIds.get(item.nodeKind) ?? []
      if (!vtxoIds.includes(item.vtxoId)) vtxoIds.push(item.vtxoId)
      legacyVtxoIds.set(item.nodeKind, vtxoIds)
      continue
    }
    const key = `${item.nodeKind}${ITEM_KEY_SEPARATOR}${item.spentTxid}${ITEM_KEY_SEPARATOR}${item.spentVout}`
    const existing = spentSections.get(key)
    if (existing == null) {
      spentSections.set(key, {
        kind: item.nodeKind,
        spentTxid: item.spentTxid,
        spentVout: item.spentVout,
        vtxoIds: [item.vtxoId],
        testId: `${SEIZURE_SECTION_TEST_ID[item.nodeKind]}-${item.spentTxid}-${item.spentVout}`,
      })
      continue
    }
    if (existing.vtxoIds.includes(item.vtxoId)) continue
    spentSections.set(key, { ...existing, vtxoIds: [...existing.vtxoIds, item.vtxoId] })
  }

  const sections: BarkExitSeizureSection[] = []
  for (const kind of BARK_EXIT_NODE_SWEEP_KINDS) {
    const vtxoIds = legacyVtxoIds.get(kind)
    if (vtxoIds != null && vtxoIds.length > 0) {
      sections.push({
        kind,
        spentTxid: null,
        spentVout: null,
        vtxoIds,
        testId: SEIZURE_SECTION_TEST_ID[kind],
      })
    }
  }
  sections.push(...spentSections.values())
  return sections.sort(compareSeizureSections)
}

export function barkExitSeizureWarningParts(
  section: Pick<BarkExitSeizureSection, 'kind' | 'spentTxid' | 'spentVout'>,
): BarkExitSeizureWarningParts {
  if (section.spentTxid == null || section.spentVout == null) {
    return { beforeTxid: LEGACY_SEIZURE_WARNING[section.kind], txid: null, afterTxid: '' }
  }
  return {
    beforeTxid: seizureWarningBeforeTxid(section.kind),
    txid: section.spentTxid,
    afterTxid: ` output ${section.spentVout}${seizureWarningAfterOutput(section.kind)}`,
  }
}

export function formatBarkExitSeizureWarning(
  section: Pick<BarkExitSeizureSection, 'kind' | 'spentTxid' | 'spentVout'>,
): string {
  const parts = barkExitSeizureWarningParts(section)
  if (parts.txid == null) return parts.beforeTxid
  return `${parts.beforeTxid}${parts.txid}${parts.afterTxid}`
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
const INVALID_SPENT_OUTPUT = Symbol('invalid-spent-output')
const ITEM_KEY_SEPARATOR = '\0'

function readSpenderTxid(value: unknown): string | null | typeof INVALID_SPENDER_TXID {
  if (value === undefined) return null
  if (typeof value !== 'string' || value.length === 0) return INVALID_SPENDER_TXID
  return value
}

function readSpentOutput(
  spentTxid: unknown,
  spentVout: unknown,
): BarkExitSpentOutput | null | typeof INVALID_SPENT_OUTPUT {
  if (spentTxid === undefined && spentVout === undefined) return null
  if (typeof spentTxid !== 'string' || spentTxid.length === 0) return INVALID_SPENT_OUTPUT
  if (typeof spentVout !== 'number' || !Number.isInteger(spentVout) || spentVout < 0) {
    return INVALID_SPENT_OUTPUT
  }
  return { spentTxid, spentVout }
}

function normalizedExitNodeSweepVtxoItem(
  item: BarkExitNodeSweepVtxoItem,
): BarkExitNodeSweepVtxoItem | null {
  if (item.vtxoId.length === 0) return null
  const spentOutput = spentOutputOfItem(item)
  if (spentOutput === INVALID_SPENT_OUTPUT) return null
  const normalized: BarkExitNodeSweepVtxoItem = { vtxoId: item.vtxoId, nodeKind: item.nodeKind }
  if (item.spenderTxid != null && item.spenderTxid.length > 0) {
    normalized.spenderTxid = item.spenderTxid
  }
  if (spentOutput != null) {
    normalized.spentTxid = spentOutput.spentTxid
    normalized.spentVout = spentOutput.spentVout
  }
  return normalized
}

function spentOutputOfItem(
  item: BarkExitNodeSweepVtxoItem,
): BarkExitSpentOutput | null | typeof INVALID_SPENT_OUTPUT {
  if (item.spentTxid == null && item.spentVout == null) return null
  return readSpentOutput(item.spentTxid, item.spentVout)
}

function exitNodeSweepVtxoKindKey(item: BarkExitNodeSweepVtxoItem): string {
  return `${item.nodeKind}${ITEM_KEY_SEPARATOR}${item.vtxoId}`
}

function exitNodeSweepSpendKey(item: BarkExitNodeSweepVtxoItem): string {
  return `${exitNodeSweepVtxoKindKey(item)}${ITEM_KEY_SEPARATOR}${item.spenderTxid ?? ''}`
}

function exitNodeSweepItemKey(item: BarkExitNodeSweepVtxoItem): string {
  const spentTxid = item.spentTxid ?? ''
  const spentVout = item.spentVout ?? ''
  return `${exitNodeSweepSpendKey(item)}${ITEM_KEY_SEPARATOR}${spentTxid}${ITEM_KEY_SEPARATOR}${spentVout}`
}

function compareSeizureSections(left: BarkExitSeizureSection, right: BarkExitSeizureSection): number {
  const kindOrder = NODE_KIND_RANK[left.kind] - NODE_KIND_RANK[right.kind]
  if (kindOrder !== 0) return kindOrder
  if (left.spentTxid == null && right.spentTxid != null) return -1
  if (left.spentTxid != null && right.spentTxid == null) return 1
  if (left.spentTxid != null && right.spentTxid != null && left.spentTxid !== right.spentTxid) {
    return left.spentTxid < right.spentTxid ? -1 : 1
  }
  return (left.spentVout ?? -1) - (right.spentVout ?? -1)
}

function seizureWarningBeforeTxid(kind: BarkExitNodeSweepKind): string {
  switch (kind) {
    case 'anchor':
      return 'The on-chain output backing these Bark VTXOs, txid '
    case 'internal':
      return 'The internal node from an emergency exit with txid '
    case 'leaf':
      return 'The leaf transaction from an emergency exit with txid '
    case 'checkpoint':
      return 'The checkpoint from an emergency exit with txid '
  }
}

function seizureWarningAfterOutput(kind: BarkExitNodeSweepKind): string {
  switch (kind) {
    case 'anchor':
      return ', was spent by the server after expiry. These Bark VTXOs are spent, and this wallet cannot recover them.'
    case 'internal':
    case 'leaf':
    case 'checkpoint':
      return ' was spent because the exit was not continued. These Bark VTXOs are spent, and this wallet cannot recover them.'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}
