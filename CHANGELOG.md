# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

### Security

## [0.3.3] - 2026-07-08

### Added
- Arkade balance can now also be displayed in fiat currency denomination

### Changed
- When fiat amounts are shown, breakdown detail amounts are now also displayed in fiat
- Split monolithic unilateral exit button in Arkde into "Start unilateral exit" and "Complete unilateral exit"

### Fixed
- Addressed the possibility of false success of Arkade signer migration
- Fixed an issue with the unlock modal appearing after autolock timeout reloading immediately, even if the password was correct

## [0.3.2] - 2026-07-02

### Added
- Sync can now be triggered for each rail (onchain / Lightning / Arkade) separately with the respective last sync time displayed close to the sync button
- Added banner for recovering recoverable Arkade VTXOs
- **Periodic sync** feature (Settings → Features): opt-in background polling per rail with configurable intervals on Settings → Main (default 300s, 30s–24h range)
- Write locks for wallet and lab databases now prevent concurrent writes in different browser tabs

### Changed
- Bumped Arkade Rust SDK from 0.9.2 to 0.9.3
- Strict wallet unlock requirement is limited to proper /wallet routes; special actions requiring wallet data will request wallet unlock otherwise
- Reworked wallet data hydration lifecycle with state machines handling loading, syncing, and saving for each rail (onchain / Lightning / Arkade) separately; that should make hydration much more reliable and easier to reason about
- Background rail polling is off by default; Lightning and Arkade no longer poll every 15–60s unless periodic sync is enabled
- Onchain sync error now blocks most operations except sync retry and switching to a different network (skipping saving a possibly broken state)
- Fixed Lightning dashboard save invalidating its own React Query caches, which caused repeated NWC sync every few seconds even with periodic sync disabled

### Fixed
- An Arkade signer key rotation won't completely block the Arkade rail now; key rotation should be handled gracefully now
- Bitboard now runs an automatic post-sync anchor+chain reconcile, if Esplora declares any transaction as confirmed, but BDK still classifies it as unconfirmed

## [0.3.1] - 2026-06-18
### Added
- Lightning send supports LNURL-pay (`lnurl1…`, `lightning:LNURL…`, and `lnurlp://…`); withdraw, auth, and channel LNURL tags show explicit unsupported errors; LNURL-pay falls back to same-origin `/api/lnurl/fetch` when direct browser fetch to the LNURL host is blocked (e.g. CORS)

### Changed
- Toast messages now appear below the app header
- Increased size of toast close button and moved it to the top right

### Fixed
- Made modals scrollable; this fixes content from being cut off on small screens
- The receive page should no longer show an error that there is no Lightning wallet for the current network, if there actually is one
- App now sends x-build-version header to satisfy arkd compatibility signaling when communicating to Arkade sever

### Security
- Hardened security for the Ark worker by routing secrets reliably through a secrets channel (which was already implemented for the onchain crypto worker), so that they don't leak to the main thread of the app
- Confined handling of app password to the encryption worker where possible

## [0.3.0] - 2026-06-09
### Added
- Arkade Support: enable under Settings → Features; separate balance, receive, send, and board-from-on-chain flows on mainnet, and signet (Mutinynet)
- Network-scoped default Fulmine delegator URLs (env-configurable) for background VTXO renewal
- Library articles "Arkade in Bitboard Wallet" and "VTXO expiry and renewal"; deploy notes in `docs/deploy/fulmine-delegator-vps.md`
- Arkade collaborative and unilateral exit from Management (per-VTXO unilateral flow with unroll progress)
- Arkade exit fee estimates: operator policy and satoshi preview for collaborative exit; unroll step count and bumper fee lower bound for unilateral exit

### Fixed
- Fixed certain edge cases that blocked a full data wipe.

## [0.2.0] - 2026-05-31
### Added
- Feature "UTXO selection" that allows to manually select the UTXOs to be used in a transaction
- Last successful Esplora sync time is now properly persisted in the wallet database
- PWA update banner: prompts to refresh when a new version is downloaded; checks for updates when the tab becomes visible again

### Changed
- Onchain balance and transactions for live networks are now loaded immediately from BDK chain data instead of waiting for an Esplora sync
- PWA service worker uses prompt-based updates instead of silent auto-reload
- Stricter no-store cache headers on `/sw.js`, `/workbox-*.js`, and `/manifest.webmanifest`
- Structured frontend/src/lib folder by domain 
- Improved variable naming in very many files
- Renamed "sub wallet" terminology to "descriptor wallet" for consistency
- Some other various refactoring

### Fixed

### Security

