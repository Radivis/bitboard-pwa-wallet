export const DESIGN_WALLET_DRAWER_ID = 'app-wallet-drawer'

export function pointerStartedOnWalletDrawerToggle(target: EventTarget | null): boolean {
  const element = elementFromEventTarget(target)
  if (element == null) return false
  return element.closest(`[aria-controls="${DESIGN_WALLET_DRAWER_ID}"]`) != null
}

/** Downward swipes that start on the wallet icon belong to the wallet drawer. */
export function networkOpenSwipeStartsOnWalletToggle(
  mode: 'open' | 'close',
  target: EventTarget | null,
): boolean {
  return mode === 'open' && pointerStartedOnWalletDrawerToggle(target)
}

export function walletDrawerSwipeMode({
  open,
  startedOnPanel,
  startedOnToggle,
}: {
  open: boolean
  startedOnPanel: boolean
  startedOnToggle: boolean
}): 'open' | 'close' | null {
  if (open && startedOnPanel) return 'close'
  if (!open && startedOnToggle) return 'open'
  return null
}

function elementFromEventTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target
  if (target instanceof Node) return target.parentElement
  return null
}
