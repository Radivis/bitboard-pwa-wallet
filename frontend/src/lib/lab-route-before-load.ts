import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { switchToLabNetwork } from '@/lib/switch-to-lab-network'

export const LAB_SWITCH_LOADING_TOAST_ID = 'lab-network-switch-loading'
export const LAB_SWITCH_DONE_TOAST_ID = 'lab-network-switch-done'

export type LabRouteContext = {
  labAutoSwitchFailed: boolean
}

/**
 * Runs while navigating into `/lab` (TanStack `beforeLoad`). Ensures the wallet
 * is on Lab network before the lab layout renders.
 */
export async function runLabRouteBeforeLoad(): Promise<LabRouteContext> {
  const snapshot = useWalletStore.getState()
  if (snapshot.networkMode === 'lab') {
    return { labAutoSwitchFailed: false }
  }

  const previousNetworkMode = snapshot.networkMode

  // Yield once so the navigation transition can paint before we block on WASM / toasts.
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0)
  })

  toast.loading('Switching to Lab network…', {
    id: LAB_SWITCH_LOADING_TOAST_ID,
    duration: Infinity,
  })

  const { walletStatus, addressType, accountId } = useWalletStore.getState()
  const ok = await switchToLabNetwork({
    previousNetworkMode,
    walletStatus,
    addressType,
    accountId,
  })

  toast.dismiss(LAB_SWITCH_LOADING_TOAST_ID)

  if (!ok) {
    return { labAutoSwitchFailed: true }
  }

  toast.info('Network set to Lab', {
    id: LAB_SWITCH_DONE_TOAST_ID,
    description:
      'Use Settings and choose another network when you want mainnet, testnet, or another live chain again.',
  })

  return { labAutoSwitchFailed: false }
}
