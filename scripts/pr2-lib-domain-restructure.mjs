#!/usr/bin/env node
/**
 * One-off PR-2: move flat frontend/src/lib/*.ts into domain subfolders and update imports.
 * Run from repo root: node scripts/pr2-lib-domain-restructure.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const libRoot = path.join(repoRoot, 'frontend/src/lib')

/** @type {Record<string, string>} basename (no ext) -> domain */
const DOMAIN_BY_BASENAME = {
  // lab
  'lab-backup-constants': 'lab',
  'lab-backup-import': 'lab',
  'lab-chain-query': 'lab',
  'lab-coordinator': 'lab',
  'lab-cross-tab-sync': 'lab',
  'lab-db-owner': 'lab',
  'lab-entity-keys': 'lab',
  'lab-mempool-mine-stats': 'lab',
  'lab-operations': 'lab',
  'lab-owner': 'lab',
  'lab-owner-type': 'lab',
  'lab-paginated-queries': 'lab',
  'lab-pipeline-debug': 'lab',
  'lab-random-limits': 'lab',
  'lab-route-before-load': 'lab',
  'lab-send-submit': 'lab',
  'lab-tx-fee': 'lab',
  'lab-tx-net-moved': 'lab',
  'lab-tx-weight': 'lab',
  'lab-utils': 'lab',
  'lab-worker-operations': 'lab',
  'switch-to-lab-network': 'lab',
  // wallet
  bip21: 'wallet',
  'bitcoin-amount-text-parse': 'wallet',
  'bitcoin-display-unit': 'wallet',
  'bitcoin-dust': 'wallet',
  'bitcoin-unit-query': 'wallet',
  'bitcoin-utils': 'wallet',
  'descriptor-wallet-manager': 'wallet',
  'onchain-balance-display': 'wallet',
  'send-fee-preset-definitions': 'wallet',
  'send-review-summary': 'wallet',
  'settings-switch-wallet': 'wallet',
  'wallet-backup-constants': 'wallet',
  'wallet-backup-import': 'wallet',
  'wallet-cross-tab-sync': 'wallet',
  'wallet-delete-finalize': 'wallet',
  'wallet-domain-types': 'wallet',
  'wallet-lab-ui-copy': 'wallet',
  'wallet-load-query-keys': 'wallet',
  'wallet-query-cache-sync': 'wallet',
  'wallet-related-query-invalidation': 'wallet',
  'wallet-sync-error-toast': 'wallet',
  'wallet-unlocked-status': 'wallet',
  'wallet-utils': 'wallet',
  // lightning
  'lightning-backend-service': 'lightning',
  'lightning-connections-hydration': 'lightning',
  'lightning-connection-utils': 'lightning',
  'lightning-dashboard-sync': 'lightning',
  'lightning-input-limits': 'lightning',
  'lightning-query-timings': 'lightning',
  'lightning-snapshot-payload': 'lightning',
  'lightning-utils': 'lightning',
  'lightning-wallet-secrets': 'lightning',
  'lightning-wallet-snapshot-persistence': 'lightning',
  'nwc-default-connection-label': 'lightning',
  // fiat
  'fiat-amount-to-sats': 'fiat',
  'fiat-provider-currencies': 'fiat',
  'fiat-rate-client': 'fiat',
  'fiat-rate-service-whitelist': 'fiat',
  'fiat-rates-proxy-cors': 'fiat',
  'format-fiat-display': 'fiat',
  'iso-4217-alpha3': 'fiat',
  'is-usable-btc-spot-price-in-fiat': 'fiat',
  'supported-fiat-currencies': 'fiat',
  // esplora
  'esplora-fee-estimates': 'esplora',
  'esplora-full-scan-retry': 'esplora',
  'esplora-service-whitelist': 'esplora',
  'mainnet-onchain-balance-probe': 'esplora',
  // faucet
  'faucet-definitions': 'faucet',
  'faucet-matching': 'faucet',
  // settings
  'execute-settings-address-type-switch': 'settings',
  'network-mode-switch': 'settings',
  'network-switch-status-messages': 'settings',
  'mainnet-access-strict-migration': 'settings',
  'regtest-mode-strict-migration': 'settings',
  'segwit-addresses-strict-migration': 'settings',
  'strict-migration-run': 'settings',
  // shared
  'app-password-policy': 'shared',
  'app-query-client': 'shared',
  'app-router': 'shared',
  'app-session-metadata': 'shared',
  'argon2-ci-env': 'shared',
  'backup-zip-invalid-error': 'shared',
  'bad-local-chain-state-error': 'shared',
  'encrypted-blob-types': 'shared',
  'feature-toggle-async': 'settings',
  'infomode-hint-logic': 'infomode',
  'infomode-primary-action-detect': 'infomode',
  'infomode-suppression-feedback': 'infomode',
  'kdf-phc-constants': 'shared',
  'legal-locale': 'shared',
  'pathname-requires-wallet-crypto-session': 'shared',
  'persisted-store-hydration': 'settings',
  'read-file-as-array-buffer': 'shared',
  'sanitize-error-for-ui': 'shared',
  'tab-scoped-broadcast-channel-sync': 'shared',
  utils: 'shared',
  'validate-proxied-upstream-url': 'shared',
  'wipe-all-app-data-opfs-and-reload': 'shared',
  'zip-single-file-export': 'settings',
  'zip-wallet-backup-export': 'settings',
}

