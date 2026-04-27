# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

### Security

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
