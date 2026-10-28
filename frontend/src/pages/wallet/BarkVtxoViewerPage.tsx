import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Loader2, Search } from 'lucide-react'
import { format } from 'date-fns'
import { barkSessionBlockingScreen } from '@/components/bark/bark-session-blocking-screen'
import { BarkRailUnavailable } from '@/components/bark/BarkRailUnavailable'
import { BarkVtxoCard } from '@/components/bark/BarkVtxoCard'
import { CardPagination } from '@/components/CardPagination'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignInput } from '@/components/design/DesignInput'
import { PageHeader } from '@/components/PageHeader'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RailSyncErrorBanner } from '@/components/wallet/RailSyncErrorBanner'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import { useBarkEmergencyExitQuery } from '@/hooks/useBarkEmergencyExitQuery'
import { useBarkExitTopologyQuery } from '@/hooks/useBarkExitTopologyQuery'
import { useBarkHistoryQuery } from '@/hooks/useBarkHistoryQuery'
import { useBarkPendingActionsQuery } from '@/hooks/useBarkPendingActionsQuery'
import { useBarkVtxoListQuery } from '@/hooks/useBarkVtxoListQuery'
import { useBarkManualSyncMutation } from '@/hooks/useRailManualSyncMutations'
import {
  BARK_VTXO_VIEWER_PAGE_SIZE,
  EMPTY_BARK_VTXO_ROWS,
  barkVtxoListPresentation,
  countBarkVtxoStates,
  filterBarkVtxoRows,
  getBarkVtxoStateLabel,
  paginateBarkVtxoRows,
  sortBarkVtxoRows,
  type BarkVtxoListPresentation,
  type BarkVtxoSortKey,
} from '@/lib/bark/bark-vtxo-viewer-display'
import {
  barkEmergencyExitScopeFor,
  barkEmergencyExitUnfundedParentTxidsFor,
} from '@/lib/bark/bark-emergency-exit-funding-status'
import { useBarkExitChainNoticeStore } from '@/lib/bark/bark-exit-seizure-notice'
import {
  exitNodeSweepKindsByVtxoId,
  type BarkExitNodeSweepKind,
  type BarkExitNodeSweepVtxoItem,
} from '@/lib/bark/bark-exit-seizure'

const EMPTY_SWEPT_NODE_KINDS: ReadonlySet<BarkExitNodeSweepKind> = new Set()
import {
  barkVtxoIdsKeptWhenFinished,
  formatBarkVtxoEmergencyExitPhaseLine,
  resolveBarkVtxoExitPhase,
} from '@/lib/bark/bark-vtxo-exit-phase'
import { errorMessage } from '@/lib/shared/utils'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { useBarkEmergencyExitFundingStore } from '@/stores/barkEmergencyExitFundingStore'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import {
  BARK_VTXO_STATES,
  type BarkEmergencyExitRow,
  type BarkExitGraphNode,
  type BarkMovementRow,
  type BarkPendingAction,
  type BarkVtxoList,
  type BarkVtxoRow,
  type BarkVtxoState,
} from '@/workers/bark-api'

const EMPTY_BARK_EMERGENCY_EXIT_ROWS: BarkEmergencyExitRow[] = []

