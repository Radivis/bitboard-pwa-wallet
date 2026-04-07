import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import { Suspense, useLayoutEffect, type ReactElement } from 'react'
import { InfomodeProvider } from '@/components/infomode/InfomodeProvider'
import { useWalletCryptoSessionPathGateStore } from '@/stores/walletCryptoSessionPathGateStore'

export const TEST_MNEMONIC_12 =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

export const TEST_PASSWORD = 'TestP@ssword123'

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  const queryClient = createTestQueryClient()

  function Wrapper({ children }: { children: React.ReactNode }) {
    useLayoutEffect(() => {
      useWalletCryptoSessionPathGateStore.getState().setPathname('/wallet')
    }, [])
    return (
      <QueryClientProvider client={queryClient}>
        <InfomodeProvider>
          <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
            {children}
          </Suspense>
        </InfomodeProvider>
      </QueryClientProvider>
    )
  }

  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient }
}
