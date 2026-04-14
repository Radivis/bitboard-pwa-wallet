import { useCallback, useState } from 'react'
import { AlertTriangle, FlaskConical, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore, getCommittedNetworkMode } from '@/stores/walletStore'
import { isLightningSupported } from '@/lib/lightning-utils'
import { executeSettingsNetworkSwitch } from '@/lib/network-mode-switch'
import { errorMessage } from '@/lib/utils'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { MainnetAccessConfirmModal } from '@/components/settings/MainnetAccessConfirmModal'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

export function FeatureToggles() {
  const lightningEnabled = useFeatureStore((s) => s.lightningEnabled)
  const setLightningEnabled = useFeatureStore((s) => s.setLightningEnabled)
  const mainnetAccessEnabled = useFeatureStore((s) => s.mainnetAccessEnabled)
  const setMainnetAccessEnabled = useFeatureStore((s) => s.setMainnetAccessEnabled)
  const regtestModeEnabled = useFeatureStore((s) => s.regtestModeEnabled)
  const setRegtestModeEnabled = useFeatureStore((s) => s.setRegtestModeEnabled)
  const networkMode = useWalletStore((s) => s.networkMode)

  const [mainnetConfirmOpen, setMainnetConfirmOpen] = useState(false)
  const [mainnetAccessSwitchBusy, setMainnetAccessSwitchBusy] = useState(false)
  const [regtestModeSwitchBusy, setRegtestModeSwitchBusy] = useState(false)

  const networkSupportsLightning = isLightningSupported(networkMode)

  const handleMainnetAccessOff = useCallback(async () => {
    setMainnetAccessSwitchBusy(true)
    try {
      if (getCommittedNetworkMode() === 'mainnet') {
        await executeSettingsNetworkSwitch({ targetNetwork: 'testnet' })
      }
      setMainnetAccessEnabled(false)
    } catch (err) {
      toast.error(
        errorMessage(err) ??
          'Could not switch away from Mainnet. Try again or change network in Settings.',
      )
    } finally {
      setMainnetAccessSwitchBusy(false)
    }
  }, [setMainnetAccessEnabled])

  const handleRegtestModeOff = useCallback(async () => {
    setRegtestModeSwitchBusy(true)
    try {
      if (getCommittedNetworkMode() === 'regtest') {
        await executeSettingsNetworkSwitch({ targetNetwork: 'testnet' })
      }
      setRegtestModeEnabled(false)
    } catch (err) {
      toast.error(
        errorMessage(err) ??
          'Could not switch away from Regtest. Try again or change network in Settings.',
      )
    } finally {
      setRegtestModeSwitchBusy(false)
    }
  }, [setRegtestModeEnabled])

  return (
    <div className="space-y-4">
      <InfomodeWrapper
        infoId="settings-feature-mainnet-access"
        infoTitle="Mainnet access"
        infoText="When off, you cannot select the Bitcoin Mainnet in Network settings. Mainnet is the live chain where real BTC moves. Turn this on only after you understand the risks and have a seed phrase backup."
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <Label htmlFor="mainnet-access-toggle" className="cursor-pointer">
              Mainnet access
            </Label>
          </div>
          <Switch
            id="mainnet-access-toggle"
            checked={mainnetAccessEnabled}
            onCheckedChange={(checked) => {
              if (checked) {
                setMainnetConfirmOpen(true)
              } else {
                void handleMainnetAccessOff()
              }
            }}
            disabled={mainnetAccessSwitchBusy}
            aria-label="Enable Mainnet access"
          />
        </div>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="settings-feature-regtest-mode"
        infoTitle="Regtest mode"
        infoText="Regtest is an external offline test blockchain that developers run locally to try Bitcoin application behavior quickly and safely—separate from mainnet and public test networks. Enable this only if you connect to a Regtest node (for example Esplora on localhost)."
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            <Label htmlFor="regtest-mode-toggle" className="cursor-pointer">
              Regtest mode (only for developers)
            </Label>
          </div>
          <Switch
            id="regtest-mode-toggle"
            checked={regtestModeEnabled}
            onCheckedChange={(checked) => {
              if (checked) {
                setRegtestModeEnabled(true)
              } else {
                void handleRegtestModeOff()
              }
            }}
            disabled={regtestModeSwitchBusy}
            aria-label="Enable Regtest mode for developers"
          />
        </div>
      </InfomodeWrapper>

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

      <MainnetAccessConfirmModal
        open={mainnetConfirmOpen}
        onOpenChange={setMainnetConfirmOpen}
        onConfirm={() => setMainnetAccessEnabled(true)}
      />
    </div>
  )
}
