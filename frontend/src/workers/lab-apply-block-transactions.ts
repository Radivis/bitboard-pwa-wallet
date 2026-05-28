import type { LabOwner } from '@/lib/lab/lab-owner'
import type { LabTxDetails, LabTxOperationRecord, LabUtxo } from './lab-api'
import type { BlockEffectsTx } from './lab-block-effects-types'
import {
  isCoinbase,
  LAB_COINBASE_PREV_TXID_HEX,
  LAB_COINBASE_PREV_VOUT,
  LAB_COINBASE_SEQUENCE,
} from '@/lib/lab/lab-operations'
import {
  assertLabReceiverNonNull,
  labAddressesEqual,
  lookupOwnerForLabAddress,
  parseTxOperationPayload,
  labWorkerState,
  txidToChangeOutput,
} from './lab-worker-state'

function registerBlockTxOutputsInWorkingUtxoMap(
  utxoMap: Map<string, LabUtxo>,
  txid: string,
  outputs: ReadonlyArray<{ address: string; amountSats: number }>,
): void {
  for (let vout = 0; vout < outputs.length; vout += 1) {
    const outputAtVout = outputs[vout]
    utxoMap.set(`${txid}:${vout}`, {
      txid,
      vout,
      address: outputAtVout.address,
      amountSats: outputAtVout.amountSats,
      scriptPubkeyHex: '',
    })
  }
}

function resolveChangeMetadataForBlockTx(tx: BlockEffectsTx): {
  changeFromOp: LabTxOperationRecord | undefined
  txOperationPayload: ReturnType<typeof parseTxOperationPayload>
  changeOutputForTx: { address: string; vout: number | null } | undefined
} {
  const changeFromOp = labWorkerState.txOperations?.find(
    (txOperation) => txOperation.txid === tx.txid,
  )
  const txOperationPayload = parseTxOperationPayload(
    changeFromOp?.payloadJson,
    labWorkerState.entities ?? [],
  )
  const changeOutputForTx =
    txidToChangeOutput.get(tx.txid) ??
    (changeFromOp?.changeAddress
      ? { address: changeFromOp.changeAddress, vout: changeFromOp.changeVout ?? null }
      : undefined)
  return { changeFromOp, txOperationPayload, changeOutputForTx }
}

function buildInputsForBlockEffectTx(
  tx: BlockEffectsTx,
  isCoinbaseTx: boolean,
  utxoMap: Map<string, LabUtxo>,
  addressToOwner: Record<string, LabOwner>,
): { inputs: LabTxDetails['inputs']; firstInputAddress: string | null } {
  if (isCoinbaseTx) {
    return {
      inputs: [
        {
          address: '',
          amountSats: 0,
          owner: null,
          prevTxid: LAB_COINBASE_PREV_TXID_HEX,
          prevVout: LAB_COINBASE_PREV_VOUT,
          sequence: LAB_COINBASE_SEQUENCE,
        },
      ],
      firstInputAddress: null,
    }
  }
  const inputs: LabTxDetails['inputs'] = []
  let firstInputAddress: string | null = null
  for (const input of tx.inputs) {
    const key = `${input.prevTxid}:${input.prevVout}`
    const utxo = utxoMap.get(key)
    if (utxo) {
      const owner = lookupOwnerForLabAddress(utxo.address, addressToOwner) ?? null
      inputs.push({
        address: utxo.address,
        amountSats: utxo.amountSats,
        owner,
        prevTxid: input.prevTxid,
        prevVout: input.prevVout,
      })
      if (firstInputAddress === null) firstInputAddress = utxo.address
    }
  }
  return { inputs, firstInputAddress }
}

function buildOutputsForBlockEffectTx(
  tx: BlockEffectsTx,
  changeAddress: string | null | undefined,
  changeVout: number | null,
  sender: LabOwner | null,
  addressToOwner: Record<string, LabOwner>,
): LabTxDetails['outputs'] {
  const lastChangeAddressMatchIndex =
    changeAddress == null
      ? -1
      : (tx.outputs ?? []).reduce(
          (lastMatchIndex, output, index) =>
            labAddressesEqual(output.address, changeAddress) ? index : lastMatchIndex,
          -1,
        )
  return (tx.outputs ?? []).map((output, outputIndex) => {
    const isAddressMatch =
      changeAddress != null && labAddressesEqual(output.address, changeAddress)
    // Prefer matching by change address: BDK may order outputs differently than our
    // mempool metadata (add_recipient vs drain_to), so changeVout can be wrong.
    const isChange =
      changeAddress != null
        ? isAddressMatch
        : changeVout != null
          ? outputIndex === changeVout
          : isAddressMatch && outputIndex === lastChangeAddressMatchIndex
    const owner = isChange && sender
      ? sender
      : (lookupOwnerForLabAddress(output.address, addressToOwner) ?? null)
    if (isChange && sender) {
      labWorkerState.addressToOwner = labWorkerState.addressToOwner ?? {}
      labWorkerState.addressToOwner[output.address] = sender
    }
    return {
      address: output.address,
      amountSats: output.amountSats,
      isChange,
      owner,
    }
  })
}

