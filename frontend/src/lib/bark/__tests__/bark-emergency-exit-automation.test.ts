import { describe, expect, it, vi } from 'vitest'
import {
  shouldProgressBarkEmergencyExitOnTip,
  watchBarkEmergencyExitTips,
  type BarkEmergencyExitAutomationGate,
  type BarkEmergencyExitTip,
} from '@/lib/bark/bark-emergency-exit-automation'

const tipAtTen: BarkEmergencyExitTip = {
  height: 10,
  hash: 'a'.repeat(64),
}

const tipAtEleven: BarkEmergencyExitTip = {
  height: 11,
  hash: 'b'.repeat(64),
}

function openGate(
  overrides: Partial<BarkEmergencyExitAutomationGate> = {},
): BarkEmergencyExitAutomationGate {
  return {
    proceedAutomatically: true,
    walletUnlocked: true,
    sameWallet: true,
    sameNetwork: true,
    sessionLoaded: true,
    exitCount: 1,
    previousTip: tipAtTen,
    nextTip: tipAtEleven,
    justBecameActive: false,
    ...overrides,
  }
}

describe('shouldProgressBarkEmergencyExitOnTip', () => {
  it('progresses when the tip height or hash changes', () => {
    expect(shouldProgressBarkEmergencyExitOnTip(openGate())).toBe(true)
    expect(
      shouldProgressBarkEmergencyExitOnTip(
        openGate({
          nextTip: { height: tipAtTen.height, hash: 'c'.repeat(64) },
        }),
      ),
    ).toBe(true)
  })

  it('does not progress when the tip is unchanged', () => {
    expect(
      shouldProgressBarkEmergencyExitOnTip(openGate({ nextTip: tipAtTen })),
    ).toBe(false)
  })

  it('progresses on the same tip when automation just became active', () => {
    expect(
      shouldProgressBarkEmergencyExitOnTip(
        openGate({ nextTip: tipAtTen, justBecameActive: true }),
      ),
    ).toBe(true)
  })

  it('does not progress while locked, on another network, for another wallet, or with the switch off', () => {
    expect(shouldProgressBarkEmergencyExitOnTip(openGate({ walletUnlocked: false }))).toBe(false)
    expect(shouldProgressBarkEmergencyExitOnTip(openGate({ sameNetwork: false }))).toBe(false)
    expect(shouldProgressBarkEmergencyExitOnTip(openGate({ sameWallet: false }))).toBe(false)
    expect(shouldProgressBarkEmergencyExitOnTip(openGate({ proceedAutomatically: false }))).toBe(
      false,
    )
    expect(shouldProgressBarkEmergencyExitOnTip(openGate({ sessionLoaded: false }))).toBe(false)
  })

  it('does not progress when no emergency exit is listed', () => {
    expect(shouldProgressBarkEmergencyExitOnTip(openGate({ exitCount: 0 }))).toBe(false)
  })

  it('does not progress when the tip cannot be read and automation is already watching that tip', () => {
    expect(
      shouldProgressBarkEmergencyExitOnTip(openGate({ nextTip: null, justBecameActive: false })),
    ).toBe(false)
  })

  it('progresses without a tip when automation just became active', () => {
    expect(
      shouldProgressBarkEmergencyExitOnTip(openGate({ nextTip: null, justBecameActive: true })),
    ).toBe(true)
  })
})

describe('watchBarkEmergencyExitTips', () => {
  it('progresses once when automation becomes active and again only after the tip changes', async () => {
    const tips = [tipAtTen, tipAtTen, tipAtEleven]
    let tipIndex = 0
    let waits = 0
    const progress = vi.fn(async () => undefined)
    const controller = new AbortController()

    await watchBarkEmergencyExitTips({
      signal: controller.signal,
      readGate: async () => ({
        proceedAutomatically: true,
        walletUnlocked: true,
        sameWallet: true,
        sameNetwork: true,
        sessionLoaded: true,
      }),
      fetchTip: async () => tips[Math.min(tipIndex, tips.length - 1)]!,
      listExitCount: async () => 1,
      progress,
      wait: async () => {
        waits += 1
        tipIndex += 1
        if (waits >= 3) controller.abort()
      },
    })

    expect(progress).toHaveBeenCalledTimes(2)
  })

  it('refreshes the exit list before it progresses', async () => {
    const events: string[] = []
    let waits = 0
    const controller = new AbortController()

    await watchBarkEmergencyExitTips({
      signal: controller.signal,
      readGate: async () => ({
        proceedAutomatically: true,
        walletUnlocked: true,
        sameWallet: true,
        sameNetwork: true,
        sessionLoaded: true,
      }),
      fetchTip: async () => tipAtTen,
      listExitCount: async () => 1,
      onListed: async () => {
        events.push('listed')
      },
      progress: async () => {
        events.push('progress')
      },
      wait: async () => {
        waits += 1
        if (waits >= 1) controller.abort()
      },
    })

    expect(events).toEqual(['listed', 'progress'])
  })

  it('progresses when automation becomes active even if the first tip read fails', async () => {
    let fetches = 0
    let waits = 0
    const progress = vi.fn(async () => undefined)
    const onProgressError = vi.fn()
    const controller = new AbortController()

    await watchBarkEmergencyExitTips({
      signal: controller.signal,
      readGate: async () => ({
        proceedAutomatically: true,
        walletUnlocked: true,
        sameWallet: true,
        sameNetwork: true,
        sessionLoaded: true,
      }),
      fetchTip: async () => {
        fetches += 1
        if (fetches === 1) throw new Error('esplora down')
        return tipAtTen
      },
      listExitCount: async () => 1,
      progress,
      onProgressError,
      wait: async () => {
        waits += 1
        if (waits >= 2) controller.abort()
      },
    })

    expect(progress).toHaveBeenCalledTimes(1)
    expect(onProgressError).not.toHaveBeenCalled()
  })

  it('reports a progress failure and retries while automation is still becoming active', async () => {
    let waits = 0
    let attempts = 0
    const onProgressError = vi.fn()
    const controller = new AbortController()

    await watchBarkEmergencyExitTips({
      signal: controller.signal,
      readGate: async () => ({
        proceedAutomatically: true,
        walletUnlocked: true,
        sameWallet: true,
        sameNetwork: true,
        sessionLoaded: true,
      }),
      fetchTip: async () => tipAtTen,
      listExitCount: async () => 1,
      progress: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('broadcast failed')
      },
      onProgressError,
      wait: async () => {
        waits += 1
        if (waits >= 2) controller.abort()
      },
    })

    expect(onProgressError).toHaveBeenCalledTimes(1)
    expect(attempts).toBe(2)
  })
})
