# Unlock Esplora: full scan instead of incremental sync

Implemented: unlock uses incremental Esplora when `fullScanDone`; periodic query is gated on `refetchInterval`; Arkade session open does not await or start bumper `full_scan`. Bumper Esplora is lazy (first `onchain_bumper_info` / exit proceed); later bumper polls use tip-address `/utxo`, not another HD `/txs` walk. See the original diagnosis below.

Handoff for an implementing agent. Branch: `fix-full-sync-instead-of-sync`.

This is **not** Arkade indexer / VTXO-list slowness. That problem is [arkade-sync-performance-optimizations.md](./arkade-sync-performance-optimizations.md) (ASP `list_vtxos` by script). The symptoms below are **BDK → public Esplora** (`GET /blocks`, then many `GET …/scripthash/…/txs`).

Do **not** start by adding more Esplora permits, 429 cooldowns, or proxy throttling. Those only serialize a firehose. The firehose is two overlapping BDK `full_scan`s on unlock, plus a third incremental Esplora pass that toasts again.

---

## Observed symptoms

On Signet/Mutinynet with Arkade enabled, after unlock:

1. **Arkade session init looks like an on-chain sync.** “Establishing Arkade session…” sits on Esplora while the network tab fills with scripthash `/txs` (and `/blocks` first).
2. **`Wallet synced` appears twice** when Arkade is on (two separate Sonner toasts, not one id-replaced loading toast).
3. **The first on-chain sync takes as long as a full HD rescan**, with a high 429 rate on those `/txs` calls. Throttling makes each `/txs` *slower*; it does not cut how many are issued.

Those three are the same bug: unlock treats Esplora like first-import `full_scan` every time, and Arkade session open does a **second**, independent `full_scan` of a wallet that is recreated empty every session.

---

## BDK `full_scan` vs `sync` (what `/txs` means)

| API | WASM | What Esplora sees |
|-----|------|-------------------|
| **Full scan** | `full_scan_wallet` / `ArkBdkWallet::sync` → `start_full_scan_at` | Walk **both** keychains from index 0 until `stop_gap` consecutive unused scripts. Each script → `/scripthash/{hash}/txs` (plus pagination / tx bodies as needed). First request is usually `GET /blocks`. |
| **Incremental sync** | `sync_wallet` → `start_sync_with_revealed_spks_at` | Only scripts **already revealed** in the loaded changeset. Cheap after a changeset exists. |

Crypto comments already state the policy: full scan after create/import; `sync_wallet` for later updates (`crypto/src/lib.rs`). Unlock ignores that.

Request volume for one full scan ≈ `(last_used_index + stop_gap) × 2 keychains` GETs, plus `/blocks`. A wallet with many used addresses is hundreds of `/txs` in one unlock.

On this branch:

- Main wallet full scan: `stop_gap = 20` (`FULL_SCAN_STOP_GAP` in `frontend/src/lib/wallet/wallet-utils.ts`), parallel HTTP `2` (`FULL_SCAN_PARALLEL_REQUESTS` in `crypto/src/lib.rs`). Incremental parallel is `5`.
- Ark bumper “sync”: `full_scan(request, 5, 5)` — stop_gap 5, **parallel 5** (`third_party/ark-bdk-wallet/src/lib.rs`).
- Main full-scan HTTP timeout 30s; incremental 5s (`crypto/src/esplora.rs`).
- Whole-scan retries: `withEsploraFullScanRetries` (3 attempts) and Ark `ONCHAIN_SYNC_MAX_ATTEMPTS = 3`. A 429/timeout can **restart the entire HD walk**.

---

## Root cause 1 — Unlock always full-scans the main wallet

`orchestrateOnchainPostUnlockSync` hardcodes `useFullScan: true` and `markFullScanDone: true`:

```210:221:frontend/src/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator.ts
export async function orchestrateOnchainPostUnlockSync(...) {
  const work = orchestrateOnchainSyncThenSave({
    syncKind: 'postUnlock',
    useFullScan: true,
    markFullScanDone: true,
```

That is fired from `runUnlockLoad` in `lock-lifecycle-orchestrator.ts` (and from `loadDescriptorWalletAndSync`) on every non-lab unlock.

Meanwhile load **already** hydrates the persisted BDK changeset:

```104:109:frontend/src/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator.ts
  await loadWalletHandlingPersistedChainMismatch(loadWallet, {
    // ...
    changesetJson: descriptorWallet.changeSet,
    useEmptyChain: false,
  })
```

`fullScanDone` is persisted (`docs/persistence/bitcoin-onchain.md`) and **used on descriptor switch**:

```165:168:frontend/src/lib/wallet/settings-switch-wallet.ts
      const fullScanNeeded =
        isLiveNetworkSwitch ||
        !descriptorWallet.fullScanDone ||
        usedEmptyChainFallback
```

Unlock never reads `fullScanDone`. Every later unlock still `full_scan_wallet`.

**Intended (already written, not implemented on unlock):**

- `docs/wallet-rail-lifecycle.md`: hydration (`postUnlock`) is **incremental** Esplora; full scan is create/import / Full rescan / switch when `fullScanNeeded`.
- `doc/features/wallet.yaml`: dashboard shows changeset immediately; Esplora **refreshes in the background**.
- `doc/features/wallet-lifecycle.yaml`: create/import uses `setupInitial` **full** scan (`onchain-setup-lifecycle.ts`) — keep that.
- Manual dashboard Sync is already incremental (`runIncrementalDashboardWalletSync`, `useFullScan: false`).

**Target policy for `postUnlock`:** same as `switchDescriptorWallet` — incremental when changeset loaded and `fullScanDone`; full scan only if `!fullScanDone` or empty-chain fallback. Do not force full scan on every live-network unlock the way live↔live *switch* currently does (that switch rule is a separate, documented special case).

Full-scan UI: `Scanning blockchain…` then `Wallet synced` with a shared toast id (`syncActiveWalletAndUpdateState`). Incremental dashboard uses a **second** `toast.success('Wallet synced')` with no id.

---

## Root cause 2 — Arkade session open blocks on a cold bumper `full_scan`

Unlock starts Arkade load in parallel with on-chain post-unlock sync (`runUnlockLoad`). WASM `ArkSession::open` **awaits** Esplora before returning, so the spinner “Establishing Arkade session…” includes the bumper scan:

```237:237:bitboard-ark/src/session/open.rs
        sync_onchain_wallet_for_session_open(&client).await;
```

`sync_onchain_wallet` → `OnchainWallet::sync` → **always** `start_full_scan_at` (not `start_sync_with_revealed_spks_at`). Comments in `open.rs` say failure must not block session open; the **success path still waits** for the whole scan (up to 3 retries).

The bumper BDK wallet is `create_wallet_no_persist()` every session (`ArkBdkWallet::new_from_xpriv`). Ark JSON persistence stores boarding outputs and offchain snapshot, **not** a BDK changeset. Every session is a cold full scan of the boarding/on-chain HD wallet, even when the main crypto wallet already has a changeset.

Same helper is used on autonomous-mode enter (`bitboard-ark/src/session/autonomous.rs`) and on unilateral-exit proceed/complete (those can stay stricter; they need chain truth for fees/prevouts). Unlock/session-open is the user-visible stall.

The bumper and the main wallet are **different BDK instances** (different workers) hitting the **same** Mutinynet `/api/esplora` origin. Parallel 2 (crypto full scan) + parallel 5 (ark bumper) is enough to 429 public Esplora.

**Target for session open:** do not block “session ready” / dashboard Arkade UI on bumper `full_scan`. Prefer one or more of:

