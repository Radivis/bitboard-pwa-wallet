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
import { awaitArkadeSessionReady } from '@/lib/arkade/arkade-session-service'
import {
  isArkadeDelegatorConfigured,
  isArkadeSupportedNetworkMode,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { useSessionStore } from '@/stores/sessionStore'
import { getCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import type { NetworkMode } from '@/stores/walletStore'
import { errorMessage } from '@/lib/shared/utils'

const ARKADE_WALLET_UNLOCKED_ERROR = 'Wallet must be unlocked'

function useArkadeQueryBase() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const password = useSessionStore((sessionState) => sessionState.password)
  const sessionReady =
    activeWalletId != null &&
    password != null &&
    isArkadeActiveForNetworkMode(networkMode) &&
    isArkadeSupportedNetworkMode(networkMode)

  return { networkMode, activeWalletId, password, sessionReady }
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

async function withReadyArkadeWorker<T>(run: () => Promise<T>): Promise<T> {
  await awaitArkadeSessionReady()
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
  buildKey: (walletId: number, network: ArkadeSupportedNetworkMode) => readonly unknown[],
  disabledScope: string,
): readonly unknown[] {
  if (activeWalletId != null && isArkadeSupportedNetworkMode(networkMode)) {
    return buildKey(activeWalletId, networkMode)
  }
  return disabledArkadeQueryKey(disabledScope)
}

/** Clears boarding UTXO counts and bumps Arkade balance while settle refetches. */
function applyOptimisticBoardingSettle(
  queryClient: ReturnType<typeof useQueryClient>,
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
): void {
  const boardingStatusKey = arkadeBoardingStatusQueryKey(walletId, networkMode)
  const previousStatus = queryClient.getQueryData<ArkadeBoardingStatus>(boardingStatusKey)
  const settledSats = previousStatus?.spendableSats ?? 0

  if (previousStatus != null) {
    queryClient.setQueryData<ArkadeBoardingStatus>(boardingStatusKey, {
      ...previousStatus,
      spendableSats: 0,
      pendingSats: 0,
      expiredSats: 0,
    })
  }

  if (settledSats > 0) {
    const balanceKey = arkadeBalanceQueryKey(walletId, networkMode)
    const previousBalance = queryClient.getQueryData<ArkadeBalanceInfo>(balanceKey)
    if (previousBalance != null) {
      queryClient.setQueryData<ArkadeBalanceInfo>(balanceKey, {
        confirmedSats: previousBalance.confirmedSats + settledSats,
        totalSats: previousBalance.totalSats + settledSats,
      })
    }
  }
}

async function invalidateArkadeWalletDataQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  walletId: number,
  networkMode: NetworkMode,
): Promise<void> {
  if (!isArkadeSupportedNetworkMode(networkMode)) return
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: arkadeBalanceQueryKey(walletId, networkMode),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeHistoryQueryKey(walletId, networkMode),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeExitCandidatesQueryKey(walletId, networkMode),
    }),
    queryClient.invalidateQueries({
      queryKey: arkadeBumperInfoQueryKey(walletId, networkMode),
    }),
  ])
}

export function useArkadeBalanceQuery() {
  const { networkMode, activeWalletId, sessionReady } = useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      arkadeBalanceQueryKey,
      'balance',
    ),
    enabled: sessionReady,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().getBalance()),
    staleTime: 30_000,
    refetchInterval: 15_000,
  })
}

export function useArkadeHistoryQuery() {
  const { networkMode, activeWalletId, sessionReady } = useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      arkadeHistoryQueryKey,
      'history',
    ),
    enabled: sessionReady,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().getTransactionHistory()),
    staleTime: 30_000,
    refetchInterval: 15_000,
  })
}

export function useArkadeAddressQuery() {
  const { networkMode, activeWalletId, sessionReady } = useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      arkadeAddressQueryKey,
      'address',
    ),
    enabled: sessionReady,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().getAddress()),
    staleTime: 300_000,
  })
}

export function useArkadeBoardingAddressQuery() {
  const { networkMode, activeWalletId, sessionReady } = useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      arkadeBoardingAddressQueryKey,
      'boarding-address',
    ),
    enabled: sessionReady,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().getBoardingAddress()),
    staleTime: 300_000,
  })
}

