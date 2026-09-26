# Dashboard scope as the guard for UI transitions

Planning note. The wallet-id checks shipped with new-wallet activation stay until this refactor. Nothing here is implemented.

Related:

- On-chain scope: `OnchainRailDescriptorScope` in `frontend/src/lib/wallet/lifecycle/onchain-rail-types.ts`
- Arkade scope: `ArkadeRailScope` in `frontend/src/lib/wallet/lifecycle/arkade-rail-types.ts` (same shape as `ArkadeWalletScope` in `frontend/src/lib/arkade/arkade-session-scope.ts`)
- Lightning scope: `LightningRailScope` in `frontend/src/lib/wallet/lifecycle/lightning-rail-types.ts`
- Closest existing compare: `localDescriptorScopeMatchesRemote` in `frontend/src/lib/wallet/lifecycle/onchain-rail-snapshot.ts`
- Activation glue to replace: `releasePreviousWalletDashboardSession` in `frontend/src/lib/wallet/new-wallet-dashboard-session.ts`
- Feature contract: [doc/features/wallet-lifecycle.yaml](../../doc/features/wallet-lifecycle.yaml)

---

## Problem

The dashboard is one set of fields (`balance`, `transactions`, Arkade balance and payments, sync banners) with no scope of its own. Rail work is scoped. When the user creates or imports a wallet, or otherwise changes the wallet they are looking at, in-flight work for the previous scope still finishes and writes into those fields.

The current fix compares `activeWalletId` at each write site:

- `refreshWalletStoreFromLoadedBdk(expectedWalletId)`
- `refreshArkadeStoreFromLoadedWasm(..., expectedWalletId)`
- `onchainSyncStillTargetsActiveWallet`
- `arkadeLoadedSessionMatchesWallet`
- `abandonArkadeLoadIfActiveWalletChanged`
- `detachOnchainSyncSnapshotIfDifferentWallet`, `detachArkadeLoadSnapshotIfDifferentWallet`, `detachArkadeSyncSnapshotIfDifferentWallet`

That stops the bug. It is also a list of special cases. A new publisher can forget the check. Several of the checks look only at `walletId`, so a descriptor switch or Arkade account change inside the same wallet is a different hole. Load snapshots still mean “some session is loaded”, not “this scope is loaded”. `ArkadeWalletScope` and `ArkadeRailScope` are two names for one value.

Two directions of the bug, which the checks currently mix:

| Direction | Wrong outcome | Example |
|-----------|----------------|---------|
| Publish into the UI | Previous scope’s balance or history appears on the new wallet | In-flight Esplora sync or an open Arkade session writes the singleton store after `setActiveWallet` |
| Persist | New wallet is treated as the owner of the previous session | Operator-sync timestamp saved under the new `walletId` with the old Arkade account (“Unknown Arkade account”) |

UI publish must follow the **scope the user is looking at**. Persistence must follow the **scope the work started with**. Neither side should be retargeted to whichever id happens to be active at the end.

---

## Invariant

Every dashboard read and every dashboard write names a scope. A UI transition commits a new active scope. Work that started under another scope may finish, but it does not paint the dashboard and it does not save into the new scope.

“Loaded”, “syncing”, and “session ready” are properties of a scope, not of the app.

---

## Scope

Keep the three rail scopes. Do not add a fourth parallel type for Arkade.

| Rail | Scope | Already defined |
|------|--------|-----------------|
| On-chain | `walletId`, `networkMode`, `addressType`, `accountId` | `OnchainRailDescriptorScope` |
| Arkade | `walletId`, `networkMode`, `arkadeAccountId` | `ArkadeRailScope` — fold `ArkadeWalletScope` into this |
| Lightning | `walletId`, `networkMode` | `LightningRailScope` |

Equality is the existing key helpers (`onchainRailDescriptorScopeKey`, `arkadeRailScopeKey`, `lightningRailScopeKey`). A wallet-only compare is not enough: same wallet, different network or address type, is a different on-chain scope.

The active UI scope is whatever the dashboard is allowed to show. It changes on create, import, wallet switch, descriptor switch, Arkade account change, and lock (active scope becomes none).

An operation scope is captured when load, sync, save, or a dashboard query starts. It does not get rewritten if `activeWalletId` changes later.

---

## Guard

One helper per rail, used by every publisher:

