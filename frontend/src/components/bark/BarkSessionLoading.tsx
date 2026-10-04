import { useEffect, useState } from 'react'
import { Dog } from 'lucide-react'
import {
  BARK_SESSION_LOADING_COMMENTS,
  BARK_SESSION_LOADING_COMMENT_ROTATION_MS,
  nextBarkSessionLoadingCommentIndex,
} from '@/components/bark/bark-session-loading-comments'
import {
  BARK_SESSION_LOADING_SPIN_DURATION_CLASS,
  barkSessionStatusClassName,
} from '@/components/bark/bark-session-status-layout'

function initialCommentIndex(): number {
  return Math.floor(Math.random() * BARK_SESSION_LOADING_COMMENTS.length)
}

export function BarkSessionLoading({ embedded = false }: { embedded?: boolean }) {
  const [commentIndex, setCommentIndex] = useState(initialCommentIndex)

  useEffect(() => {
    const rotationTimer = setInterval(() => {
      setCommentIndex((currentIndex) =>
        nextBarkSessionLoadingCommentIndex(
          currentIndex,
          BARK_SESSION_LOADING_COMMENTS.length,
        ),
      )
    }, BARK_SESSION_LOADING_COMMENT_ROTATION_MS)
    return () => clearInterval(rotationTimer)
  }, [])

  return (
    <div className={barkSessionStatusClassName(embedded)} data-testid="bark-session-loading">
      <Dog
        className={`size-24 animate-spin ${BARK_SESSION_LOADING_SPIN_DURATION_CLASS}`}
        aria-hidden
      />
      <h1 className="text-2xl font-semibold">Establishing Bark session</h1>
      <p className="max-w-xl text-muted-foreground" data-testid="bark-session-loading-comment">
        {BARK_SESSION_LOADING_COMMENTS[commentIndex]}
      </p>
    </div>
  )
}
