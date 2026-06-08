import { type Page, expect } from '@playwright/test'
import {
  E2E_ARKADE_MOCK_CONTROL_PATH,
  E2E_ARKADE_MOCK_PARTITION_COOKIE,
  E2E_ARKADE_MOCK_PARTITION_HEADER,
  type E2eArkadeMockIncomingPayment,
} from '@/lib/arkade/e2e/arkade-operator-mock-state'

export async function postArkadeMockControl(
  page: Page,
  partitionId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
  const response = await page.request.post(`${baseUrl}${E2E_ARKADE_MOCK_CONTROL_PATH}`, {
    headers: {
      'Content-Type': 'application/json',
      [E2E_ARKADE_MOCK_PARTITION_HEADER]: partitionId,
      Cookie: `${E2E_ARKADE_MOCK_PARTITION_COOKIE}=${partitionId}`,
    },
    data: body,
  })
  expect(response.ok()).toBeTruthy()
}

export async function simulateArkadeIncomingPayment(
  page: Page,
  partitionId: string,
  payment: E2eArkadeMockIncomingPayment,
): Promise<void> {
  await postArkadeMockControl(page, partitionId, {
    action: 'addIncomingPayment',
    payment,
  })
}
