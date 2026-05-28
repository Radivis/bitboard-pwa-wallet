import { wrap, type Remote } from 'comlink'
import {
  mergeMempoolInputsDetailWithOutpoints,
  type LabEntityRecord,
  type LabMineOperationRecord,
  type LabService,
  type LabState,
  type LabTxDetails,
  type LabTxInputDetail,
  type LabTxOperationRecord,
} from './lab-api'
import {
  EMPTY_LAB_STATE,
  LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
  LAB_DEFAULT_MINER_SUBSIDY_SATS,
  normalizeBlockWeightLimit,
  normalizeMinerSubsidySats,
} from './lab-api'
import {
  ensureLabMigrated,
  getLabDatabase,
} from '@/db'
import { notifyLabStatePersistedAfterCommit } from '@/lib/lab/lab-cross-tab-sync'
import type { LabDatabase } from '@/db/lab-schema'
import { SQLITE_FALSE, SQLITE_TRUE } from '@/db/schema'
import { labOwnerFromDbPair, labOwnerFromTxRow, labOwnerToDbPair } from '@/lib/lab/lab-db-owner'
import { parseAddressType } from '@/lib/wallet/wallet-domain-types'
import { labEntityOwnerKey } from '@/lib/lab/lab-entity-keys'
import { labVsizeFromWeight } from '@/lib/lab/lab-tx-weight'
import type { LabOwner } from '@/lib/lab/lab-owner'
import {
  labEntityLabOwner,
  labOwnerDisplayKey,
  normalizeJsonOwnerToLabOwner,
  walletLabOwner,
} from '@/lib/lab/lab-owner'
import type { Transaction } from 'kysely'

/**
 * Max rows per `INSERT` when persisting a {@link LabState} snapshot. Large states come from
 * mining and chain growth (many UTXOs and rows across tables), not from the random-transaction UI
 * limit—batching keeps each statement bounded and avoids oversized single inserts.
 */
const LAB_PERSIST_INSERT_BATCH_SIZE = 200

/** Splits row arrays so each DB insert stays within {@link LAB_PERSIST_INSERT_BATCH_SIZE}. */
function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function normalizeMempoolIoOwners<
  T extends { owner?: unknown },
>(rows: T[], entities: LabEntityRecord[]): (T & { owner?: LabOwner | null })[] {
  return rows.map((row) => ({
    ...row,
    owner: normalizeJsonOwnerToLabOwner(row.owner, entities),
  }))
}

let worker: Worker | null = null
let labWorkerProxy: Remote<LabService> | null = null

export function getLabWorker(): Remote<LabService> {
  if (!worker || !labWorkerProxy) {
    worker = new Worker(new URL('./lab.worker.ts', import.meta.url), {
      type: 'module',
    })
    labWorkerProxy = wrap<LabService>(worker)
  }
  return labWorkerProxy
}

