import { E2E_DEV_SERVER_ORIGIN } from '../e2e-dev-server'
import { type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import {
  E2E_ARKADE_MOCK_PARTITION_COOKIE,
  E2E_ARKADE_MOCK_PARTITION_HEADER,
} from '@/lib/arkade/e2e/arkade-operator-mock-state'

export function buildArkadeMockPartitionId(testInfo: TestInfo): string {
  return `w${testInfo.workerIndex}-p${testInfo.parallelIndex}-${testInfo.testId}`
}

/**
 * Isolates Vite middleware mock state per Playwright test.
 *
 * Arkade operator traffic is fetched from the WASM web worker, which does not pass through
 * Playwright `page.route`. Same-origin cookies are included on worker fetch and are read by
 * the mock handler; the optional route adds the partition header for any main-thread calls.
 */
export async function installArkadeMockIsolation(
  context: BrowserContext,
  page: Page,
  partitionId: string,
): Promise<void> {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? E2E_DEV_SERVER_ORIGIN
  const cookieDomain = new URL(baseUrl).hostname

  await context.addCookies([
    {
      name: E2E_ARKADE_MOCK_PARTITION_COOKIE,
      value: partitionId,
      domain: cookieDomain,
      path: '/',
    },
  ])

  await page.route('**/api/arkade/operator/**', async (route) => {
    const requestHeaders = route.request().headers()
    await route.continue({
      headers: {
        ...requestHeaders,
        [E2E_ARKADE_MOCK_PARTITION_HEADER]: partitionId,
      },
    })
  })
}