export function BarkVtxoViewerPage() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const syncSnapshot = useBarkSyncLifecycleSnapshot()
  const barkManualSync = useBarkManualSyncMutation()
  const vtxoListQuery = useBarkVtxoListQuery()
  const pendingActionsQuery = useBarkPendingActionsQuery()
  const historyQuery = useBarkHistoryQuery()
  const pendingActions = pendingActionsQuery.data ?? []
  const movements = historyQuery.data ?? []
  const vtxoList: BarkVtxoList | undefined = vtxoListQuery.data
  const vtxoRows = vtxoList?.rows ?? EMPTY_BARK_VTXO_ROWS
  const exitRows = useBarkEmergencyExitQuery().data ?? EMPTY_BARK_EMERGENCY_EXIT_ROWS
  const processingVtxoIds = useMemo(
    () => exitRows.filter((row) => row.state === 'processing').map((row) => row.vtxoId),
    [exitRows],
  )
  const topologyQuery = useBarkExitTopologyQuery(processingVtxoIds)
  const unfundedParents = useBarkEmergencyExitFundingStore(
    (fundingState) => fundingState.unfundedParents,
  )
  const unfundedParentTxids = barkEmergencyExitUnfundedParentTxidsFor(
    unfundedParents,
    barkEmergencyExitScopeFor(activeWalletId, networkMode),
  )
  const exitChainNotice = useBarkExitChainNoticeStore((noticeState) => noticeState.notice)
  const shownExitChainNotice =
    exitChainNotice != null &&
    exitChainNotice.walletId === activeWalletId &&
    exitChainNotice.networkMode === networkMode
      ? exitChainNotice
      : null
  const graphNodes = topologyQuery.data == null ? null : topologyQuery.data.nodes

  const [searchQuery, setSearchQuery] = useState('')
  const [stateFilter, setStateFilter] = useState<BarkVtxoState | null>(null)
  const [hideFinished, setHideFinished] = useState(true)
  const [sortKey, setSortKey] = useState<BarkVtxoSortKey>('expiry_asc')
  const [pageIndex, setPageIndex] = useState(0)

  useEffect(() => {
    setPageIndex(0)
  }, [searchQuery, stateFilter, hideFinished, sortKey])

  if (!isBarkEnabled || !isBarkNetworkMode(networkMode)) {
    return (
      <BarkRailUnavailable
        title="Bark VTXOs"
        message="Bark VTXOs are available on Signet and Mainnet when Bark is enabled."
        backTo="/wallet/management"
        backLabel="Back to management"
      />
    )
  }

  const sessionBlockingScreen = barkSessionBlockingScreen(
    loadSnapshot.loadPhase,
    loadSnapshot.errorMessage,
  )
  if (sessionBlockingScreen) {
    return sessionBlockingScreen
  }

  const isSyncing = syncSnapshot.syncPhase === 'syncing' || barkManualSync.isPending
  const syncedAtLabel = formatBarkSyncedAt(syncSnapshot.lastSuccessfulSyncAt)
  const listPresentation = barkVtxoListPresentation({
    syncPhase: syncSnapshot.syncPhase,
    hasData: vtxoListQuery.data != null,
    isLoading: vtxoListQuery.isLoading,
    isError: vtxoListQuery.isError,
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Bark VTXOs" />
      {syncedAtLabel != null ? (
        <p className="design-type-regular text-muted-foreground" data-testid="bark-vtxo-synced-at">
          Synced {syncedAtLabel}
        </p>
      ) : null}

      <RailSyncErrorBanner
        rail="bark"
        syncPhase={syncSnapshot.syncPhase}
        loadPhase={loadSnapshot.loadPhase}
        errorMessage={syncSnapshot.errorMessage}
        onRetry={() => barkManualSync.mutate()}
        isRetrying={isSyncing}
      />

      <BarkVtxoInventory
        rows={vtxoRows}
        tipHeight={vtxoList?.tipHeight ?? null}
        networkMode={networkMode}
        presentation={listPresentation}
        errorMessage={vtxoListQuery.isError ? errorMessage(vtxoListQuery.error) : null}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        stateFilter={stateFilter}
        onStateFilterChange={setStateFilter}
        hideFinished={hideFinished}
        onHideFinishedChange={setHideFinished}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        pageIndex={pageIndex}
        onPageIndexChange={setPageIndex}
        pendingActions={pendingActions}
        movements={movements}
        exitRows={exitRows}
        graphNodes={graphNodes}
        unfundedParentTxids={unfundedParentTxids}
        exitNodeSweepVtxoItems={shownExitChainNotice?.exitNodeSweepVtxoItems ?? []}
      />

      <DesignButton type="button" appearance="secondary" asChild>
        <Link to="/wallet/management">Back to management</Link>
      </DesignButton>
    </div>
  )
}

interface BarkVtxoInventoryProps {
  rows: BarkVtxoRow[]
  tipHeight: number | null
  networkMode: 'signet' | 'mainnet' | 'regtest'
  presentation: BarkVtxoListPresentation
  errorMessage: string | null
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  stateFilter: BarkVtxoState | null
  onStateFilterChange: (state: BarkVtxoState | null) => void
  hideFinished: boolean
  onHideFinishedChange: (hideFinished: boolean) => void
  sortKey: BarkVtxoSortKey
  onSortKeyChange: (sortKey: BarkVtxoSortKey) => void
  pageIndex: number
  onPageIndexChange: (pageIndex: number) => void
  pendingActions: readonly BarkPendingAction[]
  movements: readonly BarkMovementRow[]
  exitRows: readonly BarkEmergencyExitRow[]
  graphNodes: readonly BarkExitGraphNode[] | null
  unfundedParentTxids: readonly string[]
  exitNodeSweepVtxoItems: readonly BarkExitNodeSweepVtxoItem[]
}

