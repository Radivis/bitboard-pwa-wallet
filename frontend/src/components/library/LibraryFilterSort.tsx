import { Search } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { DesignInput } from '@/components/design/DesignInput'
import { DesignOptionMenu } from '@/components/design/DesignOptionMenu'
import { DesignSwitch } from '@/components/design/DesignSwitch'
import type { LibraryArticleScope, LibraryArticleSort } from '@/lib/library/library-filter-sort'
import {
  isLibraryLevel,
  LIBRARY_LEVEL_LABEL,
  LIBRARY_LEVELS,
  type LibraryLevel,
} from '@/lib/library/library-level'
import {
  selectLibraryFilterSortCriteria,
  useLibraryFilterSortStore,
} from '@/stores/libraryFilterSortStore'

const SCOPE_OPTIONS: { value: LibraryArticleScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'favorites', label: 'Favorites' },
]

const LEVEL_OPTIONS = LIBRARY_LEVELS.map((level) => ({
  value: String(level),
  label: `${level} ${LIBRARY_LEVEL_LABEL[level]}`,
}))

const SORT_OPTIONS: { value: LibraryArticleSort; label: string }[] = [
  { value: 'title-asc', label: 'Alphabetic (A -> Z)' },
  { value: 'title-desc', label: 'Alphabetic (Z -> A)' },
  { value: 'level-asc', label: 'Level (1 -> 5)' },
  { value: 'level-desc', label: 'Level (5 -> 1)' },
]

function libraryLevelFromSelectValue(value: string): LibraryLevel | null {
  const level = Number(value)
  if (!isLibraryLevel(level)) return null
  return level
}

function LibraryLevelMenu({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: LibraryLevel
  onChange: (level: LibraryLevel) => void
}) {
  return (
    <div className="min-w-[12rem] space-y-2">
      <label htmlFor={id} className="design-type-emphasis text-foreground">
        {label}
      </label>
      <DesignOptionMenu
        id={id}
        className="w-full"
        ariaLabel={label}
        value={String(value)}
        options={LEVEL_OPTIONS}
        onValueChange={(nextValue) => {
          const level = libraryLevelFromSelectValue(nextValue)
          if (level != null) onChange(level)
        }}
      />
    </div>
  )
}

export function LibraryFilterSort() {
  const criteria = useLibraryFilterSortStore(useShallow(selectLibraryFilterSortCriteria))
  const setQuery = useLibraryFilterSortStore((state) => state.setQuery)
  const setMinimumLevel = useLibraryFilterSortStore((state) => state.setMinimumLevel)
  const setMaximumLevel = useLibraryFilterSortStore((state) => state.setMaximumLevel)
  const setSort = useLibraryFilterSortStore((state) => state.setSort)
  const setScope = useLibraryFilterSortStore((state) => state.setScope)

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-[16rem] flex-1 space-y-2">
        <label htmlFor="library-search" className="design-type-emphasis text-foreground">
          Search
        </label>
        <DesignInput
          id="library-search"
          type="search"
          leadingIcon={Search}
          placeholder="Filter by title or tag…"
          value={criteria.query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
      </div>
      <LibraryLevelMenu
        id="library-minimum-level"
        label="Minimum level"
        value={criteria.minimumLevel}
        onChange={setMinimumLevel}
      />
      <LibraryLevelMenu
        id="library-maximum-level"
        label="Maximum level"
        value={criteria.maximumLevel}
        onChange={setMaximumLevel}
      />
      <div className="min-w-[14rem] space-y-2">
        <label htmlFor="library-sort" className="design-type-emphasis text-foreground">
          Sort
        </label>
        <DesignOptionMenu
          id="library-sort"
          className="w-full"
          ariaLabel="Sort"
          value={criteria.sort}
          options={SORT_OPTIONS}
          onValueChange={setSort}
        />
      </div>
      <DesignSwitch
        aria-label="Shown articles"
        value={criteria.scope}
        onValueChange={setScope}
        options={SCOPE_OPTIONS}
      />
    </div>
  )
}
