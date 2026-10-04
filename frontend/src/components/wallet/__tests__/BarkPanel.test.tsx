import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { BarkPanel } from '@/components/wallet/BarkPanel'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { NetworkMode } from '@/stores/walletStore'
import type { BarkPendingAction } from '@/workers/bark-api'

const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as NetworkMode,
  loadedDescriptorWallet: { networkMode: 'signet' as NetworkMode },
}))

const featureState = vi.hoisted(() => ({
  isBarkEnabled: true,
}))

const pendingActions = vi.hoisted(() => ({
  current: [] as BarkPendingAction[],
}))

const loadSnapshot = vi.hoisted(() => ({
  current: {
    loadPhase: 'loaded' as 'loaded' | 'loading' | 'load-error' | 'not-configured',
    networkMode: 'signet' as NetworkMode | null,
    errorMessage: null as string | null,
    receiveKeyIndex: 0 as number | null,
  },
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (state: typeof featureState) => unknown) => selector(featureState),
    { getState: () => featureState },
  ),
}))

vi.mock('@/hooks/useBarkPendingActionsQuery', () => ({
  useBarkPendingActionsQuery: () => ({ data: pendingActions.current }),
}))

vi.mock('@/hooks/useBarkLoadLifecycleSnapshot', () => ({
  useBarkLoadLifecycleSnapshot: () => loadSnapshot.current,
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: Object.assign(
      (selector: (state: typeof walletStoreState) => unknown) => selector(walletStoreState),
      { getState: () => walletStoreState },
    ),
  }
})

function pendingOffboard(): BarkPendingAction {
  return {
    id: '20fb503685add1f2fe5af4056979dc98',
    kind: 'offboard',
    title: 'Bark exit',
    status: 'Waiting for the exit transaction to confirm.',
    amountSats: 10_000,
    feeSats: 50_815,
    destination: 'tb1qcurrentaddressxxxxxxxx',
    txid: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
    error: null,
  }
}

describe('BarkPanel', () => {
  beforeEach(() => {
    pendingActions.current = []
    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'signet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'signet' }
    loadSnapshot.current = {
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
      receiveKeyIndex: 0,
    }
  })

  it('BARK-VTX-08 shows a pending offboard on the management panel', () => {
    pendingActions.current = [pendingOffboard()]
    renderWithProviders(<BarkPanel />)
    const banner = screen.getByTestId('bark-pending-action-banner')
    expect(banner).toHaveTextContent('Bark exit')
    expect(banner).toHaveTextContent('Waiting for the exit transaction to confirm.')
    expect(banner).toHaveTextContent('10000 sats')
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('BARK-VTX-01 shows List VTXOs when Bark is on and the network is signet', () => {
    renderWithProviders(<BarkPanel />)
    expect(screen.getByTestId('bark-list-vtxos-link')).toHaveAttribute(
      'href',
      '/wallet/bark/vtxos',
    )
    expect(screen.getByTestId('bark-list-vtxos-link')).toHaveTextContent('List VTXOs')
  })

  it('BARK-EMG-01 shows Emergency exit only when Bark is on and the network is signet', () => {
    renderWithProviders(<BarkPanel />)
    expect(screen.getByTestId('bark-emergency-exit-link')).toHaveAttribute(
      'href',
      '/wallet/bark/emergency-exit',
    )
    expect(screen.getByTestId('bark-emergency-exit-link')).toHaveTextContent('Emergency exit')
  })

  it('BARK-EMG-01 hides Emergency exit when Bark is off or the network is not signet', () => {
    featureState.isBarkEnabled = false
    const disabled = renderWithProviders(<BarkPanel />)
    expect(screen.queryByTestId('bark-emergency-exit-link')).not.toBeInTheDocument()
    disabled.unmount()

    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'mutinynet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'mutinynet' }
    renderWithProviders(<BarkPanel />)
    expect(screen.queryByTestId('bark-emergency-exit-link')).not.toBeInTheDocument()
  })

  it('BARK-VTX-01 hides List VTXOs when Bark is off or the network is not signet', () => {
    featureState.isBarkEnabled = false
    const disabled = renderWithProviders(<BarkPanel />)
    expect(screen.queryByTestId('bark-list-vtxos-link')).not.toBeInTheDocument()
    disabled.unmount()

    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'mutinynet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'mutinynet' }
    renderWithProviders(<BarkPanel />)
    expect(screen.queryByTestId('bark-list-vtxos-link')).not.toBeInTheDocument()
  })

  it('BARK-SESS-01 shows the embedded loading screen and hides the links while the session is opening', () => {
    loadSnapshot.current.loadPhase = 'loading'
    renderWithProviders(<BarkPanel />)
    expect(screen.getByTestId('bark-session-loading')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Establishing Bark session' })).toBeInTheDocument()
    expect(screen.queryByTestId('bark-list-vtxos-link')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bark-emergency-exit-link')).not.toBeInTheDocument()
  })

  it('BARK-SESS-02 shows the embedded error screen and hides the links when open fails', () => {
    loadSnapshot.current = {
      ...loadSnapshot.current,
      loadPhase: 'load-error',
      errorMessage: 'signet unreachable',
    }
    renderWithProviders(<BarkPanel />)
    expect(screen.getByTestId('bark-session-load-error')).toBeInTheDocument()
    expect(screen.getByText('signet unreachable')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-list-vtxos-link')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bark-emergency-exit-link')).not.toBeInTheDocument()
  })
})
