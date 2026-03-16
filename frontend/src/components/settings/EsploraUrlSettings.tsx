import { useState, useEffect, useCallback } from 'react'
import { Globe } from 'lucide-react'
import { toast } from 'sonner'
import { useWalletStore, NETWORK_LABELS } from '@/stores/walletStore'
import { DEFAULT_ESPLORA_URLS } from '@/lib/bitcoin-utils'
import {
  saveCustomEsploraUrl,
  deleteCustomEsploraUrl,
  loadCustomEsploraUrl,
} from '@/lib/wallet-utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { errorMessage } from '@/lib/utils'

export function EsploraUrlSettings() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const [customUrl, setCustomUrl] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadCustomEsploraUrl(networkMode).then((url) => {
      if (url) {
        setCustomUrl(url)
        setIsCustom(true)
      } else {
        setCustomUrl(DEFAULT_ESPLORA_URLS[networkMode])
        setIsCustom(false)
      }
    })
  }, [networkMode])

  const handleSave = useCallback(async () => {
    try {
      setLoading(true)
      await saveCustomEsploraUrl(networkMode, customUrl)
      setIsCustom(true)
      toast.success('Esplora endpoint saved')
    } catch (err) {
      toast.error(errorMessage(err) || 'Failed to save endpoint')
    } finally {
      setLoading(false)
    }
  }, [networkMode, customUrl])

  const handleReset = useCallback(async () => {
    try {
      setLoading(true)
      await deleteCustomEsploraUrl(networkMode)
      setCustomUrl(DEFAULT_ESPLORA_URLS[networkMode])
      setIsCustom(false)
      toast.success('Reset to default endpoint')
    } catch {
      toast.error('Failed to reset endpoint')
    } finally {
      setLoading(false)
    }
  }, [networkMode])

  return (
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
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder={DEFAULT_ESPLORA_URLS[networkMode]}
            disabled={loading}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={loading} size="sm">
            Save Endpoint
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={loading || !isCustom}
            size="sm"
          >
            Reset to Default
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
