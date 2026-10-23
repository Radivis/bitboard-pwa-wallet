import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWalletStore } from '@/stores/walletStore'
import { useRailLoadOnFeatureActivation } from '@/hooks/useRailLoadOnFeatureActivation'

const ACTIVE_WALLET_ID = 7

function renderRailActivationHook(initiallyActivated: boolean) {
  const startRailLoad = vi.fn()
  const isRailActiveForNetwork = vi.fn(() => true)
  const hook = renderHook(
    ({ isRailActivated }: { isRailActivated: boolean }) =>
      useRailLoadOnFeatureActivation({
        isRailActivated,
        isRailActiveForNetwork,
        startRailLoad,
      }),
    { initialProps: { isRailActivated: initiallyActivated } },
  )
  return { ...hook, startRailLoad, isRailActiveForNetwork }
}

describe('useRailLoadOnFeatureActivation', () => {
  beforeEach(() => {
    useWalletStore.setState({
      activeWalletId: ACTIVE_WALLET_ID,
      walletStatus: 'unlocked',
      networkMode: 'signet',
    })
  })

  it('does not load on mount when the rail is already activated', () => {
    const { startRailLoad } = renderRailActivationHook(true)
    expect(startRailLoad).not.toHaveBeenCalled()
  })

  it('loads the active wallet when the rail becomes activated while unlocked', () => {
    const { rerender, startRailLoad } = renderRailActivationHook(false)
    rerender({ isRailActivated: true })
    expect(startRailLoad).toHaveBeenCalledTimes(1)
    expect(startRailLoad).toHaveBeenCalledWith({
      walletId: ACTIVE_WALLET_ID,
      networkMode: 'signet',
    })
  })

  it('does not load when the wallet is locked', () => {
    useWalletStore.setState({ walletStatus: 'locked' })
    const { rerender, startRailLoad } = renderRailActivationHook(false)
    rerender({ isRailActivated: true })
    expect(startRailLoad).not.toHaveBeenCalled()
  })

  it('does not load when the rail is not active for the current network', () => {
    const { rerender, startRailLoad, isRailActiveForNetwork } = renderRailActivationHook(false)
    isRailActiveForNetwork.mockReturnValue(false)
    rerender({ isRailActivated: true })
    expect(isRailActiveForNetwork).toHaveBeenCalledWith('signet')
    expect(startRailLoad).not.toHaveBeenCalled()
  })

  it('does not load again on rerender without a new activation', () => {
    const { rerender, startRailLoad } = renderRailActivationHook(false)
    rerender({ isRailActivated: true })
    rerender({ isRailActivated: true })
    expect(startRailLoad).toHaveBeenCalledTimes(1)
  })

  it('loads again after the rail is deactivated and activated once more', () => {
    const { rerender, startRailLoad } = renderRailActivationHook(false)
    rerender({ isRailActivated: true })
    rerender({ isRailActivated: false })
    rerender({ isRailActivated: true })
    expect(startRailLoad).toHaveBeenCalledTimes(2)
  })
})