## [0.1.8] - 2026-05-23
### Added
- The "Review Transaction" page now also shows
  - Actual fees
  - Total deducted amount (sent + fees)
  - Balance remaining
  - Change
  - Immediately spendable balance remaining
  - Used UTXOs in a list toggled by a button (list not shown by default)
- The transaction list on the dashboard now uses pagination
- New Library article "Esplora Privacy"

### Changed
- Dashboard page: Sent on-chain and Lightning transactions show the net amount transferred (excluding fees) in the list; expanded details show fee and total including fee for sends
- Bitcoin amount units on live test networks (testnet, signet, regtest) now show a `t` prefix before the unit label; Lab mode amounts show a flask icon instead
- In Lab mode the wallet dashboard page shows clearer labels indicating that the wallet refers to the Lab, instead of any online blockchain
- Made the wording in the privacy policy regarding Esplora requests via Vercel / directly for custom Esplora endpoints more specific

### Fixed
- Pending transactions were not shown on the dashboard, if there were already 10 transactions in the list due to an issue with sorting

## [0.1.7] - 2026-05-19
### Changed
- Conversion between Bitcoin and fiat currencies now supports all currencies from the currently selected currency rate service

### Fixed
- Reset currently loaded network specific wallet balance and transaction data when switching networks to prevent balances or transactions from the wrong network being displayed
- Paths for open graph images are now hardcoded on the landing page, too.

## [0.1.6] - 2026-05-13
### Added
- Currency conversion between Bitcoin and USD, EUR, or GBP using Kraken, CoinGecko, or Blockchain.com - selectable in Settings
- Vercel preview build alias for the latest preview builds at https://bitboard-preview.vercel.app/

### Changed
- Fee rate buttons now wrap on small screens

### Fixed
- Fixed duplicate sync processes on startup
- All LaTeX formulas and symbols should now actually be displayed properly in production
- Paths for open graph images are now hardcoded to the assets on the landing page bypassing the unreliable domain injection during build

## [0.1.5] - 2026-05-09

### Added
- Fee rate estimates via Esplora API

### Changed
- Refactored pages to a new pages directory to align with Vite 8 best practices (addressing many warnings)

### Security
- Various updates of npm dependencies connected to Vercel, due to flagged vulnerabilities 


## [0.1.4] - 2026-05-08

### Changed
- Changed styling for two level nav to make it more intuitive that it's actually a two level nav

### Fixed
- Sending Lightning payments should not cause an insufficient balance error, if onchain balance is below the payment amount
- Fixed some display issues for small screens
- LaTeX formulas and symbols should now also be displayed properly in production
- Using absolute paths for open graph images as required by social media for open graph previews

## [0.1.3] - 2026-05-05

### Added
- Support for "amountless" (payer specified) Lightning payments via NWC

### Changed
- Privacy policy now includes mentions of the Vercel serverless handler for connecting to Esplora services and faucets in production

### Fixed
- In the case that the wallet should have persisted any chain state inconsistent with the Espolora service, the error is classified as BadLocalChainStateError. Using the "Full Scan" button on the wallet dashboard page retries the full scan with an empty chain as a convenient recovery path in that case.

## [0.1.2] - 2026-04-27

### Changed
- Reduced number of retries for initial full sync from 3 to 1 to make errors appear faster
- Using edge proxy server in productive app to eliminate CORS issues
- Using Vite proxy in development app to make Faucet availability check work there, too

## [0.1.1] - 2026-04-25

### Added

- Toggle button on landing page for stopping and resuming the Matrix background effect
- Extended the Future section of the landing page
- Added some new Library articles:
  - ECDSA (Elliptic Curve Digital Signature Algorithm)
  - Elliptic Curve Algebra
  - Finite Fields
  - Lightning Invoices
  - ML-DSA (Module Lattice Digital Signature Algorithm)
  - Schnorr signatures
  - UTXO Model vs. Account Model

### Changed

- Restructured all Library articles
- Using `nLockTime = 0` now instead of BDK's default in order to improve transaction broadcast stability

## [0.1.0] - 2026-04-23

### Added

- Full scan button on dashboard to deal with failures of initial full scan
- New presentation of Lab transactions as cards in mempool and block details
- Suppressed regular app actions during active infomode now trigger a toast message and a horizontal jitter of the lightbulb icon
- og:image tags for sharing landing page or app on social media

### Changed

- Switched from beta to stable `0.1.0` versioning for this release line.

### Fixed

- Initial Esplora full scan should be more stable now - if it still fails it raises a visible error
- Toasts now respect the currently selected light / dark theme
- Fixed undesired display of fractional sats, if sat was selected as Bitcoin display unit
