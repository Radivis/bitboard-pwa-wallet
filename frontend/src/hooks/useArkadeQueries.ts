import { awaitInFlightWalletSecretsWrites } from '@/db'
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { proxy } from 'comlink'
import { toast } from 'sonner'
import { getArkadeWorker } from '@/workers/arkade-factory'
import {
  arkadeBalanceQueryKey,
  arkadeBoardingAddressQueryKey,
  arkadeBoardingStatusQueryKey,
  arkadeBumperInfoQueryKey,
  arkadeCollaborativeExitFeeQueryKey,
  arkadeDisabledQueryKey,
  ARKADE_QUERY_DISABLED,
  arkadeAddressQueryKey,
  arkadeAutonomousModeStatusQueryKey,
  arkadeDelegateInfoQueryKey,
  arkadeExitCandidatesQueryKey,
  arkadeHistoryQueryKey,
  arkadeOperatorConfigDiffQueryKey,
  arkadeOperatorScheduledSessionQueryKey,
  arkadeOperatorTrustStatusQueryKey,
  arkadeRecoverableVtxoFeeQueryKey,
  arkadeSignerMigrationPartialResultQueryKey,
  arkadeUnilateralExitCompletionFeeQueryKey,
  arkadeUnilateralExitFeeQueryKey,
  arkadeUnilateralExitsInProgressQueryKey,
  arkadeUnilateralExitTopologyQueryKey,
  arkadeUnilateralExitBatchEstimateQueryKey,
  arkadeUnilateralExitProgressQueryKey,
  arkadeVtxoExpiryQueryKey,
  arkadeVtxoListQueryKey,
} from '@/lib/arkade/arkade-query-keys'
import type {
  ArkadeBalanceInfo,
  ArkadeBatchJoinResult,
  ArkadeBoardingStatus,
  ArkadePendingBatchIntent,
  ArkadeSignerMigrationResult,
  ArkadeUnrollProgressEvent,
  ArkadeUnrollResult,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import {
  awaitArkadeLoadQuiescence,
  getArkadeLoadLifecycleSnapshot,
  isArkadeLoadFailedForNetwork,
} from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { useIsArkadeSessionReady } from '@/hooks/useArkadeLifecycleSnapshots'
import {
  openArkadeSessionForWallet,
} from '@/lib/arkade/arkade-session-service'
import {
  orchestrateArkadeSyncThenSave,
  scheduleBackgroundArkadeOperatorSync,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { orchestrateArkadeSave } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import { refreshArkadeStoreFromLoadedWasm } from '@/lib/arkade/arkade-persistence-store-sync'
import { readArkadeDashboardStateFromStore } from '@/lib/arkade/arkade-persistence-store-sync'
import {
  abandonInFlightRegisteredIntents,
  arkadeRefetchIntervalWithPendingBatchIntent,
  hasPendingBatchIntent,
  hasPendingKind,
  pendingBatchIntentKey,
  isBatchJoinCompleted,
  isBatchJoinWaiting,
  markPendingBatchIntentCancelled,
  pendingOverlapsOnchain,
  pendingBatchIntentFromSources,
  pendingBatchIntentSucceededMessage,
  rememberInFlightRegisteredIntent,
  settleInFlightRegisteredIntents,
} from '@/lib/arkade/arkade-pending-batch-intent'
import {
  ARKADE_BUMPER_FUNDING_POLL_MS,
  ARKADE_EXIT_CANDIDATES_POLL_MS,
  ARKADE_FEE_ESTIMATE_STALE_MS,
  ARKADE_SESSION_POLL_STALE_MS,
  ARKADE_SLOW_METADATA_STALE_MS,
  unilateralExitProgressIdlePollMs,
  unilateralExitProgressPollMs,
} from '@/lib/arkade/arkade-query-timings'
import { usePeriodicSyncRefetchInterval } from '@/lib/wallet/periodic-sync/usePeriodicSyncRefetchInterval'
import {
  applyOptimisticExitBalanceDeduction,
  reconcileBalanceAfterExitOperation,
  revertOptimisticExitBalanceDeduction,
  type ExitBalanceOptimisticContext,
} from '@/lib/arkade/arkade-exit-balance-optimistic'
import {
  formatArkadeTxidToastSnippet,
  formatUnilateralUnrollSuccessMessage,
  shouldShowUnilateralUnrollProgressToast,
  unilateralUnrollProgressToastId,
} from '@/lib/arkade/arkade-exit-utils'
import { arkadeOffchainSpendableSats } from '@/lib/arkade/arkade-balance-display'
import {
  isArkadeDelegatorConfigured,
  isArkadeSupportedNetworkMode,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import {
  getCommittedNetworkMode,
  selectCommittedNetworkMode,
  useWalletStore,
} from '@/stores/walletStore'
import type { NetworkMode } from '@/stores/walletStore'
import { arkadeDashboardWalletDataQueryOptions } from '@/lib/arkade/arkade-dashboard-query-options'
import {
  beginOptimisticBoardingSettle,
  reconcileBalanceAfterBoardingSettle,
  reconcileBoardingStatusAfterSettle,
  revertOptimisticBoardingSettle,
} from '@/lib/arkade/arkade-boarding-settle-optimistic'
import { errorMessage } from '@/lib/shared/utils'
import { isWalletSecretsSessionActive } from '@/lib/wallet/wallet-secrets-session'
import {
  isOperatorTrustPendingDigestChangedError,
  operatorTrustPendingDigestChangedMessage,
} from '@/lib/arkade/arkade-operator-trust-utils'
import {
  assertArkadeSessionUnlocked,
  proceedUnilateralExitStepWithGuards,
} from '@/lib/arkade/proceed-unilateral-exit-step'
import { isUnilateralExitBranchComplete } from '@/lib/arkade/unilateral-exit-branch-complete'
import {
  isUnilateralExitProgressWaitingForConfirmation,
  unilateralExitProgressQueryRefetchInterval,
  unilateralExitProgressQueryShouldFetch,
} from '@/lib/arkade/unilateral-exit-progress-query'

function useArkadeQueryBase() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const activeArkadeConnectionId = useWalletStore(
    (walletState) => walletState.activeArkadeConnectionId,
  )
  const arkadeSessionReady = useIsArkadeSessionReady()
  const sessionReady =
    activeWalletId != null &&
    isArkadeActiveForNetworkMode(networkMode) &&
    isArkadeSupportedNetworkMode(networkMode) &&
    arkadeSessionReady

  return { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady }
}

function useArkadeDashboardPeriodicQueryOptions() {
  const refetchInterval = usePeriodicSyncRefetchInterval('arkade')
  return {
    ...arkadeDashboardWalletDataQueryOptions,
    refetchInterval,
  }
}

function useArkadeDelegateQueryBase() {
  const { networkMode, activeWalletId, sessionReady: arkadeSessionReady } =
    useArkadeQueryBase()
  const sessionReady =
    arkadeSessionReady &&
    isArkadeSupportedNetworkMode(networkMode) &&
    isArkadeDelegatorConfigured(networkMode)

  return { networkMode, activeWalletId, sessionReady }
}

async function ensureArkadeSessionOpenForActiveWallet(): Promise<void> {
  const activeWalletId = useWalletStore.getState().activeWalletId
  const networkMode = getCommittedNetworkMode()
  if (
    activeWalletId == null ||
    !isArkadeActiveForNetworkMode(networkMode) ||
    !isArkadeSupportedNetworkMode(networkMode)
  ) {
    await awaitArkadeLoadQuiescence()
    return
  }
  if (!(await isWalletSecretsSessionActive())) {
    await awaitArkadeLoadQuiescence()
    return
  }
  if (getArkadeLoadLifecycleSnapshot().loadPhase === 'loaded') {
    return
  }
  if (isArkadeLoadFailedForNetwork(networkMode)) {
    return
  }
  try {
    await openArkadeSessionForWallet({
      walletId: activeWalletId,
      networkMode,
    })
  } catch {
    // load-error snapshot + retry banner handle UX; queries stay disabled until retry.
  }
}

async function withReadyArkadeWorker<T>(run: () => Promise<T>): Promise<T> {
  await ensureArkadeSessionOpenForActiveWallet()
  return run()
}

async function withReadyArkadeWorkerAndOptionalDelegate<T>(
  networkMode: NetworkMode,
  run: () => Promise<T>,
): Promise<T> {
  await awaitArkadeLoadQuiescence()
  const result = await run()
  if (isArkadeSupportedNetworkMode(networkMode) && isArkadeDelegatorConfigured(networkMode)) {
    await getArkadeWorker().delegateSpendableVtxos()
  }
  return result
}

function walletScopedQueryKey(
  activeWalletId: number | null,
  networkMode: NetworkMode,
  connectionId: string | null,
  buildKey: (
    walletId: number,
    network: ArkadeSupportedNetworkMode,
    connectionId: string,
  ) => readonly unknown[],
  disabledScope: string,
): readonly unknown[] {
  if (activeWalletId != null && isArkadeSupportedNetworkMode(networkMode)) {
    return buildKey(
      activeWalletId,
      networkMode,
      connectionId ?? `pending-${networkMode}`,
    )
  }
  return arkadeDisabledQueryKey(disabledScope)
}

async function invalidateArkadeWalletDataQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  walletId: number,
  networkMode: NetworkMode,
  connectionId: string,
  options?: { skipBalance?: boolean; skipBoardingStatus?: boolean },
): Promise<void> {
  if (!isArkadeSupportedNetworkMode(networkMode)) return

  const invalidations = [
    queryClient.invalidateQueries({
      queryKey: arkadeHistoryQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeExitCandidatesQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeUnilateralExitsInProgressQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeBumperInfoQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeVtxoExpiryQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeOperatorScheduledSessionQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeVtxoListQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeRecoverableVtxoFeeQueryKey(walletId, networkMode, connectionId),
    }),
  ]

  if (!options?.skipBalance) {
    invalidations.unshift(
      queryClient.invalidateQueries({
        queryKey: arkadeBalanceQueryKey(walletId, networkMode, connectionId),
      }),
    )
  }

  if (!options?.skipBoardingStatus) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: arkadeBoardingStatusQueryKey(walletId, networkMode, connectionId),
      }),
    )
  }

  await Promise.all(invalidations)
}

