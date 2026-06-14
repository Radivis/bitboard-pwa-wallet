import { test, expect, type Page } from '@playwright/test'
import { bech32 } from '@scure/base'
import { createWalletViaUI } from './helpers/wallet-setup'
import { goToWalletTab } from './helpers/wallet-nav'
import {
  openSettingsFeaturesTab,
  waitForSettingsNetworkModeButtonSelected,
  waitForSettingsNetworkSwitchComplete,
} from './helpers/settings-waits'

const E2E_NWC_CONNECTION_STRING = 'nostr+walletconnect://e2e-mock'
const E2E_NWC_LABEL = 'E2E LNURL Wallet'

const LNURL_PAY_HTTPS_URL = 'https://e2e-lnurl.test/.well-known/lnurlp/user'
const LNURL_CALLBACK_URL = 'https://e2e-lnurl.test/lnurl/callback'
const SIGNET_BOLT11_STUB =
  'lntbs1lnurle2etestinvoiceplaceholderxxxxxxxxxxxxxxxxxxxxxxxx'

function encodeLnurlForUrl(url: string): string {
  const words = bech32.toWords(new TextEncoder().encode(url))
  return bech32.encode('lnurl', words, 2000)
}

const LNURL_BECH32 = encodeLnurlForUrl(LNURL_PAY_HTTPS_URL)

async function switchToSignetWithLightning(page: Page) {
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Signet' }).click()
  await waitForSettingsNetworkSwitchComplete(page)
  await waitForSettingsNetworkModeButtonSelected(page, 'Signet')

  await openSettingsFeaturesTab(page)
  const lightningToggle = page.getByRole('switch', {
    name: 'Enable Lightning Network',
  })
  if ((await lightningToggle.getAttribute('aria-checked')) !== 'true') {
    await lightningToggle.click()
    await expect(lightningToggle).toHaveAttribute('aria-checked', 'true')
  }
}

async function setE2eNwcBalanceSats(page: Page, balanceSats: number) {
  await page.waitForFunction(() => typeof window.__E2E_NWC__ !== 'undefined')
  await page.evaluate((balance) => {
    window.__E2E_NWC__?.setBalanceSats(balance)
  }, balanceSats)
}

async function connectE2eNwcWallet(page: Page) {
  await goToWalletTab(page, 'Management')
  await expect(page.getByRole('heading', { name: 'Management' })).toBeVisible()
  await page.getByRole('button', { name: 'Connect Lightning Wallet' }).click()
  await page.getByLabel('NWC Connection String').fill(E2E_NWC_CONNECTION_STRING)
  await page.getByRole('button', { name: 'Test Connection' }).click()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
    timeout: 15_000,
  })
  await page.locator('#ln-wallet-label').fill(E2E_NWC_LABEL)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(E2E_NWC_LABEL)).toBeVisible()
  await setE2eNwcBalanceSats(page, 1_000_000)
}

function registerLnurlPayRoutes(
  page: Page,
  payJson: Record<string, unknown>,
) {
  return page.route('https://e2e-lnurl.test/**', async (route) => {
    const url = route.request().url()
    if (url === LNURL_PAY_HTTPS_URL) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payJson),
      })
      return
    }
    if (url.startsWith(LNURL_CALLBACK_URL)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pr: SIGNET_BOLT11_STUB }),
      })
      return
    }
    await route.continue()
  })
}

function registerLnurlProxyFallbackRoutes(
  page: Page,
  payJson: Record<string, unknown>,
) {
  return Promise.all([
    page.route('https://e2e-lnurl.test/**', (route) =>
      route.abort('failed'),
    ),
    page.route('**/api/lnurl/fetch**', async (route) => {
      const proxyUrl = new URL(route.request().url())
      const upstreamUrl = proxyUrl.searchParams.get('url')
      if (upstreamUrl === LNURL_PAY_HTTPS_URL) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payJson),
        })
        return
      }
      if (upstreamUrl?.startsWith(LNURL_CALLBACK_URL)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ pr: SIGNET_BOLT11_STUB }),
        })
        return
      }
      await route.fulfill({ status: 404, body: 'not found' })
    }),
  ])
}

