import { type Page, expect } from '@playwright/test'
import {
  ARKADE_REGTEST_RECOVERABLE_MINE_BLOCKS,
  ARKADE_REGTEST_RENEWAL_SOON_MINE_BLOCKS,
  mineRegtestBlocks,
} from './arkade-regtest'
import {
  fundAndBoardToArkade,
  goToArkadeManagementPanel,
  setupRegtestArkadeWallet,
} from './arkade-management'
import { triggerArkadeRailSync } from './dashboard-arkade'
import { goToWalletTab } from './wallet-nav'
import { TEST_MNEMONIC } from './wallet-setup'

const DEFAULT_BOARD_SATS = 200_000

const RECOVERABLE_BANNER_POLL_TIMEOUT_MS = 300_000

async function waitForRecoverableVtxoBanner(page: Page): Promise<void> {
  await expect(async () => {
    await goToWalletTab(page, 'Dashboard')
    await triggerArkadeRailSync(page, 120_000)
    await goToArkadeManagementPanel(page)
    await expect(page.getByTestId('arkade-recoverable-vtxo-banner')).toBeVisible({
      timeout: 10_000,
    })
  }).toPass({ timeout: RECOVERABLE_BANNER_POLL_TIMEOUT_MS })
}

export async function prepareFundedArkadeBalance(
  page: Page,
  boardSats: number = DEFAULT_BOARD_SATS,
): Promise<void> {
  await setupRegtestArkadeWallet(page, TEST_MNEMONIC)
  await fundAndBoardToArkade(page, boardSats)
}

export async function prepareRecoverableVtxoScenario(page: Page): Promise<void> {
  await prepareFundedArkadeBalance(page)
  await mineRegtestBlocks(ARKADE_REGTEST_RECOVERABLE_MINE_BLOCKS)
  await waitForRecoverableVtxoBanner(page)
}

export async function prepareVtxoRenewalScenario(page: Page): Promise<void> {
  await prepareFundedArkadeBalance(page)
  await mineRegtestBlocks(ARKADE_REGTEST_RENEWAL_SOON_MINE_BLOCKS)
  await goToWalletTab(page, 'Dashboard')
  await triggerArkadeRailSync(page)
  await goToArkadeManagementPanel(page)
}

export async function prepareCollaborativeExitScenario(page: Page): Promise<void> {
  await prepareFundedArkadeBalance(page)
  await goToArkadeManagementPanel(page)
}

export async function prepareUnilateralUnrollScenario(page: Page): Promise<void> {
  await prepareFundedArkadeBalance(page)
  await mineRegtestBlocks(ARKADE_REGTEST_RECOVERABLE_MINE_BLOCKS)
  await goToWalletTab(page, 'Dashboard')
  await triggerArkadeRailSync(page)
  await goToArkadeManagementPanel(page)
}
