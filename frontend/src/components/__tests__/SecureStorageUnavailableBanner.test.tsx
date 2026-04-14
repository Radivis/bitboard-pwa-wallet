import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SecureStorageUnavailableBanner } from '@/components/SecureStorageUnavailableBanner'
import { useSecureStorageAvailabilityStore } from '@/stores/secureStorageAvailabilityStore'

describe('SecureStorageUnavailableBanner', () => {
  afterEach(() => {
    act(() => {
      useSecureStorageAvailabilityStore.setState({
        isAvailable: true,
        lastErrorMessage: null,
        opfsLikelyUnsupported: false,
      })
    })
  })

  it('renders nothing when secure storage is available', () => {
    const { container } = render(<SecureStorageUnavailableBanner />)
    expect(container.textContent).toBe('')
  })

  it('shows OPFS-oriented copy when OPFS is likely unsupported', () => {
    act(() => {
      useSecureStorageAvailabilityStore.getState().markUnavailable({
        lastErrorMessage: 'unit test error',
        opfsLikelyUnsupported: true,
      })
    })
    render(<SecureStorageUnavailableBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByText(/Origin Private File System/i),
    ).toBeInTheDocument()
    expect(screen.getByTestId('secure-storage-error-detail')).toHaveTextContent(
      'unit test error',
    )
  })

  it('shows broader copy when OPFS probe succeeded but DB failed', () => {
    act(() => {
      useSecureStorageAvailabilityStore.getState().markUnavailable({
        lastErrorMessage: 'sqlite failure',
        opfsLikelyUnsupported: false,
      })
    })
    render(<SecureStorageUnavailableBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByText(/Secure storage could not be opened/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Origin Private File System/i),
    ).not.toBeInTheDocument()
  })
})
