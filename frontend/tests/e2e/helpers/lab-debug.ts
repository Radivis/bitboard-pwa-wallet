import type { Page } from '@playwright/test'

/**
 * Turn on [lab-pipeline] console logs for one browser context.
 * Use in a test's beforeEach or at the start of a failing test:
 *
 *   await enableLabPipelineDebug(page)
 *   page.on('console', (m) => { if (m.text().includes('[lab-pipeline]')) console.log(m.text()) })
 *
 * Then run headed or read CI logs — compare mineBlocks:workerReturned.totalSats vs afterApply.
 */
export async function enableLabPipelineDebug(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('bitboard_lab_debug', '1')
  })
}
