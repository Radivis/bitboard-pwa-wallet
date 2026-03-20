import { describe, it, expect } from 'vitest'
import { runLabOp } from '@/lib/lab-coordinator'

describe('runLabOp', () => {
  it('serializes concurrent ops so the second runs after the first completes', async () => {
    const order: string[] = []
    const first = runLabOp(async () => {
      order.push('a-start')
      await new Promise((r) => setTimeout(r, 40))
      order.push('a-end')
      return 1
    })
    const second = runLabOp(async () => {
      order.push('b-start')
      return 2
    })
    const [r1, r2] = await Promise.all([first, second])
    expect(r1).toBe(1)
    expect(r2).toBe(2)
    expect(order).toEqual(['a-start', 'a-end', 'b-start'])
  })
})
