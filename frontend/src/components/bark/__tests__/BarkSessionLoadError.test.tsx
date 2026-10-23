import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BARK_SESSION_LOAD_ERROR_TILT_CLASS } from '@/components/bark/bark-session-status-layout'
import { BarkSessionLoadError } from '@/components/bark/BarkSessionLoadError'

const retryLoad = vi.hoisted(() => vi.fn())

vi.mock('@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator', () => ({
  orchestrateBarkRetryLoad: () => retryLoad(),
}))

describe('BarkSessionLoadError', () => {
  it('shows a tilted red mark, the failure heading, and a sanitized error', () => {
    render(
      <BarkSessionLoadError errorMessage="connect failed https://ark.signet.2nd.dev/v1" />,
    )

    expect(
      screen.getByRole('heading', { name: 'Bark session could not be established' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('bark-session-load-error-message')).toHaveTextContent(
      'connect failed [url]',
    )

    const icon = screen.getByTestId('bark-session-load-error').querySelector('[aria-hidden="true"]')
    expect(icon).toHaveClass(BARK_SESSION_LOAD_ERROR_TILT_CLASS)
    expect(icon).toHaveClass('text-red-600')
    expect(icon).not.toHaveClass('animate-spin')
  })

  it('omits the error line when there is no message', () => {
    render(<BarkSessionLoadError errorMessage={null} />)

    expect(screen.queryByTestId('bark-session-load-error-message')).not.toBeInTheDocument()
  })

  it('retries session open from the error page', () => {
    retryLoad.mockClear()
    render(<BarkSessionLoadError errorMessage="Load failed" />)

    screen.getByRole('button', { name: 'Retry' }).click()
    expect(retryLoad).toHaveBeenCalledOnce()
  })
})
