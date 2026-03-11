import { wrap, type Remote } from 'comlink'
import type { RegtestService } from './regtest-api'
import {
  ensureRegtestMigrated,
  getRegtestDatabase,
} from '@/db'
import type { RegtestState } from './regtest-api'

let worker: Worker | null = null
let proxy: Remote<RegtestService> | null = null

export function getRegtestWorker(): Remote<RegtestService> {
  if (!worker || !proxy) {
    worker = new Worker(new URL('./regtest.worker.ts', import.meta.url), {
      type: 'module',
    })
    proxy = wrap<RegtestService>(worker)
  }
  return proxy
}

export async function initRegtestWorkerWithState(): Promise<Remote<RegtestService>> {
  const regtestProxy = getRegtestWorker()
  await ensureRegtestMigrated()
  const db = getRegtestDatabase()

  const blocks = await db
    .selectFrom('blocks')
    .select(['block_hash', 'height', 'block_data', 'created_at'])
    .orderBy('height', 'asc')
    .execute()

  const utxos = await db
    .selectFrom('utxos')
    .select(['txid', 'vout', 'address', 'amount_sats', 'script_pubkey_hex'])
    .execute()

  const addresses = await db
    .selectFrom('regtest_addresses')
    .select(['address', 'wif'])
    .execute()

  const addressOwnersRows = await db
    .selectFrom('regtest_address_owners')
    .select(['address', 'owner'])
    .execute()

  const addressToOwner: Record<string, string> = {}
  for (const row of addressOwnersRows) {
    addressToOwner[row.address] = row.owner
  }

  const mempoolRows = await db
    .selectFrom('regtest_mempool')
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

  const transactions = await db
    .selectFrom('regtest_transactions')
    .select(['txid', 'sender', 'receiver'])
    .orderBy('regtest_transaction_id', 'asc')
    .execute()

  const txDetailsRows = await db
    .selectFrom('regtest_tx_details')
    .select(['txid', 'block_height', 'block_time', 'inputs_json', 'outputs_json'])
    .execute()

  const txDetails = txDetailsRows.map((r) => ({
    txid: r.txid,
    blockHeight: r.block_height,
    blockTime: r.block_time,
    confirmations: 0,
    inputs: JSON.parse(r.inputs_json) as {
      address: string
      amountSats: number
      owner?: string | null
    }[],
    outputs: JSON.parse(r.outputs_json) as {
      address: string
      amountSats: number
      isChange?: boolean
      owner?: string | null
    }[],
  }))

  const state: RegtestState = {
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
    addressToOwner,
    mempool,
    transactions: transactions.map((t) => ({
      txid: t.txid,
      sender: t.sender,
      receiver: t.receiver,
    })),
    txDetails,
  }

  await regtestProxy.loadState(state)
  return regtestProxy
}

export async function persistRegtestState(state: RegtestState): Promise<void> {
  await ensureRegtestMigrated()
  const db = getRegtestDatabase()

  await db.deleteFrom('blocks').execute()
  await db.deleteFrom('utxos').execute()
  await db.deleteFrom('regtest_addresses').execute()
  await db.deleteFrom('regtest_address_owners').execute()
  await db.deleteFrom('regtest_mempool').execute()
  await db.deleteFrom('regtest_transactions').execute()
  await db.deleteFrom('regtest_tx_details').execute()

  const now = new Date().toISOString()
  for (const b of state.blocks) {
    await db
      .insertInto('blocks')
      .values({
        block_hash: b.blockHash,
        height: b.height,
        block_data: b.blockData,
        created_at: now,
      })
      .execute()
  }
  for (const u of state.utxos) {
    await db
      .insertInto('utxos')
      .values({
        txid: u.txid,
        vout: u.vout,
        address: u.address,
        amount_sats: u.amountSats,
        script_pubkey_hex: u.scriptPubkeyHex,
      })
      .execute()
  }
  for (const a of state.addresses) {
    await db
      .insertInto('regtest_addresses')
      .values({
        address: a.address,
        wif: a.wif,
      })
      .execute()
  }
  for (const t of state.transactions) {
    await db
      .insertInto('regtest_transactions')
      .values({
        txid: t.txid,
        sender: t.sender,
        receiver: t.receiver,
      })
      .execute()
  }
  for (const [address, owner] of Object.entries(state.addressToOwner ?? {})) {
    await db
      .insertInto('regtest_address_owners')
      .values({ address, owner })
      .execute()
  }
  for (const m of state.mempool ?? []) {
    await db
      .insertInto('regtest_mempool')
      .values({
        signed_tx_hex: m.signedTxHex,
        txid: m.txid,
        sender: m.sender,
        receiver: m.receiver,
        fee_sats: m.feeSats,
        inputs_json: JSON.stringify(m.inputs),
        inputs_detail_json: JSON.stringify(m.inputsDetail),
        outputs_detail_json: JSON.stringify(m.outputsDetail),
      })
      .execute()
  }
  for (const d of state.txDetails ?? []) {
    await db
      .insertInto('regtest_tx_details')
      .values({
        txid: d.txid,
        block_height: d.blockHeight,
        block_time: d.blockTime,
        inputs_json: JSON.stringify(d.inputs),
        outputs_json: JSON.stringify(d.outputs),
      })
      .execute()
  }
}

export async function resetRegtestLab(): Promise<Remote<RegtestService>> {
  const emptyState: RegtestState = {
    blocks: [],
    utxos: [],
    addresses: [],
    addressToOwner: {},
    mempool: [],
    transactions: [],
    txDetails: [],
  }
  await persistRegtestState(emptyState)
  return initRegtestWorkerWithState()
}

export function terminateRegtestWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    proxy = null
  }
}
