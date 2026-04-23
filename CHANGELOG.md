# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

### Security

## [0.1.0] - 2026-04-23

### Added

- Full scan button on dashboard to deal with failures of initial full scan
- New presentation of Lab transactions as cards in mempool and block details
- Suppressed regular app actions during active infomode now trigger a toast  message and a horizontal jitter of the lightbulb icon
- og:image tags for sharing landing page or app on social media

### Changed

- Switched from beta to stable `0.1.0` versioning for this release line.

### Fixed

- Initial Esplora full scan should be more stable now - if it still fails it raises a visible error
- Toasts now respect the currently selected light / dark theme
- Fixed undesired display of fractional sats, if sat was selected as Bitcoin display unit
