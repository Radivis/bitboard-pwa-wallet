import type {
  BarkEmergencyCpfpRequest,
  BarkEmergencyExitDrain,
  BarkEmergencyExitProgress,
} from '@/workers/bark-api'

export type StartBarkEmergencyExitDeps = {
  start: (vtxoIds: string[]) => Promise<void>
}

export type ProgressBarkEmergencyExitDeps = {
  progress: () => Promise<BarkEmergencyExitProgress>
  signChild: (
    request: BarkEmergencyCpfpRequest,
    feeRateSatPerVb: number,
  ) => Promise<string>
  provideChild: (parentTxid: string, childTxHex: string) => Promise<void>
  rememberUnconfirmedChild: (childTxHex: string) => Promise<void>
}

export type ClaimBarkEmergencyExitDeps = {
  drain: (address: string, feeRateSatPerVb: number) => Promise<BarkEmergencyExitDrain>
  broadcast: (rawTxHex: string) => Promise<string>
  syncBark: () => Promise<void>
  startOnchainBackgroundSync: () => void
}

export type ClaimedBarkEmergencyExit = {
  txid: string
  syncWarning: string | null
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Marks VTXOs for emergency exit. An empty id list exits the whole wallet. Does not offboard. */
export async function startBarkEmergencyExit(
  deps: StartBarkEmergencyExitDeps,
  vtxoIds: string[],
): Promise<void> {
  await deps.start(vtxoIds)
}

/**
 * One Progress press: advance Bark's exit manager, sign each Pay-to-Anchor child
 * from the on-chain wallet, then advance again so those exits leave the CPFP wait.
 */
export async function progressBarkEmergencyExits(
  deps: ProgressBarkEmergencyExitDeps,
  feeRateSatPerVb: number,
): Promise<void> {
  const first = await deps.progress()
  let providedChildren = 0
  try {
    for (const request of first.requests) {
      const childTxHex = await deps.signChild(request, feeRateSatPerVb)
      await deps.provideChild(request.parentTxid, childTxHex)
      providedChildren += 1
      await deps.rememberUnconfirmedChild(childTxHex)
    }
  } catch (err) {
    if (providedChildren > 0) {
      await deps.progress().catch(() => undefined)
    }
    throw err instanceof Error ? err : new Error(errorText(err))
  }
  if (providedChildren > 0) {
    await deps.progress()
  }
}

/**
 * Drains every claimable exit to the given address and broadcasts the signed transaction.
 * Does not reveal a new on-chain address.
 */
export async function claimBarkEmergencyExits(
  deps: ClaimBarkEmergencyExitDeps,
  destinationAddress: string,
  feeRateSatPerVb: number,
): Promise<ClaimedBarkEmergencyExit> {
  const drained = await deps.drain(destinationAddress, feeRateSatPerVb)
  const txid = await deps.broadcast(drained.rawTxHex)
  let syncWarning: string | null = null
  try {
    await deps.syncBark()
  } catch (err) {
    syncWarning = errorText(err)
  }
  deps.startOnchainBackgroundSync()
  return { txid, syncWarning }
}
