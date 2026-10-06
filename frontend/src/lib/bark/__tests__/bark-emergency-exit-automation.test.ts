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
})
