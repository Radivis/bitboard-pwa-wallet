export const ARKADE_SESSION_LOADING_COMMENT_ROTATION_MS = 10_000

export const ARKADE_SESSION_LOADING_COMMENTS = [
  'Arkade by Ark Labs is one of multiple different protocols based on the Ark architecture. There are also Bark by Second and Wavelength by Lightning Labs.',
  'Arkade allows the movement of Bitcoin with truly minimal fees',
  'What if the Arkade operator goes down permanently? You can recover your coins in that emergency via unilateral exit',
  'Arkade is based on Virtual Transaction Outputs (VTXOs) that use the same transaction protocol as regular Bitcoin transactions, but are not broadcast to the Bitcoin blockchain.',
  "If VTXOs are about to expire, you should renew them - but if you don't, there is still a collaborative recovery path",
  'VTXOs can have different states - you can see those on the VTXOs page',
] as const

/** Next comment index, always different from the current one when more than one comment exists. */
export function nextArkadeSessionLoadingCommentIndex(
  currentIndex: number,
  commentCount: number,
): number {
  if (commentCount <= 1) {
    return 0
  }
  const stepsUntilDifferent = 1 + Math.floor(Math.random() * (commentCount - 1))
  return (currentIndex + stepsUntilDifferent) % commentCount
}
