import type { LabOwner } from '@/lib/lab-owner'
import { labVsizeFromWeight } from '@/lib/lab-tx-weight'
import type { LabMempoolMetadata } from './lab-api'
import { rebuildTxidToChangeAddressFromState, state } from './lab-worker-state'

export function appendLabTxOperationAndMempoolEntry(params: {
  signedTxHex: string
  txid: string
  weight: number
  mempoolMetadata: LabMempoolMetadata
  sender: LabOwner
  changeAddress: string | null
  changeVout: number | null
}): void {
  const { signedTxHex, txid, weight, mempoolMetadata, sender, changeAddress, changeVout } =
    params
  const normalizedWeight = weight > 0 ? weight : 1
  const vsize = labVsizeFromWeight(normalizedWeight)
  const primaryToAddress = mempoolMetadata.outputsDetail.find((o) => !o.isChange)?.address ?? null

  state.txOperations = state.txOperations ?? []
  state.txOperations.push({
    txid,
    sender,
    changeAddress,
    changeVout,
    payloadJson: JSON.stringify({
      receiver: mempoolMetadata.receiver,
      primaryToAddress,
    }),
  })
  rebuildTxidToChangeAddressFromState()

  state.mempool = state.mempool ?? []
  state.mempool.push({
    signedTxHex,
    txid,
    sender: mempoolMetadata.sender,
    receiver: mempoolMetadata.receiver,
    feeSats: mempoolMetadata.feeSats,
    weight: normalizedWeight,
    vsize,
    inputs: mempoolMetadata.inputs,
    inputsDetail: mempoolMetadata.inputsDetail,
    outputsDetail: mempoolMetadata.outputsDetail,
  })
}
