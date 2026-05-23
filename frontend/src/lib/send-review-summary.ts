import type { ReviewInputUtxo } from '@/workers/crypto-api'
import { useSendStore } from '@/stores/sendStore'

export type SendReviewTxSummary = {
  feeSats: number
  changeSats: number
  inputUtxos: ReviewInputUtxo[]
}

export function applySendReviewTxSummaryToStore(summary: SendReviewTxSummary) {
  useSendStore.setState({
    reviewFeeSats: summary.feeSats,
    reviewChangeSats: summary.changeSats,
    reviewInputUtxos: summary.inputUtxos,
  })
}

export function clearSendReviewTxSummaryFromStore() {
  useSendStore.setState({
    reviewFeeSats: null,
    reviewChangeSats: null,
    reviewInputUtxos: null,
  })
}
