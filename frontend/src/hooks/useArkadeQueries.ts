import { awaitInFlightWalletSecretsWrites } from '@/db'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  arkadeOperatorTrustStatusQueryKey,
  arkadeRecoverableVtxoFeeQueryKey,
  arkadeSignerMigrationPartialResultQueryKey,
  arkadeUnilateralExitCompletionFeeQueryKey,
  arkadeUnilateralExitFeeQueryKey,
  arkadeUnilateralExitsInProgressQueryKey,
  arkadeVtxoExpiryQueryKey,
  arkadeVtxoListQueryKey,
} from '@/lib/arkade/arkade-query-keys'
import type {
  ArkadeBalanceInfo,
  ArkadeBoardingStatus,
  ArkadeSignerMigrationResult,
  ArkadeUnrollProgressEvent,
} from '@/workers/arkade-api'
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
  ARKADE_BUMPER_FUNDING_POLL_MS,
  ARKADE_EXIT_CANDIDATES_POLL_MS,
  ARKADE_FEE_ESTIMATE_STALE_MS,
  ARKADE_SESSION_POLL_STALE_MS,
  ARKADE_SLOW_METADATA_STALE_MS,
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
  isOperatorIndexerCatchingUpError,
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

const ARKADE_WALLET_UNLOCKED_ERROR = 'Wallet must be unlocked'

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

function assertArkadeSessionUnlocked(
  activeWalletId: number | null,
): asserts activeWalletId is number {
  if (activeWalletId == null) {
    throw new Error(ARKADE_WALLET_UNLOCKED_ERROR)
  }
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
    refetchInterval,
    staleTime: ARKADE_SESSION_POLL_STALE_MS,
  })
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

export function useArkadeRenewMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      assertArkadeSessionUnlocked(activeWalletId)
      return withReadyArkadeWorker(() => getArkadeWorker().renewVtxosNow())
    },
    onSuccess: async (txid) => {
      if (txid) {
        toast.success('VTXOs renewed')
      } else {
        toast.message('No expiring VTXOs to renew right now')
      }
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

export function useArkadeRecoverRecoverableVtxosMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      assertArkadeSessionUnlocked(activeWalletId)
      return withReadyArkadeWorker(() => getArkadeWorker().recoverRecoverableVtxos())
    },
    onSuccess: async (txid) => {
      if (txid) {
        toast.success('Recoverable VTXOs settled')
      } else {
        toast.message('No recoverable VTXOs to settle right now')
      }
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
      const migrationResult = await orchestrateArkadeSyncThenSave({
        walletId: activeWalletId,
        networkMode,
        connectionId: activeArkadeConnectionId,
        syncKind: 'signerMigration',
        awaitCompletion: true,
        throwOnError: true,
      })
      if (migrationResult == null) {
        throw new Error('Signer migration did not return a result')
      }
      return migrationResult
    },
    onSuccess: async (migrationResult) => {
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
      const txid = await withReadyArkadeWorkerAndOptionalDelegate(networkMode, () =>
        getArkadeWorker().onboardBoardedUtxos(),
      )
      if (!txid) {
        throw new Error('Boarding settlement did not return a commitment transaction')
      }
      return txid
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
    onSuccess: async (txid, _variables, context) => {
      if (txid) {
        toast.success('Boarding settlement submitted to operator')
      }
      if (
        activeWalletId == null ||
        activeArkadeConnectionId == null ||
        !isArkadeSupportedNetworkMode(networkMode)
      ) {
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

export function useArkadeBumperInfoQuery(enabled: boolean) {
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
    queryFn: () =>
      withReadyArkadeWorker(() => getArkadeWorker().listUnilateralExitsInProgress()),
    refetchInterval: enabled ? ARKADE_EXIT_CANDIDATES_POLL_MS : false,
    staleTime: ARKADE_SESSION_POLL_STALE_MS,
  })
}

export function useArkadeUnilateralExitCompletionFeeQuery(params: {
  enabled: boolean
  vtxoTxids: string[]
  destinationAddress: string
  feeRateSatPerVb: number
}) {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const destinationTrimmed = params.destinationAddress.trim()
  const sortedVtxoTxids = [...params.vtxoTxids].sort()
  const enabled =
    params.enabled &&
    sessionReady &&
    sortedVtxoTxids.length > 0 &&
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
            sortedVtxoTxids,
            destinationTrimmed,
            params.feeRateSatPerVb,
          )
        : arkadeDisabledQueryKey('unilateral-completion-fee'),
    enabled,
    queryFn: () =>
      withReadyArkadeWorker(() =>
        getArkadeWorker().estimateUnilateralExitCompletion({
          vtxoTxids: sortedVtxoTxids,
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
      return withReadyArkadeWorker(() => getArkadeWorker().collaborativeExit(params))
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
    onSuccess: async (txid, _params, context) => {
      toast.success(`Collaborative exit started (${formatArkadeTxidToastSnippet(txid)})`)
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
    }) => {
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
      if (result.indexerWarning) {
        toast.warning(result.indexerWarning, { id: 'arkade-unroll-indexer-warning' })
      }
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
      vtxoTxids: string[]
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
      if (isOperatorIndexerCatchingUpError(err)) {
        return
      }
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
      await withReadyArkadeWorker(async () => {
        await getArkadeWorker().acceptPendingOperatorConfig()
      })
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
