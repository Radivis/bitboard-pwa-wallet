import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Bookmark, GraduationCap } from 'lucide-react'

import { designFocusClassName } from '@/components/design/design-classes'
import { designTypeClassName } from '@/components/design/design-type'
import { LIBRARY_LEVEL_LABEL, type LibraryLevel } from '@/lib/library/library-level'
import { cn } from '@/lib/shared/utils'

export function DesignLibraryCard({
  title,
  articleSlug,
  level,
  tags,
  isBookmarked,
  onToggleBookmark,
  bookmarkPending = false,
  className,
}: {
  title: string
  articleSlug: string
  level: LibraryLevel
  /** Tag links. They sit above the stretched title so each tag keeps its own target. */
  tags?: ReactNode
  isBookmarked: boolean
  onToggleBookmark: () => void
  bookmarkPending?: boolean
  className?: string
}) {
  return (
    <article
      data-slot="design-library-card"
      className={cn(
        'design-ui relative flex h-full w-full max-w-[480px] min-w-0 flex-col gap-4 rounded-[20px] px-6 py-3',
        className,
      )}
    >
      <Link
        to="/library/articles/$slug"
        params={{ slug: articleSlug }}
        data-library-card-title=""
        className={cn(
          designTypeClassName.emphasis,
          'text-[var(--design-text-regular)] outline-none after:absolute after:inset-0 after:content-[""]',
        )}
      >
        {title}
      </Link>
      {tags != null ? <div className="relative z-10 flex flex-wrap gap-4">{tags}</div> : null}
      <div role="img" aria-label={LIBRARY_LEVEL_LABEL[level]} className="flex items-center justify-center gap-2">
        {Array.from({ length: level }, (_, index) => (
          <GraduationCap
            key={index}
            className="size-6 shrink-0 text-[var(--design-text-regular)]"
            aria-hidden
          />
        ))}
      </div>
      <button
        type="button"
        className={cn(
          designFocusClassName,
          'absolute bottom-3 right-4 z-10 size-6 p-0 text-[var(--design-text-regular)]',
        )}
        aria-pressed={isBookmarked}
        aria-disabled={bookmarkPending || undefined}
        aria-label={
          isBookmarked ? `Remove ${title} from bookmarks` : `Add ${title} to bookmarks`
        }
        onClick={() => {
          if (bookmarkPending) return
          onToggleBookmark()
        }}
      >
        <Bookmark
          className={cn('size-6', isBookmarked && 'fill-[var(--design-text-regular)]')}
          aria-hidden
        />
      </button>
    </article>
  )
}
