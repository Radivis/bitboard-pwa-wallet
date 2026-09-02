import type { Page, TestInfo } from '@playwright/test'
import type { E2eUnilateralExitDebugSnapshot } from '@/lib/arkade/e2e/e2e-arkade-regtest-control'
import {
  fetchEsploraChainTipHeight,
  fetchEsploraTxDiagnosticReport,
  formatEsploraTxDiagnosticReport,
} from '@/lib/wallet/esplora-tx-diagnostics'
import { ESPLORA_URL } from './regtest'

const CONTROL_PAGE_UI_PROBES = [
  { testId: 'unilateral-exit-tree-graph', label: 'tree_graph' },
  { testId: 'unilateral-exit-tree-idle', label: 'tree_idle' },
  { testId: 'unilateral-exit-tree-error', label: 'tree_error' },
  { testId: 'unilateral-exit-tree-refresh-error', label: 'tree_refresh_error' },
  { testId: 'unilateral-exit-automation-paused', label: 'automation_paused' },
  { testId: 'unilateral-exit-step-progress', label: 'step_progress' },
  { testId: 'unilateral-exit-proceed', label: 'proceed_button' },
] as const

async function readUnilateralExitDebugSnapshotFromPage(
  page: Page,
): Promise<E2eUnilateralExitDebugSnapshot | null> {
  return page.evaluate(async () => {
    const exportFn = window.__e2eExportUnilateralExitDebugSnapshot
    if (exportFn == null) {
      return null
    }
    return exportFn()
  })
}

async function formatControlPageUiState(page: Page): Promise<string> {
  const lines = [`page.url=${page.url()}`]

  for (const probe of CONTROL_PAGE_UI_PROBES) {
    const locator = page.getByTestId(probe.testId)
    const visible = await locator.isVisible().catch(() => false)
    lines.push(`ui.${probe.label}=${visible ? 'visible' : 'hidden'}`)
    if (!visible) {
      continue
    }
    const text = (await locator.textContent())?.replace(/\s+/g, ' ').trim()
    if (text != null && text.length > 0) {
      lines.push(`ui.${probe.label}_text=${text.slice(0, 240)}`)
    }
    if (probe.testId === 'unilateral-exit-step-progress') {
      const stepIndex = await locator.getAttribute('data-step-index')
      const totalSteps = await locator.getAttribute('data-total-steps')
      const progressPhase = await locator.getAttribute('data-progress-phase')
      lines.push(
        `ui.step_progress_signature=step:${stepIndex ?? '?'}/${totalSteps ?? '?'}:${progressPhase ?? 'unknown'}`,
      )
    }
  }

  return lines.join('\n')
}

function formatWalletSnapshot(snapshot: E2eUnilateralExitDebugSnapshot): string {
  const lines = [
    `network_mode=${snapshot.networkMode}`,
    `esplora_url=${snapshot.esploraUrl}`,
    `wallet.status=${snapshot.walletStatus}`,
    `arkade.load_phase=${snapshot.arkadeLoadPhase}`,
    `arkade.load_error=${snapshot.arkadeLoadError ?? 'null'}`,
    `machine.state=${snapshot.machineState}`,
    `control.selected_leaves=${snapshot.controlStore.selectedLeafOutpoints.length}`,
    `lifecycle.phase=${snapshot.lifecycle.phase}`,
    `lifecycle.wallet_scope=${snapshot.lifecycle.walletScope != null ? 'set' : 'null'}`,
    `lifecycle.selected_leaves=${snapshot.lifecycle.selectedLeafOutpoints.length}`,
    `lifecycle.last_error=${snapshot.lifecycle.lastErrorMessage ?? 'null'}`,
    `automation.enabled=${snapshot.automation.enabled}`,
    `automation.paused_reason=${snapshot.automation.pausedReason ?? 'null'}`,
    `automation.last_error=${snapshot.automation.lastErrorMessage ?? 'null'}`,
    `automation.scheduling=${snapshot.automation.scheduling}`,
    `persisted.job_active=${snapshot.persistedJob.jobActive}`,
    `persisted.selected_leaves=${snapshot.persistedJob.selectedLeafOutpoints.length}`,
    `exit_candidates.total=${snapshot.exitCandidates.total}`,
    `exit_candidates.startable=${snapshot.exitCandidates.startable}`,
    `exit_candidates.error=${snapshot.exitCandidates.error ?? 'null'}`,
    `topology.error=${snapshot.topologyError ?? 'null'}`,
  ]

  if (snapshot.progress != null) {
    lines.push(
      `progress.phase=${snapshot.progress.phase}`,
      `progress.step=${snapshot.progress.stepIndex + 1}/${snapshot.progress.totalSteps}`,
      `progress.waiting_since=${snapshot.progress.currentStepWaitingSince ?? 'null'}`,
      `progress.step_relayed=${snapshot.progress.currentStepTxRelayed}`,
    )
    for (const [index, node] of snapshot.progress.nodeStatuses.entries()) {
      lines.push(
        `progress.node[${index}] txid=${node.txid} status=${node.status} confirmations=${node.confirmations}`,
      )
    }
  } else {
    lines.push(`progress=null error=${snapshot.progressError ?? 'n/a'}`)
  }

  if (snapshot.batchEstimate != null) {
    lines.push(
      `batch.projected_steps=${snapshot.batchEstimate.projectedUnrollSteps}`,
      `batch.bumper_sufficient=${snapshot.batchEstimate.bumperSufficient}`,
    )
  } else {
    lines.push(`batch=null error=${snapshot.batchEstimateError ?? 'n/a'}`)
  }

  if (snapshot.exitBranchTxids.length > 0) {
    lines.push(`topology.exit_branch_txids=${snapshot.exitBranchTxids.join(',')}`)
  }

  return lines.join('\n')
}

