# Wallet session context and rail reconciler

Planning note. Nothing here is implemented except the stopgap activation hooks named below and most of "Related problem A".

Related:

- Publish and persist guards (companion note, decides who may write): [dashboard-scope-guards.md](./dashboard-scope-guards.md)
- Rail scopes: `OnchainRailDescriptorScope`, `ArkadeRailScope`, `LightningRailScope` in `frontend/src/lib/wallet/lifecycle/*-rail-types.ts`
- Unlock trigger: `runUnlockLoad` in `frontend/src/lib/wallet/lifecycle/lock-lifecycle-orchestrator.ts`
- Network switch trigger: `executeSettingsNetworkSwitch` in `frontend/src/lib/settings/network-mode-switch.ts`
- Wallet switch trigger: `prepareActiveWalletSwitch` in `frontend/src/lib/wallet/prepare-active-wallet-switch.ts`
- Stopgap feature activation: `useRailLoadsOnFeatureActivation` in `frontend/src/hooks/useRailLoadsOnFeatureActivation.ts`
- Feature contract: [doc/features/wallet-lifecycle.yaml](../../doc/features/wallet-lifecycle.yaml)

---

## Problem

Rails start because an event happened, not because the state says they should run. Each event handler re-derives the context and decides what to start:

| Event | Where rails are started or stopped |
|-------|-----------------------------------|
| Unlock | `runUnlockLoad` (on-chain, Arkade if `isArkadeActiveForNetworkMode`, Bark via `startBarkLoadAfterUnlock`, Lightning) |
| Network switch | `abort*SessionForNetworkSwitch`, then `refreshArkadeSessionAfterNetworkSwitch`, `refreshBarkSessionAfterNetworkSwitch`. Lightning: nothing |
| Wallet switch | `prepareActiveWalletSwitch` (close Arkade and Bark, purge Lightning, reset lifecycles, lock) |
| Feature toggled on | `useRailLoadsOnFeatureActivation` (stopgap, added after the NWC bug) |
| Feature toggled off | Nothing for Arkade or Bark; sessions keep running until lock or network switch |
| Lightning connection added | `reloadLightningRailAfterConnectionsChanged` |
| Lock | `lockAndPurgeSensitiveRuntimeState`, `syncAllRailLifecyclesWithLockPhase` |

Any state change without a handler leaves the rails out of sync. The NWC disappearance bug was one: unlock ran while `isLightningEnabled` was false (toggle or late feature-store hydration), Lightning was skipped, nothing retried, and the next `addConnection` saved the in-memory list over the stored one.

The same rules are re-checked at roughly 230 call sites in 76 files: `walletStatus === 'unlocked'`, `activeWalletId == null`, `isLightningEnabled && isLightningSupported(networkMode)`, `isArkadeActiveForNetworkMode`, `isBarkActiveForNetworkMode`, and similar. They drift. Arkade checks `isMainnetAccessEnabled`; Lightning and Bark do not, and rely on mainnet being unreachable while that flag is off.

---

## Invariant

Which rails run, for which wallet and network, is a pure function of one context value. One reconciler makes the running sessions match that function after every context change. No other code starts or stops a rail session.

This note decides **which sessions exist**. [dashboard-scope-guards.md](./dashboard-scope-guards.md) decides **which finished work may paint the dashboard or persist**. Both use the same rail scopes and key helpers.

---

## Step 1: Context and desired rail scopes

New module `frontend/src/lib/wallet/session/wallet-session-context.ts`:

```ts
export type WalletSessionContext =
  | { kind: 'no-wallet' }
  | { kind: 'locked'; walletId: number }
  | { kind: 'unlocked'; walletId: number; networkMode: NetworkMode; features: RailFeatureFlags }

export type RailFeatureFlags = {
  isLightningEnabled: boolean
  isArkadeEnabled: boolean
  isBarkEnabled: boolean
  isMainnetAccessEnabled: boolean
}

export function readWalletSessionContext(): WalletSessionContext
```

`readWalletSessionContext` reads `useWalletStore`, `useFeatureStore`, and the lock lifecycle snapshot. It returns `locked` until both persisted stores report `hasHydrated()`. Late hydration then becomes an ordinary context change instead of a race.

Use the lock lifecycle phase, not `walletStatus`, as the source of `unlocked`. `unlocking` and `locking` map to `locked` so no rail starts mid-transition.

New module `frontend/src/lib/wallet/session/desired-rail-scopes.ts`:

