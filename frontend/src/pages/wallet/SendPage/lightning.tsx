import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LightningAddress } from '@getalby/lightning-tools'
import { isValidSendAmountSats } from '@/lib/wallet/send/send-amount-validation'
import { useLightningPayMutation } from '@/hooks/useLightningMutations'
import { useSendLightningBalances } from '@/hooks/useSendLightningBalances'
import {
  isLightningSupported,
  isValidBolt11Invoice,
  isLightningAddress,
  bolt11NetworkModeFromPrefix,
} from '@/lib/lightning/lightning-utils'
import {
  canBuildLightningSend,
  getDecodedBolt11ForSend,
  isBolt11DecodeOk,
  isBolt11NetworkMismatch,
  isLightningSendMode as computeLightningSendMode,
  needsUserLightningAmount as computeNeedsUserLightningAmount,
  resolveLightningPayAmountSats,
  isSendRecipientFormatValid,
} from '@/lib/lightning/send-flow-validation'
import { msatsAmountNumberFromSatsExact, MAX_SATS_MSAT_AMOUNT_NUMBER } from '@/lib/wallet/bitcoin-utils'
import type { ConnectedLightningWallet } from '@/lib/lightning/lightning-backend-service'
import type { NetworkMode } from '@/stores/walletStore'

export function useSendFlowLightning({
  lightningEnabled,
  networkMode,
  activeWalletId,
  connectedLightningWallets,
  normalizedRecipient,
  amountSats,
}: {
  lightningEnabled: boolean
  networkMode: NetworkMode
  activeWalletId: number | null
  connectedLightningWallets: ConnectedLightningWallet[]
  normalizedRecipient: string
  amountSats: number
}) {
  const lightningAvailable = lightningEnabled && isLightningSupported(networkMode)
  const [isResolvingLightningAddress, setIsResolvingLightningAddress] =
    useState(false)

  const isLightningSendMode = useMemo(
    () => computeLightningSendMode(lightningAvailable, normalizedRecipient),
    [lightningAvailable, normalizedRecipient],
  )

  const {
    matchingLightningConnections,
    selectedLightningConnectionId,
    setSelectedLightningConnectionId,
    balanceQueries,
    selectedLightningWallet,
    selectedLnBalanceQuery,
    selectedLnBalanceSats,
    hasLightningWalletSelected,
  } = useSendLightningBalances({
    lightningEnabled,
    networkMode,
    activeWalletId,
    connectedLightningWallets,
    isLightningSendMode,
  })

  const lightningPayMutation = useLightningPayMutation()

  const decodedBolt11 = useMemo(
    () => getDecodedBolt11ForSend(normalizedRecipient),
    [normalizedRecipient],
  )

  const bolt11NetworkMismatch = useMemo(
    () => isBolt11NetworkMismatch(normalizedRecipient, networkMode),
    [normalizedRecipient, networkMode],
  )

  const needsUserLightningAmount = useMemo(
    () =>
      computeNeedsUserLightningAmount({
        isLightningSendMode,
        normalizedRecipient,
        decodedBolt11,
      }),
    [isLightningSendMode, normalizedRecipient, decodedBolt11],
  )

  const lightningPayAmountSats = useMemo(
    () =>
      resolveLightningPayAmountSats({
        isLightningSendMode,
        normalizedRecipient,
        decodedBolt11,
        amountSats,
      }),
    [isLightningSendMode, normalizedRecipient, decodedBolt11, amountSats],
  )

  const bolt11DecodeOk = useMemo(
    () => isBolt11DecodeOk(normalizedRecipient, decodedBolt11),
    [normalizedRecipient, decodedBolt11],
  )

  const recipientFormatValid = useMemo(
    () =>
      isSendRecipientFormatValid({
        normalizedRecipient,
        networkMode,
        lightningAvailable,
      }),
    [normalizedRecipient, networkMode, lightningAvailable],
  )

  const lightningRecipientOk =
    !isLightningSendMode || matchingLightningConnections.length > 0

  const canBuildLightning = canBuildLightningSend({
    normalizedRecipient,
    amountSats,
    recipientFormatValid,
    isLightningSendMode,
    matchingLightningConnectionsCount: matchingLightningConnections.length,
    hasLightningWalletSelected,
    bolt11NetworkMismatch,
    bolt11DecodeOk,
    needsUserLightningAmount,
    lightningPayAmountSats,
    selectedLnBalanceQuerySuccess: selectedLnBalanceQuery?.isSuccess === true,
    selectedLnBalanceSats,
    decodedBolt11,
  })

  const handleLightningAddressPay = useCallback(async () => {
    if (!selectedLightningWallet || !isValidSendAmountSats(amountSats)) return
    setIsResolvingLightningAddress(true)
    try {
      const recipientLightningAddress = new LightningAddress(normalizedRecipient)
      await recipientLightningAddress.fetch()
      const lud16Invoice = await recipientLightningAddress.requestInvoice({
        satoshi: amountSats,
      })
      const bolt11PaymentRequest = lud16Invoice.paymentRequest
      const invoiceNetworkMode = bolt11NetworkModeFromPrefix(bolt11PaymentRequest)
      if (invoiceNetworkMode !== networkMode) {
        toast.error(
          'This invoice is for a different network. Switch network in Settings.',
        )
        return
      }
      lightningPayMutation.mutate({
        bolt11: bolt11PaymentRequest,
        config: selectedLightningWallet.config,
      })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not fetch Lightning invoice',
      )
    } finally {
      setIsResolvingLightningAddress(false)
    }
  }, [
    selectedLightningWallet,
    amountSats,
    normalizedRecipient,
    networkMode,
    lightningPayMutation,
  ])

  const submitLightningPayment = useCallback(() => {
    if (isLightningAddress(normalizedRecipient)) {
      void handleLightningAddressPay()
      return
    }

    if (!selectedLightningWallet) {
      toast.error('Select a Lightning wallet to pay from.')
      return
    }

    if (!isValidBolt11Invoice(normalizedRecipient)) return

    const amountMsatsForAmountless =
      decodedBolt11 != null &&
      decodedBolt11.satoshi === 0 &&
      isValidSendAmountSats(amountSats) &&
      amountSats <= MAX_SATS_MSAT_AMOUNT_NUMBER
        ? msatsAmountNumberFromSatsExact(amountSats)
        : undefined

    lightningPayMutation.mutate({
      bolt11: normalizedRecipient,
      config: selectedLightningWallet.config,
      ...(amountMsatsForAmountless != null
        ? { amountMsats: amountMsatsForAmountless }
        : {}),
    })
  }, [
    normalizedRecipient,
    selectedLightningWallet,
    decodedBolt11,
    amountSats,
    lightningPayMutation,
    handleLightningAddressPay,
  ])

  return {
    lightningAvailable,
    isLightningSendMode,
    isResolvingLightningAddress,
    lightningPayMutation,
    matchingLightningConnections,
    selectedLightningConnectionId,
    setSelectedLightningConnectionId,
    balanceQueries,
    selectedLnBalanceQuery,
    selectedLnBalanceSats,
    hasLightningWalletSelected,
    decodedBolt11,
    bolt11NetworkMismatch,
    bolt11DecodeOk,
    needsUserLightningAmount,
    lightningPayAmountSats,
    lightningRecipientOk,
    recipientFormatValid,
    canBuildLightning,
    submitLightningPayment,
  }
}