1. **Background** `sync_onchain_wallet_for_session_open` after the session is usable (operator connect + offchain snapshot already loaded).
2. **Persist and restore** the bumper BDK changeset; then use incremental `sync` when a changeset exists.
3. If the bumper only needs known **boarding** scripts, query those instead of walking unused HD gap from an empty wallet.

Do not drop bumper sync entirely without a replacement: boarding settle and on-chain Ark balance still need Esplora at some point.

---

## Root cause 3 — Periodic-sync query runs once even when the feature is off

`ActiveWalletBootstrap` always mounts `useOnchainPeriodicSyncQuery`.

```31:45:frontend/src/hooks/useOnchainPeriodicSyncQuery.ts
  const enabled =
    networkMode !== 'lab' && descriptorWalletKey != null && onchainRailLoaded

  useQuery({
    queryFn: async () => {
      await runIncrementalDashboardWalletSync({ networkMode, activeWalletId })
      return 'completed'
    },
    enabled,
    refetchInterval,
```

`useIsOnchainRailLoaded` is `loadPhase === 'loaded'` (true as soon as WASM load finishes, while `postUnlock` full scan is still running).

`refetchInterval` is `false` when Periodic sync is off (`resolvePeriodicSyncRefetchIntervalMs`). That only disables **polling**. TanStack Query still runs `queryFn` on the first enable.

`runIncrementalDashboardWalletSync` waits on a different in-flight sync key (`incrementalDashboard` vs `postUnlock`), then toasts `Wallet synced` **without** the full-scan toast id.

Typical sequence with Arkade on:

1. Unlock → `postUnlock` full scan → `Scanning blockchain…` → `Wallet synced` (toast id).
2. Ark bumper full scan overlaps (no toast; blocks session spinner).
3. Periodic query’s first fetch → incremental sync → **second** `Wallet synced`.

Arkade does not create the second toast by itself; it stretches the session so both toasts are obvious. Spec: `doc/features/periodic-sync.yaml` — default remains hydration + **manual** dashboard sync; the hook must not Esplora-sync until Periodic sync is on.

**Target:** `enabled` only when `refetchInterval` is a number (feature + rail + visible tab), not merely `onchainRailLoaded`. Lightning’s periodic path is already refetchInterval-gated; match that.

---

## Unlock sequence (actual)

```mermaid
sequenceDiagram
  participant Lock as runUnlockLoad
  participant Crypto as crypto worker BDK
  participant Ark as ark worker bumper BDK
  participant RQ as useOnchainPeriodicSyncQuery

  Lock->>Crypto: orchestrateOnchainLoad (changeset)
  Lock->>Ark: orchestrateArkadeLoad (parallel)
  Lock->>Crypto: postUnlock full_scan stop_gap 20
  Ark->>Ark: session open awaits bumper full_scan stop_gap 5 parallel 5
  RQ->>Crypto: enabled on loadPhase loaded; incremental after postUnlock
  Crypto-->>Lock: toast Wallet synced (full scan)
  RQ-->>Lock: toast Wallet synced (incremental)
```

---

## Recommended implementation order

1. **Periodic query gate** (smallest, explains double toast). Tests: query does not call `runIncrementalDashboardWalletSync` when Periodic sync is off; does when on and rail loaded.
2. **`postUnlock` uses `fullScanDone` + changeset.** Tests: `orchestrateOnchainPostUnlockSync` / lock unlock path passes `useFullScan: false` when `fullScanDone`; `true` when not. Keep `setupInitial` and dashboard Full rescan as full scan. Align `docs/wallet-rail-lifecycle.md` (already says incremental) with `doc/features/wallet-lifecycle.yaml` + a contract id if missing.
3. **Arkade session open does not await bumper full scan.** Session UI becomes ready after operator connect + persistence hydrate; bumper Esplora is background (or incremental after persisted changeset). Tests: load orchestrator / WASM open does not require `sync_onchain_wallet` to finish before returning; boarding/on-chain still eventually syncs. Update `doc/features/arkade.yaml` / UNLOCK-ARK notes as needed.

