import { renderHook } from '@testing-library/react'
import { createActor } from 'xstate'
import { describe, expect, it, vi } from 'vitest'
import { unilateralExitMachine } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.machine'

vi.mock('@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime', () => ({
  getUnilateralExitActorSnapshot: vi.fn(),
  subscribeUnilateralExitActor: (listener: () => void) => {
    listener()
    return () => {}
  },
}))

import { getUnilateralExitActorSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime'
import { useUnilateralExitAutomationSnapshot } from '@/hooks/useUnilateralExitAutomationSnapshot'

describe('useUnilateralExitAutomationSnapshot', () => {
  it('does not trigger infinite re-renders when actor snapshot is stable', () => {
    const actor = createActor(unilateralExitMachine, { input: { pollDelayMs: 2_000 } })
    actor.start()
    const mockedGetSnapshot = vi.mocked(getUnilateralExitActorSnapshot)
    mockedGetSnapshot.mockImplementation(() => actor.getSnapshot())

    const { result } = renderHook(() => useUnilateralExitAutomationSnapshot())

    expect(result.current.prefs.enabled).toBe(false)
    expect(mockedGetSnapshot.mock.calls.length).toBeLessThan(20)
  })
})
