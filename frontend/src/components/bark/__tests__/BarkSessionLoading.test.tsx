import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BARK_SESSION_LOADING_COMMENT_ROTATION_MS,
  BARK_SESSION_LOADING_COMMENTS,
  nextBarkSessionLoadingCommentIndex,
} from '@/components/bark/bark-session-loading-comments'
import { BARK_SESSION_LOADING_SPIN_DURATION_CLASS } from '@/components/bark/bark-session-status-layout'
import { BarkSessionLoading } from '@/components/bark/BarkSessionLoading'

describe('BarkSessionLoading', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the session heading and one loading comment', () => {
    render(<BarkSessionLoading />)

    expect(screen.getByRole('heading', { name: 'Establishing Bark session' })).toBeInTheDocument()
    const comment = screen.getByTestId('bark-session-loading-comment').textContent
    expect(BARK_SESSION_LOADING_COMMENTS).toContain(comment)

    const icon = screen.getByTestId('bark-session-loading').querySelector('[aria-hidden="true"]')
    expect(icon).toHaveClass('animate-spin')
    expect(icon).toHaveClass(BARK_SESSION_LOADING_SPIN_DURATION_CLASS)
  })

  it('rotates to a different comment every 10 seconds', () => {
    vi.useFakeTimers()
    render(<BarkSessionLoading />)

    const commentBeforeRotation = screen.getByTestId('bark-session-loading-comment').textContent
    act(() => {
      vi.advanceTimersByTime(BARK_SESSION_LOADING_COMMENT_ROTATION_MS)
    })
    const commentAfterRotation = screen.getByTestId('bark-session-loading-comment').textContent

    expect(BARK_SESSION_LOADING_COMMENTS).toContain(commentAfterRotation)
    expect(commentAfterRotation).not.toBe(commentBeforeRotation)
  })

  it('never repeats the current comment when choosing the next one', () => {
    for (let currentIndex = 0; currentIndex < BARK_SESSION_LOADING_COMMENTS.length; currentIndex += 1) {
      const nextIndex = nextBarkSessionLoadingCommentIndex(
        currentIndex,
        BARK_SESSION_LOADING_COMMENTS.length,
      )
      expect(nextIndex).not.toBe(currentIndex)
      expect(nextIndex).toBeGreaterThanOrEqual(0)
      expect(nextIndex).toBeLessThan(BARK_SESSION_LOADING_COMMENTS.length)
    }
  })
})
