import type { ArkadeVtxoExitRecordDto } from '@/workers/arkade-api'
import { getArkadeWorker } from '@/workers/arkade-factory'

type VtxoExitHydrateSender = (records: ArkadeVtxoExitRecordDto[]) => void

let sendHydrateRecords: VtxoExitHydrateSender | null = null

export function registerVtxoExitHydrateSender(send: VtxoExitHydrateSender): void {
  sendHydrateRecords = send
}

export function resetVtxoExitHydrateSenderForTests(): void {
  sendHydrateRecords = null
}

export async function hydrateVtxoExitChildrenFromWasm(): Promise<void> {
  try {
    const records = await getArkadeWorker().listVtxoExitRecords()
    sendHydrateRecords?.(records)
  } catch {
    // Dump is best-effort; the next load, sync, proceed, progress, list, or complete retries.
  }
}
