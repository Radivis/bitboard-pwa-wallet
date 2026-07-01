import { expect, type Page } from '@playwright/test'
import { onChainSpendableSatsFromSendPageAvailableText } from './onchain-spendable-balance-text'

async function readSendPageAvailableSectionText(page: Page): Promise<string> {
  const availableRow = page.locator('div').filter({ hasText: /^Available:/ }).first()
  if (!(await availableRow.isVisible().catch(() => false))) {
    return ''
  }
  return (await availableRow.innerText()) ?? ''
}

/** Strict: dashboard must already show spendable balance; no dashboard re-sync retries. */
export async function assertSendPageSpendableOnChainBalance(
  page: Page,
  minSats: number,
): Promise<void> {
  const availableText = await readSendPageAvailableSectionText(page)
  const availableSats = onChainSpendableSatsFromSendPageAvailableText(availableText)
  if (availableSats >= minSats) {
    return
  }

  throw new Error(
    [
      'Send page Available balance is below the required spendable threshold.',
      `Parsed Available sats: ${availableSats}`,
      `Required sats: ${minSats}`,
      'Raw Available row:',
      availableText.trim() || '(empty)',
      'If the dashboard already showed spendable balance, the send form may not reflect wallet store state.',
    ].join('\n'),
  )
}

export async function waitForSendReviewTransactionButtonEnabled(
  page: Page,
  timeoutMs = 45_000,
): Promise<void> {
  await expect(page.getByRole('button', { name: 'Review Transaction' })).toBeEnabled({
    timeout: timeoutMs,
  })
}
