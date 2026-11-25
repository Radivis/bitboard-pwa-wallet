import { useCallback, useState } from 'react'
import { AlertTriangle, Coins, FlaskConical, Layers, RefreshCw, Zap } from 'lucide-react'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { BarkIcon } from '@/components/icons/BarkIcon'
import { useFeatureStore } from '@/stores/featureStore'
import {
  AddressType,
  getCommittedAddressType,
  getCommittedNetworkMode,
} from '@/stores/walletStore'
import { executeSettingsNetworkSwitch } from '@/lib/settings/network-mode-switch'
import { executeSettingsAddressTypeSwitch } from '@/lib/settings/execute-settings-address-type-switch'
import { runFeatureToggleOffWork } from '@/lib/settings/feature-toggle-async'
import { ArkadeFeatureInfomodeContent } from '@/components/arkade/infomode/ArkadeFeatureInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { ArkadeEnableConfirmModal } from '@/components/settings/ArkadeEnableConfirmModal'
import { BarkEnableConfirmModal } from '@/components/settings/BarkEnableConfirmModal'
import { MainnetAccessConfirmModal } from '@/components/settings/MainnetAccessConfirmModal'
import { DesignSwitch, type DesignSwitchOption } from '@/components/design/DesignSwitch'

type FeatureOnOffValue = 'off' | 'on'

const FEATURE_ON_OFF_OPTIONS: readonly DesignSwitchOption<FeatureOnOffValue>[] = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
]

