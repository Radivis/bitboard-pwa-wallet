import { wrap, type Remote } from 'comlink'
import type { LabService } from './lab-api'
import {
  ensureLabMigrated,
  getLabDatabase,
} from '@/db'
import type { LabState } from './lab-api'

let worker: Worker | null = null
let proxy: Remote<LabService> | null = null

export function getLabWorker(): Remote<LabService> {
  if (!worker || !proxy) {
    worker = new Worker(new URL('./lab.worker.ts', import.meta.url), {
      type: 'module',
    })
    proxy = wrap<LabService>(worker)
  }
  return proxy
}

export async function initLabWorkerWithState(): Promise<{
  proxy: Remote<LabService>
  state: LabState
}> {
  const labProxy = getLabWorker()
  await ensureLabMigrated()
  const db = getLabDatabase()

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
    .selectFrom('lab_addresses')
    .select(['address', 'wif'])
    .execute()

  const addressOwnersRows = await db
    .selectFrom('lab_address_owners')
    .select(['address', 'owner_type', 'wallet_id', 'owner_name'])
    .execute()

  const addressToOwner: Record<string, string> = {}
  for (const row of addressOwnersRows) {
    if (row.owner_type === 'wallet' && row.wallet_id != null) {
      addressToOwner[row.address] = `wallet:${row.wallet_id}`
    } else if (row.owner_type === 'name' && row.owner_name != null) {
      addressToOwner[row.address] = row.owner_name
    }
  }

  const mempoolRows = await db
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

  const transactions = await db
    .selectFrom('lab_transactions')
    .select(['txid', 'sender', 'receiver'])
    .orderBy('lab_transaction_id', 'asc')
    .execute()

  const txDetailsRows = await db
    .selectFrom('lab_tx_details')
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

  const state: LabState = {
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

  await labProxy.loadState(state)
  return { proxy: labProxy, state }
}

export async function persistLabState(state: LabState): Promise<void> {
  await ensureLabMigrated()
  const db = getLabDatabase()

  await db.deleteFrom('blocks').execute()
  await db.deleteFrom('utxos').execute()
  await db.deleteFrom('lab_addresses').execute()
  await db.deleteFrom('lab_address_owners').execute()
  await db.deleteFrom('lab_mempool').execute()
  await db.deleteFrom('lab_transactions').execute()
  await db.deleteFrom('lab_tx_details').execute()

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
      .insertInto('lab_addresses')
      .values({
        address: a.address,
        wif: a.wif,
      })
      .execute()
  }
  for (const t of state.transactions) {
    await db
      .insertInto('lab_transactions')
      .values({
        txid: t.txid,
        sender: t.sender,
        receiver: t.receiver,
      })
      .execute()
  }
  for (const [address, ownerKey] of Object.entries(state.addressToOwner ?? {})) {
    const ownerType = ownerKey.startsWith('wallet:')
      ? ('wallet' as const)
      : ('name' as const)
    const walletId = ownerType === 'wallet'
      ? parseInt(ownerKey.slice(7), 10)
      : null
    const ownerName = ownerType === 'name' ? ownerKey : null
    await db
      .insertInto('lab_address_owners')
      .values({
        address,
        owner_type: ownerType,
        wallet_id: walletId,
        owner_name: ownerName,
      })
      .execute()
  }
  for (const m of state.mempool ?? []) {
    await db
      .insertInto('lab_mempool')
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
      .insertInto('lab_tx_details')
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

export async function resetLab(): Promise<Remote<LabService>> {
  const emptyState: LabState = {
    blocks: [],
    utxos: [],
    addresses: [],
    addressToOwner: {},
    mempool: [],
    transactions: [],
    txDetails: [],
  }
  await persistLabState(emptyState)
  const { proxy } = await initLabWorkerWithState()
  return proxy
}

export function terminateLabWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    proxy = null
  }
}
