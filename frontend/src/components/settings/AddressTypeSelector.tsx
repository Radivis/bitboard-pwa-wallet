import { useState, useCallback } from 'react'
import {
  useWalletStore,
  type AddressType,
} from '@/stores/walletStore'
import { switchDescriptorWallet } from '@/lib/settings-switch-wallet'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'

export function AddressTypeSelector() {
  const addressType = useWalletStore((s) => s.addressType)
  const setAddressType = useWalletStore((s) => s.setAddressType)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const networkMode = useWalletStore((s) => s.networkMode)
  const accountId = useWalletStore((s) => s.accountId)
  const [showWarning, setShowWarning] = useState(false)
  const [pendingType, setPendingType] = useState<'taproot' | 'segwit' | null>(
    null,
  )
  const [switching, setSwitching] = useState(false)

  const handleChange = (type: 'taproot' | 'segwit') => {
    if (type === addressType) return
    if (activeWalletId) {
      setPendingType(type)
      setShowWarning(true)
    } else {
      setAddressType(type)
    }
  }

  const applyAddressTypeChange = useCallback(
    async (type: AddressType) => {
      const previousAddressType = addressType

      if (walletStatus === 'unlocked' || walletStatus === 'syncing') {
        setSwitching(true)
        try {
          await switchDescriptorWallet({
            targetNetworkMode: networkMode,
            targetAddressType: type,
            targetAccountId: accountId,
            currentNetworkMode: networkMode,
            currentAddressType: previousAddressType,
            currentAccountId: accountId,
          })
          setAddressType(type)
        } catch {
          // switchDescriptorWallet already showed a toast
        } finally {
          setSwitching(false)
        }
      } else {
        setAddressType(type)
      }
    },
    [setAddressType, walletStatus, networkMode, addressType, accountId],
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
            variant={addressType === 'taproot' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleChange('taproot')}
            className="w-full"
            disabled={switching}
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
            variant={addressType === 'segwit' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleChange('segwit')}
            className="w-full"
            disabled={switching}
          >
            SegWit (BIP84)
          </Button>
        </InfomodeWrapper>
      </div>
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
    </>
  )
}