const LNURLP_RECIPIENT = `lnurlp://${LNURL_PAY_HTTPS_URL.slice('https://'.length)}`

async function waitForSendLightningPayReady(page: Page) {
  await expect(
    page.getByRole('heading', { name: 'Send Lightning' }),
  ).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Loading balance…')).not.toBeVisible({
    timeout: 15_000,
  })
}

test.describe('LNURL pay send @nwc', () => {
  test.beforeEach(async () => {
    test.skip(
      process.env.VITE_E2E_NWC_MOCK !== 'true',
      'Run with VITE_E2E_NWC_MOCK=true (npm run test:e2e:nwc).',
    )
    test.setTimeout(120_000)
  })

  test('pays via LNURL-pay resolve flow', async ({ page }) => {
    await registerLnurlPayRoutes(page, {
      tag: 'payRequest',
      callback: LNURL_CALLBACK_URL,
      minSendable: 1_000,
      maxSendable: 1_000_000_000,
      metadata: '[["text/plain","E2E LNURL"]]',
    })

    await createWalletViaUI(page)
    await switchToSignetWithLightning(page)
    await connectE2eNwcWallet(page)

    await goToWalletTab(page, 'Dashboard')
    await goToWalletTab(page, 'Send')
    await page.locator('#recipient-address').fill(LNURLP_RECIPIENT)
    await page.getByLabel('Unit for amount entry').selectOption('sat')
    await page.locator('#send-amount').fill('1000')
    await waitForSendLightningPayReady(page)
    const payButton = page.getByRole('button', { name: /pay with lightning/i })
    await expect(payButton).toBeEnabled({ timeout: 15_000 })
    await payButton.click()

    await expect(page.getByText('Lightning payment sent!')).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('pays via LNURL-pay when direct fetch is blocked and proxy is used', async ({
    page,
  }) => {
    await registerLnurlProxyFallbackRoutes(page, {
      tag: 'payRequest',
      callback: LNURL_CALLBACK_URL,
      minSendable: 1_000,
      maxSendable: 1_000_000_000,
      metadata: '[["text/plain","E2E LNURL proxy"]]',
    })

    await createWalletViaUI(page)
    await switchToSignetWithLightning(page)
    await connectE2eNwcWallet(page)

    await goToWalletTab(page, 'Dashboard')
    await goToWalletTab(page, 'Send')
    await page.locator('#recipient-address').fill(LNURLP_RECIPIENT)
    await page.getByLabel('Unit for amount entry').selectOption('sat')
    await page.locator('#send-amount').fill('1000')
    await waitForSendLightningPayReady(page)
    const payButton = page.getByRole('button', { name: /pay with lightning/i })
    await expect(payButton).toBeEnabled({ timeout: 15_000 })
    await payButton.click()

    await expect(page.getByText('Lightning payment sent!')).toBeVisible({
      timeout: 20_000,
    })
  })

  test('shows error for unsupported LNURL withdraw', async ({ page }) => {
    await registerLnurlPayRoutes(page, {
      tag: 'withdrawRequest',
      callback: LNURL_CALLBACK_URL,
      minWithdrawable: 1_000,
      maxWithdrawable: 1_000_000,
    })

    await createWalletViaUI(page)
    await switchToSignetWithLightning(page)
    await connectE2eNwcWallet(page)

    await goToWalletTab(page, 'Dashboard')
    await goToWalletTab(page, 'Send')
    await page.locator('#recipient-address').fill(`lightning:${LNURL_BECH32}`)
    await page.getByLabel('Unit for amount entry').selectOption('sat')
    await page.locator('#send-amount').fill('1000')
    await waitForSendLightningPayReady(page)
    const payButton = page.getByRole('button', { name: /pay with lightning/i })
    await expect(payButton).toBeEnabled({ timeout: 15_000 })
    await payButton.click()

    await expect(
      page.getByText(
        'LNURL withdraw is not supported. Use a BOLT11 invoice or Lightning address.',
      ),
    ).toBeVisible({ timeout: 15_000 })
  })
})
