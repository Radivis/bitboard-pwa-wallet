export const BARK_SESSION_LOADING_COMMENT_ROTATION_MS = 10_000

export const BARK_SESSION_LOADING_COMMENTS = [
  'Bark and Arkade balances cannot be exchanged directly. Their exchange requires swaps or on-chain transactions.',
  'Both Bark and Arkade are based on Ark, but have different strengths. Bark is targeted at making payments easier, while Arkade has a more universal approach with programmability in mind.',
  'A collaborative exit sends Bark funds to your current on-chain receive address. That is the preferred way to exit Bark funds.',
  'If the Bark server is unavailable, emergency exit can still move selected coins on-chain. High on-chain transaction fees may make exiting small VTXOs economically unviable for a while.',
  "The VTXO list is Bark's local record of each coin. Spent and exited coins stay hidden until you show them.",
  'Bark is currently available on Signet and Mainnet.',
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
