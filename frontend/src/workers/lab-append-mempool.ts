import type { LabOwner } from '@/lib/lab/lab-owner'
import { labVsizeFromWeight } from '@/lib/lab/lab-tx-weight'
import type { LabMempoolMetadata } from './lab-api'
import { rebuildTxidToChangeAddressFromState, labWorkerState } from './lab-worker-state'

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
  const primaryToAddress =
    mempoolMetadata.outputsDetail.find((outputDetail) => !outputDetail.isChange)?.address ?? null

  labWorkerState.txOperations = labWorkerState.txOperations ?? []
  labWorkerState.txOperations.push({
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

  labWorkerState.mempool = labWorkerState.mempool ?? []
  labWorkerState.mempool.push({
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
