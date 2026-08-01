import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-automation-controller', () => ({
  getUnilateralExitAutomationSnapshot: vi.fn(() => ({
    prefs: { enabled: false, feePresetLabel: 'Medium', maxFeeRateSatPerVb: 10 },
    pausedReason: null,
    lastErrorMessage: null,
    scheduling: 'idle' as const,
  })),
  subscribeUnilateralExitAutomation: (listener: () => void) => {
    listener()
    return () => {}
  },
}))

import { getUnilateralExitAutomationSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit-automation-controller'
import { useUnilateralExitAutomationSnapshot } from '@/hooks/useUnilateralExitAutomationSnapshot'

describe('useUnilateralExitAutomationSnapshot', () => {
  it('does not trigger infinite re-renders when getSnapshot returns fresh prefs objects', () => {
    const mockedGetSnapshot = vi.mocked(getUnilateralExitAutomationSnapshot)
    mockedGetSnapshot.mockImplementation(() => ({
      prefs: { enabled: false, feePresetLabel: 'Medium', maxFeeRateSatPerVb: 10 },
      pausedReason: null,
      lastErrorMessage: null,
      scheduling: 'idle',
    }))

    const { result } = renderHook(() => useUnilateralExitAutomationSnapshot())

    expect(result.current.prefs.enabled).toBe(false)
    expect(mockedGetSnapshot.mock.calls.length).toBeLessThan(20)
  })
})
