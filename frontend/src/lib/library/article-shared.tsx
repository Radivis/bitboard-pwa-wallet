import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

const linkClass = 'text-primary underline-offset-4 hover:underline'

/** Max contrast body copy; links stay `text-primary` for clear distinction. */
export const ARTICLE_BODY_CLASS =
  'space-y-4 text-sm leading-relaxed text-black dark:text-white'

/** Matches article heading contrast on the article route. */
export const LIBRARY_ARTICLE_TITLE_CLASS =
  'text-2xl font-bold tracking-tight text-black dark:text-white'

/** Internal link to another library article by slug. */
export function ArticleLink({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <Link to="/library/articles/$slug" params={{ slug }} className={linkClass}>
      {children}
    </Link>
  )
}
