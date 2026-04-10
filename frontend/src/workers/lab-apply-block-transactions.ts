import type { LabTxDetails, LabTxOperationRecord, LabUtxo } from './lab-api'
import type { BlockEffectsTx } from './lab-block-effects-types'
import {
  isCoinbase,
  LAB_COINBASE_PREV_TXID_HEX,
  LAB_COINBASE_PREV_VOUT,
  LAB_COINBASE_SEQUENCE,
} from '@/lib/lab-operations'
import {
  assertLabReceiverNonNull,
  labAddressesEqual,
  lookupOwnerForLabAddress,
  parseTxOperationPayload,
  state,
  txidToChangeOutput,
} from './lab-worker-state'

function registerBlockTxOutputsInWorkingUtxoMap(
  utxoMap: Map<string, LabUtxo>,
  txid: string,
  outputs: ReadonlyArray<{ address: string; amountSats: number }>,
): void {
  for (let vout = 0; vout < outputs.length; vout += 1) {
    const o = outputs[vout]
    utxoMap.set(`${txid}:${vout}`, {
      txid,
      vout,
      address: o.address,
      amountSats: o.amountSats,
      scriptPubkeyHex: '',
    })
  }
}

function resolveChangeMetadataForBlockTx(tx: BlockEffectsTx): {
  changeFromOp: LabTxOperationRecord | undefined
  txOperationPayload: ReturnType<typeof parseTxOperationPayload>
  changeOutputForTx: { address: string; vout: number | null } | undefined
} {
  const changeFromOp = state.txOperations?.find((o) => o.txid === tx.txid)
  const txOperationPayload = parseTxOperationPayload(changeFromOp?.payloadJson)
  const changeOutputForTx =
    txidToChangeOutput.get(tx.txid) ??
    (changeFromOp?.changeAddress
      ? { address: changeFromOp.changeAddress, vout: changeFromOp.changeVout ?? null }
      : undefined)
  return { changeFromOp, txOperationPayload, changeOutputForTx }
}

function buildInputsForBlockEffectTx(
  tx: BlockEffectsTx,
  isCb: boolean,
  utxoMap: Map<string, LabUtxo>,
  addressToOwner: Record<string, string>,
): { inputs: LabTxDetails['inputs']; firstInputAddress: string | null } {
  if (isCb) {
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
    const key = `${input.prev_txid}:${input.prev_vout}`
    const utxo = utxoMap.get(key)
    if (utxo) {
      const owner = lookupOwnerForLabAddress(utxo.address, addressToOwner) ?? null
      inputs.push({ address: utxo.address, amountSats: utxo.amountSats, owner })
      if (firstInputAddress === null) firstInputAddress = utxo.address
    }
  }
  return { inputs, firstInputAddress }
}

function buildOutputsForBlockEffectTx(
  tx: BlockEffectsTx,
  changeAddress: string | null | undefined,
  changeVout: number | null,
  sender: string | null,
  addressToOwner: Record<string, string>,
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
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[output.address] = sender
    }
    return {
      address: output.address,
      amountSats: output.amount_sats,
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
  sender: string | null,
  addressToOwner: Record<string, string>,
): string | null {
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
      payOutput = outputs.find((o) => labAddressesEqual(o.address, primaryFromOp))
    }
    if (payOutput == null && nonChangeOutputs.length === 1) {
      payOutput = nonChangeOutputs[0]
    }
    if (payOutput != null) {
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[payOutput.address] = txOperationPayload.receiver
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
    state.addressToOwner = state.addressToOwner ?? {}
    state.addressToOwner[firstNonChangeOutput.address] = sender
    receiver = sender
  }
  for (const output of outputs) {
    if (!output.isChange && output.owner == null) {
      const resolved = lookupOwnerForLabAddress(
        output.address,
        state.addressToOwner ?? {},
      )
      if (resolved != null) output.owner = resolved
    }
  }
  for (const output of outputs) {
    if (output.owner != null && output.owner !== '') {
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[output.address] = output.owner
    }
  }
  return receiver
}

export function applyTransactionsAndDetailsFromBlock(
  transactions: BlockEffectsTx[],
  height: number,
  blockTime: number,
): void {
  const utxoMap = new Map(state.utxos.map((utxo) => [`${utxo.txid}:${utxo.vout}`, utxo]))
  const addressToOwner = state.addressToOwner ?? {}

  for (const tx of transactions) {
    const isCb = isCoinbase(tx)
    const { changeFromOp, txOperationPayload, changeOutputForTx } =
      resolveChangeMetadataForBlockTx(tx)

    const { inputs, firstInputAddress } = buildInputsForBlockEffectTx(
      tx,
      isCb,
      utxoMap,
      addressToOwner,
    )

    const sender = isCb
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

    if (isCb) {
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
    state.transactions.push({
      txid: tx.txid,
      sender,
      receiver,
      isCoinbase: isCb,
    })
    if (inputs.length > 0 || outputs.length > 0) {
      state.txDetails.push({
        txid: tx.txid,
        blockHeight: height,
        blockTime,
        confirmations: 0,
        isCoinbase: isCb,
        inputs,
        outputs,
      })
    }
    registerBlockTxOutputsInWorkingUtxoMap(utxoMap, tx.txid, outputs)
    txidToChangeOutput.delete(tx.txid)
  }
}
