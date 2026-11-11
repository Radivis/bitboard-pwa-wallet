import { describe, expect, it } from 'vitest'
import {
  ARKADE_EXIT_CANDIDATES_POLL_MS,
  unilateralExitInProgressRefreshOptions,
} from '@/lib/arkade/arkade-query-timings'

describe('complete unilateral exit refresh', () => {
  it('keeps polling the in-progress list when the window is not focused', () => {
    expect(unilateralExitInProgressRefreshOptions(true, true)).toEqual({
      refetchInterval: ARKADE_EXIT_CANDIDATES_POLL_MS,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
    })
  })

  it('does not poll the in-progress list in the background for other pages', () => {
    expect(unilateralExitInProgressRefreshOptions(true, false)).toEqual({
      refetchInterval: ARKADE_EXIT_CANDIDATES_POLL_MS,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
    })
  })
})