function resolveReceiverForBlockEffectTx(
  tx: BlockEffectsTx,
  outputs: LabTxDetails['outputs'],
  txOperationPayload: ReturnType<typeof parseTxOperationPayload>,
  changeFromOp: LabTxOperationRecord | undefined,
  sender: LabOwner | null,
  addressToOwner: Record<string, LabOwner>,
): LabOwner | null {
  const nonChangeOutputs = outputs.filter((output) => !output.isChange)
  const firstNonChangeOutput = nonChangeOutputs[0]
  let receiver = firstNonChangeOutput
    ? (lookupOwnerForLabAddress(firstNonChangeOutput.address, addressToOwner) ?? null)
    : null

  const primaryFromOp = txOperationPayload.primaryToAddress?.trim() ?? ''
  if (receiver === null && txOperationPayload.receiver && changeFromOp?.txid === tx.txid) {
    // Prefer the vout whose address matches mempool `primaryToAddress` — WASM `isChange` can
    // disagree with our mempool flags, and "only one !isChange" may then be the change output.
    let payOutput: (typeof outputs)[0] | undefined
    if (primaryFromOp !== '') {
      payOutput = outputs.find((outputDetail) =>
        labAddressesEqual(outputDetail.address, primaryFromOp),
      )
    }
    if (payOutput == null && nonChangeOutputs.length === 1) {
      payOutput = nonChangeOutputs[0]
    }
    if (payOutput != null) {
      labWorkerState.addressToOwner = labWorkerState.addressToOwner ?? {}
      labWorkerState.addressToOwner[payOutput.address] = txOperationPayload.receiver
      receiver = txOperationPayload.receiver
    }
  }
  if (
    firstNonChangeOutput &&
    receiver === null &&
    sender !== null &&
    outputs.some(
      (output) =>
        output.isChange === true && labAddressesEqual(output.address, firstNonChangeOutput.address),
    )
  ) {
    labWorkerState.addressToOwner = labWorkerState.addressToOwner ?? {}
    labWorkerState.addressToOwner[firstNonChangeOutput.address] = sender
    receiver = sender
  }
  for (const output of outputs) {
    if (!output.isChange && output.owner == null) {
      const resolved = lookupOwnerForLabAddress(
        output.address,
        labWorkerState.addressToOwner ?? {},
      )
      if (resolved != null) output.owner = resolved
    }
  }
  for (const output of outputs) {
    if (output.owner != null) {
      labWorkerState.addressToOwner = labWorkerState.addressToOwner ?? {}
      labWorkerState.addressToOwner[output.address] = output.owner
    }
  }
  return receiver
}

export function applyTransactionsAndDetailsFromBlock(
  transactions: BlockEffectsTx[],
  height: number,
  blockTime: number,
): void {
  const utxoMap = new Map(labWorkerState.utxos.map((utxo) => [`${utxo.txid}:${utxo.vout}`, utxo]))
  const addressToOwner = labWorkerState.addressToOwner ?? {}

  for (const tx of transactions) {
    const isCoinbaseTx = isCoinbase(tx)
    const { changeFromOp, txOperationPayload, changeOutputForTx } =
      resolveChangeMetadataForBlockTx(tx)

    const { inputs, firstInputAddress } = buildInputsForBlockEffectTx(
      tx,
      isCoinbaseTx,
      utxoMap,
      addressToOwner,
    )

    const sender = isCoinbaseTx
      ? null
      : firstInputAddress
        ? lookupOwnerForLabAddress(firstInputAddress, addressToOwner) ?? null
        : null

    const changeAddress = changeOutputForTx?.address
    const changeVout = changeOutputForTx?.vout ?? null

    const outputs = buildOutputsForBlockEffectTx(
      tx,
      changeAddress,
      changeVout,
      sender,
      addressToOwner,
    )

    const receiver = resolveReceiverForBlockEffectTx(
      tx,
      outputs,
      txOperationPayload,
      changeFromOp,
      sender,
      addressToOwner,
    )

    if (isCoinbaseTx) {
      assertLabReceiverNonNull(
        receiver,
        `applyTransactionsFromBlock coinbase txid=${tx.txid} height=${height}`,
      )
    } else {
      assertLabReceiverNonNull(
        receiver,
        `applyTransactionsFromBlock txid=${tx.txid} height=${height}`,
      )
    }
    labWorkerState.transactions.push({
      txid: tx.txid,
      sender,
      receiver,
    })
    if (inputs.length > 0 || outputs.length > 0) {
      labWorkerState.txDetails.push({
        txid: tx.txid,
        blockHeight: height,
        blockTime,
        confirmations: 0,
        inputs,
        outputs,
      })
    }
    registerBlockTxOutputsInWorkingUtxoMap(utxoMap, tx.txid, outputs)
    txidToChangeOutput.delete(tx.txid)
  }
}
