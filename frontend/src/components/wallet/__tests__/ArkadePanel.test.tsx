import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ArkadeExitSection } from '@/components/wallet/ArkadeExitSection'

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
    {
      getState: () => ({ isArkadeEnabled: true, isMainnetAccessEnabled: false }),
    },
  ),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  const state = {
    ...actual.useWalletStore.getState(),
    networkMode: 'signet' as const,
    activeWalletId: 1,
    currentAddress: 'tb1qexample',
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
    selector({ password: 'test-password' }),
}))

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => ({
    isLoading: false,
    data: { confirmedSats: 1000, totalSats: 1000 },
  }),
  useArkadeDelegateInfoQuery: () => ({ data: null }),
  useArkadeRenewMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeExitCandidatesQuery: () => ({ data: [], isLoading: false }),
  useArkadeBumperInfoQuery: () => ({ data: null, isLoading: false }),
  useArkadeCollaborativeExitMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeUnilateralUnrollMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeCompleteUnilateralExitMutation: () => ({ mutate: vi.fn(), isPending: false }),
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

describe('ArkadeExitSection', () => {
  it('shows collaborative and unilateral exit actions', () => {
    renderWithProviders(<ArkadeExitSection />)
    expect(screen.getByRole('button', { name: 'Collaborative exit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unilateral exit' })).toBeInTheDocument()
  })
})
