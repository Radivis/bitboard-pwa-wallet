import { type Page, expect } from '@playwright/test'
import { TEST_MNEMONIC_12 } from '@/test-utils/test-providers'

export const TEST_MNEMONIC = TEST_MNEMONIC_12

export const TEST_PASSWORD = 'TestP@ssword123'

/** First-run blocking dialog on /setup/create and /setup/import when no wallets exist and no session password. */
export async function dismissSetAppPasswordModalIfPresent(page: Page, password: string) {
  const heading = page.getByRole('heading', { name: 'Set Bitboard app password' })
  try {
    await heading.waitFor({ state: 'visible', timeout: 8000 })
  } catch {
    return
  }
  await page.locator('#app-password').fill(password)
  await page.locator('#app-confirm-password').fill(password)
  await page.getByRole('button', { name: 'Continue' }).click()
}

export async function createWalletViaUI(page: Page) {
  await page.goto('/setup')
  await page.getByRole('button', { name: 'Create New Wallet' }).click()

  await dismissSetAppPasswordModalIfPresent(page, TEST_PASSWORD)

  await expect(page.getByText('Step 1 of 3')).toBeVisible()
  const generateButton = page.getByRole('button', { name: 'Generate & Continue' })
  await expect(generateButton).toBeEnabled()
  await generateButton.click()

  await expect(page.getByText('Step 2 of 3')).toBeVisible({ timeout: 30000 })

  const wordSpans = page.locator('.font-mono.text-sm')
  await expect(wordSpans.first()).toBeVisible()
  const words: string[] = []
  const count = await wordSpans.count()
  for (let i = 0; i < count; i++) {
    const text = await wordSpans.nth(i).textContent()
    if (text) words.push(text.trim())
  }

  await page.getByRole('button', { name: "I've Written It Down" }).click()
  await expect(page.getByText('Step 3 of 3')).toBeVisible()

  const inputs = page.getByPlaceholder(/Enter word #/)
  const inputCount = await inputs.count()
  for (let i = 0; i < inputCount; i++) {
    const placeholder = await inputs.nth(i).getAttribute('placeholder')
    const wordNum = parseInt(placeholder!.replace('Enter word #', ''))
    await inputs.nth(i).fill(words[wordNum - 1])
  }

  await page.getByRole('button', { name: 'Confirm & Finish' }).click()

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
    timeout: 30000,
  })
}

export async function importWalletViaUI(
  page: Page,
  mnemonic: string = TEST_MNEMONIC,
  password: string = TEST_PASSWORD,
) {
  await page.goto('/setup')
  await page.getByRole('button', { name: 'Import Wallet' }).click()

  await dismissSetAppPasswordModalIfPresent(page, password)

  await page.getByLabel('Seed Phrase').fill(mnemonic)
  await expect(page.getByText('Valid mnemonic')).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: 'Restore Wallet' }).click()

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
    timeout: 60000,
  })
}

export async function unlockWalletViaUI(
  page: Page,
  password: string = TEST_PASSWORD,
) {
  await expect(page.getByText('Unlock Wallet')).toBeVisible({ timeout: 10000 })
  await page.getByLabel('Bitboard app password').fill(password)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
    timeout: 60000,
  })
}
