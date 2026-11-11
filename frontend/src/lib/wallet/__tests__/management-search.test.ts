import { describe, expect, it } from 'vitest'
import { parseManagementSearch } from '@/lib/wallet/management-search'

describe('parseManagementSearch', () => {
  it('keeps a 64-character sweep txid', () => {
    const txid = 'Ab'.repeat(32)
    expect(parseManagementSearch({ completedExitTxid: txid })).toEqual({
      completedExitTxid: txid.toLowerCase(),
    })
  })

  it('drops a txid that is not a transaction id', () => {
    expect(parseManagementSearch({ completedExitTxid: 'not-a-txid' })).toEqual({})
  })

  it('still recognizes the delete-wallet flag', () => {
    expect(parseManagementSearch({ openDelete: 'true', completedExitTxid: 'nope' })).toEqual({
      openDelete: true,
    })
  })
})