export function useArkadeBalanceQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const storeBalance = useWalletStore((walletState) => walletState.arkadeBalance)
  const arkadeDashboardPeriodicQueryOptions = useArkadeDashboardPeriodicQueryOptions()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeBalanceQueryKey,
      'balance',
    ),
    enabled: sessionReady,
    initialData: storeBalance ?? undefined,
    queryFn: async () => {
      await ensureArkadeSessionOpenForActiveWallet()
      scheduleBackgroundArkadeOperatorSync()
      return getArkadeWorker().getBalance()
    },
    ...arkadeDashboardPeriodicQueryOptions,
    refetchInterval: (query) =>
      arkadeRefetchIntervalWithPendingBatchIntent(
        hasPendingBatchIntent(query.state.data?.pendingBatchIntents ?? []),
        arkadeDashboardPeriodicQueryOptions.refetchInterval,
      ),
  })
}

export function useArkadeHistoryQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const storePayments = useWalletStore((walletState) => walletState.arkadePayments)
  const arkadeDashboardPeriodicQueryOptions = useArkadeDashboardPeriodicQueryOptions()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeHistoryQueryKey,
      'history',
    ),
    enabled: sessionReady,
    initialData: storePayments.length > 0 ? storePayments : undefined,
    queryFn: async () => {
      await ensureArkadeSessionOpenForActiveWallet()
      scheduleBackgroundArkadeOperatorSync()
      return getArkadeWorker().getTransactionHistory()
    },
    ...arkadeDashboardPeriodicQueryOptions,
  })
}

export function useArkadeAddressQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const storeReceiveAddress = useWalletStore((walletState) => walletState.arkadeReceiveAddress)

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeAddressQueryKey,
      'address',
    ),
    enabled: sessionReady && activeArkadeConnectionId != null,
    initialData: storeReceiveAddress ?? undefined,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().getAddress()),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useArkadeNewAddressMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      assertArkadeSessionUnlocked(activeWalletId)
      const newAddress = await withReadyArkadeWorker(() => getArkadeWorker().getNewAddress())
      await awaitInFlightWalletSecretsWrites()
      return newAddress
    },
    onSuccess: async () => {
      toast.success('New Arkade address generated')
      if (activeWalletId == null || !isArkadeSupportedNetworkMode(networkMode)) {
        return
      }
      const displayAddress = await withReadyArkadeWorker(() =>
        getArkadeWorker().getAddress(),
      )
      const addressQueryKey = walletScopedQueryKey(
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
        arkadeAddressQueryKey,
        'address',
      )
      if (!addressQueryKey.includes(ARKADE_QUERY_DISABLED)) {
        queryClient.setQueryData(addressQueryKey, displayAddress)
      }
      const dashboardState = readArkadeDashboardStateFromStore()
      if (dashboardState.balance != null) {
        useWalletStore.getState().setArkadeDashboardState({
          balance: dashboardState.balance,
          payments: dashboardState.payments,
          receiveAddress: displayAddress,
        })
      } else {
        useWalletStore.setState({ arkadeReceiveAddress: displayAddress })
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err))
    },
  })
}

export function useArkadeBoardingAddressQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeBoardingAddressQueryKey,
      'boarding-address',
    ),
    enabled: sessionReady,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().getBoardingAddress()),
    staleTime: ARKADE_SLOW_METADATA_STALE_MS,
  })
}

export function useArkadeBoardingStatusQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const refetchInterval = usePeriodicSyncRefetchInterval('arkade')

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeBoardingStatusQueryKey,
      'boarding-status',
    ),
    enabled: sessionReady,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().getBoardingStatus()),
    refetchInterval: (query) =>
      arkadeRefetchIntervalWithPendingBatchIntent(
        hasPendingBatchIntent(query.state.data?.pendingBatchIntents ?? []),
        refetchInterval,
      ),
    staleTime: ARKADE_SESSION_POLL_STALE_MS,
  })
}

export function usePendingBatchIntents(): ArkadePendingBatchIntent[] {
  const boardingStatusQuery = useArkadeBoardingStatusQuery()
  const balanceQuery = useArkadeBalanceQuery()
  return pendingBatchIntentFromSources(
    boardingStatusQuery.data?.pendingBatchIntents,
    balanceQuery.data?.pendingBatchIntents,
  )
}

export function useHasPendingBatchIntent(): boolean {
  return hasPendingBatchIntent(usePendingBatchIntents())
}

export function useHasPendingOnchainBatchIntent(): boolean {
  return pendingOverlapsOnchain(usePendingBatchIntents())
}

export function useHasPendingBatchIntentKind(kind: string): boolean {
  return hasPendingKind(usePendingBatchIntents(), kind)
}

export function pendingBatchIntentActionParams(intent: ArkadePendingBatchIntent): {
  onchainOutpoints: ArkadeVtxoOutpoint[]
  vtxoOutpoints: ArkadeVtxoOutpoint[]
} {
  return {
    onchainOutpoints: intent.onchainOutpoints,
    vtxoOutpoints: intent.vtxoOutpoints,
  }
}

export function pendingBatchIntentStableKey(intent: ArkadePendingBatchIntent): string {
  return pendingBatchIntentKey(intent)
}

export function useArkadeDelegateInfoQuery() {
  const { networkMode, sessionReady } = useArkadeDelegateQueryBase()

  return useQuery({
    queryKey: isArkadeSupportedNetworkMode(networkMode)
      ? arkadeDelegateInfoQueryKey(networkMode)
      : arkadeDisabledQueryKey('delegator'),
    enabled: sessionReady,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().getDelegateInfo()),
    staleTime: ARKADE_SLOW_METADATA_STALE_MS,
  })
}

export function useArkadeVtxoExpiryQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const arkadeDashboardPeriodicQueryOptions = useArkadeDashboardPeriodicQueryOptions()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeVtxoExpiryQueryKey,
      'vtxo-expiry',
    ),
    enabled: sessionReady,
    queryFn: async () => {
      await ensureArkadeSessionOpenForActiveWallet()
      scheduleBackgroundArkadeOperatorSync()
      return getArkadeWorker().getVtxoExpiryStatus()
    },
    ...arkadeDashboardPeriodicQueryOptions,
  })
}

export function useArkadeOperatorScheduledSessionQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const arkadeDashboardPeriodicQueryOptions = useArkadeDashboardPeriodicQueryOptions()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeOperatorScheduledSessionQueryKey,
      'operator-scheduled-session',
    ),
    enabled: sessionReady,
    queryFn: async () => {
      await ensureArkadeSessionOpenForActiveWallet()
      scheduleBackgroundArkadeOperatorSync()
      return getArkadeWorker().getOperatorScheduledSession()
    },
    ...arkadeDashboardPeriodicQueryOptions,
  })
}

export function useArkadeVtxoListQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const arkadeDashboardPeriodicQueryOptions = useArkadeDashboardPeriodicQueryOptions()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeVtxoListQueryKey,
      'vtxo-list',
    ),
    enabled: sessionReady,
    queryFn: async () => {
      await ensureArkadeSessionOpenForActiveWallet()
      scheduleBackgroundArkadeOperatorSync()
      return getArkadeWorker().listVtxos()
    },
    ...arkadeDashboardPeriodicQueryOptions,
  })
}

export function useArkadeSendMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async (params: { address: string; amountSats: number }) => {
      assertArkadeSessionUnlocked(activeWalletId)
      return withReadyArkadeWorkerAndOptionalDelegate(networkMode, () =>
        getArkadeWorker().sendPayment(params),
      )
    },
    retry: false,
    onSuccess: async (txid) => {
      toast.success(`Arkade payment sent (${formatArkadeTxidToastSnippet(txid)})`)
      if (
        activeWalletId != null &&
        activeArkadeConnectionId != null &&
        isArkadeSupportedNetworkMode(networkMode)
      ) {
        await invalidateArkadeWalletDataQueries(
          queryClient,
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err))
    },
  })
}

function toastBatchJoinResult(
  result: ArkadeBatchJoinResult,
  kindFallback: string,
  idleMessage?: string,
): void {
  if (isBatchJoinWaiting(result)) {
    abandonInFlightRegisteredIntents()
    return
  }
  if (isBatchJoinCompleted(result) && result.commitmentTxid) {
    settleInFlightRegisteredIntents()
    toast.success(
      pendingBatchIntentSucceededMessage(result.pendingIntent?.kind ?? kindFallback),
    )
    return
  }
  abandonInFlightRegisteredIntents()
  if (idleMessage != null) {
    toast.message(idleMessage)
  }
}

function upsertPendingBatchIntent(
  intents: ArkadePendingBatchIntent[] | undefined,
  incoming: ArkadePendingBatchIntent,
): ArkadePendingBatchIntent[] {
  const incomingKey = pendingBatchIntentKey(incoming)
  return [
    ...(intents ?? []).filter((item) => pendingBatchIntentKey(item) !== incomingKey),
    incoming,
  ]
}

