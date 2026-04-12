/**
 * Paginated reads against the lab SQLite DB for large cards (block txs, addresses, UTXOs).
 * Owner grouping uses {@link lab_address_owners} only—the same source persisted from
 * `addressToOwner` in lab state (see lab-factory persist).
 *
 * **Owner key invariant:** Distinct keys from {@link labAddressOwnerKeySql} match
 * {@link labOwnerSortKey} for wallet and lab-entity rows (`w:…` / `e:…`). Legacy `wallet:…`
 * and bare entity names are handled in {@link ownerKeyMatches} and in
 * {@link labOwnerFromSortKey} / {@link labOwnerFromLegacyKey} on the TS side.
 */
import type { QueryClient } from '@tanstack/react-query'
import { sql } from 'kysely'
import { ensureLabMigrated, getLabDatabase } from '@/db/lab-database'
import { labEntityOwnerKey } from '@/lib/lab-entity-keys'
import { labOwnerFromDbPair } from '@/lib/lab-db-owner'
import { labOwnerFromSortKey, labOwnerFromWalletOwnerKey } from '@/lib/lab-owner'
import { feeSatsFromTxDetails } from '@/lib/lab-tx-fee'
import {
  type AddressType,
  parseAddressType,
} from '@/lib/wallet-domain-types'
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

/**
 * SQL expression for the stable owner key string stored logically as
 * {@link labOwnerSortKey} for wallet / lab-entity rows in `lab_address_owners`.
 */
const labAddressOwnerKeySql = sql`
  CASE
    WHEN owner_type = 'wallet' THEN 'w:' || wallet_id
    WHEN lab_entity_id IS NOT NULL THEN 'e:' || lab_entity_id
    ELSE entity_name
  END
`

function ownerKeyMatches(ownerKey: string) {
  const fromSort = labOwnerFromSortKey(ownerKey)
  if (fromSort?.kind === 'wallet') {
    return sql<boolean>`o.owner_type = 'wallet' AND o.wallet_id = ${fromSort.walletId}`
  }
  if (fromSort?.kind === 'lab_entity') {
    return sql<boolean>`o.owner_type = 'lab_entity' AND o.lab_entity_id = ${fromSort.labEntityId}`
  }
  const walletLegacy = labOwnerFromWalletOwnerKey(ownerKey)
  if (walletLegacy?.kind === 'wallet') {
    return sql<boolean>`o.owner_type = 'wallet' AND o.wallet_id = ${walletLegacy.walletId}`
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
    sender_lab_entity_id: number | null
    sender_wallet_id: number | null
    receiver_lab_entity_id: number | null
    receiver_wallet_id: number | null
  },
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
  }
  return {
    txid: row.txid,
    sender: labOwnerFromDbPair(row.sender_lab_entity_id, row.sender_wallet_id),
    receiver: labOwnerFromDbPair(row.receiver_lab_entity_id, row.receiver_wallet_id),
    feeSats: feeSatsFromTxDetails(tx),
    inputs,
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

  const rows = await labDb
    .selectFrom('lab_tx_details as d')
    .leftJoin('lab_transactions as t', 't.txid', 'd.txid')
    .select([
      'd.txid',
      'd.block_time',
      'd.inputs_json',
      'd.outputs_json',
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
    parseTxDetailsRow(blockHeight, row.block_time, row),
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
      SELECT DISTINCT ${labAddressOwnerKeySql} AS owner_key
      FROM lab_address_owners
    )
  `.execute(labDb)
  const totalCount = Number(countResult.rows[0]?.c ?? 0)

  const pageResult = await sql<{ owner_key: string }>`
    SELECT DISTINCT ${labAddressOwnerKeySql} AS owner_key
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
  addressType: AddressType
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

  const ids = entityRows.map((r) => r.lab_entity_id)
  if (ids.length === 0) {
    return { rows: [], totalCount }
  }

  const balanceRows = await labDb
    .selectFrom('utxos as u')
    .innerJoin('lab_address_owners as o', 'o.address', 'u.address')
    .select((eb) => [
      'o.lab_entity_id',
      eb.fn.sum<number | bigint | null>('u.amount_sats').as('total'),
    ])
    .where('o.owner_type', '=', 'lab_entity')
    .where('o.lab_entity_id', 'in', ids)
    .groupBy('o.lab_entity_id')
    .execute()

  const balanceByEntityId = new Map<number, number>()
  for (const b of balanceRows) {
    if (b.lab_entity_id == null) continue
    const t = b.total
    balanceByEntityId.set(
      b.lab_entity_id,
      typeof t === 'bigint' ? Number(t) : Number(t ?? 0),
    )
  }

  const [confirmedSenders, confirmedReceivers, mempoolSenders, mempoolReceivers] = await Promise.all([
    labDb
      .selectFrom('lab_transactions')
      .select('sender_lab_entity_id')
      .where('sender_lab_entity_id', 'in', ids)
      .execute(),
    labDb
      .selectFrom('lab_transactions')
      .select('receiver_lab_entity_id')
      .where('receiver_lab_entity_id', 'in', ids)
      .execute(),
    labDb
      .selectFrom('lab_mempool')
      .select('sender_lab_entity_id')
      .where('sender_lab_entity_id', 'in', ids)
      .execute(),
    labDb
      .selectFrom('lab_mempool')
      .select('receiver_lab_entity_id')
      .where('receiver_lab_entity_id', 'in', ids)
      .execute(),
  ])

  const hasTransactionsById = new Set<number>()
  for (const r of confirmedSenders) {
    if (r.sender_lab_entity_id != null) hasTransactionsById.add(r.sender_lab_entity_id)
  }
  for (const r of confirmedReceivers) {
    if (r.receiver_lab_entity_id != null) hasTransactionsById.add(r.receiver_lab_entity_id)
  }
  for (const r of mempoolSenders) {
    if (r.sender_lab_entity_id != null) hasTransactionsById.add(r.sender_lab_entity_id)
  }
  for (const r of mempoolReceivers) {
    if (r.receiver_lab_entity_id != null) hasTransactionsById.add(r.receiver_lab_entity_id)
  }

  const rows: LabEntitiesPageRow[] = entityRows.map((r) => {
    const labEntityId = r.lab_entity_id
    const entityName = r.entity_name
    const displayName = labEntityOwnerKey({ labEntityId, entityName })
    return {
      labEntityId,
      entityName,
      displayName,
      addressType: parseAddressType(r.address_type),
      balanceSats: balanceByEntityId.get(labEntityId) ?? 0,
      hasTransactions: hasTransactionsById.has(labEntityId),
      isDead: r.is_dead !== 0,
    }
  })

  return { rows, totalCount }
}

export async function fetchLabAddressBalancesSats(
  addresses: readonly string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (addresses.length === 0) return result

  for (const address of addresses) {
    result.set(address, 0)
  }

  await ensureLabMigrated()
  const labDb = getLabDatabase()

  const rows = await labDb
    .selectFrom('utxos')
    .select((eb) => ['address', eb.fn.sum<number | bigint | null>('amount_sats').as('total')])
    .where('address', 'in', [...addresses])
    .groupBy('address')
    .execute()

  for (const row of rows) {
    const t = row.total
    result.set(
      row.address,
      typeof t === 'bigint' ? Number(t) : Number(t ?? 0),
    )
  }

  return result
}
