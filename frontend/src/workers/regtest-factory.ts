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
}

export function terminateRegtestWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    proxy = null
  }
}
