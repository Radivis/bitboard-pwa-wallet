# Wallet session migration

This document tracks the move from implicit thread-local wallet state (`ACTIVE_WALLET` in
[`crypto/src/lib.rs`](../src/lib.rs)) to explicit `WalletSession` handles
([`crypto/src/wallet_session.rs`](../src/wallet_session.rs)).

## Current global state

| Thread-local | Purpose |
|--------------|---------|
| `ACTIVE_WALLET` | Single BDK wallet used by most WASM exports |
| `ACCUMULATED_CHANGESET` | Merged persistence delta for `export_changeset` |
| `EXTERNAL_DESCRIPTOR_FOR_LAB` / `INTERNAL_DESCRIPTOR_FOR_LAB` | Lab PSBT paths (separate track) |

Most exports call `with_wallet` / `with_wallet_mut` and assume one loaded wallet per worker.

## Phased rollout

| Phase | Scope | Status |
|-------|--------|--------|
| **0** | Ephemeral read-only sessions: `WalletSession::open`, `get_balance`, `export_changeset` | **Done (PR-9)** — mainnet on-chain balance probe |
| **1** | Session-based sync: open → sync → export → `free` without touching globals | Future |
| **2** | `load_wallet` / `create_wallet` return or register a session; deprecate implicit slot | Future |
| **3** | Remove `ACTIVE_WALLET` and `ACCUMULATED_CHANGESET` thread-locals | Future |

## Phase 0 (PR-9) API

**Rust / WASM**

- `WalletSession::new(external, internal, network, changeset_json, use_empty_chain)`
- `session.get_balance()` → `{ confirmed, total, … }`
- `session.export_changeset()` → JSON string
- `session.free()` (wasm-bindgen) — call after each ephemeral use

**Does not** read or write `ACTIVE_WALLET`, lab descriptor globals, or the global changeset accumulator.

**Frontend**

- `cryptoStore.openWalletSession(params)` → handle with `getBalance`, `exportChangeset`, `free`
- [`mainnet-onchain-balance-probe.ts`](../../frontend/src/lib/esplora/mainnet-onchain-balance-probe.ts) uses sessions in the descriptor loop; restore of the active descriptor wallet still uses global `loadWallet`.

## Remaining global consumers (by priority)

### High — wallet load / send / sync

- `create_wallet`, `load_wallet`
- `sync_wallet`, `full_scan_wallet`
- `prepare_onchain_send_transaction`, `build_transaction`, `sign_and_extract_transaction`
- `get_new_address`, `get_current_address`, `get_transaction_list`

### Medium — persistence helpers

- Global `export_changeset` (pre-probe persist of active descriptor wallet)
- Settings network switch save path

### Separate track — lab PSBT

- `build_and_sign_lab_transaction`, `draft_lab_psbt_transaction`, `get_lab_change_address`
- Lab descriptor thread-locals

### Already session-like

- [`lab_entity_wallet.rs`](../src/lab_entity_wallet.rs) — ephemeral wallets, no globals
- [`wallet_session.rs`](../src/wallet_session.rs) — PR-9 pilot

## Migration guidelines for new code

1. Prefer `WalletSession` when the operation is **read-only** and must not disturb the active wallet slot.
2. Keep using global `load_wallet` for the **committed active descriptor wallet** until Phase 2.
3. Always call `free()` on ephemeral sessions in loops.
4. Do not add new thread-local wallet state; extend `WalletSession` or pass explicit handles.

## Validation checklist (per phase)

- Native tests in `crypto/tests/wallet_session_tests.rs`
- WASM boundary test: session works while global slot empty
- No regression on wallet load / send E2E and native wallet tests
- Frontend probe unit test asserts session path for descriptor loop
