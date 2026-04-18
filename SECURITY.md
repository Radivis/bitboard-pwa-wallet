# Security policy

Bitboard Wallet is a **non-custodial**, **educational** Bitcoin wallet shipped as a Progressive Web App. It is still in active development; do not assume it is production-hardened. This document explains how to **report security vulnerabilities** in this repository.

There is **no separate monitored security email**. Use GitHub only (see below).

## Reporting a vulnerability

**Please use GitHub private vulnerability reporting** for this project:

1. Open the repository on GitHub.
2. Go to the **Security** tab.
3. Choose **Report a vulnerability** (private advisory).

Do **not** file public issues for undisclosed security bugs. Do **not** post exploit details, proof-of-concept code, or steps that could harm users on public issues or discussions.

### What to include

- Affected **commit hash** or **release** (if applicable) and how you built or ran the app.
- Clear **steps to reproduce** and a concise **impact** assessment (e.g. key exposure, unauthorized spend, cross-wallet data leak).
- Optional: suggested fix or references.

Avoid testing against **other people’s wallets** or **mainnet funds** without permission; prefer testnet, signet, lab mode, or a local setup where possible.

### What to expect

- We aim to **acknowledge** valid reports within **7 business days**. Complex issues may take longer to triage.
- We will work toward a **fix** and **coordinated disclosure**. As a rough guideline, we target **public disclosure** about **90 days** after a fix is available for non-critical issues; **critical** issues (e.g. widespread key theft) may be disclosed sooner after mitigation.
- We may publish a **GitHub Security Advisory** and credit you if you want to be named.

This is our intent, not a legal obligation. We may decline reports that are out of scope, not reproducible, or duplicate.

## Scope

### In scope

Issues in **this codebase** that affect confidentiality, integrity, or availability of wallet operation, for example:

- Handling of mnemonics, keys, passwords, or encrypted storage (SQLite/OPFS, workers, WASM).
- Esplora URL handling, validation, and chain interaction **as implemented in the app**.
- Transaction construction, signing, address parsing, backup/import, and related logic **in this repository**.

A more detailed threat model and implementation notes are in [doc/SECURITY.md](doc/SECURITY.md).

### Out of scope

- **Third-party services** (browser vendors, operating systems, default or user-configured Esplora/mempool endpoints, DNS, hosting). Report those to the respective operator.
- **Physical access**, **malware on the user’s machine**, **stolen devices**, or **social engineering** of users.
- **Denial-of-service** against public infrastructure, mass scanning, or spam.
- Findings that require **full penetration testing** of unrelated systems or violate laws or terms of service.

## Safe harbor

We support **good-faith** security research that follows this policy: stay within scope, do not harm users or degrade third-party services, do not access data that isn’t yours without authorization, and give us a reasonable time to fix issues before public disclosure.

## Supported versions

The project is **pre-1.0** and does not maintain long-term support branches. **Security fixes apply to the current default branch** (`main`) and **published builds** derived from it. Older commits or forks are **not** guaranteed to receive fixes. When we start tagging releases, this section may be updated.

## Dependencies

GitHub **Dependabot** is enabled for dependency alerts. We also use Rust advisory checks (`cargo deny`) and encourage npm auditing; see [doc/SECURITY.md](doc/SECURITY.md) (dependencies and logging sections).

## Bug bounty

**There is no bug bounty program** at this time.

## Recognition

With your consent, we may credit you in release notes or a GitHub Security Advisory.
