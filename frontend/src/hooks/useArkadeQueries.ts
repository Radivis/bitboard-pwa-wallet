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
  arkadeDelegateInfoQueryKey,
  arkadeExitCandidatesQueryKey,
  arkadeHistoryQueryKey,
  arkadeRecoverableVtxoFeeQueryKey,
  arkadeUnilateralExitFeeQueryKey,
  arkadeVtxoExpiryQueryKey,
} from '@/lib/arkade/arkade-query-keys'
import type {
  ArkadeBalanceInfo,
  ArkadeBoardingStatus,
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
import { scheduleBackgroundArkadeOperatorSync } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { readArkadeDashboardStateFromStore } from '@/lib/arkade/arkade-persistence-store-sync'
import {
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
  revertOptimisticBoardingSettle,
  zeroBoardingStatus,
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
  await openArkadeSessionForWallet({
    walletId: activeWalletId,
    networkMode,
  })
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
  options?: { skipBalance?: boolean },
): Promise<void> {
  if (!isArkadeSupportedNetworkMode(networkMode)) return

  const invalidations = [
    queryClient.invalidateQueries({
      queryKey: arkadeHistoryQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeBoardingStatusQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeExitCandidatesQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeBumperInfoQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeVtxoExpiryQueryKey(walletId, networkMode, connectionId),
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

export function useArkadeOnboardMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      assertArkadeSessionUnlocked(activeWalletId)
      return withReadyArkadeWorkerAndOptionalDelegate(networkMode, () =>
        getArkadeWorker().onboardBoardedUtxos(),
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

      if (txid && settledSats > 0) {
        const cachedStatus = queryClient.getQueryData<ArkadeBoardingStatus>(boardingStatusKey)
        if (cachedStatus != null) {
          queryClient.setQueryData(boardingStatusKey, zeroBoardingStatus(cachedStatus))
        }
      }

      await queryClient.refetchQueries({ queryKey: balanceKey })
      const fetchedBalance = queryClient.getQueryData<ArkadeBalanceInfo>(balanceKey)
      if (fetchedBalance != null && settledSats > 0) {
        queryClient.setQueryData(
          balanceKey,
          reconcileBalanceAfterBoardingSettle(fetchedBalance, settledSats),
        )
      }

      await invalidateArkadeWalletDataQueries(
        queryClient,
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
        { skipBalance: true },
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
    mutationFn: async (params: { vtxoTxids: string[]; destinationAddress: string }) => {
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
    staleTime: ARKADE_FEE_ESTIMATE_STALE_MS,
  })
}