export function useArkadeBoardingStatusQuery() {
  const { networkMode, activeWalletId, sessionReady } = useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
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
  const { networkMode, activeWalletId, password } = useArkadeQueryBase()

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
      if (activeWalletId != null && isArkadeSupportedNetworkMode(networkMode)) {
        await queryClient.invalidateQueries({
          queryKey: arkadeBalanceQueryKey(activeWalletId, networkMode),
        })
        await queryClient.invalidateQueries({
          queryKey: arkadeHistoryQueryKey(activeWalletId, networkMode),
        })
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err))
    },
  })
}

export function useArkadeRenewMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, password } = useArkadeQueryBase()

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
      if (activeWalletId != null && isArkadeSupportedNetworkMode(networkMode)) {
        void queryClient.invalidateQueries({
          queryKey: arkadeBalanceQueryKey(activeWalletId, networkMode),
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
  const { networkMode, activeWalletId, password } = useArkadeQueryBase()

  return useMutation({
    mutationFn: async () => {
      assertArkadeSessionUnlocked(activeWalletId, password)
      return withReadyArkadeWorkerAndOptionalDelegate(networkMode, () =>
        getArkadeWorker().onboardBoardedUtxos(),
      )
    },
    onSuccess: async (txid) => {
      if (txid) {
        toast.success('Boarding completed')
      }
      if (activeWalletId != null && isArkadeSupportedNetworkMode(networkMode)) {
        if (txid) {
          applyOptimisticBoardingSettle(queryClient, activeWalletId, networkMode)
        }
        await Promise.all([
          queryClient.refetchQueries({
            queryKey: arkadeBalanceQueryKey(activeWalletId, networkMode),
          }),
          queryClient.refetchQueries({
            queryKey: arkadeBoardingStatusQueryKey(activeWalletId, networkMode),
          }),
        ])
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err))
    },
  })
}

export function useArkadeExitCandidatesQuery(enabled: boolean) {
  const { networkMode, activeWalletId, sessionReady } = useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
      arkadeExitCandidatesQueryKey,
      'exit-candidates',
    ),
    enabled: enabled && sessionReady,
    queryFn: () => withReadyArkadeWorker(() => getArkadeWorker().listExitCandidates()),
    staleTime: 15_000,
  })
}

export function useArkadeBumperInfoQuery(enabled: boolean) {
  const { networkMode, activeWalletId, sessionReady } = useArkadeQueryBase()

  return useQuery({
    queryKey: walletScopedQueryKey(
      activeWalletId,
      networkMode,
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
  const { networkMode, activeWalletId, password } = useArkadeQueryBase()

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
      if (activeWalletId != null) {
        await invalidateArkadeWalletDataQueries(queryClient, activeWalletId, networkMode)
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err))
    },
  })
}

export function useArkadeUnilateralUnrollMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, password } = useArkadeQueryBase()

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
      if (activeWalletId != null) {
        await invalidateArkadeWalletDataQueries(queryClient, activeWalletId, networkMode)
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err))
    },
  })
}

export function useArkadeCompleteUnilateralExitMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, password } = useArkadeQueryBase()

  return useMutation({
    mutationFn: async (params: { vtxoTxids: string[]; destinationAddress: string }) => {
      assertArkadeSessionUnlocked(activeWalletId, password)
      return withReadyArkadeWorker(() => getArkadeWorker().completeUnilateralExit(params))
    },
    onSuccess: async (txid) => {
      toast.success(`Exit completed on-chain (${txid.slice(0, 12)}…)`)
      if (activeWalletId != null) {
        await invalidateArkadeWalletDataQueries(queryClient, activeWalletId, networkMode)
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
  const { networkMode, activeWalletId, sessionReady } = useArkadeQueryBase()
  const destinationTrimmed = params.destinationAddress.trim()
  const enabled =
    params.enabled && sessionReady && destinationTrimmed.length > 0

  return useQuery({
    queryKey:
      activeWalletId != null && isArkadeSupportedNetworkMode(networkMode)
        ? arkadeCollaborativeExitFeeQueryKey(
            activeWalletId,
            networkMode,
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
  const { networkMode, activeWalletId, sessionReady } = useArkadeQueryBase()
  const enabled =
    params.enabled && sessionReady && params.txid != null && params.vout != null

  return useQuery({
    queryKey:
      activeWalletId != null &&
      isArkadeSupportedNetworkMode(networkMode) &&
      params.txid != null &&
      params.vout != null
        ? arkadeUnilateralExitFeeQueryKey(
            activeWalletId,
            networkMode,
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
