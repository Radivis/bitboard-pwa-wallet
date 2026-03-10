import type { Generated, Insertable, Selectable, Updateable } from 'kysely'

export interface RegtestDatabase {
  blocks: BlocksTable
  utxos: UtxosTable
  regtest_addresses: RegtestAddressesTable
}

interface BlocksTable {
  block_hash: string
  height: number
  block_data: string
  created_at: string
}

export type Block = Selectable<BlocksTable>
export type NewBlock = Insertable<BlocksTable>
export type BlockUpdate = Updateable<BlocksTable>

interface UtxosTable {
  utxo_id: Generated<number>
  txid: string
  vout: number
  address: string
  amount_sats: number
  script_pubkey_hex: string
}

export type Utxo = Selectable<UtxosTable>
export type NewUtxo = Insertable<UtxosTable>
export type UtxoUpdate = Updateable<UtxosTable>

interface RegtestAddressesTable {
  regtest_address_id: Generated<number>
  address: string
  wif: string
}

export type RegtestAddress = Selectable<RegtestAddressesTable>
export type NewRegtestAddress = Insertable<RegtestAddressesTable>
export type RegtestAddressUpdate = Updateable<RegtestAddressesTable>
