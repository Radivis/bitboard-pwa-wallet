import { claimObservedByBark } from '@/lib/bark/bark-emergency-claim'
import type {
  BarkEmergencyCpfpRequest,
  BarkEmergencyExitDrain,
  BarkEmergencyExitProgress,
  BarkEmergencyExitRow,
} from '@/workers/bark-api'
import { errorMessage } from '@/lib/shared/utils'
import { formatSats } from '@/lib/wallet/bitcoin-utils'
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
  /** On-chain wallet balance including pending and immature coins. */
  onchainTotalSats: () => Promise<number>
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

export type BarkEmergencyExitProgressOutcome = {
  requestedChildren: number
  providedChildren: number
}

export const BARK_CPFP_INSUFFICIENT_FUNDS = 'bark_cpfp_insufficient_funds'
/** Same label as `BARK_CPFP_NEEDED_SATS_LABEL` in `crypto/src/p2a_cpfp.rs`. */
const BARK_CPFP_NEEDED_SATS_LABEL = 'needed_sats'
export const BARK_CPFP_UNFUNDABLE = 'bark_cpfp_unfundable'

type SignedChild = { childTxHex: string } | { shortfallSats: number }

export type ClaimedBarkEmergencyExit = {
  txid: string
  /** Bark's chain source reports every drained VTXO claim-in-progress or claimed. */
  observed: boolean
}

/**
 * Text after `bark_cpfp_insufficient_funds: `, or null for other errors. The marker is
 * not at the start because `CryptoError::Transaction` prefixes `Transaction error: `.
 */
function insufficientFundsDetail(err: unknown): string | null {
  const marker = `${BARK_CPFP_INSUFFICIENT_FUNDS}: `
  const message = errorMessage(err)
  const markerIndex = message.indexOf(marker)
  return markerIndex === -1 ? null : message.slice(markerIndex + marker.length)
}

export function barkEmergencyExitChildrenWaitForFunds(
  outcome: BarkEmergencyExitProgressOutcome,
): boolean {
  return outcome.providedChildren < outcome.requestedChildren
}

/** The bumper wallet has no confirmed coin left for this Pay-to-Anchor child. */
export function isBarkCpfpInsufficientFundsError(err: unknown): boolean {
  return insufficientFundsDetail(err) != null
}

/** Even pending coins cannot pay for the children that are waiting. */
export function isBarkCpfpUnfundableError(err: unknown): boolean {
  return errorMessage(err).startsWith(BARK_CPFP_UNFUNDABLE)
}

/**
 * Sats the signer reported missing in `bark_cpfp_insufficient_funds: needed_sats=<sats>; ...`.
 * Zero when the error does not name an amount, so it never causes a false unfundable error.
 */
export function barkCpfpShortfallNeededSats(err: unknown): number {
  const neededLabel = `${BARK_CPFP_NEEDED_SATS_LABEL}=`
  const detail = insufficientFundsDetail(err)
  if (detail == null || !detail.startsWith(neededLabel)) return 0
  const neededSats = Number(detail.slice(neededLabel.length).split(';', 1)[0])
  return Number.isSafeInteger(neededSats) && neededSats > 0 ? neededSats : 0
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
 * A child the wallet cannot fund from confirmed coins is skipped; a later run funds it
 * once earlier change confirms. When the skipped children need more than the wallet
 * holds even with pending coins, waiting cannot help and the run fails as unfundable.
 * A tip tick, this call, and post-sync settle share one queue so two CPFP passes do
 * not overlap.
 */
export function progressBarkEmergencyExits(
  deps: ProgressBarkEmergencyExitDeps,
  feeRateSatPerVb: number,
): Promise<BarkEmergencyExitProgressOutcome> {
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
): Promise<BarkEmergencyExitProgressOutcome> {
  const { requests } = await deps.progress()
  let providedChildren = 0
  let waitingNeededSats = 0
  try {
    for (const request of requests) {
      const signed = await signFundedChild(deps, request, feeRateSatPerVb)
      if ('shortfallSats' in signed) {
        waitingNeededSats += signed.shortfallSats
        continue
      }
      await deps.provideChild(request.parentTxid, signed.childTxHex)
      providedChildren += 1
      await deps.rememberUnconfirmedChild(signed.childTxHex)
    }
    if (providedChildren < requests.length) {
      await assertWaitingChildrenFundable(deps, waitingNeededSats)
    }
  } catch (err) {
    if (providedChildren > 0) {
      await deps.progress().catch(() => undefined)
    }
    throw err instanceof Error ? err : new Error(errorMessage(err))
  }
  if (providedChildren > 0) {
    await deps.progress()
  }
  return { requestedChildren: requests.length, providedChildren }
}

/** A shortfall when the wallet has no confirmed coin left for this child. */
async function signFundedChild(
  deps: ProgressBarkEmergencyExitDeps,
  request: BarkEmergencyCpfpRequest,
  feeRateSatPerVb: number,
): Promise<SignedChild> {
  try {
    return { childTxHex: await deps.signChild(request, feeRateSatPerVb) }
  } catch (err) {
    if (!isBarkCpfpInsufficientFundsError(err)) throw err
    return { shortfallSats: barkCpfpShortfallNeededSats(err) }
  }
}

/**
 * Change from children funded earlier confirms and pays for later ones, so the
 * whole balance including pending coins is what the waiting children can draw on.
 */
async function assertWaitingChildrenFundable(
  deps: ProgressBarkEmergencyExitDeps,
  waitingNeededSats: number,
): Promise<void> {
  const onchainTotalSats = await deps.onchainTotalSats()
  if (onchainTotalSats >= waitingNeededSats) return
  throw new Error(
    `${BARK_CPFP_UNFUNDABLE}: Waiting exit transactions need at least ${formatSats(waitingNeededSats)} sat, but the on-chain wallet holds ${formatSats(onchainTotalSats)} sat including pending coins. Add on-chain funds to continue the emergency exit.`,
  )
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