```ts
export type RailId = 'onchain' | 'lightning' | 'arkade' | 'bark'

export type DesiredRailScope =
  | { rail: 'onchain'; scope: OnchainRailDescriptorScope }
  | { rail: 'lightning'; scope: LightningRailScope }
  | { rail: 'arkade'; scope: { walletId: number; networkMode: ArkadeSupportedNetworkMode } }
  | { rail: 'bark'; scope: { walletId: number; networkMode: BarkRailNetwork } }

export function desiredRailScopes(context: WalletSessionContext): DesiredRailScope[]
export function isRailDesired(context: WalletSessionContext, rail: RailId): boolean
export function desiredRailScopeKey(desired: DesiredRailScope): string
```

Arkade's desired scope has no `arkadeAccountId`; the account is resolved during load. The running session's `ArkadeRailScope` adds it.

Move the rules here, with tests per row:

| Rail | Desired when unlocked and |
|------|---------------------------|
| On-chain | always (lab included) |
| Lightning | `isLightningEnabled`, `isLightningSupported(networkMode)`, mainnet needs `isMainnetAccessEnabled` |
| Arkade | today's `isArkadeActiveForNetworkMode` |
| Bark | today's `isBarkActiveForNetworkMode` (keeps the e2e regtest exception) |

`isArkadeActiveForNetworkMode`, `isBarkActiveForNetworkMode`, and the Lightning predicate in `lightning-connection-utils.ts` become thin wrappers over `isRailDesired(readWalletSessionContext(), rail)` in this step, then are deleted in step 3 once their callers read the context directly.

Lightning with zero stored connections is still desired. The load decides `not-configured`, as today. The reconciler does not read secrets.

Decide during this step whether Lightning should honour `isMainnetAccessEnabled`. Today it does not. Either way, write it down in `wallet-lifecycle.yaml`.

Deliverable: two pure modules, unit tests, no behaviour change.

---

## Step 2: Reconciler (replaces the activation hooks first)

New module `frontend/src/lib/wallet/session/rail-reconciler.ts`.

```ts
type RailDriver = {
  start: (desired: DesiredRailScope) => Promise<void>
  stop: () => Promise<void>
}

export function startRailReconciler(drivers: Record<RailId, RailDriver>): () => void
```

Behaviour:

1. Subscribe to `useWalletStore`, `useFeatureStore`, and the lock lifecycle. On any change, compute `desiredRailScopes(readWalletSessionContext())`.
2. Keep `runningScopeKeyByRail: Partial<Record<RailId, string>>`.
3. For each rail: desired and not running → `start`. Running but not desired → `stop`. Running with a different key → `stop`, then `start`.
4. Serialize per rail. A new reconcile while a rail's start or stop is in flight queues behind it; only the latest desired state is applied (drop intermediate ones).
5. Record the running key when `start` resolves, also when the load ends in `load-error`. Errors stay with the rail's load lifecycle and its banner; the reconciler does not retry. `orchestrate*RetryLoad` stays the user retry path.

Drivers wrap what exists:

| Rail | `start` | `stop` |
|------|---------|--------|
| On-chain | `orchestrateOnchainLoad` + `orchestrateOnchainPostUnlockSync` (lab: no sync) | nothing; lock handles the WASM wallet |
| Lightning | `orchestrateLightningLoad` | `purgeLightningConnectionsFromMemory` for that wallet, `syncLightning*WithLockPhase('locked')` |
| Arkade | `orchestrateArkadeLoad` | `closeArkadeSession` (network switch keeps `abortArkadeSessionForNetworkSwitch`) |
| Bark | `orchestrateBarkLoad` | `closeBarkSession` |

All starts pass `allowRetryFromError: true`, matching unlock.

Start the reconciler once from `AppInitializer` (a `useEffect` that returns the unsubscribe). Delete `useRailLoadsOnFeatureActivation`, `useRailLoadOnFeatureActivation`, and their test in the same change; port the test cases to reconciler tests.

In this step the reconciler only acts on transitions that today have no handler (feature on, feature off, hydration). To avoid double starts with the existing triggers, it treats a rail as running when the rail's load snapshot is already `loading` or `loaded` for the same scope. The in-flight trackers already coalesce same-key loads; this check also covers different-key races.

Deliverable: feature toggles start and stop rails while unlocked. The activation hooks are gone.

---

## Step 3: Move the existing triggers to the reconciler

One trigger per change. Each change deletes the rail starts it replaces. Do not keep both.

