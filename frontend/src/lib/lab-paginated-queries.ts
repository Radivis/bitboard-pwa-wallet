/**
 * Paginated reads against the lab SQLite DB for large cards (block txs, addresses, UTXOs).
 * Owner grouping uses {@link lab_address_owners} only—the same source persisted from
 * `addressToOwner` in lab state (see lab-factory persist).
 */
import type { QueryClient } from '@tanstack/react-query'
import { sql } from 'kysely'
import { ensureLabMigrated, getLabDatabase } from '@/db/lab-database'
import { labEntityOwnerKey } from '@/lib/lab-entity-keys'
import { labOwnerFromTxRow } from '@/lib/lab-db-owner'
import { isCoinbase } from '@/lib/lab-operations'
import { feeSatsFromTxDetails } from '@/lib/lab-tx-fee'
import type { LabAddress, LabBlockTransactionSummary, LabTxDetails } from '@/workers/lab-api'

export const LAB_CARD_PAGE_SIZE = 20
export const LAB_ENTITY_INNER_PAGE_SIZE = 5

export const labPaginatedQueryKeyPrefix = ['lab', 'paginated'] as const

export function invalidateLabPaginatedQueries(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: [...labPaginatedQueryKeyPrefix] })
}

export function labBlockTxsQueryKey(blockHeight: number, pageIndex: number) {
  return [...labPaginatedQueryKeyPrefix, 'blockTxs', blockHeight, pageIndex] as const
}

export function labOwnerKeysQueryKey(pageIndex: number) {
  return [...labPaginatedQueryKeyPrefix, 'ownerKeys', pageIndex] as const
}

export function labAddressesByOwnerQueryKey(ownerKey: string, pageIndex: number) {
  return [...labPaginatedQueryKeyPrefix, 'addressesByOwner', ownerKey, pageIndex] as const
}

export function labUtxosByOwnerQueryKey(ownerKey: string, pageIndex: number) {
  return [...labPaginatedQueryKeyPrefix, 'utxosByOwner', ownerKey, pageIndex] as const
}

export function labAddressBalancesQueryKey(addressesKey: string) {
  return [...labPaginatedQueryKeyPrefix, 'addressBalances', addressesKey] as const
}

export function labEntitiesPageQueryKey(pageIndex: number) {
  return [...labPaginatedQueryKeyPrefix, 'labEntities', pageIndex] as const
}

function ownerKeyMatches(ownerKey: string) {
  const w = /^w:(\d+)$/.exec(ownerKey)
  if (w) {
    const id = Number(w[1])
    return sql<boolean>`o.owner_type = 'wallet' AND o.wallet_id = ${id}`
  }
  const e = /^e:(\d+)$/.exec(ownerKey)
  if (e) {
    const id = Number(e[1])
    return sql<boolean>`o.owner_type = 'lab_entity' AND o.lab_entity_id = ${id}`
  }
  if (ownerKey.startsWith('wallet:')) {
    const id = parseInt(ownerKey.slice('wallet:'.length), 10)
    return sql<boolean>`o.owner_type = 'wallet' AND o.wallet_id = ${id}`
  }
  return sql<boolean>`o.owner_type = 'lab_entity' AND o.entity_name = ${ownerKey}`
}

function parseTxDetailsRow(
  blockHeight: number,
  blockTime: number,
  row: {
    txid: string
    inputs_json: string
    outputs_json: string
    sender: string | null
    receiver: string | null
    sender_lab_entity_id: number | null
    sender_wallet_id: number | null
    receiver_lab_entity_id: number | null
    receiver_wallet_id: number | null
  },
  entities: readonly { labEntityId: number; entityName: string | null }[],
): LabBlockTransactionSummary {
  const inputs = JSON.parse(row.inputs_json) as LabTxDetails['inputs']
  const outputs = JSON.parse(row.outputs_json) as LabTxDetails['outputs']
  const tx: LabTxDetails = {
    txid: row.txid,
    blockHeight,
    blockTime,
    confirmations: 0,
    inputs,
    outputs,
    isCoinbase: isCoinbase({ inputs }),
  }
  return {
    txid: row.txid,
    sender: labOwnerFromTxRow(
      row.sender_lab_entity_id,
      row.sender_wallet_id,
      row.sender,
      entities,
    ),
    receiver: labOwnerFromTxRow(
      row.receiver_lab_entity_id,
      row.receiver_wallet_id,
      row.receiver,
      entities,
    ),
    feeSats: feeSatsFromTxDetails(tx),
    isCoinbase: tx.isCoinbase ?? false,
  }
}