function patchPendingBatchIntentQueryCaches(
  queryClient: QueryClient,
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
  intent: ArkadePendingBatchIntent,
): void {
  rememberInFlightRegisteredIntent(intent)
  const boardingStatusKey = arkadeBoardingStatusQueryKey(
    walletId,
    networkMode,
    connectionId,
  )
  const balanceKey = arkadeBalanceQueryKey(walletId, networkMode, connectionId)
  queryClient.setQueryData<ArkadeBoardingStatus>(boardingStatusKey, (previous) =>
    previous == null
      ? previous
      : {
          ...previous,
          pendingBatchIntents: upsertPendingBatchIntent(
            previous.pendingBatchIntents,
            intent,
          ),
        },
  )
  queryClient.setQueryData<ArkadeBalanceInfo>(balanceKey, (previous) =>
    previous == null
      ? previous
      : {
          ...previous,
          pendingBatchIntents: upsertPendingBatchIntent(
            previous.pendingBatchIntents,
            intent,
          ),
        },
  )
}

function pendingBatchIntentOnRegisteredHandler(
  queryClient: QueryClient,
  walletId: number | null,
  networkMode: NetworkMode,
  connectionId: string | null,
): (intent: ArkadePendingBatchIntent) => void {
  return (intent) => {
    if (
      walletId == null ||
      connectionId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      rememberInFlightRegisteredIntent(intent)
      return
    }
    patchPendingBatchIntentQueryCaches(
      queryClient,
      walletId,
      networkMode,
      connectionId,
      intent,
    )
  }
}

export function useArkadeRenewMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      assertArkadeSessionUnlocked(activeWalletId)
      const onRegistered = pendingBatchIntentOnRegisteredHandler(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )
      return withReadyArkadeWorker(() =>
        getArkadeWorker().renewVtxosNow(proxy(onRegistered)),
      )
    },
    onSuccess: async (result) => {
      toastBatchJoinResult(
        result,
        'renew',
        'No expiring VTXOs to renew right now',
      )
      if (
        activeWalletId != null &&
        activeArkadeConnectionId != null &&
        isArkadeSupportedNetworkMode(networkMode)
      ) {
        await invalidateArkadeWalletDataQueries(
          queryClient,
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err))
    },
  })
}

export function useArkadeCancelPendingBatchIntentMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } = useArkadeQueryBase()
  return useMutation({
    mutationFn: async (intent: ArkadePendingBatchIntent) => {
      assertArkadeSessionUnlocked(activeWalletId)
      return withReadyArkadeWorker(() =>
        getArkadeWorker().cancelPendingBatchIntent(pendingBatchIntentActionParams(intent)),
      )
    },
    onSuccess: async (_result, intent) => {
      markPendingBatchIntentCancelled(intent)
      if (
        activeWalletId != null &&
        activeArkadeConnectionId != null &&
        isArkadeSupportedNetworkMode(networkMode)
      ) {
        await invalidateArkadeWalletDataQueries(
          queryClient,
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
}

export function useArkadeRetryPendingBatchIntentMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } = useArkadeQueryBase()
  return useMutation({
    mutationFn: async (intent: ArkadePendingBatchIntent) => {
      assertArkadeSessionUnlocked(activeWalletId)
      const onRegistered = pendingBatchIntentOnRegisteredHandler(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )
      return withReadyArkadeWorker(() =>
        getArkadeWorker().retryPendingBatchIntent(
          pendingBatchIntentActionParams(intent),
          proxy(onRegistered),
        ),
      )
    },
    onSuccess: async (result, intent) => {
      toastBatchJoinResult(result, intent.kind)
      if (
        activeWalletId != null &&
        activeArkadeConnectionId != null &&
        isArkadeSupportedNetworkMode(networkMode)
      ) {
        await invalidateArkadeWalletDataQueries(
          queryClient,
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
}

export function useArkadeRecoverRecoverableVtxosMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      assertArkadeSessionUnlocked(activeWalletId)
      const onRegistered = pendingBatchIntentOnRegisteredHandler(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )
      return withReadyArkadeWorker(() =>
        getArkadeWorker().recoverRecoverableVtxos(proxy(onRegistered)),
      )
    },
    onSuccess: async (result) => {
      toastBatchJoinResult(
        result,
        'recover',
        'No recoverable VTXOs to settle right now',
      )
      if (
        activeWalletId != null &&
        activeArkadeConnectionId != null &&
        isArkadeSupportedNetworkMode(networkMode)
      ) {
        await invalidateArkadeWalletDataQueries(
          queryClient,
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err))
    },
  })
}

export function useArkadeSignerMigrationPartialResultQuery() {
  const queryClient = useQueryClient()
  const migrationHint = useWalletStore(
    (walletState) => walletState.arkadeSignerMigrationHint,
  )
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()

  const queryKey = walletScopedQueryKey(
    activeWalletId,
    networkMode,
    activeArkadeConnectionId,
    (walletId, scopedNetworkMode, connectionId) =>
      arkadeSignerMigrationPartialResultQueryKey(
        walletId,
        scopedNetworkMode,
        connectionId,
        migrationHint?.previousSignerPkHex ?? '',
      ),
    'signer-migration-partial',
  )

  return useQuery({
    queryKey,
    enabled:
      migrationHint != null &&
      sessionReady &&
      activeWalletId != null &&
      activeArkadeConnectionId != null &&
      isArkadeSupportedNetworkMode(networkMode),
    queryFn: async () =>
      queryClient.getQueryData<ArkadeSignerMigrationResult>(queryKey) ?? null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 30,
  })
}

export function useArkadeSignerMigrationMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      if (activeWalletId == null || activeArkadeConnectionId == null) {
        throw new Error('Arkade session is not ready')
      }
      const onRegistered = pendingBatchIntentOnRegisteredHandler(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )
      const migrationResult = await orchestrateArkadeSyncThenSave({
        walletId: activeWalletId,
        networkMode,
        connectionId: activeArkadeConnectionId,
        syncKind: 'signerMigration',
        awaitCompletion: true,
        throwOnError: true,
        onIntentRegistered: proxy(onRegistered),
      })
      if (migrationResult == null) {
        throw new Error('Signer migration did not return a result')
      }
      return migrationResult
    },
    onSuccess: async (migrationResult) => {
      if (migrationResult.settleTxids.length > 0) {
        settleInFlightRegisteredIntents()
        toast.success(pendingBatchIntentSucceededMessage('migrate'))
      } else {
        abandonInFlightRegisteredIntents()
      }
      if (
        activeWalletId == null ||
        activeArkadeConnectionId == null ||
        !isArkadeSupportedNetworkMode(networkMode)
      ) {
        return
      }

      const migrationHint = useWalletStore.getState().arkadeSignerMigrationHint
      const partialResultQueryKey =
        migrationHint != null
          ? arkadeSignerMigrationPartialResultQueryKey(
              activeWalletId,
              networkMode,
              activeArkadeConnectionId,
              migrationHint.previousSignerPkHex,
            )
          : null

      if (migrationResult.migrationComplete) {
        if (partialResultQueryKey != null) {
          queryClient.removeQueries({ queryKey: partialResultQueryKey })
        }
        useWalletStore.getState().setArkadeSignerMigrationHint(null)
      } else if (partialResultQueryKey != null) {
        queryClient.setQueryData(partialResultQueryKey, migrationResult)
      }

      await invalidateArkadeWalletDataQueries(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )
    },
  })
}

