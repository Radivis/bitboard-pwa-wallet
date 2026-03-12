import type { Generated, Insertable, Selectable, Updateable } from 'kysely'

interface LabAddressOwnersTable {
  address: string
  owner: string
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
}

interface LabTxDetailsTable {
  txid: string
  block_height: number
  block_time: number
  inputs_json: string
  outputs_json: string
}

export interface LabDatabase {
  blocks: BlocksTable
  utxos: UtxosTable
  lab_addresses: LabAddressesTable
  lab_address_owners: LabAddressOwnersTable
  lab_mempool: LabMempoolTable
  lab_transactions: LabTransactionsTable
  lab_tx_details: LabTxDetailsTable
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

interface LabAddressesTable {
  lab_address_id: Generated<number>
  address: string
  wif: string
}

export type LabAddress = Selectable<LabAddressesTable>
export type NewLabAddress = Insertable<LabAddressesTable>
export type LabAddressUpdate = Updateable<LabAddressesTable>
