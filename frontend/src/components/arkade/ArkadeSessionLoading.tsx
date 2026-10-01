import { useEffect, useState } from 'react'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import {
  ARKADE_SESSION_LOADING_COMMENTS,
  ARKADE_SESSION_LOADING_COMMENT_ROTATION_MS,
  nextArkadeSessionLoadingCommentIndex,
} from '@/components/arkade/arkade-session-loading-comments'
import {
  ARKADE_SESSION_LOADING_SPIN_DURATION_CLASS,
  arkadeSessionStatusClassName,
} from '@/components/arkade/arkade-session-status-layout'

function initialCommentIndex(): number {
  return Math.floor(Math.random() * ARKADE_SESSION_LOADING_COMMENTS.length)
}

export function ArkadeSessionLoading({ embedded = false }: { embedded?: boolean }) {
  const [commentIndex, setCommentIndex] = useState(initialCommentIndex)

  useEffect(() => {
    const rotationTimer = setInterval(() => {
      setCommentIndex((currentIndex) =>
        nextArkadeSessionLoadingCommentIndex(
          currentIndex,
          ARKADE_SESSION_LOADING_COMMENTS.length,
        ),
      )
    }, ARKADE_SESSION_LOADING_COMMENT_ROTATION_MS)
    return () => clearInterval(rotationTimer)
  }, [])

  return (
    <div className={arkadeSessionStatusClassName(embedded)} data-testid="arkade-session-loading">
      <ArkadeIcon
        className={`size-24 animate-spin ${ARKADE_SESSION_LOADING_SPIN_DURATION_CLASS}`}
      />
      <h1 className="text-2xl font-semibold">Establishing Arkade session</h1>
      <p className="max-w-xl text-muted-foreground" data-testid="arkade-session-loading-comment">
        {ARKADE_SESSION_LOADING_COMMENTS[commentIndex]}
      </p>
    </div>
  )
}
