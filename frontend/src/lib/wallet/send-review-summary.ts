import type { ReviewInputUtxo } from '@/workers/crypto-api'
import { useSendStore } from '@/stores/sendStore'

export type SendReviewTxSummary = {
  feeSats: number
  changeSats: number
  inputUtxos: ReviewInputUtxo[]
}

export type SendReviewDisplayAmountsInput = {
  amountSats: number
  reviewFeeSats: number | null
  reviewChangeSats: number | null
  reviewInputUtxos: ReviewInputUtxo[] | null
  spendableBalanceSats: number
  totalBalanceSats: number
}

export type SendReviewDisplayAmounts = {
  totalInputSats: number
  totalDeductedSats: number
  amountRemainingSats: number
  immediatelySpendableRemainingSats: number
  changeSats: number
}

export function computeSendReviewDisplayAmounts(
  input: SendReviewDisplayAmountsInput,
): SendReviewDisplayAmounts {
  const inputUtxos = input.reviewInputUtxos ?? []
  const totalInputSats = inputUtxos.reduce(
    (sum, utxo) => sum + utxo.amountSats,
    0,
  )
  const totalDeductedSats = input.amountSats + (input.reviewFeeSats ?? 0)
  const amountRemainingSats = Math.max(
    0,
    input.totalBalanceSats - totalDeductedSats,
  )
  const immediatelySpendableRemainingSats = Math.max(
    0,
    input.spendableBalanceSats - totalInputSats,
  )
  const changeSats = input.reviewChangeSats ?? 0

  return {
    totalInputSats,
    totalDeductedSats,
    amountRemainingSats,
    immediatelySpendableRemainingSats,
    changeSats,
  }
}

export function applySendReviewTxSummaryToStore(summary: SendReviewTxSummary) {
  const store = useSendStore.getState()
  store.setReviewFeeSats(summary.feeSats)
  store.setReviewChangeSats(summary.changeSats)
  store.setReviewInputUtxos(summary.inputUtxos)
}

export function clearSendReviewTxSummaryFromStore() {
  const store = useSendStore.getState()
  store.setReviewFeeSats(null)
  store.setReviewChangeSats(null)
  store.setReviewInputUtxos(null)
}
