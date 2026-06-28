import { waitForArkadeRegtestHealthy } from '../../../../scripts/arkade-regtest-health.mjs'

export default async function globalSetup(): Promise<void> {
  if (process.env.REQUIRE_ARKADE_REGTEST !== '1') {
    return
  }
  console.log(
    '[e2e globalSetup] waiting for arkade-regtest Docker (Esplora :7030/api + arkd :7070)…',
  )
  await waitForArkadeRegtestHealthy()
  console.log('[e2e globalSetup] arkade-regtest Docker is healthy.')
}
