import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

export function DesignLibraryCard({
  title,
  articleSlug,
  tags,
  className,
}: {
  title: string
  articleSlug: string
  /** Tag links. They sit above the stretched title so each tag keeps its own target. */
  tags?: ReactNode
  className?: string
}) {
  return (
    <article
      data-slot="design-library-card"
      className={cn(
        'design-ui relative flex h-full w-full min-w-0 flex-col gap-4 rounded-[20px] px-6 py-3',
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
    </article>
  )
}
