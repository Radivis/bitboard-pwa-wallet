import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { rememberBarkReceiveKeyIndex } from '@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator'
import { errorMessage } from '@/lib/shared/utils'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

export function barkReceiveAddressQueryKey(
  walletId: number | null,
  networkMode: NetworkMode,
  receiveKeyIndex: number | null,
) {
  return ['bark', 'receive-address', walletId, networkMode, receiveKeyIndex] as const
}

export function useBarkReceiveAddressQuery() {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const snapshot = useBarkLoadLifecycleSnapshot()
  const receiveKeyIndex = snapshot.receiveKeyIndex
  const sessionReady =
    snapshot.loadPhase === 'loaded' &&
    snapshot.networkMode === networkMode &&
    isBarkActiveForNetworkMode(networkMode) &&
    receiveKeyIndex != null &&
    activeWalletId != null

  return useQuery({
    queryKey: barkReceiveAddressQueryKey(activeWalletId, networkMode, receiveKeyIndex),
    enabled: sessionReady,
    queryFn: () => {
      if (receiveKeyIndex == null) {
        throw new Error('Bark receive key index is missing')
      }
      return getBarkWorker().peekReceiveAddress(receiveKeyIndex)
    },
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useBarkRevealReceiveAddressMutation() {
  const queryClient = useQueryClient()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)

  return useMutation({
    mutationFn: async () => {
      const revealed = await getBarkWorker().revealNextReceiveAddress()
      queryClient.setQueryData(
        barkReceiveAddressQueryKey(activeWalletId, networkMode, revealed.index),
        revealed.address,
      )
      rememberBarkReceiveKeyIndex(revealed.index)
      return revealed
    },
    onSuccess: () => {
      toast.success('New Bark address generated')
    },
    onError: (err) => {
      toast.error(errorMessage(err))
    },
  })
}
