import type { LabMempoolMetadata } from './lab-api'
import { rebuildTxidToChangeAddressFromState, state } from './lab-worker-state'

export function appendLabTxOperationAndMempoolEntry(params: {
  signedTxHex: string
  txid: string
  mempoolMetadata: LabMempoolMetadata
  senderKey: string
  changeAddress: string | null
  changeVout: number | null
}): void {
  const { signedTxHex, txid, mempoolMetadata, senderKey, changeAddress, changeVout } = params
  const primaryToAddress = mempoolMetadata.outputsDetail.find((o) => !o.isChange)?.address ?? null

  state.txOperations = state.txOperations ?? []
  state.txOperations.push({
    txid,
    senderKey,
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
    inputs: mempoolMetadata.inputs,
    inputsDetail: mempoolMetadata.inputsDetail,
    outputsDetail: mempoolMetadata.outputsDetail,
  })
}