function BarkVtxoInventory({
  rows,
  tipHeight,
  networkMode,
  presentation,
  errorMessage,
  searchQuery,
  onSearchQueryChange,
  stateFilter,
  onStateFilterChange,
  hideFinished,
  onHideFinishedChange,
  sortKey,
  onSortKeyChange,
  pageIndex,
  onPageIndexChange,
  pendingActions,
  movements,
  exitRows,
  graphNodes,
  unfundedParentTxids,
  exitNodeSweepVtxoItems,
}: BarkVtxoInventoryProps) {
  const stateCounts = useMemo(() => countBarkVtxoStates(rows), [rows])
  const exitRowByVtxoId = useMemo(
    () => new Map(exitRows.map((row) => [row.vtxoId, row])),
    [exitRows],
  )
  const unfundedParentTxidSet = useMemo(
    () => new Set(unfundedParentTxids),
    [unfundedParentTxids],
  )
  const sweptNodeKindsByVtxoId = useMemo(
    () => exitNodeSweepKindsByVtxoId(exitNodeSweepVtxoItems),
    [exitNodeSweepVtxoItems],
  )
  const keepWhenFinishedIds = useMemo(
    () =>
      barkVtxoIdsKeptWhenFinished({
        exitRows,
        exitNodeSweepVtxoItems,
      }),
    [exitNodeSweepVtxoItems, exitRows],
  )
  const filteredRows = useMemo(
    () =>
      sortBarkVtxoRows(
        filterBarkVtxoRows(rows, {
          searchQuery,
          stateFilter,
          hideFinished,
          keepWhenFinishedIds,
        }),
        sortKey,
      ),
    [hideFinished, keepWhenFinishedIds, rows, searchQuery, sortKey, stateFilter],
  )
  const pageRows = paginateBarkVtxoRows(filteredRows, pageIndex, BARK_VTXO_VIEWER_PAGE_SIZE)

  return (
    <>
      <div className="space-y-4 rounded-lg border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bark-vtxo-search">Search</Label>
            <DesignInput
              id="bark-vtxo-search"
              leadingIcon={Search}
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="VTXO id or sats amount"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bark-vtxo-sort">Sort</Label>
            <select
              id="bark-vtxo-sort"
              className="design-type-addresses flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 shadow-xs"
              value={sortKey}
              onChange={(event) => onSortKeyChange(event.target.value as BarkVtxoSortKey)}
            >
              <option value="expiry_asc">Expiry (soonest)</option>
              <option value="expiry_desc">Expiry (latest)</option>
              <option value="amount_desc">Amount (high to low)</option>
              <option value="amount_asc">Amount (low to high)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="bark-vtxo-hide-finished"
            checked={hideFinished}
            onCheckedChange={onHideFinishedChange}
          />
          <Label htmlFor="bark-vtxo-hide-finished">Hide spent and exited</Label>
        </div>

        <div className="flex flex-wrap gap-2">
          <DesignButton
            type="button"
            appearance={stateFilter == null ? 'primary' : 'secondary'}
            onClick={() => onStateFilterChange(null)}
          >
            All ({rows.length})
          </DesignButton>
          {BARK_VTXO_STATES.map((state) => (
            <DesignButton
              key={state}
              type="button"
              appearance={stateFilter === state ? 'primary' : 'secondary'}
              onClick={() => onStateFilterChange(stateFilter === state ? null : state)}
            >
              {getBarkVtxoStateLabel(state)} ({stateCounts[state]})
            </DesignButton>
          ))}
        </div>
      </div>

      {presentation === 'waiting-for-sync' ? (
        <p className="design-type-regular text-muted-foreground" data-testid="bark-vtxo-waiting-for-sync">
          The VTXO list loads when Bark sync finishes.
        </p>
      ) : presentation === 'loading' ? (
        <div className="design-type-regular flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading VTXOs…
        </div>
      ) : presentation === 'error' ? (
        <p className="design-type-regular text-destructive" data-testid="bark-vtxo-list-error">
          Couldn&apos;t load Bark VTXOs. {errorMessage}
        </p>
      ) : rows.length === 0 ? (
        <p className="design-type-regular text-muted-foreground">No VTXOs in this wallet yet.</p>
      ) : filteredRows.length === 0 ? (
        <p className="design-type-regular text-muted-foreground">No VTXOs match the current filters.</p>
      ) : (
        <CardPagination
          pageSize={BARK_VTXO_VIEWER_PAGE_SIZE}
          totalCount={filteredRows.length}
          pageIndex={pageIndex}
          onPageChange={onPageIndexChange}
          ariaLabel="VTXO page"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pageRows.map((row) => (
              <BarkVtxoCard
                key={row.id}
                row={row}
                tipHeight={tipHeight}
                networkMode={networkMode}
                pendingActions={pendingActions}
                movements={movements}
                emergencyExitPhaseLine={formatBarkVtxoEmergencyExitPhaseLine(
                  resolveBarkVtxoExitPhase({
                    vtxoState: row.state,
                    exitRow: exitRowByVtxoId.get(row.id) ?? null,
                    graphNodes,
                    unfundedParentTxids: unfundedParentTxidSet,
                    sweptNodeKinds: sweptNodeKindsByVtxoId.get(row.id) ?? EMPTY_SWEPT_NODE_KINDS,
                  }),
                )}
              />
            ))}
          </div>
        </CardPagination>
      )}
    </>
  )
}

function formatBarkSyncedAt(isoTimestamp: string | null): string | null {
  if (isoTimestamp == null) return null
  const syncedAt = new Date(isoTimestamp)
  if (Number.isNaN(syncedAt.getTime())) return null
  return format(syncedAt, 'yyyy-MM-dd HH:mm')
}
