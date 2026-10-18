const INVALID_EXIT_CHAIN_NOTICES = 'Bark exit chain notices are invalid'

/** A sweep is an anchor spend. A seizure is a checkpoint spend. */
export type BarkExitChainNoticeKind = 'sweep' | 'seizure'

export const BARK_ANCHOR_SWEEP_WARNING =
  'The on-chain output backing these VTXOs was spent by the server after expiry. These VTXOs are spent, and this wallet cannot recover them.'

export const BARK_CHECKPOINT_SEIZURE_WARNING =
  'A checkpoint from an emergency exit was spent because the exit was not continued. These VTXOs are spent, and this wallet cannot recover them.'

export type BarkExitChainNotices = {
  anchorSweepVtxoIds: string[]
  checkpointSeizureVtxoIds: string[]
}

/** Reads the JSON object from `bark_exit_chain_notices`. */
export function readBarkExitChainNotices(value: unknown): BarkExitChainNotices {
  if (typeof value !== 'string') {
    throw new Error(INVALID_EXIT_CHAIN_NOTICES)
  }
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed)) {
    throw new Error(INVALID_EXIT_CHAIN_NOTICES)
  }
  return {
    anchorSweepVtxoIds: vtxoIdsFromUnknown(parsed.anchorSweepVtxoIds),
    checkpointSeizureVtxoIds: vtxoIdsFromUnknown(parsed.checkpointSeizureVtxoIds),
  }
}

function vtxoIdsFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new Error(INVALID_EXIT_CHAIN_NOTICES)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}