/** @type {Record<string, string>} test basename -> domain */
const TEST_DOMAIN = {
  'app-router.test': 'shared',
  'bad-local-chain-state-error.test': 'shared',
  'bitcoin-amount-text-parse.test': 'wallet',
  'bitcoin-display-unit.test': 'wallet',
  'bitcoin-dust.test': 'wallet',
  'bitcoin-utils.test': 'wallet',
  'descriptor-wallet-manager.test': 'wallet',
  'esplora-fee-estimates.test': 'esplora',
  'esplora-full-scan-retry.test': 'esplora',
  'esplora-service-whitelist.test': 'esplora',
  'faucet-matching.test': 'faucet',
  'fiat-amount-to-sats.test': 'fiat',
  'fiat-provider-currencies.test': 'fiat',
  'fiat-rate-client.test': 'fiat',
  'fiat-rate-service-whitelist.test': 'fiat',
  'fiat-rates-proxy-cors.test': 'fiat',
  'format-fiat-display.test': 'fiat',
  'infomode-hint-logic.test': 'infomode',
  'infomode-primary-action-detect.test': 'infomode',
  'infomode-suppression-feedback.test': 'infomode',
  'isCoinbase.test': 'lab',
  'is-usable-btc-spot-price-in-fiat.test': 'fiat',
  'lab-backup-import.test': 'lab',
  'lab-coordinator.test': 'lab',
  'lab-cross-tab-sync.test': 'lab',
  'lab-mempool-mine-stats.test': 'lab',
  'lab-owner.test': 'lab',
  'lab-tx-fee.test': 'lab',
  'lab-tx-net-moved.test': 'lab',
  'lab-tx-weight.test': 'lab',
  'lab-utils-address-owner.test': 'lab',
  'lab-utils-owner-aria.test': 'lab',
  'lab-worker-operations-random-batch.test': 'lab',
  'lightning-connection-utils.test': 'lightning',
  'lightning-dashboard-sync.test': 'lightning',
  'lightning-payment-display.test': 'lightning',
  'lightning-snapshot-payload.test': 'lightning',
  'lightning-utils-bolt11.test': 'lightning',
  'lightning-utils-nip47-network.test': 'lightning',
  'lightning-wallet-secrets.test': 'lightning',
  'lightning-wallet-snapshot-persistence.test': 'lightning',
  'nwc-backend-service.test': 'lightning',
  'nwc-default-connection-label.test': 'lightning',
  'opfs-capability.test': 'shared',
  'sanitize-error-for-ui.test': 'shared',
  'send-review-summary.test': 'wallet',
  'settings-switch-wallet.test': 'wallet',
  'supported-fiat-currencies.test': 'fiat',
  'tab-scoped-broadcast-channel-sync.test': 'shared',
  'validate-proxied-upstream-url.test': 'shared',
  'wallet-backup-import.test': 'wallet',
  'wallet-cross-tab-sync.test': 'wallet',
  'wallet-domain-types.test': 'wallet',
  'wallet-sync-error-toast.test': 'wallet',
  'wallet-utils-full-rescan-repair.test': 'wallet',
  'zip-single-file-export.test': 'settings',
}

function gitMv(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  execSync(`git mv "${from}" "${to}"`, { cwd: repoRoot, stdio: 'inherit' })
}

function walkTsFiles(dir) {
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'wasm-pkg') continue
      out.push(...walkTsFiles(full))
    } else if (/\.(ts|tsx)$/.test(ent.name)) {
      out.push(full)
    }
  }
  return out
}

