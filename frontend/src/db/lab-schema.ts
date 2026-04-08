import type { Generated, Insertable, Selectable, Updateable } from 'kysely'

interface LabAddressOwnersTable {
  address: string
  owner_type: 'wallet' | 'name' | 'lab_entity'
  wallet_id: number | null
  owner_name: string | null
  entity_name: string | null
}

interface LabEntitiesTable {
  entity_name: string
  mnemonic: string
  changeset_json: string
  external_descriptor: string
  internal_descriptor: string
  network: string
  address_type: string
  account_id: number
  created_at: string
  updated_at: string
}

interface LabMempoolTable {
  mempool_id: Generated<number>
  signed_tx_hex: string
  txid: string
  sender: string | null
  receiver: string | null
  fee_sats: number
  inputs_json: string
  inputs_detail_json: string
  outputs_detail_json: string
}

interface LabTransactionsTable {
  lab_transaction_id: Generated<number>
  txid: string
  sender: string | null
  receiver: string | null
  is_coinbase: number
}

interface LabTxDetailsTable {
  txid: string
  block_height: number
  block_time: number
  inputs_json: string
  outputs_json: string
  is_coinbase: number
}

interface LabMineOperationsTable {
  mine_operation_id: Generated<number>
  height: number
  block_hash: string
  mined_by_key: string | null
  coinbase_txid: string | null
  coinbase_vout: number | null
  created_at: string
}

interface LabTxOperationsTable {
  tx_operation_id: Generated<number>
  txid: string
  sender_key: string
  change_address: string | null
  change_vout: number | null
  payload_json: string
}

export interface LabDatabase {
  blocks: BlocksTable
  utxos: UtxosTable
  lab_addresses: LabAddressesTable
  lab_entities: LabEntitiesTable
  lab_address_owners: LabAddressOwnersTable
  lab_mempool: LabMempoolTable
  lab_transactions: LabTransactionsTable
  lab_tx_details: LabTxDetailsTable
  lab_mine_operations: LabMineOperationsTable
  lab_tx_operations: LabTxOperationsTable
}

export type LabEntityRow = Selectable<LabEntitiesTable>
export type NewLabEntityRow = Insertable<LabEntitiesTable>

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
  vout: number // INDEX of the output vector in the transaction - confusing legacy naming, but we stick to it for consistency
  address: string
  amount_sats: number
  script_pubkey_hex: string
}

export type Utxo = Selectable<UtxosTable>
export type NewUtxo = Insertable<UtxosTable>
export type UtxoUpdate = Updateable<UtxosTable>

interface LabAddressesTable {
  lab_address_id: Generated<number>
  address: string
  wif: string
}

export type LabAddress = Selectable<LabAddressesTable>
export type NewLabAddress = Insertable<LabAddressesTable>
export type LabAddressUpdate = Updateable<LabAddressesTable>
