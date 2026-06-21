import { useState, useCallback } from 'react'
import { AddressType, useWalletStore } from '@/stores/walletStore'
import { useDescriptorWalletSwitchMutation } from '@/hooks/useDescriptorWalletSwitchMutation'
import { useRequireUnlockedWallet } from '@/hooks/useRequireUnlockedWallet'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import { LoadingSpinner } from '@/components/LoadingSpinner'

const ADDRESS_SWITCH_SPINNER_CLASS =
  'flex-row items-start justify-start gap-2 py-1 [&_.animate-spin]:mt-0.5 [&_.animate-spin]:h-4 [&_.animate-spin]:w-4 [&_p]:max-w-[min(100%,28rem)] [&_p]:text-left [&_p]:leading-snug'

export function AddressTypeSelector() {
  const addressType = useWalletStore((walletState) => walletState.addressType)
  const setAddressType = useWalletStore((walletState) => walletState.setAddressType)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const { runWhenUnlocked, unlockDialog } = useRequireUnlockedWallet()
  const [showWarning, setShowWarning] = useState(false)
  const [pendingType, setPendingType] = useState<AddressType | null>(null)

  const { mutateAsync, isSwitching, statusLine } =
    useDescriptorWalletSwitchMutation('addressType')

  const handleChange = (type: AddressType) => {
    if (type === addressType) return
    if (activeWalletId) {
      setPendingType(type)
      setShowWarning(true)
    } else {
      setAddressType(type)
    }
  }

  const applyAddressTypeChange = useCallback(
    (type: AddressType) => {
      runWhenUnlocked(async () => {
        await mutateAsync(type)
        setAddressType(type)
      })
    },
    [runWhenUnlocked, mutateAsync, setAddressType],
  )

  return (
    <>
      <div className="flex gap-2">
        <InfomodeWrapper
          infoId="settings-address-type-taproot"
          infoTitle="Taproot (BIP86)"
          infoText="Taproot-style addresses (often shown as bc1p…) are the newer standard many wallets use by default. They can enable nicer privacy and efficiency features on-chain and remain fully compatible with normal sends and receives."
          className="min-w-0 flex-1"
        >
          <Button
            variant={addressType === AddressType.Taproot ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleChange(AddressType.Taproot)}
            className="w-full"
            disabled={isSwitching}
          >
            Taproot (BIP86)
          </Button>
        </InfomodeWrapper>
        <InfomodeWrapper
          infoId="settings-address-type-segwit"
          infoTitle="SegWit (BIP84)"
          infoText="Native SegWit addresses (often bc1q…) have been widely supported for years. They are cheaper to spend than old legacy addresses and work with virtually every exchange and wallet today."
          className="min-w-0 flex-1"
        >
          <Button
            variant={addressType === AddressType.SegWit ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleChange(AddressType.SegWit)}
            className="w-full"
            disabled={isSwitching}
          >
            SegWit (BIP84)
          </Button>
        </InfomodeWrapper>
      </div>
      {isSwitching && statusLine && (
        <LoadingSpinner text={statusLine} className={ADDRESS_SWITCH_SPINNER_CLASS} />
      )}
      <ConfirmationDialog
        open={showWarning}
        title="Change Address Type?"
        message="Changing address type will switch to a different descriptor wallet derived from the same seed. Your funds on the previous address type remain accessible. Continue?"
        confirmText="Change"
        onConfirm={() => {
          if (pendingType) applyAddressTypeChange(pendingType)
          setShowWarning(false)
          setPendingType(null)
        }}
        onCancel={() => {
          setShowWarning(false)
          setPendingType(null)
        }}
      />
      {unlockDialog}
    </>
  )
}