export async function fetchLabBlockTransactionsPage(
  blockHeight: number,
  pageIndex: number,
  pageSize: number = LAB_CARD_PAGE_SIZE,
): Promise<{ transactions: LabBlockTransactionSummary[]; totalCount: number }> {
  await ensureLabMigrated()
  const labDb = getLabDatabase()
  const offset = pageIndex * pageSize

  const countRow = await labDb
    .selectFrom('lab_tx_details')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('block_height', '=', blockHeight)
    .executeTakeFirst()

  const totalCount = Number(countRow?.count ?? 0)

  const entityRows = await labDb.selectFrom('lab_entities').selectAll().execute()
  const entities = entityRows.map((r) => ({
    labEntityId: r.lab_entity_id,
    entityName: r.entity_name,
  }))

  const rows = await labDb
    .selectFrom('lab_tx_details as d')
    .leftJoin('lab_transactions as t', 't.txid', 'd.txid')
    .select([
      'd.txid',
      'd.block_time',
      'd.inputs_json',
      'd.outputs_json',
      't.sender',
      't.receiver',
      't.sender_lab_entity_id',
      't.sender_wallet_id',
      't.receiver_lab_entity_id',
      't.receiver_wallet_id',
    ])
    .where('d.block_height', '=', blockHeight)
    .orderBy('d.txid', 'asc')
    .limit(pageSize)
    .offset(offset)
    .execute()

  const transactions = rows.map((row) =>
    parseTxDetailsRow(blockHeight, row.block_time, row, entities),
  )

  return { transactions, totalCount }
}

export async function fetchLabOwnerKeysPage(
  pageIndex: number,
  pageSize: number = LAB_CARD_PAGE_SIZE,
): Promise<{ ownerKeys: string[]; totalCount: number }> {
  await ensureLabMigrated()
  const labDb = getLabDatabase()
  const offset = pageIndex * pageSize

  const countResult = await sql<{ c: number | bigint }>`
    SELECT COUNT(*) AS c FROM (
      SELECT DISTINCT CASE
        WHEN owner_type = 'wallet' THEN 'w:' || wallet_id
        WHEN lab_entity_id IS NOT NULL THEN 'e:' || lab_entity_id
        ELSE entity_name
      END AS owner_key
      FROM lab_address_owners
    )
  `.execute(labDb)
  const totalCount = Number(countResult.rows[0]?.c ?? 0)

  const pageResult = await sql<{ owner_key: string }>`
    SELECT DISTINCT CASE
      WHEN owner_type = 'wallet' THEN 'w:' || wallet_id
      WHEN lab_entity_id IS NOT NULL THEN 'e:' || lab_entity_id
      ELSE entity_name
    END AS owner_key
    FROM lab_address_owners
    ORDER BY owner_key
    LIMIT ${pageSize} OFFSET ${offset}
  `.execute(labDb)

  const ownerKeys = pageResult.rows.map((r) => r.owner_key).filter((k) => k != null && k !== '')

  return { ownerKeys, totalCount }
}

export async function fetchLabAddressesForOwnerPage(
  ownerKey: string,
  pageIndex: number,
  pageSize: number = LAB_ENTITY_INNER_PAGE_SIZE,
): Promise<{ addresses: LabAddress[]; totalCount: number }> {
  await ensureLabMigrated()
  const labDb = getLabDatabase()
  const offset = pageIndex * pageSize

  const countRow = await labDb
    .selectFrom('lab_address_owners as o')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where(ownerKeyMatches(ownerKey))
    .executeTakeFirst()
  const totalCount = Number(countRow?.count ?? 0)

  const rows = await labDb
    .selectFrom('lab_address_owners as o')
    .leftJoin('lab_addresses as la', 'la.address', 'o.address')
    .select(['o.address', sql<string>`COALESCE(la.wif, '')`.as('wif')])
    .where(ownerKeyMatches(ownerKey))
    .orderBy('o.address', 'asc')
    .limit(pageSize)
    .offset(offset)
    .execute()

  const addresses: LabAddress[] = rows.map((r) => ({
    address: r.address,
    wif: r.wif,
  }))

  return { addresses, totalCount }
}

export type LabUtxoRow = {
  txid: string
  vout: number
  address: string
  amountSats: number
}

