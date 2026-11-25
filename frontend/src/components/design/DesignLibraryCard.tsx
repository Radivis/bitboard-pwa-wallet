import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { GraduationCap } from 'lucide-react'

import { designTypeClassName } from '@/components/design/design-type'
import { LIBRARY_LEVEL_LABEL, type LibraryLevel } from '@/lib/library/library-level'
import { cn } from '@/lib/shared/utils'

export function DesignLibraryCard({
  title,
  articleSlug,
  level,
  tags,
  className,
}: {
  title: string
  articleSlug: string
  level: LibraryLevel
  /** Tag links. They sit above the stretched title so each tag keeps its own target. */
  tags?: ReactNode
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
    </article>
  )
}
