import { persistBumperSidecarBestEffort } from '@/lib/wallet/persist-bumper-sidecar-after-sync'
import type { NetworkMode } from '@/stores/walletStore'
import { getArkadeWorker } from '@/workers/arkade-factory'

export interface BackgroundBumperWalletSyncParams {
  walletId: number
  networkMode: NetworkMode
  syncBumperWallet?: () => Promise<void>
  persistSidecar?: (scope: { walletId: number; networkMode: NetworkMode }) => Promise<void>
}

let bumperScanInFlight: Promise<void> | null = null

export async function runBackgroundBumperWalletSync(
  params: BackgroundBumperWalletSyncParams,
): Promise<void> {
  const syncBumperWallet =
    params.syncBumperWallet ?? (() => getArkadeWorker().syncBumperWallet())
  const persistSidecar =
    params.persistSidecar ??
    ((scope) =>
      persistBumperSidecarBestEffort(scope, 'after complete-page bumper scan'))
  await syncBumperWallet()
  await persistSidecar({
    walletId: params.walletId,
    networkMode: params.networkMode,
  })
}

/** Starts the once-per-session bumper scan without blocking the caller. */
export function scheduleBackgroundBumperWalletSync(
  params: BackgroundBumperWalletSyncParams,
): void {
  if (bumperScanInFlight != null) {
    return
  }
  const scan = runBackgroundBumperWalletSync(params)
    .catch((error: unknown) => {
      console.warn('Background bumper wallet scan failed', error)
    })
    .finally(() => {
      if (bumperScanInFlight === scan) {
        bumperScanInFlight = null
      }
    })
  bumperScanInFlight = scan
}
