import { type Page, expect } from '@playwright/test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { restartArkadeOperator, rotateRegtestSigner } from './regtest'
import {
  ARKADE_REGTEST_BOARDED_FIXTURE_DEFAULT,
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
import {
  readDashboardArkadeBalanceSats,
  triggerArkadeRailSync,
  waitForArkadeLoadReady,
  exportBoardedWalletSdkPersistenceJson,
} from './dashboard-arkade'
import { goToWalletTab } from './wallet-nav'
import { unlockWalletViaUI } from './wallet-setup'
import { generateMnemonic } from '@scure/bip39'
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js'

const DEFAULT_BOARD_SATS = 200_000

function resolveBoardedFixtureExportPath(): string | undefined {
  const raw = process.env.ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE
  if (raw == null || raw === '') {
    return undefined
  }
  if (raw === '1' || raw === 'true') {
    return path.resolve(process.cwd(), ARKADE_REGTEST_BOARDED_FIXTURE_DEFAULT)
  }
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
}

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

/**
 * Fund and board on the pre-rotation signer, rotate the operator with a future cooperative cutoff,
 * restart arkd, and reload so the wallet reopens with a signer migration hint.
 *
 * When `ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE` is set, writes `{ mnemonic, persistence_before_rotate }`
 * JSON for `bitboard-ark` `cooperative_signer_migration_clears_pending_recovery_due_to_expired_signer_with_boarded_fixture`.
 */
export async function prepareSignerMigrationScenario(page: Page): Promise<number> {
  const boardSats = DEFAULT_BOARD_SATS
  const mnemonic = freshRegtestWalletMnemonic()
  await setupRegtestArkadeWallet(page, mnemonic)
  await fundAndBoardToArkade(page, boardSats)
  const balanceBeforeRotate = await readDashboardArkadeBalanceSats(page)

  const fixtureExportPath = resolveBoardedFixtureExportPath()
  if (fixtureExportPath) {
    await triggerArkadeRailSync(page, 120_000)
    const persistenceBeforeRotate = await exportBoardedWalletSdkPersistenceJson(page)
    await fs.mkdir(path.dirname(fixtureExportPath), { recursive: true })
    await fs.writeFile(
      fixtureExportPath,
      JSON.stringify({ mnemonic, persistence_before_rotate: persistenceBeforeRotate }, null, 2),
      'utf8',
    )
    console.info(`wrote boarded wallet fixture for Rust regtest to ${fixtureExportPath}`)
  }

  await rotateRegtestSigner()
  await restartArkadeOperator()
  await page.reload()
  await page.goto('/wallet')
  await unlockWalletViaUI(page)
  await waitForArkadeLoadReady(page, 120_000)
  await expect(page.getByTestId('arkade-signer-migration-banner')).toBeVisible({
    timeout: 60_000,
  })
  return balanceBeforeRotate
}
