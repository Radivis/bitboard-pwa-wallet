import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, type ReactNode } from '@tanstack/react-query'
import { useOnchainAddressAccepted } from '@/hooks/useOnchainAddressAccepted'

const bitcoinAddressIsValid = vi.hoisted(() => vi.fn())

vi.mock('@/workers/crypto-factory', () => ({
  getCryptoWorker: () => ({ bitcoinAddressIsValid }),
}))

const TESTNET_P2WPKH = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
const MAINNET_P2PKH = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useOnchainAddressAccepted', () => {
  beforeEach(() => {
    bitcoinAddressIsValid.mockReset()
  })

  it('accepts segwit without asking the worker', () => {
    const { result } = renderHook(
      () => useOnchainAddressAccepted(TESTNET_P2WPKH, 'signet'),
      { wrapper: createWrapper() },
    )
    expect(result.current.onchainAddressValid).toBe(true)
    expect(result.current.onchainAddressCheckPending).toBe(false)
    expect(bitcoinAddressIsValid).not.toHaveBeenCalled()
  })

  it('stays pending until the worker accepts a legacy address', async () => {
    let resolveCheck: (accepted: boolean) => void = () => {}
    bitcoinAddressIsValid.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve
      }),
    )
    const { result } = renderHook(
      () => useOnchainAddressAccepted(MAINNET_P2PKH, 'mainnet'),
      { wrapper: createWrapper() },
    )
    expect(result.current.onchainAddressValid).toBe(false)
    expect(result.current.onchainAddressCheckPending).toBe(true)

    resolveCheck(true)
    await waitFor(() => {
      expect(result.current.onchainAddressValid).toBe(true)
    })
    expect(result.current.onchainAddressCheckPending).toBe(false)
    expect(bitcoinAddressIsValid).toHaveBeenCalledWith(MAINNET_P2PKH, 'bitcoin')
  })

  it('rejects a legacy address when the worker says no', async () => {
    bitcoinAddressIsValid.mockResolvedValue(false)
    const { result } = renderHook(
      () => useOnchainAddressAccepted('1', 'mainnet'),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.onchainAddressCheckPending).toBe(false)
    })
    expect(result.current.onchainAddressValid).toBe(false)
  })

  it('rejects a broken segwit string without asking the worker', () => {
    const { result } = renderHook(
      () => useOnchainAddressAccepted('tb1qnot-a-real-address', 'signet'),
      { wrapper: createWrapper() },
    )
    expect(result.current.onchainAddressValid).toBe(false)
    expect(result.current.onchainAddressCheckPending).toBe(false)
    expect(bitcoinAddressIsValid).not.toHaveBeenCalled()
  })
})
