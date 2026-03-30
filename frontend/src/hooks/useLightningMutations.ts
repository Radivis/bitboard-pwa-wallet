import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useLightningStore } from '@/stores/lightningStore'
import { useReceiveStore } from '@/stores/receiveStore'
import { useSendStore } from '@/stores/sendStore'
import {
  createBackendService,
  type LnbitsConnectionConfig,
  type LightningConnectionConfig,
} from '@/lib/lightning-backend-service'
import {
  DEFAULT_INVOICE_EXPIRY_SECONDS,
  formatSatsCompact,
} from '@/lib/lightning-utils'

export function useLnWalletBalanceQuery(config: LightningConnectionConfig) {
  return useQuery({
    queryKey: ['ln-wallet-balance', config],
    queryFn: async () => {
      const service = createBackendService(config)
      return service.getBalance()
    },
    staleTime: 30_000,
    retry: 1,
  })
}

export function useTestConnectionMutation() {
  return useMutation({
    mutationFn: async (config: LnbitsConnectionConfig) => {
      const service = createBackendService(config)
      return service.testConnection()
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(`Connected to "${result.walletName}"`)
      } else {
        toast.error(`Connection failed: ${result.error}`)
      }
    },
    onError: (err) => {
      toast.error(`Connection test failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useCreateInvoiceMutation(onCreated: () => void) {
  const networkMode = useWalletStore((s) => s.networkMode)
  const createInvoice = useLightningStore((s) => s.createInvoice)
  const addSessionInvoice = useReceiveStore((s) => s.addSessionInvoice)

  return useMutation({
    mutationFn: async (params: {
      amountSats: number
      description: string
      expirySeconds?: number
    }) => {
      return createInvoice({
        amountSats: params.amountSats,
        description: params.description,
        expirySeconds: params.expirySeconds ?? DEFAULT_INVOICE_EXPIRY_SECONDS,
        networkMode,
      })
    },
    onSuccess: (invoice) => {
      addSessionInvoice(invoice)
      toast.success(`Invoice created for ${formatSatsCompact(invoice.amountSats)}`)
      onCreated()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice')
    },
  })
}

export function useLightningPayMutation() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (params: {
      bolt11: string
      config: LightningConnectionConfig
    }) => {
      const service = createBackendService(params.config)
      return service.payInvoice(params.bolt11)
    },
    onSuccess: () => {
      toast.success('Lightning payment sent!')
      const { setRecipient, setAmount } = useSendStore.getState()
      setRecipient('')
      setAmount('')
      navigate({ to: '/wallet' })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Lightning payment failed')
    },
  })
}
