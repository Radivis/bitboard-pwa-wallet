import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useInfomodeStore } from '@/stores/infomodeStore'
import {
  INFOMODE_PRIMARY_SUPPRESSED_TOAST_ID,
  INFOMODE_SUPPRESSION_TOAST_TEXT,
  notifyInfomodePrimaryActionSuppressed,
} from '@/lib/infomode-suppression-feedback'

vi.mock('sonner', () => ({
  toast: { message: vi.fn() },
}))

describe('notifyInfomodePrimaryActionSuppressed', () => {
  beforeEach(() => {
    useInfomodeStore.setState({
      isActive: false,
      lightbulbSuppressionCue: 0,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows a deduplicated sonner message and bumps the lightbulb cue', () => {
    notifyInfomodePrimaryActionSuppressed()

    expect(vi.mocked(toast.message)).toHaveBeenCalledWith(INFOMODE_SUPPRESSION_TOAST_TEXT, {
      id: INFOMODE_PRIMARY_SUPPRESSED_TOAST_ID,
      duration: 8_000,
    })
    expect(useInfomodeStore.getState().lightbulbSuppressionCue).toBe(1)

    notifyInfomodePrimaryActionSuppressed()
    expect(useInfomodeStore.getState().lightbulbSuppressionCue).toBe(2)
  })
})
