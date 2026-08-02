import { renderHook } from '@testing-library/react'
import { createActor } from 'xstate'
import { describe, expect, it, vi } from 'vitest'
import { unilateralExitMachine } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.machine'
import { toUnilateralExitActorSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-snapshot'

vi.mock('@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime', () => ({
  getUnilateralExitActorSnapshot: vi.fn(),
  subscribeUnilateralExitActor: (listener: () => void) => {
    listener()
    return () => {}
  },
}))

import { getUnilateralExitActorSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime'
import { useUnilateralExitActorSnapshot } from '@/hooks/useUnilateralExitLifecycleSnapshot'

describe('useUnilateralExitActorSnapshot', () => {
  it('does not trigger infinite re-renders when actor snapshot is stable', () => {
    const actor = createActor(unilateralExitMachine, { input: { pollDelayMs: 2_000 } })
    actor.start()
    const mockedGetSnapshot = vi.mocked(getUnilateralExitActorSnapshot)
    mockedGetSnapshot.mockImplementation(() =>
      toUnilateralExitActorSnapshot(actor.getSnapshot()),
    )

    const { result } = renderHook(() => useUnilateralExitActorSnapshot())

    expect(result.current.value).toBe('notConfigured')
    expect(mockedGetSnapshot.mock.calls.length).toBeLessThan(20)
  })
})
