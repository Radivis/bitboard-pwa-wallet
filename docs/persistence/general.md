# General persistence

Shared concerns that span all rails: the wallet SQLite schema, encryption, Zustand settings persistence, library, near-zero security mode, and backup/import.

See [overview.md](overview.md) for the high-level architecture diagram.

## Wallet SQLite schema (`bitboard-wallet`)

Types: `frontend/src/db/schema.ts`  
Initial migration: `frontend/src/db/migrations/wallet/20260417120000_initial_wallet_schema.ts`

| Table | Purpose |
|-------|---------|
| `wallets` | Wallet list: `wallet_id`, `name`, `created_at`, `no_mnemonic_backup` |
| `wallet_secrets` | Encrypted mnemonic + payload; `revision` for CAS |
| `settings` | Key/value store for Zustand persist and app config |
| `library_history` | Article visit timestamps |
| `library_articles` | Article favorites |

Bookkeeping tables: `schema_migrations`, `schema_migrations_lock` (Kysely migrator).

Migration failure reports are written to OPFS as `wallet-schema-migration-failure.json` (`wallet-migration-failure-report.ts`).

## Encryption

| Layer | Location | Role |
|-------|----------|------|
| KDF | `bitboard-encryption` (WASM) | Argon2id |
| Symmetric crypto | `frontend/src/db/encryption.ts` → encryption worker | AES-256-GCM |
| Session password | `encryption.worker` memory | Cleared on lock |
| Secrets channel | `frontend/src/workers/secrets-channel.ts` | Workers decrypt without main-thread plaintext |

`wallet_secrets` uses **split storage**: mnemonic ciphertext in separate columns from the main payload (`mnemonic_encrypted_data` vs `encrypted_data` for `WalletSecretsPayload` JSON).

API surface: `frontend/src/db/wallet-persistence.ts` — `loadWalletSecrets`, `updateWalletSecretsPayloadWithRetry`, `updateWalletSecretsEncryptedPayloadWithRetry`, etc.

## Zustand persisted stores

All use `sqliteStorage` → `settings` table. Hydration helper: `frontend/src/lib/settings/persisted-store-hydration.ts`.

| Store | Settings key | Persisted fields | Store version |
|-------|--------------|------------------|---------------|
| `walletStore` | `wallet-storage` | `networkMode`, `addressType`, `accountId`, `activeWalletId` | — |
| `lightningStore` | `lightning-storage` | `activeConnectionIds`, `invoices` | — |
| `featureStore` | `feature-storage` | Feature flags (Lightning, mainnet, regtest, segwit, UTXO, Arkade, periodic sync) | 4 |
| `themeStore` | `theme-storage` | `themeMode` | — |
| `fiatDenominationStore` | `fiat-denomination-storage` | Fiat mode, currency, provider | — |
| `bitcoinDisplayUnitStore` | `bitcoin-display-unit-storage` | `defaultBitcoinUnit` | — |
| `periodicSyncStore` | `periodic-sync-storage` | Per-rail sync intervals | 1 |
| `useUnilateralExitLifecyclePersistenceStore` | `unilateral-exit-lifecycle-storage` | `jobsByKey` (active job outpoints, relay wait) | 4 |
| `useUnilateralExitAutomationPrefsStore` | `unilateral-exit-automation-prefs` | `prefsByKey` (enabled, fee preset, max sat/vB) | 1 |
| `useUnilateralExitFailurePersistenceStore` | `unilateral-exit-failure-storage` | `failuresByKey` (last failure banner) | 2 |

Stores without `persist` hold session-only UI state (e.g. `unilateralExitControlStore`, `sendStore`). Unilateral-exit stores are documented in [unilateral-exit.md](unilateral-exit.md).

## Near-zero security mode

`frontend/src/db/near-zero-security.ts`

| Setting key | Purpose |
|-------------|---------|
| `near_zero_security_active` | `'1'` when mode is on |
| `near_zero_wrapped_session_secret` | Random session secret wrapped with fixed passphrase `!Near 0 Security!` |

The in-memory flag lives in `nearZeroSecurityStore` (not persisted itself). Documented as offering no meaningful security — convenience for local development or quick app tests only.

## Library persistence

| Module | Table | Purpose |
|--------|-------|---------|
| `frontend/src/db/library-history.ts` | `library_history` | Recent article paths |
| `frontend/src/db/library-articles.ts` | `library_articles` | Favorites by slug |

## localStorage and sessionStorage

Minimal use only — never for secrets.

| Key / pattern | Storage | Data |
|---------------|---------|------|
| `bitboard.legalLocale` | `localStorage` | `en` / `de` |
| `bitboard_lab_debug` | `localStorage` | Lab pipeline debug flag |
| Banner dismiss keys | `sessionStorage` | Tab-session UI dismissals (near-zero, no-mnemonic-backup, infomode hints) |

## Backup and import

| Target | Format | Notes |
|--------|--------|-------|
| Wallet | Signed ZIP of wallet SQLite | ML-DSA manifest signing via `bitboard-encryption` |
| Wallet import | Replace OPFS file | `opfs-sqlite-replace-and-reload.ts` |
| Lab | Unsigned ZIP | Replace-only |

Factory reset: `wipe-all-app-data-opfs-and-reload.ts` removes both OPFS databases and reloads.

## Concurrency

| Mechanism | Constant / column | Scope |
|-----------|-------------------|-------|
| Web Lock | `bitboard-wallet-writer` | Wallet DB writes |
| Web Lock | `bitboard-lab-writer` | Lab DB writes |
| CAS | `wallet_secrets.revision` | Encrypted payload updates (max 8 retries) |

`blockSqliteStorageForTeardown()` stops Zustand I/O before database destruction during factory reset.

## Related documentation

- [Application architecture](../../doc/ARCHITECTURE.md) — TanStack Query vs Zustand
- [Security](../../doc/SECURITY.md) — what must never leave encrypted storage
- [Wallet rail lifecycle](../wallet-rail-lifecycle.md) — per-rail save gates
