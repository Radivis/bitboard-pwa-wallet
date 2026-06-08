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
  arkadeAddressQueryKey,
  arkadeDelegateInfoQueryKey,
  arkadeExitCandidatesQueryKey,
  arkadeHistoryQueryKey,
  arkadeUnilateralExitFeeQueryKey,
} from '@/lib/arkade/arkade-query-keys'
import type {
  ArkadeBalanceInfo,
  ArkadeBoardingStatus,
  ArkadeUnrollProgressEvent,
} from '@/workers/arkade-api'
import {
  isArkadeActiveForCommittedNetwork,
  isArkadeActiveForNetworkMode,
} from '@/lib/arkade/arkade-utils'
import {
  awaitArkadeSessionReady,
  openArkadeSessionForWallet,
} from '@/lib/arkade/arkade-session-service'
import { scheduleBackgroundArkadeOperatorSync } from '@/lib/arkade/arkade-operator-sync'
import { readArkadeDashboardStateFromStore } from '@/lib/arkade/arkade-persistence-store-sync'
import {
  isArkadeDelegatorConfigured,
  isArkadeSupportedNetworkMode,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { useSessionStore } from '@/stores/sessionStore'
import { getCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import type { NetworkMode } from '@/stores/walletStore'
import { arkadeDashboardWalletDataQueryOptions } from '@/lib/arkade/arkade-dashboard-query-options'
import {
  beginOptimisticBoardingSettle,
  reconcileBalanceAfterBoardingSettle,
  revertOptimisticBoardingSettle,
  zeroBoardingStatus,
} from '@/lib/arkade/arkade-boarding-settle-optimistic'
import { errorMessage } from '@/lib/shared/utils'

const ARKADE_WALLET_UNLOCKED_ERROR = 'Wallet must be unlocked'

function useArkadeQueryBase() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const activeArkadeConnectionId = useWalletStore(
    (walletState) => walletState.activeArkadeConnectionId,
  )
  const password = useSessionStore((sessionState) => sessionState.password)
  const sessionReady =
    activeWalletId != null &&
    password != null &&
    isArkadeActiveForNetworkMode(networkMode) &&
    isArkadeSupportedNetworkMode(networkMode)

  return { networkMode, activeWalletId, activeArkadeConnectionId, password, sessionReady }
}

function useArkadeDelegateQueryBase() {
  const networkMode = getCommittedNetworkMode()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const password = useSessionStore((sessionState) => sessionState.password)
  const sessionReady =
    isArkadeActiveForCommittedNetwork() &&
    isArkadeSupportedNetworkMode(networkMode) &&
    isArkadeDelegatorConfigured(networkMode) &&
    activeWalletId != null &&
    password != null

  return { networkMode, activeWalletId, password, sessionReady }
}

function assertArkadeSessionUnlocked(
  activeWalletId: number | null,
  password: string | null,
): asserts activeWalletId is number {
  if (activeWalletId == null || password == null) {
    throw new Error(ARKADE_WALLET_UNLOCKED_ERROR)
  }
}

async function ensureArkadeSessionOpenForActiveWallet(): Promise<void> {
  const activeWalletId = useWalletStore.getState().activeWalletId
  const networkMode = useWalletStore.getState().networkMode
  const password = useSessionStore.getState().password
  if (
    activeWalletId == null ||
    password == null ||
    !isArkadeActiveForNetworkMode(networkMode) ||
    !isArkadeSupportedNetworkMode(networkMode)
  ) {
    await awaitArkadeSessionReady()
    return
  }
  await openArkadeSessionForWallet({
    password,
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
  await awaitArkadeSessionReady()
  const result = await run()
  if (isArkadeSupportedNetworkMode(networkMode) && isArkadeDelegatorConfigured(networkMode)) {
    await getArkadeWorker().delegateSpendableVtxos()
  }
  return result
}

function disabledArkadeQueryKey(scope: string): readonly [string, string, 'disabled'] {
  return ['arkade', scope, 'disabled']
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
  return disabledArkadeQueryKey(disabledScope)
}

async function invalidateArkadeWalletDataQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  walletId: number,
  networkMode: NetworkMode,
  connectionId: string,
): Promise<void> {
  if (!isArkadeSupportedNetworkMode(networkMode)) return
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: arkadeBalanceQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeHistoryQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeExitCandidatesQueryKey(walletId, networkMode, connectionId),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeBumperInfoQueryKey(walletId, networkMode, connectionId),
    }),
  ])
}

export function useArkadeBalanceQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const storeBalance = useWalletStore((walletState) => walletState.arkadeBalance)

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
    ...arkadeDashboardWalletDataQueryOptions,
  })
}