export async function fetchLabUtxosForOwnerPage(
  ownerKey: string,
  pageIndex: number,
  pageSize: number = LAB_ENTITY_INNER_PAGE_SIZE,
): Promise<{ utxos: LabUtxoRow[]; totalCount: number }> {
  await ensureLabMigrated()
  const labDb = getLabDatabase()
  const offset = pageIndex * pageSize

  const countRow = await labDb
    .selectFrom('utxos as u')
    .innerJoin('lab_address_owners as o', 'o.address', 'u.address')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where(ownerKeyMatches(ownerKey))
    .executeTakeFirst()
  const totalCount = Number(countRow?.count ?? 0)

  const rows = await labDb
    .selectFrom('utxos as u')
    .innerJoin('lab_address_owners as o', 'o.address', 'u.address')
    .select(['u.txid', 'u.vout', 'u.address', 'u.amount_sats'])
    .where(ownerKeyMatches(ownerKey))
    .orderBy('u.utxo_id', 'asc')
    .limit(pageSize)
    .offset(offset)
    .execute()

  const utxos: LabUtxoRow[] = rows.map((r) => ({
    txid: r.txid,
    vout: r.vout,
    address: r.address,
    amountSats: r.amount_sats,
  }))

  return { utxos, totalCount }
}

/**
 * Sum of UTXO amounts for the given addresses (batch for one inner page).
 */
export type LabEntitiesPageRow = {
  labEntityId: number
  entityName: string | null
  displayName: string
  addressType: string
  balanceSats: number
  hasTransactions: boolean
  isDead: boolean
}

export async function fetchLabEntitiesPage(
  pageIndex: number,
  pageSize: number = LAB_CARD_PAGE_SIZE,
): Promise<{ rows: LabEntitiesPageRow[]; totalCount: number }> {
  await ensureLabMigrated()
  const labDb = getLabDatabase()
  const offset = pageIndex * pageSize

  const countRow = await labDb
    .selectFrom('lab_entities')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirst()
  const totalCount = Number(countRow?.count ?? 0)

  const entityRows = await labDb
    .selectFrom('lab_entities')
    .selectAll()
    .orderBy('lab_entity_id', 'asc')
    .limit(pageSize)
    .offset(offset)
    .execute()

  const rows: LabEntitiesPageRow[] = []
  for (const r of entityRows) {
    const labEntityId = r.lab_entity_id
    const entityName = r.entity_name
    const displayName = labEntityOwnerKey({ labEntityId, entityName })
    const balRow = await labDb
      .selectFrom('utxos as u')
      .innerJoin('lab_address_owners as o', 'o.address', 'u.address')
      .select((eb) => eb.fn.sum<number | bigint | null>('u.amount_sats').as('total'))
      .where('o.owner_type', '=', 'lab_entity')
      .where('o.lab_entity_id', '=', labEntityId)
      .executeTakeFirst()
    const balanceSats = Number(balRow?.total ?? 0)

    const hasConfirmed = await labDb
      .selectFrom('lab_transactions')
      .select('txid')
      .where((eb) =>
        eb.or([
          eb('sender_lab_entity_id', '=', labEntityId),
          eb('receiver_lab_entity_id', '=', labEntityId),
        ]),
      )
      .executeTakeFirst()

    const hasMempool = await labDb
      .selectFrom('lab_mempool')
      .select('txid')
      .where((eb) =>
        eb.or([
          eb('sender_lab_entity_id', '=', labEntityId),
          eb('receiver_lab_entity_id', '=', labEntityId),
        ]),
      )
      .executeTakeFirst()

    rows.push({
      labEntityId,
      entityName,
      displayName,
      addressType: r.address_type,
      balanceSats,
      hasTransactions: hasConfirmed != null || hasMempool != null,
      isDead: r.is_dead !== 0,
    })
  }

  return { rows, totalCount }
}

export async function fetchLabAddressBalancesSats(
  addresses: readonly string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (addresses.length === 0) return result

  await ensureLabMigrated()
  const labDb = getLabDatabase()

  for (const address of addresses) {
    const row = await labDb
      .selectFrom('utxos')
      .select((eb) => eb.fn.sum<number | bigint | null>('amount_sats').as('total'))
      .where('address', '=', address)
      .executeTakeFirst()
    const n = row?.total
    result.set(address, typeof n === 'bigint' ? Number(n) : Number(n ?? 0))
  }

  return result
}