Optional follow-up (not required to fix unlock feel): persist bumper changeset; lower ark `full_scan` parallel 5; retry individual HTTP instead of the whole scan (`esplora-full-scan-retry.ts`, `ONCHAIN_SYNC_MAX_ATTEMPTS`).

---

## What not to do

- Do not add shared Esplora semaphores / 429 cooldowns / Vite proxy sleeps as the **primary** fix. A prior attempt on another branch showed: (1) throttling makes `/txs` take longer; (2) `std::time::Instant::now()` on the GET path **panics** on `wasm32-unknown-unknown` and aborts the crypto worker before any HTTP; (3) sleeping on the open Vite `/api/esplora` request burns the WASM 5s/15s timeout so `/blocks` never finishes.
- Do not remove create/import `setupInitial` full scan or dashboard **Full rescan**.
- Do not make manual “Sync on-chain” a full scan (already incremental; full scan there can stick receives as untrusted pending).
- Do not treat indexer `list_vtxos` work in [arkade-sync-performance-optimizations.md](./arkade-sync-performance-optimizations.md) as this ticket.

---

## Spec and tests

Follow TDD (`.cursor/rules/testing-strategy.mdc`): protocol file under `.cursor/tdd-protocols/`, then red tests.

| Layer | What to prove |
|-------|----------------|
| Vitest | `postUnlock` `useFullScan` follows `fullScanDone`; periodic query disabled when feature off; Arkade load snapshot `loaded` without waiting on bumper Esplora (mock worker/open). |
| Existing | `onchain-setup-lifecycle.test.ts` still expects `setupInitial` full scan; `wallet-utils-incremental-dashboard-sync.test.ts` still incremental; `settings-switch-wallet.test.ts` `fullScanNeeded` unchanged unless you deliberately unify switch vs unlock. |
| Rust unit | If bumper `sync()` gains an incremental path, unit-test the choice (changeset present → `start_sync_with_revealed_spks`, else full scan). No Docker. |
| E2E | Do not add a second happy-path unlock E2E unless the contract cannot be proven in Vitest. REG-xx already covers Arkade board/recover. |

WASM: after Rust/path-dep edits, `cd frontend && npm run build:wasm` and hard-refresh (`.cursor/rules/wasm-rebuild-workflow.mdc`).

---

## File map

| File | Role |
|------|------|
| `frontend/src/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator.ts` | `postUnlock` `useFullScan: true` |
| `frontend/src/lib/wallet/lifecycle/lock-lifecycle-orchestrator.ts` | Parallel Arkade load + postUnlock |
| `frontend/src/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator.ts` | Loads changeset before sync |
| `frontend/src/lib/wallet/lifecycle/onchain-setup-lifecycle.ts` | Legitimate first full scan |
| `frontend/src/lib/wallet/wallet-utils.ts` | Full-scan toast vs incremental toast; `FULL_SCAN_STOP_GAP` |
| `frontend/src/lib/wallet/settings-switch-wallet.ts` | `fullScanNeeded` policy to copy for unlock |
| `frontend/src/hooks/useOnchainPeriodicSyncQuery.ts` | Accidental first incremental + toast |
| `frontend/src/components/ActiveWalletBootstrap.tsx` | Mounts that query always |
| `frontend/src/lib/esplora/esplora-full-scan-retry.ts` | Restarts whole full scan |
| `bitboard-ark/src/session/open.rs` | Awaits bumper Esplora on open |
| `third_party/ark-bdk-wallet/src/lib.rs` | Empty wallet + `full_scan(..., 5, 5)` |
| `crypto/src/lib.rs` | `sync_wallet` vs `full_scan_wallet` |
| `docs/wallet-rail-lifecycle.md` | Says postUnlock is incremental (lie today) |
| `docs/descriptor-wallet-switching.md` | When full scan is actually required |
