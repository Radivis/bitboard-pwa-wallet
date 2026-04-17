import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe } from 'lucide-react'
import { toast } from 'sonner'
import {
  useWalletStore,
  NETWORK_LABELS,
  selectCommittedNetworkMode,
  getCommittedNetworkMode,
  type NetworkMode,
} from '@/stores/walletStore'
import { DEFAULT_ESPLORA_URLS } from '@/lib/bitcoin-utils'
import {
  saveCustomEsploraUrl,
  deleteCustomEsploraUrl,
  loadCustomEsploraUrl,
} from '@/lib/wallet-utils'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { errorMessage } from '@/lib/utils'
import { notifyWalletDataMayHaveChangedAfterCommit } from '@/lib/wallet-cross-tab-sync'

export const customEsploraUrlQueryKey = (networkMode: NetworkMode) =>
  ['customEsploraUrl', networkMode] as const

export function EsploraUrlSettings() {
  /** Match NetworkSelector / Esplora persistence: same “committed” network as the active mode button. */
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const queryClient = useQueryClient()
  const defaultUrl = DEFAULT_ESPLORA_URLS[networkMode]

  const { data: storedCustomUrl } = useQuery({
    queryKey: customEsploraUrlQueryKey(networkMode),
    queryFn: () => loadCustomEsploraUrl(networkMode),
  })

  const [editUrl, setEditUrl] = useState(defaultUrl)

  useEffect(() => {
    setEditUrl(storedCustomUrl ?? defaultUrl)
  }, [storedCustomUrl, defaultUrl])

  const isCustom = storedCustomUrl != null

  const saveMutation = useMutation({
    mutationFn: async () => {
      const mode = getCommittedNetworkMode()
      await saveCustomEsploraUrl(mode, editUrl)
      return { mode, savedUrl: editUrl }
    },
    onSuccess: async ({ mode, savedUrl }) => {
      queryClient.setQueryData(customEsploraUrlQueryKey(mode), savedUrl)
      await queryClient.invalidateQueries({
        queryKey: customEsploraUrlQueryKey(mode),
        refetchType: 'none',
      })
      notifyWalletDataMayHaveChangedAfterCommit()
      toast.success('Esplora endpoint saved')
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err) || 'Failed to save endpoint')
    },
  })

  const resetMutation = useMutation({
    mutationFn: async () => {
      const mode = getCommittedNetworkMode()
      await deleteCustomEsploraUrl(mode)
      return mode
    },
    onSuccess: async (mode) => {
      queryClient.setQueryData(customEsploraUrlQueryKey(mode), null)
      await queryClient.invalidateQueries({
        queryKey: customEsploraUrlQueryKey(mode),
        refetchType: 'none',
      })
      notifyWalletDataMayHaveChangedAfterCommit()
      toast.success('Reset to default endpoint')
    },
    onError: () => {
      toast.error('Failed to reset endpoint')
    },
  })

  const loading = saveMutation.isPending || resetMutation.isPending

  return (
    <InfomodeWrapper
      infoId="settings-esplora-endpoint-card"
      infoTitle="Esplora endpoint"
      infoText="Bitboard uses an Esplora-style HTTP API to read blockchain data (balances, history) and to broadcast transactions. Each network can point at its own server URL. Most people keep the default; advanced users may enter their own node or a mirror they trust."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Esplora Endpoint for {NETWORK_LABELS[networkMode]}
            </CardTitle>
            {isCustom && <Badge variant="secondary">Custom</Badge>}
          </div>
          <CardDescription>
            Network-specific: changing network will use the endpoint configured for
            that network.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="esplora-url">Endpoint URL</Label>
            <Input
              id="esplora-url"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder={defaultUrl}
              disabled={loading}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={loading}
              size="sm"
            >
              Save Endpoint
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => resetMutation.mutate()}
              disabled={loading || !isCustom}
              size="sm"
            >
              Reset to Default
            </Button>
          </div>
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