/** Loads full lab state from the lab database. Call after ensureLabMigrated. */
export async function loadLabStateFromDatabase(): Promise<LabState> {
  await ensureLabMigrated()
  const labDb = getLabDatabase()

  const presetRow = await labDb
    .selectFrom('lab_parameter_presets')
    .select(['block_size', 'miner_subsidy_sats'])
    .orderBy('id', 'asc')
    .executeTakeFirst()
  const blockWeightLimit = normalizeBlockWeightLimit(
    presetRow?.block_size ?? LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
  )
  const minerSubsidySats = normalizeMinerSubsidySats(
    presetRow?.miner_subsidy_sats ?? LAB_DEFAULT_MINER_SUBSIDY_SATS,
  )

  const blocks = await labDb
    .selectFrom('blocks')
    .select(['block_hash', 'height', 'block_data', 'created_at'])
    .orderBy('height', 'asc')
    .execute()

  const utxos = await labDb
    .selectFrom('utxos')
    .select(['txid', 'vout', 'address', 'amount_sats', 'script_pubkey_hex'])
    .execute()

  const addresses = await labDb
    .selectFrom('lab_addresses')
    .select(['address', 'wif'])
    .execute()

  const entityRows = await labDb.selectFrom('lab_entities').selectAll().execute()
  const entities: LabEntityRecord[] = entityRows.map((entityDbRow) => ({
    labEntityId: entityDbRow.lab_entity_id,
    entityName: entityDbRow.entity_name,
    mnemonic: entityDbRow.mnemonic,
    changesetJson: entityDbRow.changeset_json,
    externalDescriptor: entityDbRow.external_descriptor,
    internalDescriptor: entityDbRow.internal_descriptor,
    network: entityDbRow.network,
    addressType: parseAddressType(entityDbRow.address_type),
    accountId: entityDbRow.account_id,
    createdAt: entityDbRow.created_at,
    updatedAt: entityDbRow.updated_at,
    isDead: Boolean(entityDbRow.is_dead),
  }))

  const addressOwnersRows = await labDb
    .selectFrom('lab_address_owners')
    .select(['address', 'owner_type', 'wallet_id', 'entity_name', 'lab_entity_id'])
    .execute()

  const addressToOwner: Record<string, LabOwner> = {}
  for (const addressOwnerRow of addressOwnersRows) {
    if (addressOwnerRow.owner_type === 'wallet' && addressOwnerRow.wallet_id != null) {
      addressToOwner[addressOwnerRow.address] = walletLabOwner(addressOwnerRow.wallet_id)
    } else if (addressOwnerRow.owner_type === 'lab_entity') {
      const labEntityId = (addressOwnerRow as { lab_entity_id?: number | null }).lab_entity_id
      if (labEntityId != null && labEntityId > 0) {
        addressToOwner[addressOwnerRow.address] = labEntityLabOwner(labEntityId)
      }
    }
  }

  const mempoolRows = await labDb.selectFrom('lab_mempool').selectAll().execute()

  const mempool = mempoolRows.map((mempoolDbRow) => {
    const resolvedWeight =
      mempoolDbRow.weight != null && Number.isFinite(mempoolDbRow.weight) && mempoolDbRow.weight > 0
        ? mempoolDbRow.weight
        : 0
    return {
      signedTxHex: mempoolDbRow.signed_tx_hex,
      txid: mempoolDbRow.txid,
      sender: labOwnerFromDbPair(mempoolDbRow.sender_lab_entity_id, mempoolDbRow.sender_wallet_id),
      receiver: labOwnerFromDbPair(mempoolDbRow.receiver_lab_entity_id, mempoolDbRow.receiver_wallet_id),
      feeSats: mempoolDbRow.fee_sats,
      vsize: labVsizeFromWeight(resolvedWeight),
      weight: resolvedWeight,
      inputs: JSON.parse(mempoolDbRow.inputs_json) as { txid: string; vout: number }[],
      inputsDetail: mergeMempoolInputsDetailWithOutpoints(
        JSON.parse(mempoolDbRow.inputs_json) as { txid: string; vout: number }[],
        normalizeMempoolIoOwners(
          JSON.parse(mempoolDbRow.inputs_detail_json) as LabTxInputDetail[],
          entities,
        ),
      ),
      outputsDetail: normalizeMempoolIoOwners(
        JSON.parse(mempoolDbRow.outputs_detail_json) as {
          address: string
          amountSats: number
          isChange?: boolean
          owner?: unknown
        }[],
        entities,
      ),
    }
  })

  const txDetailsRows = await labDb
    .selectFrom('lab_tx_details')
    .select(['txid', 'block_height', 'block_time', 'inputs_json', 'outputs_json'])
    .execute()

  const txDetails = txDetailsRows.map((txDetailDbRow) => {
    const inputsRaw = JSON.parse(txDetailDbRow.inputs_json) as LabTxDetails['inputs']
    const inputs = inputsRaw.map((inputDetail) => ({
      ...inputDetail,
      owner:
        normalizeJsonOwnerToLabOwner(inputDetail.owner, entities) ??
        inputDetail.owner ??
        null,
    }))
    const outputsRaw = JSON.parse(txDetailDbRow.outputs_json) as LabTxDetails['outputs']
    const outputs = outputsRaw.map((outputEntry) => ({
      ...outputEntry,
      owner: normalizeJsonOwnerToLabOwner(outputEntry.owner, entities) ?? outputEntry.owner ?? null,
    }))
    return {
      txid: txDetailDbRow.txid,
      blockHeight: txDetailDbRow.block_height,
      blockTime: txDetailDbRow.block_time,
      confirmations: 0,
      inputs,
      outputs,
    }
  })

  const transactions = await labDb.selectFrom('lab_transactions').selectAll().orderBy('lab_transaction_id', 'asc').execute()

  const mineOpRows = await labDb.selectFrom('lab_mine_operations').selectAll().orderBy('height', 'asc').execute()
  const txOpRows = await labDb.selectFrom('lab_tx_operations').selectAll().execute()

  const mineOperations: LabMineOperationRecord[] = mineOpRows.map((mineOpDbRow) => ({
    mineOperationId: mineOpDbRow.mine_operation_id,
    height: mineOpDbRow.height,
    blockHash: mineOpDbRow.block_hash,
    minedBy: labOwnerFromTxRow(
      mineOpDbRow.mined_by_lab_entity_id,
      mineOpDbRow.mined_by_wallet_id,
      mineOpDbRow.mined_by_key,
      entities,
    ),
    coinbaseTxid: mineOpDbRow.coinbase_txid,
    createdAt: mineOpDbRow.created_at,
    blockWeightLimitWu:
      mineOpDbRow.block_weight_limit_wu != null && Number.isFinite(mineOpDbRow.block_weight_limit_wu)
        ? mineOpDbRow.block_weight_limit_wu
        : null,
    nonCoinbaseWeightUsedWu:
      mineOpDbRow.non_coinbase_weight_used_wu != null &&
      Number.isFinite(mineOpDbRow.non_coinbase_weight_used_wu)
        ? mineOpDbRow.non_coinbase_weight_used_wu
        : null,
  }))

  const txOperations: LabTxOperationRecord[] = txOpRows.map((txOpDbRow) => {
    const sender = labOwnerFromTxRow(
      txOpDbRow.sender_lab_entity_id,
      txOpDbRow.sender_wallet_id,
      txOpDbRow.sender_key,
      entities,
    )
    if (sender == null) {
      throw new Error(`lab_tx_operations: cannot parse sender for txid=${txOpDbRow.txid}`)
    }
    return {
      txOperationId: txOpDbRow.tx_operation_id,
      txid: txOpDbRow.txid,
      sender,
      changeAddress: txOpDbRow.change_address,
      changeVout: txOpDbRow.change_vout,
      payloadJson: txOpDbRow.payload_json,
    }
  })

  return {
    blockWeightLimit,
    minerSubsidySats,
    blocks: blocks.map((blockRow) => ({
      blockHash: blockRow.block_hash,
      height: blockRow.height,
      blockData: blockRow.block_data,
    })),
    utxos: utxos.map((utxoRow) => ({
      txid: utxoRow.txid,
      vout: utxoRow.vout,
      address: utxoRow.address,
      amountSats: utxoRow.amount_sats,
      scriptPubkeyHex: utxoRow.script_pubkey_hex,
    })),
    addresses: addresses.map((addressRow) => ({
      address: addressRow.address,
      wif: addressRow.wif,
    })),
    entities,
    addressToOwner,
    mempool,
    transactions: transactions.map((txRow) => ({
      txid: txRow.txid,
      sender: labOwnerFromDbPair(txRow.sender_lab_entity_id, txRow.sender_wallet_id),
      receiver: labOwnerFromDbPair(txRow.receiver_lab_entity_id, txRow.receiver_wallet_id),
    })),
    txDetails,
    mineOperations,
    txOperations,
  }
}

