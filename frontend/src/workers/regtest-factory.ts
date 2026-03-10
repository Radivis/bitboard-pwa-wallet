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

  const transactions = await db
    .selectFrom('regtest_transactions')
    .select(['txid', 'largest_input_address', 'largest_input_amount_sats'])
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
    inputs: JSON.parse(r.inputs_json) as { address: string; amountSats: number }[],
    outputs: JSON.parse(r.outputs_json) as {
      address: string
      amountSats: number
      isChange?: boolean
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
    transactions: transactions.map((t) => ({
      txid: t.txid,
      largestInputAddress: t.largest_input_address,
      largestInputAmountSats: t.largest_input_amount_sats,
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
        largest_input_address: t.largestInputAddress,
        largest_input_amount_sats: t.largestInputAmountSats,
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

export function terminateRegtestWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    proxy = null
  }
}
