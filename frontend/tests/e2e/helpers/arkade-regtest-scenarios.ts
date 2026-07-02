import { type Page, expect } from '@playwright/test'
import {
  ARKADE_REGTEST_COMMITMENT_CONFIRM_BLOCKS,
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
import { generateMnemonic } from '@scure/bip39'
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js'

const DEFAULT_BOARD_SATS = 200_000

/**
 * Each serial @arkade-regtest test gets its OWN freshly generated wallet so VTXOs, boarding outputs
 * and cumulative block mining from earlier tests cannot bleed into later ones. Combined with the
 * per-test arkd restart, this gives every test the clean state in which it passes in isolation.
 */
function freshRegtestWalletMnemonic(): string {
  return generateMnemonic(englishWordlist, 128)
}

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
  await setupRegtestArkadeWallet(page, freshRegtestWalletMnemonic())
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

/**
 * Confirm the settlement round's commitment tx so the freshly settled VTXO becomes
 * confirmed/spendable (and thus an exit candidate). Mines only a single block — far below the VTXO
 * tree expiry — so the VTXO stays live, unlike the recoverable scenario which mines past expiry.
 */
async function confirmSettledVtxoAndSync(page: Page): Promise<void> {
  await mineRegtestBlocks(ARKADE_REGTEST_COMMITMENT_CONFIRM_BLOCKS)
  await goToWalletTab(page, 'Dashboard')
  await triggerArkadeRailSync(page)
}

export async function prepareCollaborativeExitScenario(page: Page): Promise<void> {
  await prepareFundedArkadeBalance(page)
  await confirmSettledVtxoAndSync(page)
  await goToArkadeManagementPanel(page)
}

export async function prepareUnilateralUnrollScenario(page: Page): Promise<void> {
  // Unilateral unroll needs a LIVE, confirmed VTXO. The previous
  // `mineRegtestBlocks(RECOVERABLE_MINE_BLOCKS)` call here mined past the VTXO tree expiry, so the
  // operator swept the VTXO before the test could unroll it and arkd rejected it as "not eligible".
  // We instead mine just enough to confirm the settlement commitment (so the VTXO is exit-eligible)
  // while staying well under expiry.
  await prepareFundedArkadeBalance(page)
  await confirmSettledVtxoAndSync(page)
  await goToArkadeManagementPanel(page)
}
