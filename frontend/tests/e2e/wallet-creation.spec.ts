import { test, expect } from '@playwright/test'
import { TEST_PASSWORD } from './helpers/wallet-setup'

test.describe('Wallet Creation Flow', () => {
  test('wallet creation full flow', async ({ page }) => {
    await page.goto('/setup')

    await expect(page.getByRole('button', { name: 'Create New Wallet' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import Wallet' })).toBeVisible()

    await page.getByRole('button', { name: 'Create New Wallet' }).click()

    await expect(page.getByText('Step 1 of 4')).toBeVisible()
    await expect(page.getByText('Generate Seed Phrase')).toBeVisible()
    await expect(page.getByRole('button', { name: '12 Words' })).toBeVisible()
    await expect(page.getByRole('button', { name: '24 Words' })).toBeVisible()

    await page.getByRole('button', { name: 'Generate Mnemonic' }).click()

    await expect(page.getByText('Step 2 of 4')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Backup Seed Phrase')).toBeVisible()

    const wordSpans = page.locator('.font-mono.text-sm')
    await expect(wordSpans.first()).toBeVisible()

    const words: string[] = []
    const count = await wordSpans.count()
    for (let i = 0; i < count; i++) {
      const text = await wordSpans.nth(i).textContent()
      if (text) words.push(text.trim())
    }
    expect(words.length).toBeGreaterThanOrEqual(12)

    await page.getByRole('button', { name: "I've Written It Down" }).click()

    await expect(page.getByText('Step 3 of 4')).toBeVisible()
    await expect(page.getByText('Verify Seed Phrase')).toBeVisible()

    const inputs = page.getByPlaceholder(/Enter word #/)
    const inputCount = await inputs.count()
    expect(inputCount).toBe(3)

    for (let i = 0; i < inputCount; i++) {
      const placeholder = await inputs.nth(i).getAttribute('placeholder')
      const wordNum = parseInt(placeholder!.replace('Enter word #', ''))
      await inputs.nth(i).fill(words[wordNum - 1])
    }

    await page.getByRole('button', { name: 'Confirm' }).click()

    await expect(page.getByText('Step 4 of 4')).toBeVisible()
    await expect(page.getByText('Set Password')).toBeVisible()

    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
    await page.getByLabel('Confirm Password', { exact: true }).fill(TEST_PASSWORD)

    await page.getByRole('button', { name: 'Create Wallet' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('Balance')).toBeVisible()
  })
})