/**
 * Collect WASM progress + Esplora endpoint probes for the current unilateral-exit branch.
 * Logs to Playwright stdout and returns the formatted report for error messages.
 */
export async function dumpUnilateralExitEsploraDiagnostics(page: Page): Promise<string> {
  const sections: string[] = ['=== Unilateral exit debug snapshot ===']

  sections.push('=== Control page UI ===')
  try {
    sections.push(await formatControlPageUiState(page))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    sections.push(`(failed to read control page UI: ${detail})`)
  }

  const snapshot = await readUnilateralExitDebugSnapshotFromPage(page)
  if (snapshot == null) {
    sections.push(
      'Browser snapshot unavailable (__e2eExportUnilateralExitDebugSnapshot missing — requires DEV + VITE_E2E_ARKADE_REGTEST).',
    )
  } else {
    sections.push(formatWalletSnapshot(snapshot))
  }

  const esploraUrl = snapshot?.esploraUrl ?? ESPLORA_URL
  const tipHeight = await fetchEsploraChainTipHeight(esploraUrl)
  sections.push(`esplora.chain_tip_height=${tipHeight ?? 'unknown'}`)

  const txids = new Set<string>()
  snapshot?.exitBranchTxids.forEach((txid) => txids.add(txid))
  snapshot?.progress?.nodeStatuses.forEach((node) => txids.add(node.txid))

  if (txids.size === 0) {
    sections.push('No branch txids available for Esplora probes.')
  } else {
    sections.push('=== Esplora tx probes ===')
    for (const txid of txids) {
      const report = await fetchEsploraTxDiagnosticReport(esploraUrl, txid, tipHeight)
      sections.push(formatEsploraTxDiagnosticReport(report))
      sections.push('---')
    }
  }

  const formatted = sections.join('\n')
  console.log(formatted)
  return formatted
}

export async function formatUnilateralExitFailure(
  page: Page,
  message: string,
): Promise<string> {
  try {
    const diagnostics = await dumpUnilateralExitEsploraDiagnostics(page)
    return `${message}\n\n${diagnostics}`
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return `${message}\n\n(failed to collect Esplora diagnostics: ${detail})`
  }
}

/** Attach diagnostics to the Playwright report and stdout when a test fails. */
export async function attachUnilateralExitDiagnosticsOnTestFailure(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  if (testInfo.error == null) {
    return
  }

  try {
    const diagnostics = await dumpUnilateralExitEsploraDiagnostics(page)
    await testInfo.attach('unilateral-exit-diagnostics.txt', {
      body: diagnostics,
      contentType: 'text/plain',
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.log(`Failed to attach unilateral exit diagnostics: ${detail}`)
  }
}
