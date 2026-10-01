import type { BarkBoardAccepted } from '@/workers/bark-api'

export type SignedBarkFundingPsbt = {
  psbtBase64: string
  rawTxHex: string
  txid: string
}

export type PerformBarkBoardDeps = {
  signFundingPsbt: (psbtBase64: string) => Promise<SignedBarkFundingPsbt>
  submitBoardPsbt: (signedPsbtBase64: string) => Promise<BarkBoardAccepted>
  applyUnconfirmedFundingTx: (rawTxHex: string) => Promise<void>
  persistOnchainChangeset: () => Promise<void>
  startOnchainBackgroundSync: () => void
  syncBark: () => Promise<void>
}

export type PerformedBarkBoard = BarkBoardAccepted & {
  localWalletWarning: string | null
}

/**
 * Signs the reviewed PSBT and lets Bark broadcast it.
 * Does not call the on-chain Esplora broadcast, and does not write the receive cursor.
 * A failed submission leaves the on-chain wallet unchanged.
 * After Bark accepts the board, a local apply failure is a warning: the coins already moved.
 */
export async function performBarkBoard(
  deps: PerformBarkBoardDeps,
  preparedPsbtBase64: string,
): Promise<PerformedBarkBoard> {
  const signed = await deps.signFundingPsbt(preparedPsbtBase64)
  const accepted = await deps.submitBoardPsbt(signed.psbtBase64)
  const localWalletWarning = await applyAcceptedFundingTx(deps, signed.rawTxHex)
  try {
    await deps.syncBark()
  } catch (err) {
    const syncWarning = err instanceof Error ? err.message : String(err)
    return {
      ...accepted,
      localWalletWarning: joinWarnings(localWalletWarning, syncWarning),
    }
  }
  return { ...accepted, localWalletWarning }
}

async function applyAcceptedFundingTx(
  deps: PerformBarkBoardDeps,
  rawTxHex: string,
): Promise<string | null> {
  try {
    await deps.applyUnconfirmedFundingTx(rawTxHex)
    await deps.persistOnchainChangeset()
    deps.startOnchainBackgroundSync()
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

function joinWarnings(first: string | null, second: string): string {
  if (first == null || first.length === 0) return second
  return `${first} ${second}`
}
