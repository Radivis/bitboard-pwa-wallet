import type { ReactNode } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { designFocusClassName } from '@/components/design/design-classes'
import { DesignInput } from '@/components/design/DesignInput'
import { DesignSwitch } from '@/components/design/DesignSwitch'
import { designTypeClassName } from '@/components/design/design-type'
import type { LibraryArticleScope, LibraryArticleSort } from '@/lib/library/library-filter-sort'
import { LIBRARY_LEVEL_LABEL, LIBRARY_LEVELS, type LibraryLevel } from '@/lib/library/library-level'
import { cn } from '@/lib/shared/utils'
import {
  selectLibraryFilterSortCriteria,
  useLibraryFilterSortStore,
} from '@/stores/libraryFilterSortStore'

const SCOPE_OPTIONS: { value: LibraryArticleScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'favorites', label: 'Favorites' },
]

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

function LibrarySelect({
  id,
  value,
  onChange,
  children,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <div className="relative">
      <select
        id={id}
        className={cn(librarySelectClassName, 'appearance-none pr-12')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-[var(--design-text-regular)]"
      />
    </div>
  )
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
      <LibrarySelect
        id={id}
        value={String(value)}
        onChange={(nextValue) => {
          const level = libraryLevelFromSelectValue(nextValue)
          if (level != null) onChange(level)
        }}
      >
        {LIBRARY_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level} {LIBRARY_LEVEL_LABEL[level]}
          </option>
        ))}
      </LibrarySelect>
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
        <LibrarySelect
          id="library-sort"
          value={criteria.sort}
          onChange={(nextValue) => {
            if (isLibraryArticleSort(nextValue)) setSort(nextValue)
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </LibrarySelect>
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
