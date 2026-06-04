import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getArkadeWorker } from '@/workers/arkade-factory'
import {
  arkadeBalanceQueryKey,
  arkadeDelegateInfoQueryKey,
  arkadeHistoryQueryKey,
} from '@/lib/arkade/arkade-query-keys'
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
