/* eslint-disable react-refresh/only-export-components -- settings block exports constants with the component */
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
import { DEFAULT_ESPLORA_URLS } from '@/lib/wallet/bitcoin-utils'
import {
  saveCustomEsploraUrl,
  deleteCustomEsploraUrl,
  loadCustomEsploraUrl,
} from '@/lib/wallet/wallet-utils'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { DesignInput } from '@/components/design/DesignInput'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { shouldWarnEsploraNotWhitelisted } from '@/lib/esplora/esplora-service-whitelist'
import { errorMessage } from '@/lib/shared/utils'
import { notifyWalletDataMayHaveChangedAfterCommit } from '@/lib/wallet/wallet-cross-tab-sync'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'

export const customEsploraUrlQueryKey = (networkMode: NetworkMode) =>
  [...WALLET_DB_QUERY_KEY_ROOT, 'customEsploraUrl', networkMode] as const

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

  const showNonWhitelistedEsploraWarning =
    editUrl.trim() !== '' &&
    shouldWarnEsploraNotWhitelisted(editUrl, networkMode)

  return (
    <InfomodeWrapper
      infoId="settings-esplora-endpoint-card"
      infoTitle="Esplora endpoint"
      infoText="Bitboard uses an Esplora-style HTTP API to read blockchain data (balances, history) and to broadcast transactions. Each network can point at its own server URL. Most people keep the default; advanced users may enter their own node or a mirror they trust."
      className="rounded-xl"
    >
      <DesignCard>
        <DesignCardHeader>
          <div className="flex items-center gap-2">
            <DesignCardTitle>
              <Globe className="h-5 w-5" />
              Esplora Endpoint for {NETWORK_LABELS[networkMode]}
            </DesignCardTitle>
            {isCustom && <Badge variant="secondary">Custom</Badge>}
          </div>
          <DesignCardDescription>
            Network-specific: changing network will use the endpoint configured for
            that network.
          </DesignCardDescription>
        </DesignCardHeader>
        <DesignCardContent className="space-y-3">
          {showNonWhitelistedEsploraWarning && (
            <div
              role="status"
              className="design-type-regular rounded-md border border-amber-600/50 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100"
              data-testid="esplora-non-whitelisted-warning"
            >
              This app runs in your browser. Endpoints that are not in Bitboard’s
              known public Esplora list may block cross-origin requests (CORS), so
              sync, full rescan, or broadcast can fail on the hosted build. Prefer a
              listed public Esplora mirror or run your own server with CORS enabled.
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="esplora-url">Endpoint URL</Label>
            <DesignInput
              id="esplora-url"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder={defaultUrl}
              disabled={loading}
            />
          </div>
          <div className="flex gap-2">
            <DesignButton
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={loading}
            >
              Save Endpoint
            </DesignButton>
            <DesignButton
              type="button"
              appearance="secondary"
              onClick={() => resetMutation.mutate()}
              disabled={loading || !isCustom}
            >
              Reset to Default
            </DesignButton>
          </div>
        </DesignCardContent>
      </DesignCard>
    </InfomodeWrapper>
  )
}