1. **Unlock.** `runUnlockLoad` keeps `waitForCryptoWorkerHealthy` and the on-chain load (the on-chain load gates unlock success). Remove its Arkade, Bark, and Lightning starts. The lock phase becoming `unlocked` makes the reconciler start them.
2. **Network switch.** `executeSettingsNetworkSwitch` keeps the abort before the descriptor switch and the descriptor switch itself. Remove `refreshArkadeSessionAfterNetworkSwitch` and `refreshBarkSessionAfterNetworkSwitch` calls; the committed `networkMode` change re-keys the desired scopes. Lightning gets a correct reload on network switch for free. Lab stays special: `isRailDesired` returns false for every rail but on-chain in lab.
3. **Wallet switch.** `prepareActiveWalletSwitch` keeps `awaitInFlightWalletSecretsWrites`, lock, and `setActiveWallet`. The Arkade, Bark, and Lightning teardown happens through the reconciler when the context becomes `locked` for the new wallet. This step lines up with `commitActiveDashboardScope` in [dashboard-scope-guards.md](./dashboard-scope-guards.md) step 4; land them together or keep the dashboard clearing in `releasePreviousWalletDashboardSession` until that note's step 4 ships.
4. **New wallet and wallet delete.** `new-wallet.ts` and `wallet-delete-finalize.ts` stop starting or purging rails by hand.
5. **Lightning connection changes.** `reloadLightningRailAfterConnectionsChanged` becomes a reconciler `refresh(rail)` call: same desired key, forced restart. Add `refresh` to the reconciler API for this case only.
6. **Lock.** `lockAndPurgeSensitiveRuntimeState` keeps ending the secrets session and purging memory. Rail stops happen through the reconciler. `syncAllRailLifecyclesWithLockPhase` stays for now (lifecycle snapshot reset); step 5 of the larger refactor (rail state machines, out of scope here) absorbs it.

After each item, replace guard call sites in the touched files with `readWalletSessionContext()` or `isRailDesired(...)`. At the end of step 3, delete `isArkadeActiveForNetworkMode`, `isBarkActiveForNetworkMode`, and `startBarkLoadAfterUnlock`, and grep for leftover `walletStatus === 'unlocked'` and feature-flag-plus-network pairs outside `desired-rail-scopes.ts`.

Ordering constraint: Arkade aborts must still happen **before** the descriptor switch commits `networkMode`, because Esplora scans are not awaited. Keep that explicit abort in `executeSettingsNetworkSwitch`; the reconciler's later `stop` on the old key is then a no-op.

---

## Step 4: Queries read the context

1. Add `useWalletSessionContext()` (React hook over the same subscriptions as the reconciler, `useSyncExternalStore`) and `useRailQueryGate(rail)`:

   ```ts
   function useRailQueryGate(rail: RailId): {
     desired: DesiredRailScope | null
     queryKeyPrefix: readonly unknown[] | null
     enabled: boolean
   }
   ```

   `enabled` is true only when the rail is desired and its load snapshot is `loaded` for that scope key. `queryKeyPrefix` is `['wallet', scopeKey, rail]`.

2. Migrate rail query hooks one rail at a time: `useLightningDashboardQueries`, `useLightningMutations`, `useSendLightningBalances`, `useArkadeQueries`, `useBarkPeriodicSyncQuery`, `useOnchainPeriodicSyncQuery`, and `usePeriodicSyncRefetchInterval`. Each drops its own `isLightningEnabled` / network / wallet-id checks.

3. Query keys use the scope prefix. This overlaps [dashboard-scope-guards.md](./dashboard-scope-guards.md) step 5 (“Queries”): do it once, there or here, with the same key format. Remove hand-written removals (`removeOnchainDashboardQueries`, `removeLightningConnectionsHydrationQueries`, `removeArkadeDashboardQueries`) once the key change makes them redundant.

4. UI components (`DashboardPage`, `ManagementPage`, `ReceivePage`, `SendPage`) read `useRailQueryGate(rail).desired != null` instead of combining feature flag and network themselves.

---

## Related problem A: blind payload writes

Several writers read the encrypted `wallet_secrets` payload, change it in a worker, and write the whole blob back with a transform that ignores the current row (`transform: async () => blob`). A write that lands between their read and their write is lost.

**Status: fixed for the Arkade and Bark workers.** The bug became visible on Signet, the first network where Arkade and Bark run side by side. Opening an Arkade session failed with "Failed to update encrypted wallet secrets after 8 CAS retries".

Two causes combined:

- The OPFS writer lock is re-entrant for the whole tab while any holder runs. It therefore never kept same-tab writers out of each other's read → CAS window.
- Every worker encrypt and decrypt runs Argon2id, so a read-modify-write window lasts seconds. Each durable Bark record commits a full payload write.

What was done:

