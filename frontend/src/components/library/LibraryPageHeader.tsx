import type { LucideIcon } from 'lucide-react'

const LIBRARY_PAGE_HEADER_TITLE_CLASS =
  'flex items-center gap-2 text-2xl font-bold tracking-tight'

interface LibraryPageHeaderProps {
  title: string
  icon: LucideIcon
}

export function LibraryPageHeader({ title, icon: Icon }: LibraryPageHeaderProps) {
  return (
    <h2 className={LIBRARY_PAGE_HEADER_TITLE_CLASS}>
      <Icon className="h-8 w-8" aria-hidden />
      {title}
    </h2>
  )
}
