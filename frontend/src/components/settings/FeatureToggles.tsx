import { useCallback, useState } from 'react'
import { AlertTriangle, CircleDot, Coins, FlaskConical, Layers, Zap } from 'lucide-react'
import { useFeatureStore } from '@/stores/featureStore'
import {
  AddressType,
  getCommittedAddressType,
  getCommittedNetworkMode,
} from '@/stores/walletStore'
import { executeSettingsNetworkSwitch } from '@/lib/settings/network-mode-switch'
import { executeSettingsAddressTypeSwitch } from '@/lib/settings/execute-settings-address-type-switch'
import { runFeatureToggleOffWork } from '@/lib/settings/feature-toggle-async'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { MainnetAccessConfirmModal } from '@/components/settings/MainnetAccessConfirmModal'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

export function FeatureToggles() {
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const setIsLightningEnabled = useFeatureStore((featureState) => featureState.setIsLightningEnabled)
  const isMainnetAccessEnabled = useFeatureStore((featureState) => featureState.isMainnetAccessEnabled)
  const setIsMainnetAccessEnabled = useFeatureStore((featureState) => featureState.setIsMainnetAccessEnabled)
  const isRegtestModeEnabled = useFeatureStore((featureState) => featureState.isRegtestModeEnabled)
  const setIsRegtestModeEnabled = useFeatureStore((featureState) => featureState.setIsRegtestModeEnabled)
  const isSegwitAddressesEnabled = useFeatureStore((featureState) => featureState.isSegwitAddressesEnabled)
  const setIsSegwitAddressesEnabled = useFeatureStore((featureState) => featureState.setIsSegwitAddressesEnabled)
  const isUtxoSelectionEnabled = useFeatureStore((featureState) => featureState.isUtxoSelectionEnabled)
  const setIsUtxoSelectionEnabled = useFeatureStore((featureState) => featureState.setIsUtxoSelectionEnabled)
  const isArkadeEnabled = useFeatureStore((featureState) => featureState.isArkadeEnabled)
  const setIsArkadeEnabled = useFeatureStore((featureState) => featureState.setIsArkadeEnabled)

  const [mainnetConfirmOpen, setMainnetConfirmOpen] = useState(false)
  const [mainnetAccessSwitchBusy, setMainnetAccessSwitchBusy] = useState(false)
  const [regtestModeSwitchBusy, setRegtestModeSwitchBusy] = useState(false)
  const [segwitAddressesSwitchBusy, setSegwitAddressesSwitchBusy] = useState(false)

  const handleMainnetAccessOff = useCallback(async () => {
    await runFeatureToggleOffWork(
      setMainnetAccessSwitchBusy,
      async () => {
        if (getCommittedNetworkMode() === 'mainnet') {
          await executeSettingsNetworkSwitch({ targetNetwork: 'testnet' })
        }
        setIsMainnetAccessEnabled(false)
      },
      'Could not switch away from Mainnet. Try again or change network in Settings.',
    )
  }, [setIsMainnetAccessEnabled])

  const handleRegtestModeOff = useCallback(async () => {
    await runFeatureToggleOffWork(
      setRegtestModeSwitchBusy,
      async () => {
        if (getCommittedNetworkMode() === 'regtest') {
          await executeSettingsNetworkSwitch({ targetNetwork: 'testnet' })
        }
        setIsRegtestModeEnabled(false)
      },
      'Could not switch away from Regtest. Try again or change network in Settings.',
    )
  }, [setIsRegtestModeEnabled])

  const handleSegwitAddressesOff = useCallback(async () => {
    await runFeatureToggleOffWork(
      setSegwitAddressesSwitchBusy,
      async () => {
        if (getCommittedAddressType() === AddressType.SegWit) {
          await executeSettingsAddressTypeSwitch({
            targetAddressType: AddressType.Taproot,
          })
        }
        setIsSegwitAddressesEnabled(false)
      },
      'Could not switch to Taproot. Try again.',
    )
  }, [setIsSegwitAddressesEnabled])

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
            checked={isMainnetAccessEnabled}
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
            checked={isRegtestModeEnabled}
            onCheckedChange={(checked) => {
              if (checked) {
                setIsRegtestModeEnabled(true)
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
        infoId="settings-feature-segwit-addresses"
        infoTitle="SegWit addresses"
        infoText="Taproot (BIP86) is the default and works well for most users. Turn this on only if you need to choose native SegWit (BIP84) for new receives or to see Taproot vs SegWit labels in the app. When off, Bitboard keeps the experience Taproot-first and hides address-type choices."
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <Label htmlFor="segwit-addresses-toggle" className="cursor-pointer">
              SegWit addresses
            </Label>
          </div>
          <Switch
            id="segwit-addresses-toggle"
            checked={isSegwitAddressesEnabled}
            onCheckedChange={(checked) => {
              if (checked) {
                setIsSegwitAddressesEnabled(true)
              } else {
                void handleSegwitAddressesOff()
              }
            }}
            disabled={segwitAddressesSwitchBusy}
            aria-label="Enable SegWit address options and labels"
          />
        </div>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="settings-feature-utxo-selection"
        infoTitle="UTXO selection"
        infoText="When enabled, the send review step lets you choose which unspent outputs fund an on-chain payment. You can move coins between selected and available lists before confirming. Useful for coin control and privacy; off by default for a simpler send flow."
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            <Label htmlFor="utxo-selection-toggle" className="cursor-pointer">
              UTXO selection
            </Label>
          </div>
          <Switch
            id="utxo-selection-toggle"
            checked={isUtxoSelectionEnabled}
            onCheckedChange={setIsUtxoSelectionEnabled}
            aria-label="Enable manual UTXO selection on send review"
          />
        </div>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="settings-feature-arkade"
        infoTitle="Arkade (offchain layer)"
        infoText="Arkade provides instant offchain payments (VTXOs) without a Lightning wallet. Bitboard uses your mnemonic with a separate Arkade address. VTXO renewal is delegated to Bitboard-hosted Fulmine servers (one per network). Available on mainnet, testnet, and signet—not lab or regtest."
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CircleDot className="h-4 w-4" />
            <Label htmlFor="arkade-toggle" className="cursor-pointer">
              Arkade
            </Label>
          </div>
          <Switch
            id="arkade-toggle"
            checked={isArkadeEnabled}
            onCheckedChange={setIsArkadeEnabled}
            aria-label="Enable Arkade offchain layer"
          />
        </div>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="settings-feature-lightning"
        infoTitle="Lightning Network"
        infoText="The Lightning Network is a layer-2 payment protocol on top of Bitcoin. It enables fast, low-cost transactions by creating payment channels between nodes. Turn this on to enable Lightning-capable screens and flows in the app. Actual Lightning send, receive, and channel management are available when your wallet is on Mainnet, Testnet, or Signet—not on Lab or Regtest."
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
            checked={isLightningEnabled}
            onCheckedChange={setIsLightningEnabled}
            aria-label="Enable Lightning Network"
          />
        </div>
      </InfomodeWrapper>

      <MainnetAccessConfirmModal
        open={mainnetConfirmOpen}
        onOpenChange={setMainnetConfirmOpen}
        onConfirm={() => setIsMainnetAccessEnabled(true)}
      />
    </div>
  )
}