```ts
function publishIfActiveOnchainScope(
  operationScope: OnchainRailDescriptorScope,
  publish: () => void,
): boolean
```

Same for Arkade and Lightning. It returns false and does not call `publish` when the operation scope is not the active UI scope. Callers do not throw: a mismatch is a dropped paint, not a save-error banner.

Persistence uses the operation scope only. A save whose session scope is not the operation scope returns without writing. It does not adopt the new active wallet. `arkadeOpenSessionMatchesSaveTarget` becomes “session scope equals operation scope”, including network, not a wallet-id pair checked at the call site.

Load and sync snapshots store the scope they belong to. `loaded` for Arkade is true only when the snapshot scope equals the active Arkade scope. The same rule replaces `arkadeLoadedSessionMatchesWallet` and the on-chain `configure*ForLoadedRail` early return that keeps a previous wallet’s snapshot because the phase is already `not-syncing`.

Query keys are the scope key. `initialData` and `placeholderData: keepPreviousData` must not carry another scope’s rows across a transition. Removing every Arkade query on activate (`removeArkadeDashboardQueries`) goes away once the key change is enough.

---

## UI transitions

`commitActiveDashboardScope` is the only way the screen changes scope. Create, import, settings wallet switch, and descriptor switch call it instead of poking `setActiveWallet` and then a detach list.

It does four things, in order:

1. Set the active scope for each rail that changed. Rails that do not apply (Arkade off, Lightning with no connection) become none.
2. Clear singleton dashboard fields that are still unscoped, so the next paint cannot show the previous scope. This stays only until those fields are keyed by scope.
3. Leave in-flight work running. Do not cancel it and do not await Esplora or the operator.
4. Start load for the new scope the same way unlock does. The new load’s operation scope is the scope just committed.

Late completions call `publishIfActive*Scope`. If the user has already moved on, the write is ignored. The previous scope’s own save may still persist under the operation scope.

Lock sets the active scope to none. Publishes while locked no-op. That replaces the scattered “status is unlocked” checks as the UI gate; worker locks stay as they are.

---

## Migration

Do this in slices. Each slice deletes the ad hoc check it replaces. Do not keep both.

1. **Equality and active scope.** One module that holds the active on-chain, Arkade, and Lightning scopes and the `publishIfActive*` helpers. Point `localDescriptorScopeMatchesRemote` at it. Collapse `ArkadeWalletScope` into `ArkadeRailScope`.
2. **Publish sites.** `refreshWalletStoreFromLoadedBdk`, `syncActiveWalletAndUpdateState`, and `refreshArkadeStoreFromLoadedWasm` take a scope and publish through the helper. Delete `expectedWalletId` and `onchainSyncStillTargetsActiveWallet`.
3. **Snapshots.** Put the scope on load snapshots (today Arkade load stores `networkMode` only). “Session ready” and `configure*ForLoadedRail` compare scopes. Delete `detach*IfDifferentWallet`, `abandonArkadeLoadIfActiveWalletChanged`, and `arkadeLoadedSessionMatchesWallet`.
4. **Activation.** `releasePreviousWalletDashboardSession` becomes `commitActiveDashboardScope` from create, import, and wallet switch. New-wallet setup stops clearing caches by hand.
5. **Queries.** Dashboard query keys are scope keys. Drop `keepPreviousData` where it would show another scope. Lightning already filters connections by wallet id; it should use the same publish helper when a balance row is written into the dashboard.

Descriptor switch (`switchDescriptorWallet`) is the test that the guard is not wallet-id-only: same `walletId`, new address type or network, previous balance must not remain.

---

## Tests

Prefer the lifecycle unit tests that already cover these rails. One case per rail is enough:

- Publish after the active scope changes does not change store balance, transactions, or Arkade payments.
- Save after the active scope changes still targets the operation scope, or skips, and never writes the previous Arkade account into the new wallet.
- `loaded` is false when the snapshot scope and the active scope differ.
- Create/import commits the new scope and does not await the first Esplora scan.

No new Playwright path. The browser bug is the publish rule; the existing create and import component tests stay on navigation and toasts.

---

## Out of scope

- Cancelling WASM work when the user switches wallets. In-flight scans may finish; they must not publish.
- Keying the Zustand dashboard fields by scope in the first slice. The publish guard is the fix. Keyed fields can replace the clear in step 4 later if a transition still flickers.
- Lightning commitment transactions and bumper spends. Those are not dashboard scope.
