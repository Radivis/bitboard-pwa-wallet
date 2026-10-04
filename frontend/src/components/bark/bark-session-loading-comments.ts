export const BARK_SESSION_LOADING_COMMENT_ROTATION_MS = 10_000

export const BARK_SESSION_LOADING_COMMENTS = [
  'Bark sats stay separate from your on-chain total and from Arkade.',
  'Boarding moves sats from your on-chain wallet into Bark. The spendable balance updates after confirmations and a Bark sync.',
  'A collaborative exit sends Bark funds to your current on-chain receive address. Bark broadcasts that exit.',
  'If the Bark server is unavailable, emergency exit can still move selected coins on-chain.',
  "The VTXO list is Bark's local record of each coin. Spent and exited coins stay hidden until you show them.",
  'Signet and Mainnet each keep their own encrypted Bark record.',
] as const

/** Next comment index, always different from the current one when more than one comment exists. */
export function nextBarkSessionLoadingCommentIndex(
  currentIndex: number,
  commentCount: number,
): number {
  if (commentCount <= 1) {
    return 0
  }
  const stepsUntilDifferent = 1 + Math.floor(Math.random() * (commentCount - 1))
  return (currentIndex + stepsUntilDifferent) % commentCount
}
