import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LightningAddress } from '@getalby/lightning-tools'
import { isValidSendAmountSats } from '@/components/wallet/send/send-amount'
import { useLightningPayMutation } from '@/hooks/useLightningMutations'
import { useSendLightningBalances } from '@/hooks/useSendLightningBalances'
import {
  isLightningSupported,
  isValidLightningDestination,
  isValidBolt11Invoice,
  isLightningAddress,
  bolt11NetworkModeFromPrefix,
  tryDecodeBolt11Invoice,
} from '@/lib/lightning-utils'
import { isValidAddress, msatsAmountNumberFromSatsExact, MAX_SATS_MSAT_AMOUNT_NUMBER } from '@/lib/bitcoin-utils'
import { MAX_BOLT11_PAYMENT_REQUEST_LENGTH } from '@/lib/lightning-input-limits'
import type { ConnectedLightningWallet } from '@/lib/lightning-backend-service'
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

  const isLightningDestination = useMemo(
    () => lightningAvailable && isValidLightningDestination(normalizedRecipient),
    [lightningAvailable, normalizedRecipient],
  )

  const isLightningSendMode = isLightningDestination

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

  const decodedBolt11 = useMemo(() => {
    if (!isValidBolt11Invoice(normalizedRecipient)) return null
    return tryDecodeBolt11Invoice(normalizedRecipient)
  }, [normalizedRecipient])

  const bolt11NetworkMismatch = useMemo(() => {
    if (!isValidBolt11Invoice(normalizedRecipient)) return false
    const invNetwork = bolt11NetworkModeFromPrefix(normalizedRecipient)
    if (invNetwork == null) return false
    return invNetwork !== networkMode
  }, [normalizedRecipient, networkMode])

  const needsUserLightningAmount = useMemo(() => {
    if (!isLightningSendMode) return false
    if (isLightningAddress(normalizedRecipient)) return true
    if (!isValidBolt11Invoice(normalizedRecipient)) return false
    return decodedBolt11 == null || decodedBolt11.satoshi === 0
  }, [isLightningSendMode, normalizedRecipient, decodedBolt11])

  const lightningPayAmountSats = useMemo(() => {
    if (!isLightningSendMode) return 0
    if (isValidBolt11Invoice(normalizedRecipient)) {
      if (decodedBolt11 != null && decodedBolt11.satoshi > 0) {
        return decodedBolt11.satoshi
      }
      return amountSats
    }
    return amountSats
  }, [isLightningSendMode, normalizedRecipient, decodedBolt11, amountSats])

  const bolt11DecodeOk = useMemo(() => {
    if (!isValidBolt11Invoice(normalizedRecipient)) return true
    return decodedBolt11 != null
  }, [normalizedRecipient, decodedBolt11])

  const recipientFormatValid = useMemo(
    () =>
      normalizedRecipient.length > 0 &&
      (isValidAddress(normalizedRecipient, networkMode) ||
        (lightningAvailable &&
          isValidLightningDestination(normalizedRecipient))),
    [normalizedRecipient, networkMode, lightningAvailable],
  )

  const lightningRecipientOk =
    !isLightningSendMode || matchingLightningConnections.length > 0

  const lightningPayloadLengthOk =
    !isLightningSendMode ||
    normalizedRecipient.length <= MAX_BOLT11_PAYMENT_REQUEST_LENGTH

  const lightningAmountInputOk =
    !needsUserLightningAmount || isValidSendAmountSats(amountSats)

  const lightningBalanceOk =
    hasLightningWalletSelected &&
    selectedLnBalanceQuery?.isSuccess === true &&
    selectedLnBalanceSats !== undefined &&
    lightningPayAmountSats <= selectedLnBalanceSats

  const lightningAmountlessBolt11PayMsatsExactOk = useMemo(() => {
    if (!needsUserLightningAmount) return true
    if (!isValidBolt11Invoice(normalizedRecipient)) return true
    if (decodedBolt11 == null || decodedBolt11.satoshi !== 0) return true
    return (
      Number.isInteger(amountSats) && amountSats <= MAX_SATS_MSAT_AMOUNT_NUMBER
    )
  }, [
    needsUserLightningAmount,
    normalizedRecipient,
    decodedBolt11,
    amountSats,
  ])

  const canBuildLightning =
    recipientFormatValid &&
    lightningRecipientOk &&
    lightningPayloadLengthOk &&
    matchingLightningConnections.length > 0 &&
    hasLightningWalletSelected &&
    !bolt11NetworkMismatch &&
    bolt11DecodeOk &&
    lightningAmountInputOk &&
    lightningPayAmountSats >= 1 &&
    lightningBalanceOk &&
    lightningAmountlessBolt11PayMsatsExactOk &&
    (isLightningAddress(normalizedRecipient)
      ? isValidSendAmountSats(amountSats)
      : true)

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
