import { claimObservedByBark } from '@/lib/bark/bark-emergency-claim'
import type {
  BarkEmergencyCpfpRequest,
  BarkEmergencyExitDrain,
  BarkEmergencyExitProgress,
  BarkEmergencyExitRow,
} from '@/workers/bark-api'
import type { PendingEmergencyClaim } from '@/lib/wallet/wallet-domain-types'

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
  pendingVtxoIds: () => Promise<string[]>
  drain: (
    address: string,
    feeRateSatPerVb: number,
    excludeVtxoIds: string[],
  ) => Promise<BarkEmergencyExitDrain>
  broadcast: (rawTxHex: string) => Promise<string>
  rememberPendingClaim: (pending: PendingEmergencyClaim) => Promise<void>
  broadcastOnBarkChain: (rawTxHex: string) => Promise<void>
  syncExits: () => Promise<BarkEmergencyExitRow[]>
  clearPendingClaim: () => Promise<void>
  syncBark: () => Promise<void>
  startOnchainBackgroundSync: () => void
}

export type ClaimedBarkEmergencyExit = {
  txid: string
  /** Bark's chain source reports every drained VTXO claim-in-progress or claimed. */
  observed: boolean
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

let barkEmergencyExitProgressQueue: Promise<void> = Promise.resolve()

/**
 * One Progress press: advance Bark's exit manager, sign each Pay-to-Anchor child
 * from the on-chain wallet, then advance again so those exits leave the CPFP wait.
 * A tip tick, this call, and post-sync settle share one queue so two CPFP passes
 * do not overlap.
 */
export function progressBarkEmergencyExits(
  deps: ProgressBarkEmergencyExitDeps,
  feeRateSatPerVb: number,
): Promise<void> {
  const run = barkEmergencyExitProgressQueue.then(() =>
    progressBarkEmergencyExitsOnce(deps, feeRateSatPerVb),
  )
  barkEmergencyExitProgressQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function progressBarkEmergencyExitsOnce(
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
 * Drains fresh claimable exits, broadcasts the signed transaction, and asks Bark's
 * chain source whether it can see that spend. The app Esplora broadcast is not that proof.
 * Does not reveal a new on-chain address.
 */
export async function claimBarkEmergencyExits(
  deps: ClaimBarkEmergencyExitDeps,
  destinationAddress: string,
  feeRateSatPerVb: number,
): Promise<ClaimedBarkEmergencyExit> {
  const excludeVtxoIds = await deps.pendingVtxoIds()
  const drained = await deps.drain(destinationAddress, feeRateSatPerVb, excludeVtxoIds)
  const txid = await deps.broadcast(drained.rawTxHex)
  await deps.rememberPendingClaim({ txid, vtxoIds: drained.vtxoIds })
  try {
    await deps.broadcastOnBarkChain(drained.rawTxHex)
  } catch {
    // The app Esplora already accepted the transaction. Observation is sync_exits.
  }
  let observed = false
  try {
    const rows = await deps.syncExits()
    observed = claimObservedByBark(drained.vtxoIds, rows)
  } catch {
    // sync_exits failed. The pending claim stays until a later sync observes it.
  }
  if (observed) {
    await deps.clearPendingClaim()
  }
  try {
    await deps.syncBark()
  } catch {
    // A later sync can still observe the claim. The pending set stays until then.
  }
  deps.startOnchainBackgroundSync()
  return { txid, observed }
}
