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
import { WALLET_OWNER_PREFIX, walletOwnerKey } from '@/lib/lab-utils'
import type { Transaction } from 'kysely'

/** SQLite / Kysely batch size for lab snapshot inserts (avoids huge single statements). */
const LAB_PERSIST_INSERT_BATCH_SIZE = 200

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
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

  const addressOwnersRows = await labDb
    .selectFrom('lab_address_owners')
    .select(['address', 'owner_type', 'wallet_id', 'entity_name'])
    .execute()

  const addressToOwner: Record<string, string> = {}
  for (const row of addressOwnersRows) {
    if (row.owner_type === 'wallet' && row.wallet_id != null) {
      addressToOwner[row.address] = walletOwnerKey(row.wallet_id)
    } else if (row.entity_name != null && row.entity_name !== '') {
      addressToOwner[row.address] = row.entity_name
    }
  }

  const entityRows = await labDb.selectFrom('lab_entities').selectAll().execute()
  const entities: LabEntityRecord[] = entityRows.map((r) => ({
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
  }))

  const mempoolRows = await labDb
    .selectFrom('lab_mempool')
    .select([
      'signed_tx_hex',
      'txid',
      'sender',
      'receiver',
      'fee_sats',
      'inputs_json',
      'inputs_detail_json',
      'outputs_detail_json',
    ])
    .execute()

  const mempool = mempoolRows.map((r) => ({
    signedTxHex: r.signed_tx_hex,
    txid: r.txid,
    sender: r.sender,
    receiver: r.receiver,
    feeSats: r.fee_sats,
    inputs: JSON.parse(r.inputs_json) as { txid: string; vout: number }[],
    inputsDetail: JSON.parse(r.inputs_detail_json) as {
      address: string
      amountSats: number
      owner?: string | null
    }[],
    outputsDetail: JSON.parse(r.outputs_detail_json) as {
      address: string
      amountSats: number
      isChange?: boolean
      owner?: string | null
    }[],
  }))

  const transactions = await labDb
    .selectFrom('lab_transactions')
    .select(['txid', 'sender', 'receiver', 'is_coinbase'])
    .orderBy('lab_transaction_id', 'asc')
    .execute()

  const txDetailsRows = await labDb
    .selectFrom('lab_tx_details')
    .select(['txid', 'block_height', 'block_time', 'inputs_json', 'outputs_json', 'is_coinbase'])
    .execute()

  const mineOpRows = await labDb.selectFrom('lab_mine_operations').selectAll().orderBy('height', 'asc').execute()
  const txOpRows = await labDb.selectFrom('lab_tx_operations').selectAll().execute()

  const mineOperations: LabMineOperationRecord[] = mineOpRows.map((r) => ({
    mineOperationId: r.mine_operation_id,
    height: r.height,
    blockHash: r.block_hash,
    minedByKey: r.mined_by_key,
    coinbaseTxid: r.coinbase_txid,
    coinbaseVout: r.coinbase_vout,
    createdAt: r.created_at,
  }))

  const txOperations: LabTxOperationRecord[] = txOpRows.map((r) => ({
    txOperationId: r.tx_operation_id,
    txid: r.txid,
    senderKey: r.sender_key,
    changeAddress: r.change_address,
    changeVout: r.change_vout,
    payloadJson: r.payload_json,
  }))

  const txDetails = txDetailsRows.map((r) => ({
    txid: r.txid,
    blockHeight: r.block_height,
    blockTime: r.block_time,
    confirmations: 0,
    isCoinbase: r.is_coinbase === 1,
    inputs: JSON.parse(r.inputs_json) as LabTxDetails['inputs'],
    outputs: JSON.parse(r.outputs_json) as {
      address: string
      amountSats: number
      isChange?: boolean
      owner?: string | null
    }[],
  }))

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
      sender: t.sender,
      receiver: t.receiver,
      isCoinbase: t.is_coinbase === 1,
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

  const transactionRows = state.transactions.map((t) => ({
    txid: t.txid,
    sender: t.sender,
    receiver: t.receiver,
    is_coinbase: t.isCoinbase ? 1 : 0,
  }))
  for (const chunk of chunkArray(transactionRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_transactions').values(chunk).execute()
  }

  const entityRows = (state.entities ?? []).map((e) => ({
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
  }))
  for (const chunk of chunkArray(entityRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_entities').values(chunk).execute()
  }

  const ownerRows: Array<{
    address: string
    owner_type: 'wallet' | 'lab_entity'
    wallet_id: number | null
    entity_name: string | null
  }> = []
  for (const [address, ownerKey] of Object.entries(state.addressToOwner ?? {})) {
    if (ownerKey.startsWith(WALLET_OWNER_PREFIX)) {
      const walletId = parseInt(ownerKey.slice(WALLET_OWNER_PREFIX.length), 10)
      ownerRows.push({
        address,
        owner_type: 'wallet',
        wallet_id: walletId,
        entity_name: null,
      })
    } else {
      ownerRows.push({
        address,
        owner_type: 'lab_entity',
        wallet_id: null,
        entity_name: ownerKey,
      })
    }
  }
  for (const chunk of chunkArray(ownerRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_address_owners').values(chunk).execute()
  }

  const mempoolRows = (state.mempool ?? []).map((m) => ({
    signed_tx_hex: m.signedTxHex,
    txid: m.txid,
    sender: m.sender,
    receiver: m.receiver,
    fee_sats: m.feeSats,
    inputs_json: JSON.stringify(m.inputs),
    inputs_detail_json: JSON.stringify(m.inputsDetail),
    outputs_detail_json: JSON.stringify(m.outputsDetail),
  }))
  for (const chunk of chunkArray(mempoolRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_mempool').values(chunk).execute()
  }

  const txDetailRows = (state.txDetails ?? []).map((d) => ({
    txid: d.txid,
    block_height: d.blockHeight,
    block_time: d.blockTime,
    inputs_json: JSON.stringify(d.inputs),
    outputs_json: JSON.stringify(d.outputs),
    is_coinbase: d.isCoinbase ? 1 : 0,
  }))
  for (const chunk of chunkArray(txDetailRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_tx_details').values(chunk).execute()
  }

  const nowMine = new Date().toISOString()
  const mineOpRows = (state.mineOperations ?? []).map((m) => ({
    height: m.height,
    block_hash: m.blockHash,
    mined_by_key: m.minedByKey,
    coinbase_txid: m.coinbaseTxid,
    coinbase_vout: m.coinbaseVout,
    created_at: m.createdAt || nowMine,
  }))
  for (const chunk of chunkArray(mineOpRows, LAB_PERSIST_INSERT_BATCH_SIZE)) {
    await trx.insertInto('lab_mine_operations').values(chunk).execute()
  }

  const txOpRows = (state.txOperations ?? []).map((o) => ({
    txid: o.txid,
    sender_key: o.senderKey,
    change_address: o.changeAddress,
    change_vout: o.changeVout,
    payload_json: o.payloadJson || '{}',
  }))
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
