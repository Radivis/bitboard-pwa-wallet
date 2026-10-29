import { test, expect } from '@playwright/test'

test.describe('Exchange guide steps', () => {
  test('walks steps with first/last controls and toggles the nav stepper', async ({ page }) => {
    await page.goto('/guides/how-to-get-bitcoin/exchanges/1')

    await expect(page.getByRole('heading', { name: 'Exchanges Step By Step' })).toBeVisible()
    await expect(page.getByText('Step 1/4')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Exchange Selection' })).toBeVisible()
    await expect(
      page.getByRole('img', { name: 'Comparing crypto exchanges on a laptop' }),
    ).toBeVisible()

    const stepNav = page.locator('#guide-step-nav')
    await expect(stepNav).toBeVisible()
    await expect(page.getByRole('link', { name: 'Next step' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Previous step' })).toHaveCount(0)

    // force: TanStack Router Devtools can sit over the bottom bar outside CI.
    await page.getByRole('link', { name: 'Last step' }).click({ force: true })
    await expect(page).toHaveURL(/\/guides\/how-to-get-bitcoin\/exchanges\/4$/)
    await expect(page.getByText('Step 4/4')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Coin Transfer' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Next step' })).toHaveCount(0)

    await page.getByRole('link', { name: 'First step' }).click({ force: true })
    await expect(page).toHaveURL(/\/guides\/how-to-get-bitcoin\/exchanges\/1$/)
    await expect(page.getByText('Step 1/4')).toBeVisible()

    await page.getByRole('link', { name: 'Next step' }).click({ force: true })
    await expect(page).toHaveURL(/\/guides\/how-to-get-bitcoin\/exchanges\/2$/)
    await expect(page.getByText('Step 2/4')).toBeVisible()

    await page.getByRole('button', { name: 'Hide navigation' }).click({ force: true })
    await expect(page.getByRole('button', { name: 'Show navigation' })).toBeVisible()
    await expect(stepNav).toHaveAttribute('aria-hidden', 'true')

    await page.getByRole('button', { name: 'Show navigation' }).click({ force: true })
    await expect(page.getByRole('button', { name: 'Hide navigation' })).toBeVisible()
    await expect(stepNav).toHaveAttribute('aria-hidden', 'false')
  })
})
