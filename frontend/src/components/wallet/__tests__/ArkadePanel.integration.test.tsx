import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ArkadePanel } from '@/components/wallet/ArkadePanel'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  }
})

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ isArkadeEnabled: true, isMainnetAccessEnabled: false }),
    { getState: () => ({ isArkadeEnabled: true, isMainnetAccessEnabled: false }) },
  ),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  const state = {
    ...actual.useWalletStore.getState(),
    networkMode: 'signet' as const,
    activeWalletId: 1,
    committedNetworkMode: 'signet' as const,
  }
  return {
    ...actual,
    useWalletStore: Object.assign(
      (selector: (walletState: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  }
})

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ password: 'test' }),
}))

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => ({ isLoading: false, data: { confirmedSats: 1, totalSats: 1 } }),
  useArkadeDelegateInfoQuery: () => ({ data: null }),
  useArkadeRenewMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/components/wallet/ArkadeExitSection', () => ({
  ArkadeExitSection: () => <div data-testid="exit-section" />,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: () => ({ data: 'tark1qtest', isLoading: false }),
  }
})

vi.mock('@/lib/arkade/arkade-session-service', () => ({
  openArkadeSessionForWallet: vi.fn(),
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({ getAddress: vi.fn() }),
}))

describe('ArkadePanel', () => {
  it('does not link to separate arkade send or receive routes', () => {
    renderWithProviders(<ArkadePanel />)
    expect(screen.queryByRole('link', { name: 'Receive' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Send' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Board from on-chain' })).toBeInTheDocument()
  })
})
