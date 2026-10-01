import { getBarkWorkerIfExists, terminateBarkWorker } from '@/workers/bark-factory'
import {
  awaitBarkLoadQuiescence,
  forceResetBarkLoadLifecycleForTeardown,
  orchestrateBarkLoad,
} from '@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { reportBarkSessionOpenError } from '@/lib/bark/bark-session-open-error-toast'
import type { NetworkMode } from '@/stores/walletStore'

/**
 * Drop the worker immediately. Used when leaving signet so a stuck Signet
 * handshake cannot block the network switch.
 */
export function abortBarkSessionForNetworkSwitch(): void {
  terminateBarkWorker()
  forceResetBarkLoadLifecycleForTeardown()
}

/**
 * Close the WASM session, then terminate the worker. Does not delete IndexedDB.
 */
export async function closeBarkSession(): Promise<void> {
  await awaitBarkLoadQuiescence()
  const barkWorker = getBarkWorkerIfExists()
  if (barkWorker != null) {
    try {
      await barkWorker.closeSession()
    } catch {
      // closeSession is best-effort during teardown.
    }
  }
  terminateBarkWorker()
  forceResetBarkLoadLifecycleForTeardown()
}

export function startBarkLoadAfterUnlock(params: {
  walletId: number
  networkMode: NetworkMode
}): void {
  if (!isBarkActiveForNetworkMode(params.networkMode)) return
  void orchestrateBarkLoad({
    walletId: params.walletId,
    networkMode: params.networkMode,
    allowRetryFromError: true,
  }).catch((err) => {
    reportBarkSessionOpenError(err)
  })
}

export async function refreshBarkSessionAfterNetworkSwitch(params: {
  walletId: number | null
  networkMode: NetworkMode
}): Promise<void> {
  if (params.walletId == null) return
  if (!isBarkActiveForNetworkMode(params.networkMode)) {
    await closeBarkSession()
    return
  }
  try {
    await orchestrateBarkLoad({
      walletId: params.walletId,
      networkMode: params.networkMode,
      allowRetryFromError: true,
    })
  } catch (error) {
    reportBarkSessionOpenError(error)
  }
}