export function useArkadeOnboardMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      assertArkadeSessionUnlocked(activeWalletId)
      const onRegistered = pendingBatchIntentOnRegisteredHandler(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )
      return withReadyArkadeWorkerAndOptionalDelegate(networkMode, () =>
        getArkadeWorker().onboardBoardedUtxos(proxy(onRegistered)),
      )
    },
    onMutate: async () => {
      if (
        activeWalletId == null ||
        activeArkadeConnectionId == null ||
        !isArkadeSupportedNetworkMode(networkMode)
      ) {
        return undefined
      }

      const boardingStatusKey = arkadeBoardingStatusQueryKey(
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )
      const balanceKey = arkadeBalanceQueryKey(
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )
      await queryClient.cancelQueries({ queryKey: boardingStatusKey })
      await queryClient.cancelQueries({ queryKey: balanceKey })

      return beginOptimisticBoardingSettle(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )
    },
    onSuccess: async (result, _variables, context) => {
      if (isBatchJoinWaiting(result)) {
        if (context != null) {
          revertOptimisticBoardingSettle(queryClient, context)
        }
      }
      toastBatchJoinResult(result, 'board')
      if (
        activeWalletId == null ||
        activeArkadeConnectionId == null ||
        !isArkadeSupportedNetworkMode(networkMode)
      ) {
        return
      }

      if (isBatchJoinWaiting(result)) {
        await invalidateArkadeWalletDataQueries(
          queryClient,
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
        return
      }

      const settledSats = context?.settledSats ?? 0
      const boardingStatusKey = arkadeBoardingStatusQueryKey(
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )
      const balanceKey = arkadeBalanceQueryKey(
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )

      await queryClient.refetchQueries({ queryKey: balanceKey })
      const fetchedBalance = queryClient.getQueryData<ArkadeBalanceInfo>(balanceKey)
      if (fetchedBalance != null && settledSats > 0) {
        queryClient.setQueryData(
          balanceKey,
          reconcileBalanceAfterBoardingSettle(fetchedBalance, settledSats),
        )
      }

      await queryClient.refetchQueries({ queryKey: boardingStatusKey })
      const fetchedStatus = queryClient.getQueryData<ArkadeBoardingStatus>(boardingStatusKey)
      if (fetchedStatus != null && settledSats > 0) {
        queryClient.setQueryData(
          boardingStatusKey,
          reconcileBoardingStatusAfterSettle(fetchedStatus, settledSats),
        )
      }

      await invalidateArkadeWalletDataQueries(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
        { skipBalance: true, skipBoardingStatus: true },
      )
    },
    onError: (err, _variables, context) => {
      if (context != null) {
        revertOptimisticBoardingSettle(queryClient, context)
      }
      toast.error(errorMessage(err))
    },
  })
}

export function useArkadeExitCandidatesQuery(enabled: boolean) {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeExitCandidatesQueryKey,
      'exit-candidates',
    ),
    enabled: enabled && sessionReady,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().listExitCandidates()),
    // Keep the candidate list fresh while the dialog is open so swept/expired VTXOs drop out
    // instead of lingering as startable rows.
    refetchInterval: enabled ? ARKADE_EXIT_CANDIDATES_POLL_MS : false,
    staleTime: ARKADE_SESSION_POLL_STALE_MS,
  })
}

export function useArkadeBumperInfoQuery(
  enabled: boolean,
  pollWhileUnderfunded = false,
) {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeBumperInfoQueryKey,
      'bumper',
    ),
    enabled: enabled && sessionReady,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().getOnchainBumperInfo()),
    staleTime: ARKADE_SESSION_POLL_STALE_MS,
    // Poll only while an active exit flow is waiting for a bumper top-up to confirm.
    refetchInterval: pollWhileUnderfunded ? ARKADE_BUMPER_FUNDING_POLL_MS : false,
  })
}

export function useArkadeUnilateralExitsInProgressQuery(enabled: boolean) {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeUnilateralExitsInProgressQueryKey,
      'unilateral-exits-in-progress',
    ),
    enabled: enabled && sessionReady,
    queryFn: async () => {
      const rows = await withReadyArkadeWorker(() =>
        getArkadeWorker().listUnilateralExitsInProgress(),
      )
      return sortArkadeVtxoOutpoints(rows)
    },
    refetchInterval: enabled ? ARKADE_EXIT_CANDIDATES_POLL_MS : false,
    staleTime: ARKADE_SESSION_POLL_STALE_MS,
  })
}

export function useArkadeUnilateralExitCompletionFeeQuery(params: {
  enabled: boolean
  vtxoOutpoints: ArkadeVtxoOutpoint[]
  destinationAddress: string
  feeRateSatPerVb: number
}) {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const destinationTrimmed = params.destinationAddress.trim()
  const sortedVtxoOutpoints = sortArkadeVtxoOutpoints(params.vtxoOutpoints)
  const enabled =
    params.enabled &&
    sessionReady &&
    sortedVtxoOutpoints.length > 0 &&
    destinationTrimmed.length > 0 &&
    Number.isFinite(params.feeRateSatPerVb) &&
    params.feeRateSatPerVb > 0

  return useQuery({
    queryKey:
      activeWalletId != null &&
      activeArkadeConnectionId != null &&
      isArkadeSupportedNetworkMode(networkMode)
        ? arkadeUnilateralExitCompletionFeeQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
            sortedVtxoOutpoints,
            destinationTrimmed,
            params.feeRateSatPerVb,
          )
        : arkadeDisabledQueryKey('unilateral-completion-fee'),
    enabled,
    queryFn: () =>
      withReadyArkadeWorker(() =>
        getArkadeWorker().estimateUnilateralExitCompletion({
          vtxoOutpoints: sortedVtxoOutpoints,
          destinationAddress: destinationTrimmed,
          feeRateSatPerVb: params.feeRateSatPerVb,
        }),
      ),
    staleTime: ARKADE_FEE_ESTIMATE_STALE_MS,
  })
}

export function useArkadeCollaborativeExitMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async (params: {
      destinationAddress: string
      amountSats?: number
    }) => {
      assertArkadeSessionUnlocked(activeWalletId)
      const onRegistered = pendingBatchIntentOnRegisteredHandler(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )
      return withReadyArkadeWorker(() =>
        getArkadeWorker().collaborativeExit(params, proxy(onRegistered)),
      )
    },
    onMutate: async (params) => {
      if (
        activeWalletId == null ||
        activeArkadeConnectionId == null ||
        !isArkadeSupportedNetworkMode(networkMode)
      ) {
        return undefined
      }
      const balanceKey = arkadeBalanceQueryKey(
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
      )
      const previousBalance = queryClient.getQueryData<ArkadeBalanceInfo>(balanceKey)
      const deductedSats =
        params.amountSats ??
        (previousBalance != null ? arkadeOffchainSpendableSats(previousBalance) : 0)
      // Collaborative: snapshot still lists exiting VTXOs as spendable — deduct optimistically.
      return applyOptimisticExitBalanceDeduction(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
        deductedSats,
        'collaborativeExitInProgressSats',
      )
    },
    onSuccess: async (result, _params, context) => {
      toastBatchJoinResult(result, 'collaborative_exit')
      if (activeWalletId != null && activeArkadeConnectionId != null) {
        await invalidateArkadeWalletDataQueries(
          queryClient,
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
        await reconcileExitBalanceAfterMutation(queryClient, context)
      }
    },
    onError: (err, _params, context) => {
      if (context != null) {
        revertOptimisticExitBalanceDeduction(queryClient, context)
      }
      toast.error(errorMessage(err))
    },
  })
}

async function reconcileExitBalanceAfterMutation(
  queryClient: ReturnType<typeof useQueryClient>,
  context: ExitBalanceOptimisticContext | undefined,
): Promise<void> {
  if (context == null) {
    return
  }
  const fetched = await getArkadeWorker().getBalance()
  const reconciled = reconcileBalanceAfterExitOperation(fetched, context)
  queryClient.setQueryData(context.balanceKey, reconciled)
  const walletState = useWalletStore.getState()
  walletState.setArkadeDashboardState({
    balance: reconciled,
    payments: walletState.arkadePayments,
    receiveAddress: walletState.arkadeReceiveAddress ?? '',
  })
}

export function useArkadeUnilateralUnrollMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async (params: {
      txid: string
      vout: number
      amountSats: number
      onProgress: (event: ArkadeUnrollProgressEvent) => void
    }): Promise<ArkadeUnrollResult> => {
      assertArkadeSessionUnlocked(activeWalletId)
      await awaitArkadeLoadQuiescence()
      return getArkadeWorker().runUnilateralUnroll(
        { txid: params.txid, vout: params.vout },
        proxy((event: ArkadeUnrollProgressEvent) => {
          params.onProgress(event)
          if (shouldShowUnilateralUnrollProgressToast(event)) {
            toast.info(event.message, { id: unilateralUnrollProgressToastId(event) })
          }
        }),
      )
    },
    onMutate: async (params) => {
      if (
        activeWalletId == null ||
        activeArkadeConnectionId == null ||
        !isArkadeSupportedNetworkMode(networkMode)
      ) {
        return undefined
      }
      // Unilateral: exit line only — post-unroll WASM excludes VTXO from spendable via exiting sub-bucket.
      return applyOptimisticExitBalanceDeduction(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
        params.amountSats,
        'unilateralExitInProgressSats',
      )
    },
    onSuccess: async (result, _params, context) => {
      toast.dismiss(unilateralUnrollProgressToastId({ type: 'done', txid: result.vtxoTxid }))
      toast.success(formatUnilateralUnrollSuccessMessage(result.vtxoTxid))
      if (activeWalletId != null && activeArkadeConnectionId != null) {
        await invalidateArkadeWalletDataQueries(
          queryClient,
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
        await reconcileExitBalanceAfterMutation(queryClient, context)
      }
    },
    onError: (err, _params, context) => {
      if (context != null) {
        revertOptimisticExitBalanceDeduction(queryClient, context)
      }
      toast.error(errorMessage(err))
    },
  })
}

export function useArkadeCompleteUnilateralExitMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async (params: {
      vtxoOutpoints: ArkadeVtxoOutpoint[]
      destinationAddress: string
      feeRateSatPerVb: number
    }) => {
      assertArkadeSessionUnlocked(activeWalletId)
      return withReadyArkadeWorker(() => getArkadeWorker().completeUnilateralExit(params))
    },
    onSuccess: async (txid) => {
      toast.success(`Exit completed on-chain (${formatArkadeTxidToastSnippet(txid)})`)
      if (activeWalletId != null && activeArkadeConnectionId != null) {
        await invalidateArkadeWalletDataQueries(
          queryClient,
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err))
    },
  })
}

export function useArkadeRecoverableVtxoFeeQuery(params: { enabled: boolean }) {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const enabled = params.enabled && sessionReady

  return useQuery({
    queryKey:
      activeWalletId != null &&
      activeArkadeConnectionId != null &&
      isArkadeSupportedNetworkMode(networkMode)
        ? arkadeRecoverableVtxoFeeQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
          )
        : arkadeDisabledQueryKey('recoverable-vtxo-fee'),
    enabled,
    queryFn: () =>
      withReadyArkadeWorker(() => getArkadeWorker().getRecoverableVtxoFeeEstimate()),
    staleTime: ARKADE_FEE_ESTIMATE_STALE_MS,
  })
}

export function useArkadeCollaborativeExitFeeQuery(params: {
  enabled: boolean
  destinationAddress: string
  amountSats?: number
}) {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const destinationTrimmed = params.destinationAddress.trim()
  const enabled =
    params.enabled && sessionReady && destinationTrimmed.length > 0

  return useQuery({
    queryKey:
      activeWalletId != null &&
      activeArkadeConnectionId != null &&
      isArkadeSupportedNetworkMode(networkMode)
        ? arkadeCollaborativeExitFeeQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
            destinationTrimmed,
            params.amountSats,
          )
        : arkadeDisabledQueryKey('exit-fee-collaborative'),
    enabled,
    queryFn: () =>
      withReadyArkadeWorker(() =>
        getArkadeWorker().getCollaborativeExitFeeEstimate({
          destinationAddress: destinationTrimmed,
          amountSats: params.amountSats,
        }),
      ),
    staleTime: ARKADE_FEE_ESTIMATE_STALE_MS,
  })
}

