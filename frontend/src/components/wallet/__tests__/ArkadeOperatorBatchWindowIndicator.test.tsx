import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { ArkadeOperatorBatchWindowIndicator } from '@/components/wallet/ArkadeOperatorBatchWindowIndicator'
import { renderWithProviders } from '@/test-utils/test-providers'

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeOperatorScheduledSessionQuery: vi.fn(),
}))

import { useArkadeOperatorScheduledSessionQuery } from '@/hooks/useArkadeQueries'

const useScheduleQueryMock = vi.mocked(useArkadeOperatorScheduledSessionQuery)

describe('ArkadeOperatorBatchWindowIndicator', () => {
  it('renders_not_published_when_schedule_unavailable', () => {
    useScheduleQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: null,
    } as never)

    renderWithProviders(<ArkadeOperatorBatchWindowIndicator />)
    expect(screen.getByTestId('arkade-operator-batch-window-unavailable')).toBeInTheDocument()
    expect(screen.getByText(/Operator batch schedule not published/i)).toBeInTheDocument()
  })

  it('renders_next_batch_window_when_schedule_present', () => {
    const nowUnixSecs = Math.floor(Date.now() / 1000)
    useScheduleQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        nextStartTime: nowUnixSecs + 3_600,
        nextEndTime: nowUnixSecs + 4_200,
        period: 3_600,
        duration: 600,
        inProgress: false,
      },
    } as never)

    renderWithProviders(<ArkadeOperatorBatchWindowIndicator />)
    expect(screen.getByTestId('arkade-operator-batch-window-indicator')).toBeInTheDocument()
    expect(screen.getByText(/Next operator batch round starts/i)).toBeInTheDocument()
  })
})
