# Frontend naming conventions

This project uses **three layers** with different casing rules. Map at boundaries; do not mix layers in components, hooks, or domain logic.

## Layers

| Layer | Location | Casing | Examples |
|-------|----------|--------|----------|
| **Database** | `src/db/schema.ts`, migrations, Kysely rows | `snake_case` | `wallet_id`, `changeset_json`, `no_mnemonic_backup` |
| **WASM wire** | `src/workers/crypto-wire-types.ts`, Rust JSON | `snake_case` | `fee_sats`, `external_descriptor`, `is_lab_tx` |
| **TypeScript domain** | stores, hooks, components, `wallet-domain-types` | `camelCase` / `PascalCase` | `walletId`, `feeSats`, `TransactionDetails` |

WASM **function exports** use `snake_case` across all Rust crates (`create_wallet`, `derive_argon2_key_from_phc`).

## Canonical field map

| Concept | DB column | TS domain | WASM JSON |
|---------|-----------|-----------|-----------|
| Wallet row (read) | `wallet_id`, `created_at` | `walletId`, `createdAt` (`WalletSummary`) | — |
| Changeset blob | `changeset_json` | `changeSet` | `changeset_json` |
| External descriptor | — | `externalDescriptor` | `external_descriptor` |
| Internal descriptor | — | `internalDescriptor` | `internal_descriptor` |
| Confirmed balance | — | `confirmedSats` | `confirmed_sats` |
| Trusted pending | — | `trustedPendingSats` | `trusted_pending_sats` |
| Untrusted pending | — | `untrustedPendingSats` | `untrusted_pending_sats` |
| Immature | — | `immatureSats` | `immature_sats` |
| Total balance | — | `totalSats` | `total_sats` |
| Transaction fee | — | `feeSats` | `fee_sats` |
| Confirmed flag | — | `isConfirmed` | `is_confirmed` |
| Lab-sourced tx | — | `isLabTx` | `is_lab_tx` |
| Esplora descriptor wallet sync failure | — | `'syncFailed'` (union literal) | — |
| Dust floor applied | — | `isRaisedToMinDust` | `raised_to_min_dust` |
| Change-free bump applied | — | `isBumpedChangeFree` | `bumped_change_free` |
| Change-free bump path exists | — | `isChangeFreeBumpAvailable` | `change_free_bump_available` |
| PSBT has change output | — | `hasChange` | `has_change` |

### DB read boundary

`useWallets()` / `useWallet()` return `WalletSummary` (domain), not Kysely rows. Map with `mapDbWalletToDomain()` in `src/db/wallet-domain-mapper.ts`. Inserts/updates still use `NewWallet` snake_case.

Use mapper helpers at WASM boundaries:

- `mapWireTransactionToDomain`, `mapWireBalanceToDomain`, `mapWireDraftPsbtResultToDomain`, `mapWireLabSignResultToDomain` — `src/workers/crypto-wire-mappers.ts`
- `mapBlockEffectsWireToDomain` — `src/workers/lab-block-effects-mappers.ts`

For changesets, the serialized blob is the same string; only the **name** changes by layer. At WASM/DB calls use a `changesetJson` variable or property; in `DescriptorWalletData` use `changeSet`.

## Rust WASM export prefixes (lab)

| Prefix | Use |
|--------|-----|
| `lab_*` | Lab chain simulation (`lab_mine_block`, `lab_block_effects`, `draft_lab_psbt_transaction`, `build_and_sign_lab_transaction`) |
| `lab_entity_*` | Ephemeral lab-entity wallet lifecycle (`create_lab_entity_wallet`, `lab_entity_draft_psbt_transaction`) |
| (none) | Active user wallet on-chain ops (`prepare_onchain_send_transaction`, `sync_wallet`) |

On-chain and lab sends use **`to_address`** as the recipient parameter name in Rust WASM exports.

### Send recipient (three layers)

| Layer | Name | Where |
|-------|------|-------|
| UI / BIP21 | `recipient` | `sendStore`, `normalizeSendRecipient()`, amount entry step |
| TS worker / hooks (on-chain & lab) | `toAddress` | `BuildTransactionParams`, `prepareOnchainSendTransaction`, lab worker APIs |
| WASM / Rust | `to_address` | `prepare_onchain_send_transaction`, lab PSBT exports |

Lightning send uses BOLT11 / `bolt11` — not `toAddress`.

Signed transactions cross JSON boundaries as **`signed_tx_hex`** only; raw bytes stay internal to Rust.

## Intentional dual names (do not unify)

- **`NetworkMode.mainnet`** (UI/session) ↔ **`BitcoinNetwork.bitcoin`** (crypto/WASM). Map via `toBitcoinNetwork()` in `bitcoin-utils.ts`.
- **User copy** may say “satoshis”; **code** uses the `*Sats` suffix (`amountSats`, `feeSats`).
- **Lab transaction types** use `LabTx*` (`LabTxDetails`, `LabTxRecord`); main wallet history uses `TransactionDetails`. Different domains; do not merge type families.
- **Encrypted wallet secrets** use `changeSet`; WASM/DB strings use `changesetJson` / `changeset_json`.

## Booleans

In domain/UI code, prefer prefixes: `is*`, `has*`, `can*` (`isConfirmed`, `isPending`, `isRaisedToMinDust`, `isBumpedChangeFree`, `isChangeFreeBumpAvailable`, `isLightningEnabled`).

**Intentional exception:** `noMnemonicBackup` (DB `no_mnemonic_backup`) — legacy `no*` prefix; do not rename without a DB migration.

Persisted feature flags in `featureStore` use `is*Enabled` with a v1 migration from legacy `*Enabled` keys.

Lightning payment rows use `isPending` (legacy encrypted snapshots may still store `pending`; normalized on read).

## Lab owner literals

- Domain discriminant: `LabOwner` with `kind: 'lab_entity' | 'wallet'`
- Mining UI enum: `LabOwnerType.LabEntity = 'lab_entity'` (aligned with domain/SQLite, not camelCase `labEntity`)

## Lightning NWC wire

NIP-47 / `@getalby/sdk` responses use `snake_case`. Map at the service boundary:

- Wire types: `src/lib/lightning/lightning-wire-types.ts`
- Mappers: `src/lib/lightning/lightning-wire-mappers.ts`
- Domain types stay in `lightning-backend-service.ts` (`LightningPayment`, `NwcTestConnectionResult`, …)

## ESLint

`@typescript-eslint/naming-convention` enforces camelCase object-literal properties in application code. Exceptions: wire types (`src/workers/**`, `src/lib/lightning/lightning-wire-types.ts`), DB schema (`src/db/**`), migrations, generated `wasm-pkg`, setup pages, tests.
