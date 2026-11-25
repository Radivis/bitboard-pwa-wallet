import type { MouseEvent } from 'react'

import { isArticleSlug, type ArticleSlug } from '@/lib/library/articles'
import { isLibraryTagId, type LibraryTagId } from '@/lib/library/tags'

const LIBRARY_ARTICLE_SELECTOR = '[data-library-article]'
const LIBRARY_TAG_SELECTOR = '[data-library-tag]'
const LIBRARY_BOOKMARK_SELECTOR = '[data-library-bookmark]'

export function libraryArticleHref(articleSlug: string): string {
  return `/library/articles/${encodeURIComponent(articleSlug)}`
}

export function libraryTagHref(tagId: string): string {
  return `/library/tags?tag=${encodeURIComponent(tagId)}`
}

export type LibraryCatalogClickActions = {
  bookmarkSlugs: ReadonlySet<string> | undefined
  toggleBookmark: (articleSlug: ArticleSlug, isBookmarked: boolean) => void
  navigateToArticle: (articleSlug: ArticleSlug) => void
  navigateToTag: (tagId: LibraryTagId) => void
}

/** One page-level click listener for article, tag, and bookmark controls. */
export function handleLibraryCatalogClick(
  event: MouseEvent<HTMLElement>,
  actions: LibraryCatalogClickActions,
): void {
  const target = event.target
  if (!(target instanceof Element)) return

  const bookmarkControl = target.closest(LIBRARY_BOOKMARK_SELECTOR)
  if (bookmarkControl instanceof HTMLButtonElement) {
    toggleBookmarkFromControl(bookmarkControl, actions)
    return
  }

  if (!isPlainPrimaryClick(event)) return

  const tagControl = target.closest(LIBRARY_TAG_SELECTOR)
  if (tagControl instanceof HTMLAnchorElement) {
    navigateToTagFromControl(event, tagControl, actions)
    return
  }

  const articleControl = target.closest(LIBRARY_ARTICLE_SELECTOR)
  if (articleControl instanceof HTMLAnchorElement) {
    navigateToArticleFromControl(event, articleControl, actions)
  }
}

function toggleBookmarkFromControl(
  bookmarkControl: HTMLButtonElement,
  actions: LibraryCatalogClickActions,
): void {
  if (bookmarkControl.disabled) return
  const articleSlug = bookmarkControl.dataset.libraryBookmark
  if (articleSlug == null || !isArticleSlug(articleSlug)) return
  const isBookmarked = actions.bookmarkSlugs?.has(articleSlug) === true
  actions.toggleBookmark(articleSlug, !isBookmarked)
}

function navigateToTagFromControl(
  event: MouseEvent<HTMLElement>,
  tagControl: HTMLAnchorElement,
  actions: LibraryCatalogClickActions,
): void {
  const tagId = tagControl.dataset.libraryTag
  if (tagId == null || !isLibraryTagId(tagId)) return
  event.preventDefault()
  actions.navigateToTag(tagId)
}

function navigateToArticleFromControl(
  event: MouseEvent<HTMLElement>,
  articleControl: HTMLAnchorElement,
  actions: LibraryCatalogClickActions,
): void {
  const articleSlug = articleControl.dataset.libraryArticle
  if (articleSlug == null || !isArticleSlug(articleSlug)) return
  event.preventDefault()
  actions.navigateToArticle(articleSlug)
}

function isPlainPrimaryClick(event: MouseEvent<HTMLElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}
