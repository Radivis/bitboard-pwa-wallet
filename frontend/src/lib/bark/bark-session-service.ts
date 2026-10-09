import { removeBarkWalletQueries } from '@/lib/bark/bark-wallet-queries'
import { getBarkWorkerIfExists, terminateBarkWorker } from '@/workers/bark-factory'
import {
  awaitBarkLoadQuiescence,
  discardShownBarkLoadForSessionChange,
  forceResetBarkLoadLifecycleForTeardown,
  orchestrateBarkLoad,
} from '@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator'
import {
  awaitBarkSyncQuiescence,
  discardShownBarkBalanceForSessionChange,
  forceResetBarkSyncLifecycleForTeardown,
} from '@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { reportBarkSessionOpenError } from '@/lib/bark/bark-session-open-error-toast'
import type { NetworkMode } from '@/stores/walletStore'

/**
 * Drop the worker immediately. Used when leaving signet so a stuck Signet
 * handshake cannot block the network switch.
 */
export function abortBarkSessionForNetworkSwitch(): void {
  forceResetBarkSyncLifecycleForTeardown()
  terminateBarkWorker()
  forceResetBarkLoadLifecycleForTeardown()
  removeBarkWalletQueries()
}

/**
 * Close the WASM session, then terminate the worker.
 * The shown balance is cleared before quiescence so a finishing sync cannot republish it.
 */
export async function closeBarkSession(): Promise<void> {
  discardShownBarkBalanceForSessionChange()
  discardShownBarkLoadForSessionChange()
  await awaitBarkLoadQuiescence()
  await awaitBarkSyncQuiescence()
  const barkWorker = getBarkWorkerIfExists()
  if (barkWorker != null) {
    try {
      await barkWorker.closeSession()
    } catch {
      // closeSession is best-effort during teardown.
    }
  }
  terminateBarkWorker()
  forceResetBarkSyncLifecycleForTeardown()
  forceResetBarkLoadLifecycleForTeardown()
  removeBarkWalletQueries()
}

/**
 * Drop the previous wallet's Bark worker even when quiescence fails,
 * so the next wallet cannot observe that session.
 */
export async function closeBarkSessionForWalletChange(): Promise<void> {
  try {
    await closeBarkSession()
  } catch {
    abortBarkSessionForNetworkSwitch()
  }
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
