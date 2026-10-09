import { waitForArkadeRegtestHealthy } from '../../../../scripts/arkade-regtest-health.mjs'
import { waitForBarkRegtestHealthy } from '../../../../scripts/bark-regtest-health.mjs'

export default async function globalSetup(): Promise<void> {
  if (process.env.REQUIRE_ARKADE_REGTEST === '1') {
    console.log(
      '[e2e globalSetup] waiting for arkade-regtest Docker (Esplora :7030/api + arkd :7070)…',
    )
    await waitForArkadeRegtestHealthy()
    console.log('[e2e globalSetup] arkade-regtest Docker is healthy.')
  }
  if (process.env.REQUIRE_BARK_REGTEST === '1') {
    console.log('[e2e globalSetup] waiting for bark-regtest (captaind :3535 + funded round wallet)…')
    await waitForBarkRegtestHealthy()
    console.log('[e2e globalSetup] bark-regtest is healthy.')
  }
}
