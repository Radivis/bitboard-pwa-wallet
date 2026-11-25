import type { MouseEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'

import { useSetArticleBookmark } from '@/db'
import { handleLibraryCatalogClick } from '@/lib/library/library-catalog-click'

export function useLibraryCatalogClick(bookmarkSlugs: ReadonlySet<string> | undefined) {
  const navigate = useNavigate()
  const setBookmark = useSetArticleBookmark()

  return (event: MouseEvent<HTMLElement>) => {
    handleLibraryCatalogClick(event, {
      bookmarkSlugs,
      toggleBookmark: (articleSlug, isBookmarked) => {
        void setBookmark.mutateAsync({ articleSlug, isBookmarked })
      },
      navigateToArticle: (articleSlug) => {
        void navigate({ to: '/library/articles/$slug', params: { slug: articleSlug } })
      },
      navigateToTag: (tagId) => {
        void navigate({ to: '/library/tags', search: { tag: tagId } })
      },
    })
  }
}
