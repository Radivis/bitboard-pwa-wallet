/**
 * Reads persisted BDK changeset JSON to tell which signet-family chain its blocks
 * belong to. Public Signet and Mutinynet share the signet genesis block, so the
 * block heights are the only reliable signal. The JSON paths read here are pinned by
 * `crypto/tests/changeset_json_contract_tests.rs`.
 */

/**
 * A block height at or above this is Mutinynet; a height above zero and below it is
 * public Signet. Also defined as `SIGNET_MUTINYNET_HEIGHT_BOUNDARY` in
 * `crypto/src/esplora_network_identity.rs`.
 */
export const SIGNET_MUTINYNET_HEIGHT_BOUNDARY = 1_000_000

export type SignetFamilyNetwork = 'signet' | 'mutinynet'

export type ChangesetChainClassification =
  | { kind: 'unknown' }
  | { kind: 'classified'; chains: ReadonlySet<SignetFamilyNetwork> }

type ChangesetChainHeights = {
  localTipHeight: number
  anchorHeights: number[]
}

const UNKNOWN_CLASSIFICATION: ChangesetChainClassification = { kind: 'unknown' }

/**
 * Collects the chain every anchor and the local tip belong to. A genesis-only tip
 * contributes nothing. Unreadable or unexpected JSON is `unknown`.
 */
export function classifyChangesetChains(changeSetJson: string): ChangesetChainClassification {
  const chainHeights = readChangesetChainHeights(changeSetJson)
  if (chainHeights == null) return UNKNOWN_CLASSIFICATION

  const contributingHeights = [...chainHeights.anchorHeights]
  if (chainHeights.localTipHeight > 0) {
    contributingHeights.push(chainHeights.localTipHeight)
  }
  return {
    kind: 'classified',
    chains: new Set(contributingHeights.map(signetFamilyNetworkForHeight)),
  }
}

/**
 * True when any anchor or the local tip belongs to the other signet-family chain.
 * Unknown changesets never contradict, so callers leave them untouched.
 */
export function descriptorChangesetContradictsNetwork(
  changeSetJson: string,
  network: SignetFamilyNetwork,
): boolean {
  const classification = classifyChangesetChains(changeSetJson)
  if (classification.kind === 'unknown') return false
  return [...classification.chains].some((chain) => chain !== network)
}

function signetFamilyNetworkForHeight(height: number): SignetFamilyNetwork {
  return height >= SIGNET_MUTINYNET_HEIGHT_BOUNDARY ? 'mutinynet' : 'signet'
}

function readChangesetChainHeights(changeSetJson: string): ChangesetChainHeights | null {
  const changeset = parseJsonObject(changeSetJson)
  if (changeset == null) return null

  const localTipHeight = readLocalTipHeight(asRecord(changeset.local_chain)?.blocks)
  const anchorHeights = readAnchorHeights(asRecord(changeset.tx_graph)?.anchors)
  if (localTipHeight == null || anchorHeights == null) return null
  return { localTipHeight, anchorHeights }
}

/** `local_chain.blocks`: height string to block hash, or `null` for a removed checkpoint. */
function readLocalTipHeight(blocks: unknown): number | null {
  const blocksByHeight = asRecord(blocks)
  if (blocksByHeight == null) return null

  let localTipHeight = 0
  for (const [heightKey, blockHash] of Object.entries(blocksByHeight)) {
    const height = parseBlockHeight(heightKey)
    if (height == null) return null
    if (blockHash === null) continue
    if (typeof blockHash !== 'string') return null
    localTipHeight = Math.max(localTipHeight, height)
  }
  return localTipHeight
}

/** `tx_graph.anchors`: `[ { block_id: { height, hash }, confirmation_time }, txid ]` pairs. */
function readAnchorHeights(anchors: unknown): number[] | null {
  if (!Array.isArray(anchors)) return null

  const anchorHeights: number[] = []
  for (const anchorPair of anchors) {
    const height = readAnchorHeight(anchorPair)
    if (height == null) return null
    anchorHeights.push(height)
  }
  return anchorHeights
}

function readAnchorHeight(anchorPair: unknown): number | null {
  if (!Array.isArray(anchorPair)) return null
  const blockId = asRecord(asRecord(anchorPair[0])?.block_id)
  const height = blockId?.height
  return isBlockHeight(height) ? height : null
}

function parseBlockHeight(heightKey: string): number | null {
  const height = Number(heightKey)
  return isBlockHeight(height) && String(height) === heightKey ? height : null
}

function isBlockHeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function parseJsonObject(json: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(json))
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}
