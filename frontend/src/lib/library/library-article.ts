import type { ReactNode } from 'react'
import type { LibraryLevel } from './library-level'
import type { LibraryTagId } from './tags'

/** One library article: metadata plus rendered body (TSX). */
export interface LibraryArticle {
  slug: string
  title: string
  /** How specialized the topic is, from general Bitcoin to a narrow subtopic. */
  level: LibraryLevel
  tagIds: LibraryTagId[]
  body: ReactNode
}
