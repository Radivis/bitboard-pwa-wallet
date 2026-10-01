import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { BarkPanel } from '@/components/wallet/BarkPanel'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { NetworkMode } from '@/stores/walletStore'

const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as NetworkMode,
  loadedDescriptorWallet: { networkMode: 'signet' as NetworkMode },
}))

const featureState = vi.hoisted(() => ({
  isBarkEnabled: true,
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

describe('BarkPanel', () => {
  beforeEach(() => {
    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'signet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'signet' }
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
})