1. `wallet-persistence.ts` runs every `update*WithRetry` call in a same-tab FIFO critical section (`createSerialTaskQueue`). Same-tab writers can no longer land inside each other's read → CAS window. Work inside must never wait for another wallet-secrets write.
2. `EncryptedWalletSecretsHost.updateEncryptedPayload(walletId, transform)` runs read → transform → CAS inside that section, with the transform as a Comlink-proxied worker callback. The worker helper `updateDecryptedWalletPayload` (`frontend/src/workers/worker-wallet-payload-update.ts`) decrypts, applies a pure merge, and encrypts inside the callback. The originally planned worker-side retry loop was not used: with Argon2-length windows it would lose CAS races even more often.
3. All Arkade writers (`persistSdkJsonToEncryptedPayload`, `updateOperatorSyncAtEncrypted`, `ensureArkadeAccountEncrypted`) and Bark writers (`persistOpenedBarkAccount`, `persistBarkProtocolState`, `writePendingEmergencyClaim`, `writeProceedAutomatically`) use it.
4. `writeEncryptedPayloadCAS`, `readEncryptedPayloadWithRevision`, and `writeEncryptedPayloadIfRevisionMatches` were removed from the host.
5. When a rail worker is terminated, its host's detach signal aborts. A transform that will never settle then releases the critical section.

Tests: `frontend/src/lib/wallet/__tests__/encrypted-wallet-secrets-host.integration.test.ts` (real SQLite), plus `does not let a same-tab writer land between read and CAS…` in `wallet-persistence.test.ts`.

Still open:

| Writer | File | Today |
|--------|------|-------|
| `resolveDescriptorWallet` | `frontend/src/lib/wallet/descriptor-wallet-manager.ts` | reads without revision, writes `transform: async () => encryptedPayloadToStore` |

Fix: move the worker call inside the CAS transform, like `ensureSegwit0DescriptorRow` and `updateDescriptorWalletChangeset` already do. If the row already exists the transform returns the current blob unchanged.

---

## Related problem B: saves built from memory

A save that builds the stored list from in-memory state can erase what memory never loaded. The NWC bug was this case; `addConnection`, `removeConnection`, and `renameConnection` now read the stored list first. That fix still has a read-then-save window, and other saves may follow the same pattern.

Fix:

1. Change `saveLightningConnectionsForWallet` to take a mutation instead of a list:

   ```ts
   type LightningConnectionsMutation =
     | { kind: 'add'; connection: ConnectedLightningWallet }
     | { kind: 'remove'; connectionId: string }
     | { kind: 'rename'; connectionId: string; label: string }
   ```

   The mutation is applied inside the `updateWalletSecretsPayloadWithRetry` transform, so it runs on the current payload under CAS. The store applies the same mutation to memory after the save resolves, or reloads the rail. Label validation that depends on the stored list (default label, duplicates) moves into the transform and throws a typed error the store maps to the existing messages.
2. Update `LightningSaveConnectionsParams` and the save orchestrator accordingly. Retry (`orchestrateLightningRetrySave`) replays the mutation; `add` must be idempotent by connection id.
3. Audit other saves for the same pattern and list them in this note before changing them. Start with: `batchApplyNwcSnapshotPatches` (patch-based, likely fine), on-chain changeset saves (`updateDescriptorWalletChangeset`, per-row, likely fine), Arkade account lists in `ensureArkadeAccountInPayload`, and any Zustand `persist` slice that mirrors database rows (`lightningStore.activeConnectionIds` is persisted separately and is reset by purge; confirm that a purge never writes an empty map that a later reconcile treats as truth).

Tests: a Vitest case per mutation kind where the stored list contains a connection that memory does not, asserting the stored connection survives. Keep the reproduction from the NWC investigation as an integration-style test: Lightning disabled at unlock, enabled after, add a connection, both stored.

---

## Tests

- Step 1: table tests for `desiredRailScopes` covering lock phases, hydration not finished, each feature flag, each network including lab and regtest, mainnet access off.
- Step 2: reconciler tests with fake drivers: start on desire, stop on undesire, restart on key change, no start while `locked`, per-rail serialization, latest state wins, start error recorded as running.
- Step 3: existing lifecycle tests for unlock, network switch, and wallet switch keep passing after the triggers move. Add one test per moved trigger asserting the old direct call is gone (the rail starts via the reconciler only).
- Step 4: hook tests for `useRailQueryGate`: disabled while loading, enabled when loaded for the scope, new key after a network switch.
- E2E: no new Playwright path. Existing unlock, network switch, and Arkade regtest paths cover the happy paths; the reconciler must keep them green.

---

## Out of scope

- One state machine per rail session, merging the load, save, and sync orchestrators (tracked separately).
- Publish and persist guards for late completions; see [dashboard-scope-guards.md](./dashboard-scope-guards.md).
- Cancelling in-flight WASM work on context change. Stops close sessions; scans already running may finish and are then ignored by the publish guard.
- Multi-tab coordination beyond what the writer lock and CAS already give.
