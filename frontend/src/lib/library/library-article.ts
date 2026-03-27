import type { ReactNode } from 'react'
import type { LibraryTagId } from './tags'

/** One library article: metadata plus rendered body (TSX). */
export interface LibraryArticle {
  slug: string
  title: string
  tagIds: LibraryTagId[]
  body: ReactNode
}
