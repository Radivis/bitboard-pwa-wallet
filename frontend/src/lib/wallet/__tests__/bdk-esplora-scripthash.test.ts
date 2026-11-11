import { describe, expect, it } from 'vitest'

import { bdkEsploraScripthashHex } from '@/lib/wallet/bdk-esplora-scripthash'

describe('bdkEsploraScripthashHex', () => {
  it('hashes a taproot output as OP_1 so Esplora scripthash history can match', () => {
    expect(
      bdkEsploraScripthashHex(
        'bcrt1pntq6lu5yw395g9gzcsq9jf9mghy4rnly5rnkfaqrjwz6rpgrpv6qnjdm7c',
      ),
    ).toBe('71f34948c56e77c3b47c6eb501075aea549cdfb0aa8203e0402db92c04b46199')
  })

  it('hashes a witness v0 output as OP_0', () => {
    expect(bdkEsploraScripthashHex('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe(
      '8838f796bf4970b148779c05b74b8c49515b322d04035f7faa5d9b2375df2396',
    )
  })
})
