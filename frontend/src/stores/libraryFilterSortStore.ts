import { create } from 'zustand'

import type { LibraryArticleSort, LibraryFilterSortCriteria } from '@/lib/library/library-filter-sort'
import type { LibraryLevel } from '@/lib/library/library-level'

interface LibraryFilterSortState extends LibraryFilterSortCriteria {
  setQuery: (query: string) => void
  setMinimumLevel: (minimumLevel: LibraryLevel) => void
  setMaximumLevel: (maximumLevel: LibraryLevel) => void
  setSort: (sort: LibraryArticleSort) => void
}

export const useLibraryFilterSortStore = create<LibraryFilterSortState>((set) => ({
  query: '',
  minimumLevel: 1,
  maximumLevel: 5,
  sort: 'title-asc',
  setQuery: (query) => set({ query }),
  setMinimumLevel: (minimumLevel) => set({ minimumLevel }),
  setMaximumLevel: (maximumLevel) => set({ maximumLevel }),
  setSort: (sort) => set({ sort }),
}))

export function selectLibraryFilterSortCriteria(
  state: LibraryFilterSortState,
): LibraryFilterSortCriteria {
  return {
    query: state.query,
    minimumLevel: state.minimumLevel,
    maximumLevel: state.maximumLevel,
    sort: state.sort,
  }
}