export function useArkadeHistoryQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()
  const storePayments = useWalletStore((walletState) => walletState.arkadePayments)

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
    ...arkadeDashboardWalletDataQueryOptions,
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
    enabled: sessionReady,
    initialData: storeReceiveAddress ?? undefined,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().getAddress()),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useArkadeNewAddressMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId, password } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      assertArkadeSessionUnlocked(activeWalletId, password)
      return withReadyArkadeWorker(() => getArkadeWorker().getNewAddress())
    },
    onSuccess: async (newAddress) => {
      toast.success('New Arkade address generated')
      if (
        activeWalletId != null &&
        activeArkadeConnectionId != null &&
        isArkadeSupportedNetworkMode(networkMode)
      ) {
        const addressQueryKey = arkadeAddressQueryKey(
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        )
        queryClient.setQueryData(addressQueryKey, newAddress)
        const dashboardState = readArkadeDashboardStateFromStore()
        useWalletStore.getState().setArkadeDashboardState({
          balance: dashboardState.balance,
          payments: dashboardState.payments,
          receiveAddress: newAddress,
        })
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
    staleTime: 300_000,
  })
}

export function useArkadeBoardingStatusQuery() {
  const { networkMode, activeWalletId, activeArkadeConnectionId, sessionReady } =
    useArkadeQueryBase()

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
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

export function useArkadeDelegateInfoQuery() {
  const { networkMode, sessionReady } = useArkadeDelegateQueryBase()

  return useQuery({
    queryKey: isArkadeSupportedNetworkMode(networkMode)
      ? arkadeDelegateInfoQueryKey(networkMode)
      : disabledArkadeQueryKey('delegator'),
    enabled: sessionReady,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().getDelegateInfo()),
    staleTime: 300_000,
  })
}

export function useArkadeSendMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId, password } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async (params: { address: string; amountSats: number }) => {
      assertArkadeSessionUnlocked(activeWalletId, password)
      return withReadyArkadeWorkerAndOptionalDelegate(networkMode, () =>
        getArkadeWorker().sendPayment(params),
      )
    },
    retry: false,
    onSuccess: async (txid) => {
      toast.success(`Arkade payment sent (${txid.slice(0, 12)}…)`)
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
  const { networkMode, activeWalletId, activeArkadeConnectionId, password } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      assertArkadeSessionUnlocked(activeWalletId, password)
      return withReadyArkadeWorker(() => getArkadeWorker().renewVtxosNow())
    },
    onSuccess: (txid) => {
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
        void queryClient.invalidateQueries({
          queryKey: arkadeBalanceQueryKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
          ),
        })
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err))
    },
  })
}

export function useArkadeOnboardMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId, password } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      assertArkadeSessionUnlocked(activeWalletId, password)
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

      await queryClient.invalidateQueries({
        queryKey: arkadeHistoryQueryKey(
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
        ),
      })
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
    staleTime: 15_000,
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
    staleTime: 15_000,
  })
}

export function useArkadeCollaborativeExitMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId, password } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async (params: {
      destinationAddress: string
      amountSats?: number
    }) => {
      assertArkadeSessionUnlocked(activeWalletId, password)
      return withReadyArkadeWorker(() => getArkadeWorker().collaborativeExit(params))
    },
    onSuccess: async (txid) => {
      toast.success(`Collaborative exit started (${txid.slice(0, 12)}…)`)
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

export function useArkadeUnilateralUnrollMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId, password } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async (params: {
      txid: string
      vout: number
      onProgress: (event: ArkadeUnrollProgressEvent) => void
    }) => {
      assertArkadeSessionUnlocked(activeWalletId, password)
      await awaitArkadeSessionReady()
      return getArkadeWorker().runUnilateralUnroll(
        { txid: params.txid, vout: params.vout },
        proxy(params.onProgress),
      )
    },
    onSuccess: async () => {
      toast.success('Unroll finished — complete exit after the timelock')
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

export function useArkadeCompleteUnilateralExitMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, activeArkadeConnectionId, password } =
    useArkadeQueryBase()

  return useMutation({
    mutationFn: async (params: { vtxoTxids: string[]; destinationAddress: string }) => {
      assertArkadeSessionUnlocked(activeWalletId, password)
      return withReadyArkadeWorker(() => getArkadeWorker().completeUnilateralExit(params))
    },
    onSuccess: async (txid) => {
      toast.success(`Exit completed on-chain (${txid.slice(0, 12)}…)`)
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
        : disabledArkadeQueryKey('exit-fee-collaborative'),
    enabled,
    queryFn: () =>
      withReadyArkadeWorker(() =>
        getArkadeWorker().getCollaborativeExitFeeEstimate({
          destinationAddress: destinationTrimmed,
          amountSats: params.amountSats,
        }),
      ),
    staleTime: 30_000,
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
        : disabledArkadeQueryKey('exit-fee-unilateral'),
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
    staleTime: 30_000,
  })
}