/**
 * Hydrates the lab worker from **SQLite** (`loadLabStateFromDatabase`), not from TanStack
 * Query. UI cache can be stale in another tab; operations always re-read the DB here before
 * mutating so worker memory matches durable state.
 */
export async function initLabWorkerWithState(): Promise<{
  proxy: Remote<LabService>
  state: LabState
}> {
  const labWorkerProxyInstance = getLabWorker()
  const state = await loadLabStateFromDatabase()
  await labWorkerProxyInstance.loadState(state)
  return { proxy: labWorkerProxyInstance, state }
}

async function clearAndInsertLabState(
  labDbTransaction: Transaction<LabDatabase>,
  state: LabState,
): Promise<void> {
  const entities = state.entities ?? []
  await labDbTransaction.deleteFrom('blocks').execute()
  await labDbTransaction.deleteFrom('utxos').execute()
  await labDbTransaction.deleteFrom('lab_addresses').execute()
  await labDbTransaction.deleteFrom('lab_entities').execute()
  await labDbTransaction.deleteFrom('lab_address_owners').execute()
  await labDbTransaction.deleteFrom('lab_mempool').execute()
  await labDbTransaction.deleteFrom('lab_transactions').execute()
  await labDbTransaction.deleteFrom('lab_tx_details').execute()
  await labDbTransaction.deleteFrom('lab_mine_operations').execute()
  await labDbTransaction.deleteFrom('lab_tx_operations').execute()
  await labDbTransaction.deleteFrom('lab_parameter_presets').execute()

  const now = new Date().toISOString()
  const blockRows = state.blocks.map((blockRow) => ({
    block_hash: blockRow.blockHash,
    height: blockRow.height,
    block_data: blockRow.blockData,
    created_at: now,
  }))
  for (const chunk of chunkArray(blockRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await labDbTransaction.insertInto('blocks').values(chunk).execute()
  }

  const utxoRows = state.utxos.map((utxoRow) => ({
    txid: utxoRow.txid,
    vout: utxoRow.vout,
    address: utxoRow.address,
    amount_sats: utxoRow.amountSats,
    script_pubkey_hex: utxoRow.scriptPubkeyHex,
  }))
  for (const chunk of chunkArray(utxoRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await labDbTransaction.insertInto('utxos').values(chunk).execute()
  }

  const addressRows = state.addresses.map((addressRow) => ({
    address: addressRow.address,
    wif: addressRow.wif,
  }))
  for (const chunk of chunkArray(addressRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await labDbTransaction.insertInto('lab_addresses').values(chunk).execute()
  }

  const transactionRows = state.transactions.map((txRow) => {
    const senderOwner = labOwnerToDbPair(txRow.sender)
    const receiverOwner = labOwnerToDbPair(txRow.receiver)
    return {
      txid: txRow.txid,
      sender_lab_entity_id: senderOwner.labEntityId,
      sender_wallet_id: senderOwner.walletId,
      receiver_lab_entity_id: receiverOwner.labEntityId,
      receiver_wallet_id: receiverOwner.walletId,
    }
  })
  for (const chunk of chunkArray(transactionRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await labDbTransaction.insertInto('lab_transactions').values(chunk).execute()
  }

  const entityRows = (state.entities ?? []).map((entityRecord) => ({
    lab_entity_id: entityRecord.labEntityId,
    entity_name: entityRecord.entityName,
    mnemonic: entityRecord.mnemonic,
    changeset_json: entityRecord.changesetJson,
    external_descriptor: entityRecord.externalDescriptor,
    internal_descriptor: entityRecord.internalDescriptor,
    network: entityRecord.network,
    address_type: entityRecord.addressType,
    account_id: entityRecord.accountId,
    created_at: entityRecord.createdAt,
    updated_at: entityRecord.updatedAt,
    is_dead: entityRecord.isDead ? SQLITE_TRUE : SQLITE_FALSE,
  }))
  for (const chunk of chunkArray(entityRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await labDbTransaction.insertInto('lab_entities').values(chunk).execute()
  }

  const ownerRows: Array<{
    address: string
    owner_type: 'wallet' | 'lab_entity'
    wallet_id: number | null
    entity_name: string | null
    lab_entity_id: number | null
  }> = []
  for (const [address, owner] of Object.entries(state.addressToOwner ?? {})) {
    if (owner.kind === 'wallet') {
      ownerRows.push({
        address,
        owner_type: 'wallet',
        wallet_id: owner.walletId,
        entity_name: null,
        lab_entity_id: null,
      })
    } else {
      const entity = entities.find((entityRecord) => entityRecord.labEntityId === owner.labEntityId)
      ownerRows.push({
        address,
        owner_type: 'lab_entity',
        wallet_id: null,
        entity_name: entity ? labEntityOwnerKey(entity) : `Anonymous-${owner.labEntityId}`,
        lab_entity_id: owner.labEntityId,
      })
    }
  }
  for (const chunk of chunkArray(ownerRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await labDbTransaction.insertInto('lab_address_owners').values(chunk).execute()
  }

  const mempoolRows = (state.mempool ?? []).map((mempoolEntry) => {
    const senderOwner = labOwnerToDbPair(mempoolEntry.sender)
    const receiverOwner = labOwnerToDbPair(mempoolEntry.receiver)
    return {
      signed_tx_hex: mempoolEntry.signedTxHex,
      txid: mempoolEntry.txid,
      sender_lab_entity_id: senderOwner.labEntityId,
      sender_wallet_id: senderOwner.walletId,
      receiver_lab_entity_id: receiverOwner.labEntityId,
      receiver_wallet_id: receiverOwner.walletId,
      fee_sats: mempoolEntry.feeSats,
      weight: mempoolEntry.weight,
      inputs_json: JSON.stringify(mempoolEntry.inputs),
      inputs_detail_json: JSON.stringify(mempoolEntry.inputsDetail),
      outputs_detail_json: JSON.stringify(mempoolEntry.outputsDetail),
    }
  })
  for (const chunk of chunkArray(mempoolRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await labDbTransaction.insertInto('lab_mempool').values(chunk).execute()
  }

  await labDbTransaction
    .insertInto('lab_parameter_presets')
    .values({
      block_size: state.blockWeightLimit ?? LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
      miner_subsidy_sats: normalizeMinerSubsidySats(
        state.minerSubsidySats ?? LAB_DEFAULT_MINER_SUBSIDY_SATS,
      ),
    })
    .execute()

  const txDetailRows = (state.txDetails ?? []).map((txDetailRecord) => ({
    txid: txDetailRecord.txid,
    block_height: txDetailRecord.blockHeight,
    block_time: txDetailRecord.blockTime,
    inputs_json: JSON.stringify(txDetailRecord.inputs),
    outputs_json: JSON.stringify(txDetailRecord.outputs),
  }))
  for (const chunk of chunkArray(txDetailRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await labDbTransaction.insertInto('lab_tx_details').values(chunk).execute()
  }

  const nowMine = new Date().toISOString()
  const mineOpRows = (state.mineOperations ?? []).map((mineOperationRecord) => {
    const minedByOwner = labOwnerToDbPair(mineOperationRecord.minedBy)
    return {
      height: mineOperationRecord.height,
      block_hash: mineOperationRecord.blockHash,
      mined_by_key: mineOperationRecord.minedBy ? labOwnerDisplayKey(mineOperationRecord.minedBy, entities) : null,
      mined_by_lab_entity_id: minedByOwner.labEntityId,
      mined_by_wallet_id: minedByOwner.walletId,
      coinbase_txid: mineOperationRecord.coinbaseTxid,
      created_at: mineOperationRecord.createdAt || nowMine,
      block_weight_limit_wu:
        mineOperationRecord.blockWeightLimitWu != null &&
        Number.isFinite(mineOperationRecord.blockWeightLimitWu)
          ? Math.floor(mineOperationRecord.blockWeightLimitWu)
          : null,
      non_coinbase_weight_used_wu:
        mineOperationRecord.nonCoinbaseWeightUsedWu != null &&
        Number.isFinite(mineOperationRecord.nonCoinbaseWeightUsedWu)
          ? Math.floor(mineOperationRecord.nonCoinbaseWeightUsedWu)
          : null,
    }
  })
  for (const chunk of chunkArray(mineOpRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await labDbTransaction.insertInto('lab_mine_operations').values(chunk).execute()
  }

  const txOpRows = (state.txOperations ?? []).map((txOperationRecord) => {
    const senderOwner = labOwnerToDbPair(txOperationRecord.sender)
    return {
      txid: txOperationRecord.txid,
      sender_key: labOwnerDisplayKey(txOperationRecord.sender, entities),
      sender_lab_entity_id: senderOwner.labEntityId,
      sender_wallet_id: senderOwner.walletId,
      change_address: txOperationRecord.changeAddress,
      change_vout: txOperationRecord.changeVout,
      payload_json: txOperationRecord.payloadJson || '{}',
    }
  })
  for (const chunk of chunkArray(txOpRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await labDbTransaction.insertInto('lab_tx_operations').values(chunk).execute()
  }
}

export async function persistLabState(state: LabState): Promise<void> {
  await ensureLabMigrated()
  const labDb = getLabDatabase()
  await labDb.transaction().execute(async (labDbTransaction) => {
    await clearAndInsertLabState(labDbTransaction, state)
  })
  notifyLabStatePersistedAfterCommit()
}

export async function resetLab(): Promise<Remote<LabService>> {
  await persistLabState(EMPTY_LAB_STATE)
  const { proxy } = await initLabWorkerWithState()
  return proxy
}

export function terminateLabWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    labWorkerProxy = null
  }
}
