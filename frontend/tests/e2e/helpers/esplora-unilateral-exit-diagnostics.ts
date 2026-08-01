import type { Page } from '@playwright/test'
import type { E2eUnilateralExitDebugSnapshot } from '@/lib/arkade/e2e/e2e-arkade-regtest-control'
import {
  fetchEsploraChainTipHeight,
  fetchEsploraTxDiagnosticReport,
  formatEsploraTxDiagnosticReport,
} from '@/lib/wallet/esplora-tx-diagnostics'
import { ESPLORA_URL } from './regtest'

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

function formatWalletSnapshot(snapshot: E2eUnilateralExitDebugSnapshot): string {
  const lines = [
    `network_mode=${snapshot.networkMode}`,
    `esplora_url=${snapshot.esploraUrl}`,
    `wallet.status=${snapshot.walletStatus}`,
    `arkade.load_phase=${snapshot.arkadeLoadPhase}`,
    `arkade.load_error=${snapshot.arkadeLoadError ?? 'null'}`,
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
  ]

  if (snapshot.progress != null) {
    lines.push(
      `progress.phase=${snapshot.progress.phase}`,
      `progress.step=${snapshot.progress.stepIndex + 1}/${snapshot.progress.totalSteps}`,
      `progress.waiting_since=${snapshot.progress.currentStepWaitingSince ?? 'null'}`,
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
  const snapshot = await readUnilateralExitDebugSnapshotFromPage(page)
  const sections: string[] = ['=== Unilateral exit debug snapshot ===']

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
