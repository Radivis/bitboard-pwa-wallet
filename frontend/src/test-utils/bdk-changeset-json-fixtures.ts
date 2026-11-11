/**
 * Minimal BDK changeset JSON in the shape `crypto/tests/changeset_json_contract_tests.rs`
 * pins: `local_chain.blocks` and `tx_graph.anchors`.
 */

export const PUBLIC_SIGNET_ANCHOR_HEIGHT = 324_613
export const PUBLIC_SIGNET_TIP_HEIGHT = 328_647
export const MUTINYNET_ANCHOR_HEIGHT = 3_540_000
export const MUTINYNET_TIP_HEIGHT = 3_547_496

const ANCHOR_CONFIRMATION_TIME = 1_782_927_221

function fakeHex64(seed: number): string {
  return seed.toString(16).padStart(64, '0')
}

export function bdkChangesetJson(params: {
  blockHeights: number[]
  removedBlockHeights?: number[]
  anchorHeights?: number[]
}): string {
  const blocks: Record<string, string | null> = {}
  for (const height of params.blockHeights) {
    blocks[String(height)] = fakeHex64(height + 1)
  }
  for (const height of params.removedBlockHeights ?? []) {
    blocks[String(height)] = null
  }
  const anchors = (params.anchorHeights ?? []).map((height, anchorIndex) => [
    {
      block_id: { height, hash: fakeHex64(height + 1) },
      confirmation_time: ANCHOR_CONFIRMATION_TIME,
    },
    fakeHex64(anchorIndex + 0xabc),
  ])
  return JSON.stringify({
    network: 'signet',
    local_chain: { blocks },
    tx_graph: { txs: [], txouts: {}, anchors, last_seen: {} },
    indexer: { last_revealed: {} },
  })
}
