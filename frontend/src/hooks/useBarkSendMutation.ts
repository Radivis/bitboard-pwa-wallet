import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { barkArkoorSendErrorMessage } from '@/lib/bark/arkoor-send-error'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { commitBarkArkoorSend } from '@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator'
import { useWalletStore } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'
import type { BarkArkoorSendParams } from '@/workers/bark-api'

export function useBarkSendMutation() {
  return useMutation({
    mutationFn: (params: BarkArkoorSendParams) => {
      const networkMode = useWalletStore.getState().networkMode
      if (!isBarkActiveForNetworkMode(networkMode)) {
        throw new Error('Bark is not active')
      }
      return commitBarkArkoorSend(() => getBarkWorker().sendArkoorPayment(params))
    },
    retry: false,
    onSuccess: () => {
      toast.success('Bark payment sent')
    },
    onError: (err) => {
      toast.error(barkArkoorSendErrorMessage(err))
    },
  })
}
