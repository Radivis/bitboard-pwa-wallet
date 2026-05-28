/** NWC / NIP-47 SDK JSON shapes (snake_case). Map to domain before app use — see `lightning-wire-mappers.ts`. */

/** `make_invoice` response (SDK and amountless `executeNip47Request`). */
export interface WireNwcMakeInvoiceResult {
  invoice: string
  payment_hash: string
  type?: string
  state?: string
  description?: string
  description_hash?: string
  preimage?: string
  amount?: number
  fees_paid?: number
  settled_at?: number
  created_at?: number
  expires_at?: number
}

/** Single row from `list_transactions`. */
export interface WireNwcTransaction {
  type: 'incoming' | 'outgoing' | string
  state: string
  invoice: string
  description: string
  description_hash?: string
  preimage?: string
  payment_hash: string
  amount: number
  fees_paid: number
  settled_at?: number
  created_at: number
  expires_at?: number
}

/** `get_info` response fields used by Bitboard. */
export interface WireNwcWalletInfo {
  alias?: string
  color?: string
  pubkey?: string
  network?: string
  block_height?: number
  block_hash?: string
  methods?: string[]
}

/** `get_balance` response (millisatoshis). */
export interface WireNwcBalanceResponse {
  balance: number
}
