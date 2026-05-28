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
| Changeset blob | `changeset_json` | `changeSet` | `changeset_json` |
| External descriptor | — | `externalDescriptor` | `external_descriptor` |
| Internal descriptor | — | `internalDescriptor` | `internal_descriptor` |
| Transaction fee | — | `feeSats` | `fee_sats` |
| Confirmed flag | — | `isConfirmed` | `is_confirmed` |
| Lab-sourced tx | — | `isLabTx` | `is_lab_tx` |

Use mapper helpers at WASM boundaries:

- `mapWireTransactionToDomain` / `mapWireBalanceToDomain` — `src/workers/crypto-wire-mappers.ts`

For changesets, the serialized blob is the same string; only the **name** changes by layer. At WASM/DB calls use a `changesetJson` variable or property; in `DescriptorWalletData` use `changeSet`.

## Intentional dual names (do not unify)

- **`NetworkMode.mainnet`** (UI/session) ↔ **`BitcoinNetwork.bitcoin`** (crypto/WASM). Map via `toBitcoinNetwork()` in `bitcoin-utils.ts`.
- **User copy** may say “satoshis”; **code** uses the `*Sats` suffix (`amountSats`, `feeSats`).

## Booleans

In domain/UI code, prefer prefixes: `is*`, `has*`, `can*` (`isConfirmed`, `canBuildOnChainSend`).

## Lab owner literals

- Domain discriminant: `LabOwner` with `kind: 'lab_entity' | 'wallet'`
- Mining UI enum: `LabOwnerType.LabEntity = 'lab_entity'` (aligned with domain/SQLite, not camelCase `labEntity`)

## ESLint

`@typescript-eslint/naming-convention` enforces camelCase in application code. Exceptions: wire types, DB schema, migrations, generated `wasm-pkg`.
