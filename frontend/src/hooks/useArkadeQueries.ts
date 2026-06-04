import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { proxy } from 'comlink'
import { toast } from 'sonner'
import { getArkadeWorker } from '@/workers/arkade-factory'
import {
  arkadeBalanceQueryKey,
  arkadeBumperInfoQueryKey,
  arkadeDelegateInfoQueryKey,
  arkadeExitCandidatesQueryKey,
  arkadeHistoryQueryKey,
} from '@/lib/arkade/arkade-query-keys'
import type { ArkadeUnrollProgressEvent } from '@/workers/arkade-api'
import {
  isArkadeActiveForCommittedNetwork,
  isArkadeActiveForNetworkMode,
} from '@/lib/arkade/arkade-utils'
import { requireArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-utils'
import { openArkadeSessionForWallet } from '@/lib/arkade/arkade-session-service'
import {
  getArkadeEndpoints,
  isArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { useSessionStore } from '@/stores/sessionStore'
import { getCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { errorMessage } from '@/lib/shared/utils'

function useArkadeSessionContext() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const password = useSessionStore((s) => s.password)
  const sessionReady =
    activeWalletId != null &&
    password != null &&
    isArkadeActiveForNetworkMode(networkMode) &&
    isArkadeSupportedNetworkMode(networkMode)
  return { networkMode, activeWalletId, password, sessionReady }
}

async function invalidateArkadeWalletDataQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  walletId: number,
  networkMode: ReturnType<typeof useWalletStore.getState>['networkMode'],
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
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const password = useSessionStore((s) => s.password)
  const enabled =
    activeWalletId != null &&
    password != null &&
    isArkadeActiveForNetworkMode(networkMode) &&
    isArkadeSupportedNetworkMode(networkMode)

  return useQuery({
    queryKey:
      activeWalletId != null && isArkadeSupportedNetworkMode(networkMode)
        ? arkadeBalanceQueryKey(activeWalletId, networkMode)
        : ['arkade', 'balance', 'disabled'],
    enabled,
    queryFn: async () => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet must be unlocked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
      return getArkadeWorker().getBalance()
    },
    staleTime: 30_000,
  })
}

export function useArkadeHistoryQuery() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const password = useSessionStore((s) => s.password)
  const enabled =
    activeWalletId != null &&
    password != null &&
    isArkadeActiveForNetworkMode(networkMode) &&
    isArkadeSupportedNetworkMode(networkMode)

  return useQuery({
    queryKey:
      activeWalletId != null && isArkadeSupportedNetworkMode(networkMode)
        ? arkadeHistoryQueryKey(activeWalletId, networkMode)
        : ['arkade', 'history', 'disabled'],
    enabled,
    queryFn: async () => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet must be unlocked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
      return getArkadeWorker().getTransactionHistory()
    },
    staleTime: 30_000,
  })
}

export function useArkadeDelegateInfoQuery() {
  const networkMode = getCommittedNetworkMode()
  const enabled = isArkadeActiveForCommittedNetwork() && isArkadeSupportedNetworkMode(networkMode)

  return useQuery({
    queryKey: isArkadeSupportedNetworkMode(networkMode)
      ? arkadeDelegateInfoQueryKey(networkMode)
      : ['arkade', 'delegator', 'disabled'],
    enabled,
    queryFn: async () => {
      const endpoints = getArkadeEndpoints(requireArkadeSupportedNetworkMode(networkMode))
      const { RestDelegatorProvider } = await import('@arkade-os/sdk')
      const provider = new RestDelegatorProvider(endpoints.delegatorUrl)
      return provider.getDelegateInfo()
    },
    staleTime: 300_000,
  })
}

export function useArkadeSendMutation() {
  const queryClient = useQueryClient()
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const password = useSessionStore((s) => s.password)

  return useMutation({
    mutationFn: async (params: { address: string; amountSats: number }) => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet must be unlocked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
      const txid = await getArkadeWorker().sendPayment(params)
      await getArkadeWorker().delegateSpendableVtxos()
      return txid
    },
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
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const password = useSessionStore((s) => s.password)

  return useMutation({
    mutationFn: async () => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet must be unlocked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
      return getArkadeWorker().renewVtxosNow()
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
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const password = useSessionStore((s) => s.password)

  return useMutation({
    mutationFn: async () => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet must be unlocked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
      const txid = await getArkadeWorker().onboardBoardedUtxos()
      await getArkadeWorker().delegateSpendableVtxos()
      return txid
    },
    onSuccess: (txid) => {
      if (txid) {
        toast.success('Boarding completed')
      } else {
        toast.message('No pending boarding UTXOs to settle')
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

export function useArkadeExitCandidatesQuery(enabled: boolean) {
  const { networkMode, activeWalletId, password, sessionReady } = useArkadeSessionContext()

  return useQuery({
    queryKey:
      activeWalletId != null && isArkadeSupportedNetworkMode(networkMode)
        ? arkadeExitCandidatesQueryKey(activeWalletId, networkMode)
        : ['arkade', 'exit-candidates', 'disabled'],
    enabled: enabled && sessionReady,
    queryFn: async () => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet must be unlocked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
      return getArkadeWorker().listExitCandidates()
    },
    staleTime: 15_000,
  })
}

export function useArkadeBumperInfoQuery(enabled: boolean) {
  const { networkMode, activeWalletId, password, sessionReady } = useArkadeSessionContext()

  return useQuery({
    queryKey:
      activeWalletId != null && isArkadeSupportedNetworkMode(networkMode)
        ? arkadeBumperInfoQueryKey(activeWalletId, networkMode)
        : ['arkade', 'bumper', 'disabled'],
    enabled: enabled && sessionReady,
    queryFn: async () => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet must be unlocked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
      return getArkadeWorker().getOnchainBumperInfo()
    },
    staleTime: 15_000,
  })
}

export function useArkadeCollaborativeExitMutation() {
  const queryClient = useQueryClient()
  const { networkMode, activeWalletId, password } = useArkadeSessionContext()

  return useMutation({
    mutationFn: async (params: {
      destinationAddress: string
      amountSats?: number
    }) => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet must be unlocked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
      return getArkadeWorker().collaborativeExit(params)
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
  const { networkMode, activeWalletId, password } = useArkadeSessionContext()

  return useMutation({
    mutationFn: async (params: {
      txid: string
      vout: number
      onProgress: (event: ArkadeUnrollProgressEvent) => void
    }) => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet must be unlocked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
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
  const { networkMode, activeWalletId, password } = useArkadeSessionContext()

  return useMutation({
    mutationFn: async (params: { vtxoTxids: string[]; destinationAddress: string }) => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet must be unlocked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
      return getArkadeWorker().completeUnilateralExit(params)
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
