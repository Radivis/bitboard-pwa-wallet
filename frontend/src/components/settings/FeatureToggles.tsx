import { Zap } from 'lucide-react'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore } from '@/stores/walletStore'
import { isLightningSupported } from '@/lib/lightning-utils'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

export function FeatureToggles() {
  const lightningEnabled = useFeatureStore((s) => s.lightningEnabled)
  const setLightningEnabled = useFeatureStore((s) => s.setLightningEnabled)
  const networkMode = useWalletStore((s) => s.networkMode)

  const networkSupportsLightning = isLightningSupported(networkMode)

  return (
    <div className="space-y-4">
      <InfomodeWrapper
        infoId="settings-feature-lightning"
        infoTitle="Lightning Network"
        infoText="The Lightning Network is a layer-2 payment protocol on top of Bitcoin. It enables fast, low-cost transactions by creating payment channels between nodes. Enabling this adds Lightning receive (invoices) and channel management to the wallet. Lightning is only available on mainnet, testnet, and signet."
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <Label htmlFor="lightning-toggle" className="cursor-pointer">
              Lightning
            </Label>
          </div>
          <Switch
            id="lightning-toggle"
            checked={lightningEnabled}
            onCheckedChange={setLightningEnabled}
            disabled={!networkSupportsLightning}
            aria-label="Enable Lightning Network"
          />
        </div>
      </InfomodeWrapper>
      {!networkSupportsLightning && (
        <p className="text-xs text-muted-foreground">
          Lightning is not available on {networkMode === 'lab' ? 'Lab' : 'Regtest'} networks.
        </p>
      )}
    </div>
  )
}
