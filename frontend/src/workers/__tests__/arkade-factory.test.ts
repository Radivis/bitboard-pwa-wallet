import { describe, it, expect, beforeEach } from 'vitest'
import {
  getArkadeWorkerHealthStatus,
  onArkadeWorkerHealthChange,
  terminateArkadeWorker,
  type ArkadeWorkerHealthStatus,
} from '../arkade-factory'

describe('arkade-factory', () => {
  beforeEach(() => {
    terminateArkadeWorker()
  })

  it('getArkadeWorkerHealthStatus returns initializing when no worker created', () => {
    const { status, lastError } = getArkadeWorkerHealthStatus()
    expect(status).toBe('initializing')
    expect(lastError).toBeNull()
  })

  it('onArkadeWorkerHealthChange returns an unsubscribe function', () => {
    const listener = (
      _status: ArkadeWorkerHealthStatus,
      _error: string | null,
    ) => {}
    const unsubscribe = onArkadeWorkerHealthChange(listener)
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })
})
