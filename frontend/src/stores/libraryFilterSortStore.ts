import { create } from 'zustand'

import type {
  LibraryArticleScope,
  LibraryArticleSort,
  LibraryFilterSortCriteria,
} from '@/lib/library/library-filter-sort'
import type { LibraryLevel } from '@/lib/library/library-level'

interface LibraryFilterSortState extends LibraryFilterSortCriteria {
  setQuery: (query: string) => void
  setMinimumLevel: (minimumLevel: LibraryLevel) => void
  setMaximumLevel: (maximumLevel: LibraryLevel) => void
  setSort: (sort: LibraryArticleSort) => void
  setScope: (scope: LibraryArticleScope) => void
}

export const useLibraryFilterSortStore = create<LibraryFilterSortState>((set) => ({
  query: '',
  minimumLevel: 1,
  maximumLevel: 5,
  sort: 'title-asc',
  scope: 'all',
  setQuery: (query) => set({ query }),
  setMinimumLevel: (minimumLevel) => set({ minimumLevel }),
  setMaximumLevel: (maximumLevel) => set({ maximumLevel }),
  setSort: (sort) => set({ sort }),
  setScope: (scope) => set({ scope }),
}))

export function selectLibraryFilterSortCriteria(
  state: LibraryFilterSortState,
): LibraryFilterSortCriteria {
  return {
    query: state.query,
    minimumLevel: state.minimumLevel,
    maximumLevel: state.maximumLevel,
    sort: state.sort,
    scope: state.scope,
  }
}
