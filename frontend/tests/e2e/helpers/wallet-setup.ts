import { type Page, expect } from '@playwright/test'
import { TEST_MNEMONIC_12 } from '@/test-utils/test-providers'

export const TEST_MNEMONIC = TEST_MNEMONIC_12

export const TEST_PASSWORD = 'TestP@ssword123'

export async function createWalletViaUI(page: Page) {
  await page.goto('/setup')
  await page.getByRole('button', { name: 'Create New Wallet' }).click()

  await expect(page.getByText('Step 1 of 4')).toBeVisible()
  await page.getByRole('button', { name: 'Generate Mnemonic' }).click()

  await expect(page.getByText('Step 2 of 4')).toBeVisible({ timeout: 15000 })

  const wordSpans = page.locator('.font-mono.text-sm')
  await expect(wordSpans.first()).toBeVisible()
  const words: string[] = []
  const count = await wordSpans.count()
  for (let i = 0; i < count; i++) {
    const text = await wordSpans.nth(i).textContent()
    if (text) words.push(text.trim())
  }

  await page.getByRole('button', { name: "I've Written It Down" }).click()
  await expect(page.getByText('Step 3 of 4')).toBeVisible()

  const inputs = page.getByPlaceholder(/Enter word #/)
  const inputCount = await inputs.count()
  for (let i = 0; i < inputCount; i++) {
    const placeholder = await inputs.nth(i).getAttribute('placeholder')
    const wordNum = parseInt(placeholder!.replace('Enter word #', ''))
    await inputs.nth(i).fill(words[wordNum - 1])
  }

  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Step 4 of 4')).toBeVisible()

  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
  await page.getByLabel('Confirm Password', { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Create Wallet' }).click()

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

  await page.getByLabel('Seed Phrase').fill(mnemonic)
  await expect(page.getByText('Valid mnemonic')).toBeVisible({ timeout: 10000 })

  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm Password', { exact: true }).fill(password)
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
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
    timeout: 30000,
  })
}
