import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

const linkClass = 'text-primary underline-offset-4 hover:underline'

/** Article body copy. Links stay `text-primary` for clear distinction. */
export const ARTICLE_BODY_CLASS =
  'design-ui space-y-4 text-sm leading-relaxed text-[var(--design-text-card-description)]'

/** Article page title. Size stays at the page heading; color follows the card title token. */
export const LIBRARY_ARTICLE_TITLE_CLASS =
  'design-ui text-2xl font-bold tracking-tight text-[var(--design-text-card-title)]'

/** Consistent h2 + body wrapper for library article sections (e.g. In a Nutshell, How it Works). */
export function ArticleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="design-ui text-lg font-semibold text-[var(--design-text-card-title)]">{title}</h2>
      {children}
    </section>
  )
}

/** Internal link to another library article by slug. */
export function ArticleLink({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <Link to="/library/articles/$slug" params={{ slug }} className={linkClass}>
      {children}
    </Link>
  )
}