function FeatureOnOffSwitch({
  label,
  enabled,
  disabled = false,
  onEnabledChange,
}: {
  label: string
  enabled: boolean
  disabled?: boolean
  onEnabledChange: (enabled: boolean) => void
}) {
  return (
    <DesignSwitch
      aria-label={label}
      className="shrink-0"
      disabled={disabled}
      value={enabled ? 'on' : 'off'}
      onValueChange={(next) => {
        const nextEnabled = next === 'on'
        if (nextEnabled !== enabled) {
          onEnabledChange(nextEnabled)
        }
      }}
      options={FEATURE_ON_OFF_OPTIONS}
    />
  )
}

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
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const setIsBarkEnabled = useFeatureStore((featureState) => featureState.setIsBarkEnabled)
  const isPeriodicSyncEnabled = useFeatureStore((featureState) => featureState.isPeriodicSyncEnabled)
  const setIsPeriodicSyncEnabled = useFeatureStore((featureState) => featureState.setIsPeriodicSyncEnabled)

  const [mainnetConfirmOpen, setMainnetConfirmOpen] = useState(false)
  const [arkadeConfirmOpen, setArkadeConfirmOpen] = useState(false)
  const [barkConfirmOpen, setBarkConfirmOpen] = useState(false)
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="design-type-emphasis">Mainnet access</span>
          </div>
          <FeatureOnOffSwitch
            label="Enable Mainnet access"
            enabled={isMainnetAccessEnabled}
            disabled={mainnetAccessSwitchBusy}
            onEnabledChange={(enabled) => {
              if (enabled) {
                setMainnetConfirmOpen(true)
              } else {
                void handleMainnetAccessOff()
              }
            }}
          />
        </div>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="settings-feature-regtest-mode"
        infoTitle="Regtest mode"
        infoText="Regtest is an external offline test blockchain that developers run locally to try Bitcoin application behavior quickly and safely—separate from mainnet and public test networks. Enable this only if you connect to a Regtest node (for example Esplora on localhost)."
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            <span className="design-type-emphasis">Regtest mode (only for developers)</span>
          </div>
          <FeatureOnOffSwitch
            label="Enable Regtest mode for developers"
            enabled={isRegtestModeEnabled}
            disabled={regtestModeSwitchBusy}
            onEnabledChange={(enabled) => {
              if (enabled) {
                setIsRegtestModeEnabled(true)
              } else {
                void handleRegtestModeOff()
              }
            }}
          />
        </div>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="settings-feature-segwit-addresses"
        infoTitle="SegWit addresses"
        infoText="Taproot (BIP86) is the default and works well for most users. Turn this on only if you need to choose native SegWit (BIP84) for new receives or to see Taproot vs SegWit labels in the app. When off, Bitboard keeps the experience Taproot-first and hides address-type choices."
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span className="design-type-emphasis">SegWit addresses</span>
          </div>
          <FeatureOnOffSwitch
            label="Enable SegWit address options and labels"
            enabled={isSegwitAddressesEnabled}
            disabled={segwitAddressesSwitchBusy}
            onEnabledChange={(enabled) => {
              if (enabled) {
                setIsSegwitAddressesEnabled(true)
              } else {
                void handleSegwitAddressesOff()
              }
            }}
          />
        </div>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="settings-feature-utxo-selection"
        infoTitle="UTXO selection"
        infoText="When enabled, the send review step lets you choose which unspent outputs fund an on-chain payment. You can move coins between selected and available lists before confirming. Useful for coin control and privacy; off by default for a simpler send flow."
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            <span className="design-type-emphasis">UTXO selection</span>
          </div>
          <FeatureOnOffSwitch
            label="Enable manual UTXO selection on send review"
            enabled={isUtxoSelectionEnabled}
            onEnabledChange={setIsUtxoSelectionEnabled}
          />
        </div>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="settings-feature-periodic-sync"
        infoTitle="Periodic sync"
        infoText="When enabled, loaded rails can poll Esplora, NWC, or the Arkade operator on a timer you configure under Settings → Main. Off by default: the wallet syncs on unlock and when you tap Sync on the dashboard. Polling runs only while this tab is visible."
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            <span className="design-type-emphasis">Periodic sync</span>
          </div>
          <FeatureOnOffSwitch
            label="Enable periodic sync"
            enabled={isPeriodicSyncEnabled}
            onEnabledChange={setIsPeriodicSyncEnabled}
          />
        </div>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId={ARKADE_INFOMODE_IDS.featureToggle}
        infoComponent={ArkadeFeatureInfomodeContent}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArkadeIcon className="h-4 w-4" />
            <span className="design-type-emphasis">Arkade</span>
          </div>
          <FeatureOnOffSwitch
            label="Enable Arkade offchain layer"
            enabled={isArkadeEnabled}
            onEnabledChange={(enabled) => {
              if (enabled) {
                setArkadeConfirmOpen(true)
              } else {
                setIsArkadeEnabled(false)
              }
            }}
          />
        </div>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="settings-feature-bark"
        infoTitle="Bark"
        infoText="Bark is Second's Ark wallet on Signet (ark.signet.2nd.dev) and Mainnet (ark.second.tech). Off by default. Turning it on opens a Bark session when this wallet is unlocked on Signet or Mainnet. Each network keeps its own encrypted protocol state, separate from the on-chain and Arkade totals."
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarkIcon className="h-4 w-4" />
            <span className="design-type-emphasis">Bark</span>
          </div>
          <FeatureOnOffSwitch
            label="Enable Bark rail"
            enabled={isBarkEnabled}
            onEnabledChange={(enabled) => {
              if (enabled) {
                setBarkConfirmOpen(true)
              } else {
                setIsBarkEnabled(false)
              }
            }}
          />
        </div>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="settings-feature-lightning"
        infoTitle="Lightning Network"
        infoText="The Lightning Network is a layer-2 payment protocol on top of Bitcoin. It enables fast, low-cost transactions by creating payment channels between nodes. Turn this on to enable Lightning-capable screens and flows in the app. Actual Lightning send, receive, and channel management are available when your wallet is on Mainnet, Testnet, or Signet—not on Labnet or Regtest."
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="design-type-emphasis">Lightning</span>
          </div>
          <FeatureOnOffSwitch
            label="Enable Lightning Network"
            enabled={isLightningEnabled}
            onEnabledChange={setIsLightningEnabled}
          />
        </div>
      </InfomodeWrapper>

      <MainnetAccessConfirmModal
        open={mainnetConfirmOpen}
        onOpenChange={setMainnetConfirmOpen}
        onConfirm={() => setIsMainnetAccessEnabled(true)}
      />

      <ArkadeEnableConfirmModal
        open={arkadeConfirmOpen}
        onOpenChange={setArkadeConfirmOpen}
        onConfirm={() => setIsArkadeEnabled(true)}
      />

      <BarkEnableConfirmModal
        open={barkConfirmOpen}
        onOpenChange={setBarkConfirmOpen}
        onConfirm={() => setIsBarkEnabled(true)}
      />
    </div>
  )
}
