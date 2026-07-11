import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { ArkadeVtxoCard } from '@/components/arkade/ArkadeVtxoCard'
import { CardPagination } from '@/components/CardPagination'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RailSyncWarningBanner } from '@/components/wallet/RailSyncWarningBanner'
import {
  useArkadeLoadLifecycleSnapshot,
  useArkadeRailSnapshot,
  useArkadeSyncLifecycleSnapshot,
} from '@/hooks/useArkadeLifecycleSnapshots'
import { useArkadeManualSyncMutation } from '@/hooks/useRailManualSyncMutations'
import { useArkadeVtxoListQuery } from '@/hooks/useArkadeQueries'
import {
  ARKADE_VTXO_CLASSIFICATIONS,
  ARKADE_VTXO_VIEWER_PAGE_SIZE,
  countArkadeVtxoClassifications,
  filterArkadeVtxoRows,
  getArkadeVtxoClassificationLabel,
  paginateArkadeVtxoRows,
  sortArkadeVtxoRows,
  type ArkadeVtxoSortKey,
} from '@/lib/arkade/arkade-vtxo-viewer-display'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import type { ArkadeVtxoClassification } from '@/workers/arkade-api'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

export function ArkadeVtxoViewerPage() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const vtxoListQuery = useArkadeVtxoListQuery()
  const arkadeRail = useArkadeRailSnapshot()
  const arkadeLoadSnapshot = useArkadeLoadLifecycleSnapshot()
  const arkadeSyncSnapshot = useArkadeSyncLifecycleSnapshot()
  const arkadeManualSync = useArkadeManualSyncMutation()

  const [searchQuery, setSearchQuery] = useState('')
  const [classificationFilter, setClassificationFilter] =
    useState<ArkadeVtxoClassification | null>(null)
  const [hideFinalized, setHideFinalized] = useState(true)
  const [sortKey, setSortKey] = useState<ArkadeVtxoSortKey>('expiry_asc')
  const [pageIndex, setPageIndex] = useState(0)

  useEffect(() => {
    setPageIndex(0)
  }, [searchQuery, classificationFilter, hideFinalized, sortKey])

  const allRows = vtxoListQuery.data?.rows ?? []
  const classificationCounts = useMemo(
    () => countArkadeVtxoClassifications(allRows),
    [allRows],
  )

  const filteredRows = useMemo(
    () =>
      sortArkadeVtxoRows(
        filterArkadeVtxoRows(allRows, {
          searchQuery,
          classificationFilter,
          hideFinalized,
        }),
        sortKey,
      ),
    [allRows, classificationFilter, hideFinalized, searchQuery, sortKey],
  )

  const pageRows = paginateArkadeVtxoRows(
    filteredRows,
    pageIndex,
    ARKADE_VTXO_VIEWER_PAGE_SIZE,
  )

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    return (
      <div className="space-y-4">
        <PageHeader title="VTXOs" icon={ArkadeIcon} />
        <p className="text-muted-foreground">Arkade is not enabled for this network.</p>
        <Button type="button" variant="outline" asChild>
          <Link to="/wallet">Back</Link>
        </Button>
      </div>
    )
  }

  const fromSnapshotSyncedAt = vtxoListQuery.data?.fromSnapshotSyncedAt ?? null

  return (
    <div className="space-y-6">
      <PageHeader title="VTXOs" icon={ArkadeIcon} />
      {fromSnapshotSyncedAt != null && fromSnapshotSyncedAt > 0 ? (
        <p className="text-sm text-muted-foreground">
          From snapshot synced{' '}
          {format(new Date(fromSnapshotSyncedAt * 1000), 'yyyy-MM-dd HH:mm')}
        </p>
      ) : null}

      <RailSyncWarningBanner
        rail="arkade"
        syncPhase={arkadeSyncSnapshot.syncPhase}
        loadPhase={arkadeLoadSnapshot.loadPhase}
        warningMessage={arkadeSyncSnapshot.warningMessage}
        onRetry={() => arkadeManualSync.mutate()}
        isRetrying={arkadeRail.syncPhase === 'syncing' || arkadeManualSync.isPending}
      />

      <div className="space-y-4 rounded-lg border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="arkade-vtxo-search">Search</Label>
            <Input
              id="arkade-vtxo-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="VTXO id or sats amount"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="arkade-vtxo-sort">Sort</Label>
            <select
              id="arkade-vtxo-sort"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as ArkadeVtxoSortKey)}
            >
              <option value="expiry_asc">Expiry (soonest)</option>
              <option value="expiry_desc">Expiry (latest)</option>
              <option value="amount_desc">Amount (high to low)</option>
              <option value="amount_asc">Amount (low to high)</option>
              <option value="created_desc">Created (newest)</option>
              <option value="created_asc">Created (oldest)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="arkade-vtxo-hide-finalized"
            checked={hideFinalized}
            onCheckedChange={setHideFinalized}
          />
          <Label htmlFor="arkade-vtxo-hide-finalized">Hide finalized</Label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={classificationFilter == null ? 'default' : 'outline'}
            onClick={() => setClassificationFilter(null)}
          >
            All ({allRows.length})
          </Button>
          {ARKADE_VTXO_CLASSIFICATIONS.map((classification) => (
            <Button
              key={classification}
              type="button"
              size="sm"
              variant={classificationFilter === classification ? 'default' : 'outline'}
              onClick={() =>
                setClassificationFilter((current) =>
                  current === classification ? null : classification,
                )
              }
            >
              {getArkadeVtxoClassificationLabel(classification)} (
              {classificationCounts[classification]})
            </Button>
          ))}
        </div>
      </div>

      {vtxoListQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading VTXOs…
        </div>
      ) : allRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No VTXOs in this wallet yet.</p>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No VTXOs match the current filters.</p>
      ) : (
        <CardPagination
          pageSize={ARKADE_VTXO_VIEWER_PAGE_SIZE}
          totalCount={filteredRows.length}
          pageIndex={pageIndex}
          onPageChange={setPageIndex}
          ariaLabel="VTXO page"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pageRows.map((row) => (
              <ArkadeVtxoCard key={row.id} row={row} />
            ))}
          </div>
        </CardPagination>
      )}

      <Button type="button" variant="outline" asChild>
        <Link to="/wallet">Back to wallet</Link>
      </Button>
    </div>
  )
}