console.log('Creating domain directories...')
for (const domain of new Set(Object.values(DOMAIN_BY_BASENAME))) {
  fs.mkdirSync(path.join(libRoot, domain, '__tests__'), { recursive: true })
}

console.log('Moving source files from lib root...')
for (const ent of fs.readdirSync(libRoot, { withFileTypes: true })) {
  if (!ent.isFile() || !/\.(ts|tsx)$/.test(ent.name)) continue
  if (ent.name.endsWith('.test.ts') || ent.name.endsWith('.test.tsx')) {
    continue
  }
  const base = ent.name.replace(/\.(tsx?)$/, '')
  const domain = DOMAIN_BY_BASENAME[base]
  if (!domain) {
    console.error(`No domain mapping for lib/${ent.name}`)
    process.exit(1)
  }
  const from = path.join(libRoot, ent.name)
  const to = path.join(libRoot, domain, ent.name)
  if (!fs.existsSync(from)) continue
  if (fs.existsSync(to)) continue
  gitMv(from, to)
}

console.log('Moving lib/__tests__ files...')
const legacyTests = path.join(libRoot, '__tests__')
for (const ent of fs.readdirSync(legacyTests, { withFileTypes: true })) {
  if (!ent.isFile()) continue
  const domain = TEST_DOMAIN[ent.name.replace(/\.tsx?$/, '')]
  if (!domain) {
    console.error(`No test domain mapping for __tests__/${ent.name}`)
    process.exit(1)
  }
  const from = path.join(legacyTests, ent.name)
  const to = path.join(libRoot, domain, '__tests__', ent.name)
  if (!fs.existsSync(from)) continue
  if (fs.existsSync(to)) continue
  gitMv(from, to)
}

console.log('Moving co-located test at lib root (bip21.test.ts)...')
const bip21TestRoot = path.join(libRoot, 'bip21.test.ts')
if (fs.existsSync(bip21TestRoot)) {
  gitMv(bip21TestRoot, path.join(libRoot, 'wallet', '__tests__', 'bip21.test.ts'))
}

console.log('Moving bip21.test.ts if present at wallet root...')
const bip21Test = path.join(libRoot, 'wallet', 'bip21.test.ts')
if (fs.existsSync(bip21Test)) {
  gitMv(bip21Test, path.join(libRoot, 'wallet', '__tests__', 'bip21.test.ts'))
}

console.log('Updating @/lib/ imports across frontend...')
const frontendSrc = path.join(repoRoot, 'frontend')
const files = walkTsFiles(frontendSrc)

const replacements = Object.entries(DOMAIN_BY_BASENAME)
  .map(([base, domain]) => ({
    from: `@/lib/${base}`,
    to: `@/lib/${domain}/${base}`,
  }))
  .sort((a, b) => b.from.length - a.from.length)

let changedFiles = 0
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8')
  let changed = false
  for (const { from, to } of replacements) {
    if (content.includes(from)) {
      content = content.split(from).join(to)
      changed = true
    }
  }
  if (changed) {
    fs.writeFileSync(file, content)
    changedFiles++
  }
}

console.log(`Updated imports in ${changedFiles} files.`)

console.log('Fixing cross-domain relative imports in moved tests...')
const crossDomainFixes = [
  [
    path.join(libRoot, 'fiat/__tests__/fiat-amount-to-sats.test.ts'),
    ["from '../bitcoin-utils'", "from '@/lib/wallet/bitcoin-utils'"],
  ],
  [
    path.join(libRoot, 'lightning/__tests__/nwc-backend-service.test.ts'),
    ["from '../bitcoin-utils'", "from '@/lib/wallet/bitcoin-utils'"],
  ],
]
for (const [file, [oldImp, newImp]] of crossDomainFixes) {
  if (!fs.existsSync(file)) continue
  let content = fs.readFileSync(file, 'utf8')
  if (content.includes(oldImp)) {
    content = content.replace(oldImp, newImp)
    fs.writeFileSync(file, content)
  }
}

console.log('Removing empty lib/__tests__ if empty...')
try {
  const remaining = fs.readdirSync(legacyTests)
  if (remaining.length === 0) {
    fs.rmdirSync(legacyTests)
  } else {
    console.warn('lib/__tests__ not empty:', remaining)
  }
} catch {
  /* already gone */
}

console.log('Done.')
