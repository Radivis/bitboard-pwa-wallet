import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ARKADE_SESSION_LOADING_COMMENT_ROTATION_MS,
  ARKADE_SESSION_LOADING_COMMENTS,
  ArkadeSessionLoading,
  nextArkadeSessionLoadingCommentIndex,
} from '@/components/arkade/ArkadeSessionLoading'

describe('ArkadeSessionLoading', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the session heading and one loading comment', () => {
    render(<ArkadeSessionLoading />)

    expect(screen.getByRole('heading', { name: 'Establishing Arkade session' })).toBeInTheDocument()
    const comment = screen.getByTestId('arkade-session-loading-comment').textContent
    expect(ARKADE_SESSION_LOADING_COMMENTS).toContain(comment)

    const icon = screen.getByTestId('arkade-session-loading').querySelector('[aria-hidden="true"]')
    expect(icon).toHaveClass('animate-spin')
    expect(icon).toHaveClass('[animation-duration:2s]')
  })

  it('rotates to a different comment every 10 seconds', () => {
    vi.useFakeTimers()
    render(<ArkadeSessionLoading />)

    const commentBeforeRotation = screen.getByTestId('arkade-session-loading-comment').textContent
    act(() => {
      vi.advanceTimersByTime(ARKADE_SESSION_LOADING_COMMENT_ROTATION_MS)
    })
    const commentAfterRotation = screen.getByTestId('arkade-session-loading-comment').textContent

    expect(ARKADE_SESSION_LOADING_COMMENTS).toContain(commentAfterRotation)
    expect(commentAfterRotation).not.toBe(commentBeforeRotation)
  })

  it('never repeats the current comment when choosing the next one', () => {
    for (let currentIndex = 0; currentIndex < ARKADE_SESSION_LOADING_COMMENTS.length; currentIndex += 1) {
      const nextIndex = nextArkadeSessionLoadingCommentIndex(
        currentIndex,
        ARKADE_SESSION_LOADING_COMMENTS.length,
      )
      expect(nextIndex).not.toBe(currentIndex)
      expect(nextIndex).toBeGreaterThanOrEqual(0)
      expect(nextIndex).toBeLessThan(ARKADE_SESSION_LOADING_COMMENTS.length)
    }
  })
})
