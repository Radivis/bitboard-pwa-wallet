import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Matches library sub-pages (e.g. history): title block on the left, back link on the right. */
export const LIBRARY_SUBPAGE_TOP_ROW_CLASS =
  'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'

const BACK_TO_LIBRARY_INDEX_CLASS =
  'inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline'

interface BackToLibraryLinkProps {
  className?: string
  children?: ReactNode
}

/** Muted link with arrow; default label “Back to Library Index”. */
export function BackToLibraryLink({ className, children }: BackToLibraryLinkProps) {
  return (
    <Link to="/library" className={cn(BACK_TO_LIBRARY_INDEX_CLASS, className)}>
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
      {children ?? 'Back to Library Index'}
    </Link>
  )
}