export function useArkadeUnilateralExitFeeQuery(params: {
  enabled: boolean
  txid: string | undefined
  vout: number | undefined
}) {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const enabled =
    params.enabled && sessionReady && params.txid != null && params.vout != null

  return useQuery({
    queryKey:
      activeWalletId != null &&
      activeArkadeConnectionId != null &&
      isArkadeSupportedNetworkMode(networkMode) &&
      params.txid != null &&
      params.vout != null
        ? arkadeUnilateralExitFeeQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
            params.txid,
            params.vout,
          )
        : arkadeDisabledQueryKey('exit-fee-unilateral'),
    enabled,
    queryFn: async () => {
      const { txid, vout } = params
      if (txid == null || vout == null) {
        throw new Error('VTXO outpoint is required')
      }
      return withReadyArkadeWorker(() =>
        getArkadeWorker().estimateUnilateralExit({ txid, vout }),
      )
    },
    // Re-estimate while the bumper is underfunded so the "Start unroll" gate clears automatically
    // once an on-chain top-up confirms; stop polling once the bumper can cover the estimated fees.
    refetchInterval: (query) =>
      query.state.data?.bumperSufficient ? false : ARKADE_BUMPER_FUNDING_POLL_MS,
    staleTime: ARKADE_FEE_ESTIMATE_STALE_MS,
  })
}

export function useArkadeAutonomousModeStatusQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeAutonomousModeStatusQueryKey,
      'autonomous-mode',
    ),
    enabled: sessionReady,
    queryFn: () =>
      withReadyArkadeWorker(() => getArkadeWorker().getAutonomousModeStatus()),
    staleTime: ARKADE_SESSION_POLL_STALE_MS,
  })
}

export function useArkadeAutonomousModeMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } = useArkadeQueryBase()

  return useMutation({
    mutationFn: async (nextActive: boolean) => {
      await withReadyArkadeWorker(async () => {
        if (nextActive) {
          await getArkadeWorker().enterAutonomousMode()
        } else {
          await getArkadeWorker().exitAutonomousMode()
        }
      })
    },
    onSuccess: async () => {
      if (
        activeWalletId != null &&
        activeArkadeConnectionId != null &&
        isArkadeSupportedNetworkMode(networkMode)
      ) {
        await queryClient.invalidateQueries({
          queryKey: arkadeAutonomousModeStatusQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
          ),
        })
        await invalidateOperatorTrustQueries(
          queryClient,
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
        await queryClient.invalidateQueries({
          queryKey: arkadeExitCandidatesQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
          ),
        })
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Could not update autonomous mode',
      )
    },
  })
}

export function useArkadeAutonomousModeActive(): boolean {
  return useArkadeAutonomousModeStatusQuery().data?.active ?? false
}

async function invalidateOperatorTrustQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: arkadeOperatorTrustStatusQueryKey(walletId, networkMode, connectionId),
  })
  await queryClient.invalidateQueries({
    queryKey: arkadeOperatorConfigDiffQueryKey(walletId, networkMode, connectionId),
  })
}

export function useOperatorTrustStatusQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeOperatorTrustStatusQueryKey,
      'operator-trust-status',
    ),
    enabled: sessionReady,
    queryFn: () =>
      withReadyArkadeWorker(() => getArkadeWorker().getOperatorTrustStatus()),
    staleTime: ARKADE_SESSION_POLL_STALE_MS,
  })
}

export function useOperatorConfigDiffQuery(enabled: boolean) {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      activeArkadeConnectionId,
      arkadeOperatorConfigDiffQueryKey,
      'operator-config-diff',
    ),
    enabled: sessionReady && enabled,
    queryFn: () =>
      withReadyArkadeWorker(() => getArkadeWorker().getOperatorConfigDiff()),
    staleTime: ARKADE_SLOW_METADATA_STALE_MS,
  })
}

export function useAcceptOperatorConfigMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } = useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      try {
        await withReadyArkadeWorker(async () => {
          await getArkadeWorker().acceptPendingOperatorConfig()
        })
      } catch (error) {
        if (
          isOperatorTrustPendingDigestChangedError(error) &&
          activeWalletId != null &&
          activeArkadeConnectionId != null &&
          isArkadeSupportedNetworkMode(networkMode)
        ) {
          await refreshArkadeStoreFromLoadedWasm(activeArkadeConnectionId)
          await orchestrateArkadeSave({
            walletId: activeWalletId,
            networkMode,
            connectionId: activeArkadeConnectionId,
          })
          await invalidateOperatorTrustQueries(
            queryClient,
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
          )
          await queryClient.invalidateQueries({
            queryKey: arkadeAutonomousModeStatusQueryKey(
              activeWalletId,
              networkMode,
              activeArkadeConnectionId,
            ),
          })
        }
        throw error
      }
      if (
        activeWalletId != null &&
        activeArkadeConnectionId != null &&
        isArkadeSupportedNetworkMode(networkMode)
      ) {
        await refreshArkadeStoreFromLoadedWasm(activeArkadeConnectionId)
        await orchestrateArkadeSave({
          walletId: activeWalletId,
          networkMode,
          connectionId: activeArkadeConnectionId,
        })
      }
    },
    onSuccess: async () => {
      if (
        activeWalletId != null &&
        activeArkadeConnectionId != null &&
        isArkadeSupportedNetworkMode(networkMode)
      ) {
        await invalidateOperatorTrustQueries(
          queryClient,
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
        await queryClient.invalidateQueries({
          queryKey: arkadeAutonomousModeStatusQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
          ),
        })
        await queryClient.invalidateQueries({
          queryKey: arkadeBalanceQueryKey(activeWalletId, networkMode, activeArkadeConnectionId),
        })
      }
    },
    onError: (error) => {
      if (isOperatorTrustPendingDigestChangedError(error)) {
        toast.info(operatorTrustPendingDigestChangedMessage(error))
        return
      }
      toast.error(
        error instanceof Error ? error.message : 'Could not accept operator configuration',
      )
    },
  })
}

export function useReviewOperatorConfigInAutonomousMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } = useArkadeQueryBase()

  return useMutation({
    mutationFn: () =>
      withReadyArkadeWorker(() =>
        getArkadeWorker().reviewOperatorConfigInAutonomousMode(),
      ),
    onSuccess: async () => {
      if (
        activeWalletId != null &&
        activeArkadeConnectionId != null &&
        isArkadeSupportedNetworkMode(networkMode)
      ) {
        await invalidateOperatorTrustQueries(
          queryClient,
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
        await queryClient.invalidateQueries({
          queryKey: arkadeAutonomousModeStatusQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
          ),
        })
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not enter autonomous mode for operator review',
      )
    },
  })
}

export function useArkadeUnilateralExitTopologyQuery(params: {
  enabled: boolean
  vtxoOutpoints: ArkadeVtxoOutpoint[]
}) {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const sortedOutpoints = sortArkadeVtxoOutpoints(params.vtxoOutpoints)
  const enabled = params.enabled && sessionReady

  return useQuery({
    queryKey:
      activeWalletId != null &&
      activeArkadeConnectionId != null &&
      isArkadeSupportedNetworkMode(networkMode)
        ? arkadeUnilateralExitTopologyQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
            sortedOutpoints,
          )
        : arkadeDisabledQueryKey('unilateral-exit-topology'),
    enabled,
    queryFn: () =>
      withReadyArkadeWorker(() =>
        getArkadeWorker().getUnilateralExitTopology({
          vtxoOutpoints: sortedOutpoints,
        }),
      ),
    placeholderData: sortedOutpoints.length > 0 ? keepPreviousData : undefined,
    staleTime: ARKADE_FEE_ESTIMATE_STALE_MS,
  })
}

export function useArkadeUnilateralExitBatchEstimateQuery(params: {
  enabled: boolean
  vtxoOutpoints: ArkadeVtxoOutpoint[]
  feeRateSatPerVb: number
}) {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const sortedOutpoints = sortArkadeVtxoOutpoints(params.vtxoOutpoints)
  const enabled =
    params.enabled && sessionReady && sortedOutpoints.length > 0

  return useQuery({
    queryKey:
      activeWalletId != null &&
      activeArkadeConnectionId != null &&
      isArkadeSupportedNetworkMode(networkMode)
        ? arkadeUnilateralExitBatchEstimateQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
            sortedOutpoints,
            params.feeRateSatPerVb,
          )
        : arkadeDisabledQueryKey('unilateral-exit-batch-estimate'),
    enabled,
    queryFn: () =>
      withReadyArkadeWorker(() =>
        getArkadeWorker().estimateUnilateralExitBatch({
          vtxoOutpoints: sortedOutpoints,
          feeRateSatPerVb: params.feeRateSatPerVb,
        }),
      ),
    refetchInterval: (query) =>
      query.state.data?.bumperSufficient ? false : ARKADE_BUMPER_FUNDING_POLL_MS,
    staleTime: ARKADE_FEE_ESTIMATE_STALE_MS,
  })
}

const ARKADE_UNILATERAL_EXIT_PROGRESS_POLL_MS = 3_000
const ARKADE_UNILATERAL_EXIT_PROGRESS_IDLE_POLL_MS = 15_000

export function useArkadeUnilateralExitProgressQuery(params: {
  enabled: boolean
  vtxoOutpoints: ArkadeVtxoOutpoint[]
  /** When true, the XState actor owns progress reads; this query is display cache only. */
  unilateralExitJobActive?: boolean
}) {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const sortedOutpoints = sortArkadeVtxoOutpoints(params.vtxoOutpoints)
  const unilateralExitJobActive = params.unilateralExitJobActive === true
  const enabled = unilateralExitProgressQueryShouldFetch({
    enabled: params.enabled && sessionReady && sortedOutpoints.length > 0,
    unilateralExitJobActive,
  })
  const progressPollMs = isArkadeSupportedNetworkMode(networkMode)
    ? unilateralExitProgressPollMs(networkMode)
    : ARKADE_UNILATERAL_EXIT_PROGRESS_POLL_MS
  const progressIdlePollMs = isArkadeSupportedNetworkMode(networkMode)
    ? unilateralExitProgressIdlePollMs(networkMode)
    : ARKADE_UNILATERAL_EXIT_PROGRESS_IDLE_POLL_MS

  return useQuery({
    queryKey:
      activeWalletId != null &&
      activeArkadeConnectionId != null &&
      isArkadeSupportedNetworkMode(networkMode)
        ? arkadeUnilateralExitProgressQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
            sortedOutpoints,
          )
        : arkadeDisabledQueryKey('unilateral-exit-progress'),
    enabled,
    queryFn: () =>
      withReadyArkadeWorker(() =>
        getArkadeWorker().getUnilateralExitProgress({
          vtxoOutpoints: sortedOutpoints,
        }),
      ),
    refetchInterval: (query) =>
      unilateralExitProgressQueryRefetchInterval({
        enabled,
        unilateralExitJobActive,
        branchComplete:
          query.state.data != null && isUnilateralExitBranchComplete(query.state.data),
        waitingForConfirmation: isUnilateralExitProgressWaitingForConfirmation(
          query.state.data,
        ),
        progressPollMs,
        progressIdlePollMs,
      }),
    staleTime: 0,
  })
}

export function useArkadeProceedUnilateralExitStepMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async (params: {
      vtxoOutpoints: ArkadeVtxoOutpoint[]
      feeRateSatPerVb: number
      amountSats: number
    }) => {
      return proceedUnilateralExitStepWithGuards({
        activeWalletId,
        vtxoOutpoints: params.vtxoOutpoints,
        feeRateSatPerVb: params.feeRateSatPerVb,
      })
    },
    onMutate: async (params) => {
      if (
        activeWalletId == null ||
        activeArkadeConnectionId == null ||
        !isArkadeSupportedNetworkMode(networkMode)
      ) {
        return undefined
      }
      return applyOptimisticExitBalanceDeduction(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
        params.amountSats,
        'unilateralExitInProgressSats',
      )
    },
    onError: (_error, _params, context) => {
      if (context != null) {
        revertOptimisticExitBalanceDeduction(queryClient, context)
      }
    },
    onSuccess: async (_result, params, context) => {
      await reconcileExitBalanceAfterMutation(queryClient, context)
      if (
        activeWalletId != null &&
        activeArkadeConnectionId != null &&
        isArkadeSupportedNetworkMode(networkMode)
      ) {
        await queryClient.invalidateQueries({
          queryKey: arkadeUnilateralExitProgressQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
            sortArkadeVtxoOutpoints(params.vtxoOutpoints),
          ),
        })
        await queryClient.invalidateQueries({
          queryKey: arkadeBalanceQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
          ),
        })
      }
    },
  })
}
