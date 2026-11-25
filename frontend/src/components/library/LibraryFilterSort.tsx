import { Search } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { designFocusClassName } from '@/components/design/design-classes'
import { DesignInput } from '@/components/design/DesignInput'
import { designTypeClassName } from '@/components/design/design-type'
import type { LibraryArticleSort } from '@/lib/library/library-filter-sort'
import { LIBRARY_LEVEL_LABEL, LIBRARY_LEVELS, type LibraryLevel } from '@/lib/library/library-level'
import { cn } from '@/lib/shared/utils'
import {
  selectLibraryFilterSortCriteria,
  useLibraryFilterSortStore,
} from '@/stores/libraryFilterSortStore'

const SORT_OPTIONS: { value: LibraryArticleSort; label: string }[] = [
  { value: 'title-asc', label: 'Alphabetic (A -> Z)' },
  { value: 'title-desc', label: 'Alphabetic (Z -> A)' },
  { value: 'level-asc', label: 'Level (1 -> 5)' },
  { value: 'level-desc', label: 'Level (5 -> 1)' },
]

const librarySelectClassName = cn(
  'design-ui h-12 w-full rounded-[16px] bg-[var(--design-input-enabled-background)] px-4 text-[var(--design-text-regular)]',
  designTypeClassName.regular,
  designFocusClassName,
)

function libraryLevelFromSelectValue(value: string): LibraryLevel | null {
  const level = Number(value)
  if (level === 1 || level === 2 || level === 3 || level === 4 || level === 5) return level
  return null
}

function isLibraryArticleSort(value: string): value is LibraryArticleSort {
  return SORT_OPTIONS.some((option) => option.value === value)
}

function LibraryLevelSelect({
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
      <select
        id={id}
        className={librarySelectClassName}
        value={value}
        onChange={(event) => {
          const level = libraryLevelFromSelectValue(event.target.value)
          if (level != null) onChange(level)
        }}
      >
        {LIBRARY_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level} {LIBRARY_LEVEL_LABEL[level]}
          </option>
        ))}
      </select>
    </div>
  )
}

export function LibraryFilterSort() {
  const criteria = useLibraryFilterSortStore(useShallow(selectLibraryFilterSortCriteria))
  const setQuery = useLibraryFilterSortStore((state) => state.setQuery)
  const setMinimumLevel = useLibraryFilterSortStore((state) => state.setMinimumLevel)
  const setMaximumLevel = useLibraryFilterSortStore((state) => state.setMaximumLevel)
  const setSort = useLibraryFilterSortStore((state) => state.setSort)

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
      <LibraryLevelSelect
        id="library-minimum-level"
        label="Minimum level"
        value={criteria.minimumLevel}
        onChange={setMinimumLevel}
      />
      <LibraryLevelSelect
        id="library-maximum-level"
        label="Maximum level"
        value={criteria.maximumLevel}
        onChange={setMaximumLevel}
      />
      <div className="min-w-[14rem] space-y-2">
        <label htmlFor="library-sort" className="design-type-emphasis text-foreground">
          Sort
        </label>
        <select
          id="library-sort"
          className={librarySelectClassName}
          value={criteria.sort}
          onChange={(event) => {
            if (isLibraryArticleSort(event.target.value)) setSort(event.target.value)
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
