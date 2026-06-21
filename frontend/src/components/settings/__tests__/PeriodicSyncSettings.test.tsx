import { describe, expect, it, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
// Harness must load before settings components (registers vi.mock for stores).
import {
  featureStoreState,
  periodicSyncStoreState,
  resetSettingsPageTestState,
} from '@/test-utils/settings-page-test-harness'
import { PeriodicSyncSettings } from '@/components/settings/PeriodicSyncSettings'

describe('PeriodicSyncSettings', () => {
  beforeEach(() => {
    resetSettingsPageTestState()
  })
  it('toggles per-rail periodic sync enabled switch', async () => {
    featureStoreState.isPeriodicSyncEnabled = true
    const user = userEvent.setup()
    renderWithProviders(<PeriodicSyncSettings />)

    const onchainSwitch = screen.getByRole('switch', {
      name: 'On-chain periodic sync enabled',
    })
    expect(onchainSwitch).toBeChecked()

    await user.click(onchainSwitch)

    expect(periodicSyncStoreState.setRailPeriodicSyncEnabled).toHaveBeenCalledWith(
      'onchain',
      false,
    )
  })

  it('commits interval on blur', async () => {
    featureStoreState.isPeriodicSyncEnabled = true
    const user = userEvent.setup()
    renderWithProviders(<PeriodicSyncSettings />)

    const intervalInput = screen.getByRole('spinbutton', {
      name: 'On-chain polling interval in seconds',
    })
    await user.clear(intervalInput)
    await user.type(intervalInput, '120')
    await user.tab()

    expect(periodicSyncStoreState.setRailPeriodicSyncIntervalSeconds).toHaveBeenCalledWith(
      'onchain',
      120,
    )
  })
})
