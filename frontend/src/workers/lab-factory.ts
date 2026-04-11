import { wrap, type Remote } from 'comlink'
import type {
  LabEntityRecord,
  LabMineOperationRecord,
  LabService,
  LabState,
  LabTxDetails,
  LabTxOperationRecord,
} from './lab-api'
import { EMPTY_LAB_STATE } from './lab-api'
import {
  ensureLabMigrated,
  getLabDatabase,
} from '@/db'
import type { LabDatabase } from '@/db/lab-schema'
import { labOwnerFromTxRow, labOwnerToDbPair } from '@/lib/lab-db-owner'
import { labEntityOwnerKey } from '@/lib/lab-entity-keys'
import type { LabOwner } from '@/lib/lab-owner'
import {
  labEntityLabOwner,
  labOwnerDisplayKey,
  labOwnerFromLegacyKey,
  normalizeJsonOwnerToLabOwner,
  walletLabOwner,
} from '@/lib/lab-owner'
import { isCoinbase } from '@/lib/lab-operations'
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
  const entities: LabEntityRecord[] = entityRows.map((r) => ({
    labEntityId: r.lab_entity_id,
    entityName: r.entity_name,
    mnemonic: r.mnemonic,
    changesetJson: r.changeset_json,
    externalDescriptor: r.external_descriptor,
    internalDescriptor: r.internal_descriptor,
    network: r.network,
    addressType: r.address_type,
    accountId: r.account_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    isDead: Number((r as { is_dead?: number }).is_dead ?? 0) !== 0,
  }))

  const addressOwnersRows = await labDb
    .selectFrom('lab_address_owners')
    .select(['address', 'owner_type', 'wallet_id', 'entity_name', 'lab_entity_id'])
    .execute()

  const addressToOwner: Record<string, LabOwner> = {}
  for (const row of addressOwnersRows) {
    if (row.owner_type === 'wallet' && row.wallet_id != null) {
      addressToOwner[row.address] = walletLabOwner(row.wallet_id)
    } else if (row.owner_type === 'lab_entity') {
      const lei = (row as { lab_entity_id?: number | null }).lab_entity_id
      if (lei != null && lei > 0) {
        addressToOwner[row.address] = labEntityLabOwner(lei)
      } else if (row.entity_name != null && row.entity_name !== '') {
        const o = labOwnerFromLegacyKey(row.entity_name, entities)
        if (o) addressToOwner[row.address] = o
      }
    }
  }

  const mempoolRows = await labDb.selectFrom('lab_mempool').selectAll().execute()

  const mempool = mempoolRows.map((r) => ({
    signedTxHex: r.signed_tx_hex,
    txid: r.txid,
    sender: labOwnerFromTxRow(
      r.sender_lab_entity_id,
      r.sender_wallet_id,
      r.sender,
      entities,
    ),
    receiver: labOwnerFromTxRow(
      r.receiver_lab_entity_id,
      r.receiver_wallet_id,
      r.receiver,
      entities,
    ),
    feeSats: r.fee_sats,
    inputs: JSON.parse(r.inputs_json) as { txid: string; vout: number }[],
    inputsDetail: normalizeMempoolIoOwners(
      JSON.parse(r.inputs_detail_json) as { address: string; amountSats: number; owner?: unknown }[],
      entities,
    ),
    outputsDetail: normalizeMempoolIoOwners(
      JSON.parse(r.outputs_detail_json) as {
        address: string
        amountSats: number
        isChange?: boolean
        owner?: unknown
      }[],
      entities,
    ),
  }))

  const txDetailsRows = await labDb
    .selectFrom('lab_tx_details')
    .select(['txid', 'block_height', 'block_time', 'inputs_json', 'outputs_json'])
    .execute()

  const txDetails = txDetailsRows.map((r) => {
    const inputsRaw = JSON.parse(r.inputs_json) as LabTxDetails['inputs']
    const inputs = inputsRaw.map((inp) => ({
      ...inp,
      owner: normalizeJsonOwnerToLabOwner(inp.owner, entities) ?? inp.owner ?? null,
    }))
    const outputsRaw = JSON.parse(r.outputs_json) as LabTxDetails['outputs']
    const outputs = outputsRaw.map((out) => ({
      ...out,
      owner: normalizeJsonOwnerToLabOwner(out.owner, entities) ?? out.owner ?? null,
    }))
    return {
      txid: r.txid,
      blockHeight: r.block_height,
      blockTime: r.block_time,
      confirmations: 0,
      isCoinbase: isCoinbase({ inputs }),
      inputs,
      outputs,
    }
  })

  const coinbaseByTxid = new Map(txDetails.map((d) => [d.txid, d.isCoinbase ?? false]))

  const transactions = await labDb.selectFrom('lab_transactions').selectAll().orderBy('lab_transaction_id', 'asc').execute()

  const mineOpRows = await labDb.selectFrom('lab_mine_operations').selectAll().orderBy('height', 'asc').execute()
  const txOpRows = await labDb.selectFrom('lab_tx_operations').selectAll().execute()

  const mineOperations: LabMineOperationRecord[] = mineOpRows.map((r) => ({
    mineOperationId: r.mine_operation_id,
    height: r.height,
    blockHash: r.block_hash,
    minedBy: labOwnerFromTxRow(
      r.mined_by_lab_entity_id,
      r.mined_by_wallet_id,
      r.mined_by_key,
      entities,
    ),
    coinbaseTxid: r.coinbase_txid,
    createdAt: r.created_at,
  }))

  const txOperations: LabTxOperationRecord[] = txOpRows.map((r) => {
    const sender =
      labOwnerFromTxRow(r.sender_lab_entity_id, r.sender_wallet_id, r.sender_key, entities) ??
      labOwnerFromLegacyKey(r.sender_key, entities)
    if (sender == null) {
      throw new Error(`lab_tx_operations: cannot parse sender for txid=${r.txid}`)
    }
    return {
      txOperationId: r.tx_operation_id,
      txid: r.txid,
      sender,
      changeAddress: r.change_address,
      changeVout: r.change_vout,
      payloadJson: r.payload_json,
    }
  })

  return {
    blocks: blocks.map((b) => ({
      blockHash: b.block_hash,
      height: b.height,
      blockData: b.block_data,
    })),
    utxos: utxos.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      address: u.address,
      amountSats: u.amount_sats,
      scriptPubkeyHex: u.script_pubkey_hex,
    })),
    addresses: addresses.map((a) => ({
      address: a.address,
      wif: a.wif,
    })),
    entities,
    addressToOwner,
    mempool,
    transactions: transactions.map((t) => ({
      txid: t.txid,
      sender: labOwnerFromTxRow(
        t.sender_lab_entity_id,
        t.sender_wallet_id,
        t.sender,
        entities,
      ),
      receiver: labOwnerFromTxRow(
        t.receiver_lab_entity_id,
        t.receiver_wallet_id,
        t.receiver,
        entities,
      ),
      isCoinbase: coinbaseByTxid.get(t.txid) ?? false,
    })),
    txDetails,
    mineOperations,
    txOperations,
  }
}

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
  trx: Transaction<LabDatabase>,
  state: LabState,
): Promise<void> {
  const ents = state.entities ?? []
  await trx.deleteFrom('blocks').execute()
  await trx.deleteFrom('utxos').execute()
  await trx.deleteFrom('lab_addresses').execute()
  await trx.deleteFrom('lab_entities').execute()
  await trx.deleteFrom('lab_address_owners').execute()
  await trx.deleteFrom('lab_mempool').execute()
  await trx.deleteFrom('lab_transactions').execute()
  await trx.deleteFrom('lab_tx_details').execute()
  await trx.deleteFrom('lab_mine_operations').execute()
  await trx.deleteFrom('lab_tx_operations').execute()

  const now = new Date().toISOString()
  const blockRows = state.blocks.map((b) => ({
    block_hash: b.blockHash,
    height: b.height,
    block_data: b.blockData,
    created_at: now,
  }))
  for (const chunk of chunkArray(blockRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('blocks').values(chunk).execute()
  }

  const utxoRows = state.utxos.map((u) => ({
    txid: u.txid,
    vout: u.vout,
    address: u.address,
    amount_sats: u.amountSats,
    script_pubkey_hex: u.scriptPubkeyHex,
  }))
  for (const chunk of chunkArray(utxoRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('utxos').values(chunk).execute()
  }

  const addressRows = state.addresses.map((a) => ({
    address: a.address,
    wif: a.wif,
  }))
  for (const chunk of chunkArray(addressRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_addresses').values(chunk).execute()
  }

  const transactionRows = state.transactions.map((t) => {
    const s = labOwnerToDbPair(t.sender)
    const r = labOwnerToDbPair(t.receiver)
    return {
      txid: t.txid,
      sender: t.sender ? labOwnerDisplayKey(t.sender, ents) : null,
      receiver: t.receiver ? labOwnerDisplayKey(t.receiver, ents) : null,
      sender_lab_entity_id: s.labEntityId,
      sender_wallet_id: s.walletId,
      receiver_lab_entity_id: r.labEntityId,
      receiver_wallet_id: r.walletId,
    }
  })
  for (const chunk of chunkArray(transactionRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_transactions').values(chunk).execute()
  }

  const entityRows = (state.entities ?? []).map((e) => ({
    lab_entity_id: e.labEntityId,
    entity_name: e.entityName,
    mnemonic: e.mnemonic,
    changeset_json: e.changesetJson,
    external_descriptor: e.externalDescriptor,
    internal_descriptor: e.internalDescriptor,
    network: e.network,
    address_type: e.addressType,
    account_id: e.accountId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    is_dead: e.isDead ? 1 : 0,
  }))
  for (const chunk of chunkArray(entityRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_entities').values(chunk).execute()
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
      const entity = ents.find((e) => e.labEntityId === owner.labEntityId)
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
    await trx.insertInto('lab_address_owners').values(chunk).execute()
  }

  const mempoolRows = (state.mempool ?? []).map((m) => {
    const s = labOwnerToDbPair(m.sender)
    const r = labOwnerToDbPair(m.receiver)
    return {
      signed_tx_hex: m.signedTxHex,
      txid: m.txid,
      sender: m.sender ? labOwnerDisplayKey(m.sender, ents) : null,
      receiver: m.receiver ? labOwnerDisplayKey(m.receiver, ents) : null,
      sender_lab_entity_id: s.labEntityId,
      sender_wallet_id: s.walletId,
      receiver_lab_entity_id: r.labEntityId,
      receiver_wallet_id: r.walletId,
      fee_sats: m.feeSats,
      inputs_json: JSON.stringify(m.inputs),
      inputs_detail_json: JSON.stringify(m.inputsDetail),
      outputs_detail_json: JSON.stringify(m.outputsDetail),
    }
  })
  for (const chunk of chunkArray(mempoolRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_mempool').values(chunk).execute()
  }

  const txDetailRows = (state.txDetails ?? []).map((d) => ({
    txid: d.txid,
    block_height: d.blockHeight,
    block_time: d.blockTime,
    inputs_json: JSON.stringify(d.inputs),
    outputs_json: JSON.stringify(d.outputs),
  }))
  for (const chunk of chunkArray(txDetailRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_tx_details').values(chunk).execute()
  }

  const nowMine = new Date().toISOString()
  const mineOpRows = (state.mineOperations ?? []).map((m) => {
    const mb = labOwnerToDbPair(m.minedBy)
    return {
      height: m.height,
      block_hash: m.blockHash,
      mined_by_key: m.minedBy ? labOwnerDisplayKey(m.minedBy, ents) : null,
      mined_by_lab_entity_id: mb.labEntityId,
      mined_by_wallet_id: mb.walletId,
      coinbase_txid: m.coinbaseTxid,
      created_at: m.createdAt || nowMine,
    }
  })
  for (const chunk of chunkArray(mineOpRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_mine_operations').values(chunk).execute()
  }

  const txOpRows = (state.txOperations ?? []).map((o) => {
    const sp = labOwnerToDbPair(o.sender)
    return {
      txid: o.txid,
      sender_key: labOwnerDisplayKey(o.sender, ents),
      sender_lab_entity_id: sp.labEntityId,
      sender_wallet_id: sp.walletId,
      change_address: o.changeAddress,
      change_vout: o.changeVout,
      payload_json: o.payloadJson || '{}',
    }
  })
  for (const chunk of chunkArray(txOpRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_tx_operations').values(chunk).execute()
  }
}

export async function persistLabState(state: LabState): Promise<void> {
  await ensureLabMigrated()
  const labDb = getLabDatabase()
  await labDb.transaction().execute(async (trx) => {
    await clearAndInsertLabState(trx, state)
  })
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
