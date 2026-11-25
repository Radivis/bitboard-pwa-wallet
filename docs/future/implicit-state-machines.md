# Implicit state machines

Planning note. Catalog of TypeScript flows that encode mutually exclusive phases with unions, step indexes, or clusters of flags. Nothing here is implemented. One section is one refactoring ticket unless the section says to split it.

Related:

- Already explicit: `unilateralExitMachine` and `vtxoExitMachine` in `frontend/src/lib/wallet/lifecycle/unilateral-exit/`
- Rail lifecycle as it exists today: [wallet-rail-lifecycle.md](../wallet-rail-lifecycle.md)
- Who starts a rail session (a different problem from how a rail’s phases move): [wallet-session-context-and-rail-reconciler.md](./wallet-session-context-and-rail-reconciler.md)
- Which finished work may paint the dashboard: [dashboard-scope-guards.md](./dashboard-scope-guards.md)

XState is the library these are candidates for. A ticket can still keep a small explicit union if the flow has two states and no illegal combinations. The value of a machine is the cases below: ordered steps, a product of two fields, or flags that can be true together when they must not be.

## Already explicit

Do not open tickets for these. UI phases are views of the actors.

| Machine | Path | States |
|---------|------|--------|
| `unilateralExitMachine` | `frontend/src/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.machine.ts` | `notConfigured`, `idle`, `taggingPlan`, `checkingProgress`, `loadingProgress`, `evaluatingPolicy`, `proceeding`, `ensuringBroadcast`, `waitingConfirm`, `waitingForParentData`, `paused`, `complete`, `terminated`, `aborted`, `error` |
| `vtxoExitMachine` | `frontend/src/lib/wallet/lifecycle/unilateral-exit/vtxo-exit.machine.ts` | `routing`, `idle`, `tagged`, then the Arkade exit phases (`host_broadcast_attempted`, `host_relayed`, `host_confirmed`, `unrolled`, `complete_ready`, `exited`, `funding_lost`) |

`UnilateralExitControlDisplayPhase` (`frontend/src/lib/arkade/unilateral-exit-control-phase.ts`) and the selectors in `vtxo-exit-selectors.ts` read those actors.

## Index

| Id | Machine | Size | Ticket? |
|----|---------|------|---------|
| [ISM-01](#ism-01-lock-session) | Lock session, plus the coarser `WalletStatus` | Large | Yes |
| [ISM-02](#ism-02-rail-load-sync-and-save) | Per-rail load, sync, and save | Large | Yes, long-standing |
| [ISM-03](#ism-03-send) | Send step, rail mode, Lightning resolve | Large | Yes. Split mode from the Lightning sub-flow if the diff gets wide |
| [ISM-04](#ism-04-bark-board-and-offboard) | Bark board and offboard review | Medium | Yes, one ticket for both pages |
| [ISM-05](#ism-05-wallet-backup-import) | Backup ZIP import | Medium | Yes |
| [ISM-06](#ism-06-arkade-batch-intent) | Pending batch intent | Medium | Yes |
| [ISM-07](#ism-07-bark-emergency-exit-automation) | Emergency-exit automation and the page mutex | Medium | Yes. Automation and `busyAction` can be separate tickets |
| [ISM-08](#ism-08-worker-health) | Crypto, Arkade, and Bark worker health | Small | Yes |
| [ISM-09](#ism-09-create-wallet) | Create-wallet wizard | Small | Yes |
| [ISM-10](#ism-10-password-change-and-upgrade) | Change and upgrade app password | Small | Yes, one ticket for both modals |
| [ISM-11](#ism-11-delete-wallet) | Delete-wallet dialogs | Small | Yes |
| [ISM-12](#ism-12-descriptor-switch) | Network and address-type switch | Medium | Yes |
| [ISM-13](#ism-13-seed-phrase-backup) | Seed reveal | Small | Optional |
| [ISM-14](#ism-14-drawer-presence) | Drawer enter and exit | Small | Optional |

Derived protocol phases at the end are recorded so they are not filed as their own machines. TypeScript classifies them. Rust or the worker advances them.

---

## ISM-01 Lock session

**Why.** Phase and operation are a product that the code sets through two writers (`setPhase` and `setSnapshot`). Several pairs are illegal. `WalletStatus` is a second session machine for the same lifetime, without the in-flight phases, so the store and the orchestrator can disagree.

**States.**

| Field | Values |
|-------|--------|
| `LockLifecyclePhase` | `no-lock`, `locked`, `locking`, `unlocking`, `unlocked` |
| `LockLifecycleOperation` | `none`, `locking`, `manual_unlock`, `bootstrap_unlock` |
| `WalletStatus` | `none`, `locked`, `unlocked` |

Legal pairs: `no-lock` + `none`, `locked` + `none`, `locking` + `locking`, `unlocking` + `manual_unlock`, `unlocking` + `bootstrap_unlock`, `unlocked` + `none`.

**Where.**

- `frontend/src/lib/wallet/lifecycle/lock-lifecycle-types.ts`
- `frontend/src/lib/wallet/lifecycle/lock-lifecycle-orchestrator.ts` (`orchestrateLock`, `orchestrateManualUnlock`, `orchestrateBootstrapUnlock`)
- `frontend/src/stores/walletStore.ts` (`WalletStatus`, `lockWallet`)
- `frontend/src/lib/wallet/wallet-unlocked-status.ts`

**Transitions.** Wallet id appears or disappears. User locks. Password unlock. Bootstrap when a secrets session already exists. Unlock failure reverts to `locked` or `no-lock`. Create and import write `unlocked` on the store without going through `orchestrateManualUnlock`.

**Invariants to keep.**

- Lock is refused from `no-lock`.
- Bootstrap is refused while a manual unlock or a lock is in flight, and while the store is already unlocked.
- The same unlock key joins the running promise.
- Lock waits until every rail’s load has settled, abandons an in-flight on-chain scan, then waits for sync and save.
- A rail in `save-error` blocks lock (`*SaveBlockingLockError`) until the error is retried or acknowledged.
- UI that means “session is open” reads one source. Today `walletIsUnlockedOrSyncing` only accepts `walletStatus === 'unlocked'`.

**Ticket scope.** One machine for the lock session. Fold `WalletStatus` into a selector over that machine, or define the allowed pairs between the two and test them. Leave rail phase machines to ISM-02. Leave “which rails should be running” to [wallet-session-context-and-rail-reconciler.md](./wallet-session-context-and-rail-reconciler.md).

---

## ISM-02 Rail load, sync, and save

Long-standing candidate. The phases already have names. What is implicit is the cross-rail copy of the same three machines, the rule that sync and save are illegal until load is `loaded`, and the coupling to lock.

**States** (`frontend/src/lib/wallet/lifecycle/rail-lifecycle-types.ts`):

| Machine | Values |
|---------|--------|
| Load | `not-configured`, `loading`, `loaded`, `load-error` |
| Sync | `not-configured`, `not-syncing`, `syncing`, `sync-error` |
| Save | `not-configured`, `not-saving`, `saving`, `save-error` |

**Instances.**

| Rail | Load | Sync | Save |
|------|------|------|------|
| On-chain | `orchestrateOnchainLoad` | `orchestrateOnchainSyncThenSave` | `orchestrateOnchainSave` |
| Arkade | `orchestrateArkadeLoad` | `orchestrateArkadeSyncThenSave` | `orchestrateArkadeSave` |
| Bark | `orchestrateBarkLoad` | `orchestrateBarkSync` | none |
| Lightning | `orchestrateLightningLoad` | `orchestrateLightningSyncThenSave` | `orchestrateLightningSave` |

Save is one factory: `createSaveLifecycleOrchestrator` in `frontend/src/lib/wallet/lifecycle/save-lifecycle-orchestrator-factory.ts`. Single-flight joining is `createInFlightLifecycleTracker` in `lifecycle-in-flight-tracker.ts`. Lock reset skips a rail that is mid-transition: `shouldSkipRailLifecycleResetForLockPhase` in `rail-lifecycle-lock-phase.ts`. On-chain sync is the exception: locking clears `syncing` even while the HTTP scan is still open.

**Nested machines.**

- Lightning connections: `ConnectionSyncTrackerStatus` is `idle | syncing | ok | error` (`lightning-sync-lifecycle-types.ts`). Any in-flight connection makes the rail `syncing`. Otherwise any `error` makes it `sync-error`. Zero connections returns the rail to `not-configured`.
- Arkade sync kind: `postLoad | dashboardPoll | manual | signerMigration`.
- On-chain sync kind: `postUnlock`, `incrementalDashboard`, `fullRescanDashboard`, `descriptorSwitch`, `setupInitial`, `postBroadcast`, `barkExitCatchUp`.
- Bark sync snapshot also carries `BarkRefreshStatus` (see [derived phases](#derived-phases-do-not-ticket-as-machines)).

**Invariants to keep.**

- `load-error` stays until an explicit retry.
- A second call with the same key joins the running promise. A different key waits.
- Arkade and Bark generation counters drop a session-start that completes after timeout, so a late success cannot stamp `loaded`.
- Successful load is what moves sync from `not-configured` to `not-syncing`.
- Arkade sync is refused while Arkade load is `loading`.
- Abandoned or superseded on-chain scans do not save and do not toast.
- `save-error` blocks lock until `orchestrateRetrySave` or `acknowledgeSaveErrorForForcedLock`.
- Lightning load may return to `not-configured` when the wallet has no connections. The other rails do not.

**Ticket scope.** One shared load/sync/save machine, parameterized by rail, with the per-rail events as inputs. Bark has no save state. Do not redo session start policy in this ticket. That is [wallet-session-context-and-rail-reconciler.md](./wallet-session-context-and-rail-reconciler.md). The current architecture write-up is [wallet-rail-lifecycle.md](../wallet-rail-lifecycle.md). It predates the Bark rail.

Suggested split if one PR is too large: (1) shared phase machine and save factory, (2) on-chain, (3) Arkade, (4) Lightning including the connection tracker, (5) Bark.

---

## ISM-03 Send

**Why.** Step, rail, and Lightning confirmation are three states stored as a number plus booleans. Step 2 without a PSBT is an empty review on a real network. Two rails cannot be the send mode at once, but the mode is derived at each call site.

**States.**

| Piece | Values |
|-------|--------|
| `SendStep` | `1` entry, `2` review |
| Rail mode | Lightning, Bark, Arkade, otherwise on-chain. Today these are `isLightningSendMode`, `isBarkSendMode`, `isArkadeSendMode` |
| Lightning resolve | idle, resolving, awaiting signet-family confirmation, paying |

**Where.**

- `frontend/src/stores/sendStore.ts` (`SendStep`, initial `step: 1`)
- `frontend/src/pages/wallet/SendPage/index.tsx` (step changes after prepare, back to step 1, submit from step 1 for Lightning, Bark, and Arkade)
- `frontend/src/pages/wallet/SendPage/lightning.tsx` (`isResolvingLightningPayee`, `pendingSignetFamilyInvoice`, `signetFamilyInvoiceConfirmed`)

**Transitions.** Successful on-chain or lab prepare moves to step 2. Back, and entering step 1, clears the review summary. Lightning, Bark, and Arkade submit from step 1. A BOLT11 pays immediately. A Lightning address or LNURL resolves first, and a signet or mutinynet invoice stops for confirmation. Recipient or network changes clear that confirmation. Lab dust and manual UTXO selection sit beside the step. Manual UTXO selection is only legal on step 2.

**Invariants to keep.**

- Review data (`psbt`, fee, change) is absent on step 1 and present on step 2 for on-chain and lab.
- Paying while resolve is in flight is blocked.
- A signet-family invoice is unpaid until the confirmation flag is set.
- Leaving the page resets the store to step 1.

**Ticket scope.** One send machine whose context holds the recipient-derived rail. Lightning resolve is a nested state, invoked only in Lightning mode. Dust modals can stay local UI.

---

## ISM-04 Bark board and offboard

**Why.** Review, reprice, and confirm are separate booleans. The buttons disable overlaps. The state still allows `isReviewing && isConfirming`.

**Board** (`frontend/src/pages/wallet/BarkBoardPage.tsx`): `review`, `reviewedAtFeeRate`, `reviewError`, `repriceError`, `isReviewing`, `isRepricing`, `isConfirming`.

Inferred states: editing, reviewing, review ready, repricing, reprice error, confirming.

A fee-rate change after review starts a reprice. Confirm stays disabled until the reviewed fee matches the current fee and nothing is in flight. Confirm calls `performBarkBoard` and leaves the page.

**Offboard** (`frontend/src/pages/wallet/BarkOffboardPage.tsx`): `review`, `isReviewing`, `isConfirming`, plus `BarkOffboardMode` `amount | all` (`frontend/src/lib/bark/review-bark-offboard.ts`). Same entry, review, confirm sequence, without reprice. `performBarkOffboard` can park (`BarkOffboardParkedError`) instead of finishing.

**Invariants to keep.**

- Confirm is unreachable without a review that matches the current inputs.
- Reviewing, repricing, and confirming are exclusive.
- Mode `amount | all` is data on the offboard form, not a second lifecycle.

**Ticket scope.** One review machine used by both pages. Board adds a reprice state. Offboard adds the parked outcome.

---

## ISM-05 Wallet backup import

**Why.** The ordered path is pick a ZIP, confirm wipe, enter password, then replace and reload. The UI stores that as four flags. A stage value exists only so a failure after verify is not counted as a bad password.

**States.** `WalletBackupImportStage` is `pre-verify | post-verify` (`frontend/src/components/settings/use-wallet-backup-import.ts`). The visible cluster is wipe modal, password modal, bypass modal, `importBusy`, and `pendingImport`.

**Transitions.** User picks a ZIP. Wipe confirm opens the password modal. Verify failures count toward the bypass modal. After verify succeeds, replace-and-reload must stay in `post-verify`. Callbacks close one modal before opening the next.

**Invariants to keep.**

- Two of wipe, password, and bypass are not open together.
- A `post-verify` failure does not increment the bad-password count.
- `importBusy` covers the stretch where dismiss would race the OPFS replace.

**Ticket scope.** One import machine. The stage union and the modal flags become one state.

---

## ISM-06 Arkade batch intent

**Why.** The phase the UI acts on is split across the worker intent, a mutation flag, and three module-level sets. `submission` and `succeeded` are not stored on the intent.

**States** (`ARKADE_INTENT_LIFECYCLE_PHASES` in `frontend/src/lib/arkade/arkade-pending-batch-intent.ts`): `submission`, `processing`, `timed_out`, `reregister_hold`, `succeeded`.

- Banner subset (`ArkadePendingIntentPhase`): `processing | timed_out | reregister_hold`.
- `submission` is `isIntentSubmitPhase`: mutation pending and no intent yet.
- `succeeded` is `classifyPendingIntentDisappearance`: the intent is gone and the operator finalized.
- Kinds: `board`, `recover`, `renew`, `collaborative_exit`, `migrate`.
- Side sets in the same file: `cancelledPendingIntentKeys`, `inFlightRegisteredIntentKeys`, `settledByMutationIntentKeys`.

**Who moves it.** Submit starts `submission`. The operator round moves a stored intent to `processing`. A TTL timer yields `timed_out` or `reregister_hold`. Cancel and retry are user events. `useCollaborativeExitFlow` leaves the page once a collaborative exit is `processing`. Board, renew, and signer migration share this machine. `ArkadeSignerMigrationDeprecatedStatus` (`migratable | due_now | expired` in `frontend/src/workers/arkade-api.ts`) is a deadline label beside the migrate intent, not a second lifecycle.

**Invariants to keep.**

- Boarding settle is blocked unless the phase is `reregister_hold` (`pendingIntentBlocksBoardingSettle`).
- Boarding retry is allowed only from `timed_out` or `reregister_hold`, and only after `BOARDING_REGISTER_INTENT_TTL_SECS`.
- A key in the cancelled set is not treated as a new pending intent.
- `succeeded` and “still pending” are exclusive.

**Ticket scope.** One intent machine per kind, fed by worker snapshots and the mutation. The three sets become context or events, not parallel sources of truth. Collaborative exit navigation stays an effect of entering `processing`.

---

## ISM-07 Bark emergency-exit automation

**Why.** Idle, running, paused, and failed are three fields that can be combined. A generation counter is what makes a superseded loop illegal. The page has a second mutex for user actions.

**Automation activity** (`frontend/src/stores/barkEmergencyExitAutomationStore.ts`):

```ts
{ inFlight: boolean; errorMessage: string | null; pausedReason: 'feeCapExceeded' | 'fundsInsufficient' | null }
```

Idle is all empty. Running is `inFlight`. Paused is a `pausedReason` with `inFlight` false. Failed is `errorMessage` with `inFlight` false. `inFlight` together with `pausedReason` is illegal.

**Where the runner lives.** `syncBarkEmergencyExitAutomation` and `stopBarkEmergencyExitAutomation` in `frontend/src/lib/bark/bark-emergency-exit-automation.ts`. `shouldProgressBarkEmergencyExitOnTip` requires an unlocked wallet, a loaded Bark rail, the same wallet and network, and a new tip. Pause comes from `decideBarkEmergencyExitAutomatedFee` and sticks until the user changes the fee cap. A newer `automationGeneration` must not publish activity for a stopped loop.

**Page mutex.** `busyAction` in `frontend/src/hooks/useBarkEmergencyExitPage.ts`: `review | start | progress | cancel:${vtxoId} | claim | null`. One action at a time. A fee-rate change clears a review that is in progress.

**Invariants to keep.**

- Automatic progress returns immediately while paused.
- Stop bumps the generation so a late tick cannot clear the pause or publish `inFlight`.
- The page does not start a second `busyAction` while one is set.

**Ticket scope.** The activity object is one machine. `busyAction` is a small exclusive-action machine and can be its own ticket. This is separate from the Arkade unilateral-exit `paused` state, which is already XState.

---

## ISM-08 Worker health

**Why.** Startup failure and a later crash share an error path in callers, and recovery differs. A crashed worker can become healthy again on a later ping without constructing a new `Worker`.

**States.** `RailWorkerHealthStatus` in `frontend/src/workers/rail-worker-controller.ts`: `initializing | healthy | error | crashed`.

**Transitions.** `get()` with no worker starts at `initializing`. First ping succeeds to `healthy` or fails to `error`. A runtime `error` event or a later failed ping goes to `crashed`. A successful ping from `crashed` returns to `healthy`. `terminate` drops the worker. The next health read is `initializing` again.

**Used by.** `cryptoStore.workerHealth`, `frontend/src/workers/crypto-factory.ts`, `arkade-factory.ts`, `bark-factory.ts`. Arkade and Bark load treat a timeout by terminating the worker, which is this machine plus the load generation counter in ISM-02.

**Invariants to keep.**

- `waitUntilHealthy` throws on `error` and on `crashed`, and times out while still `initializing`.
- `error` means the worker never became healthy. `crashed` means it did, then failed. Callers that terminate on timeout must keep that distinction.

**Ticket scope.** The controller is already one object. The ticket is to make the transitions explicit and to stop callers from treating `error` and `crashed` as the same event.

---

## ISM-09 Create wallet

**Why.** Three ordered steps, and a second flag for which persist action is waiting on the app password. Verification before a mnemonic exists is meaningless. Persist runs only from step 3.

**States.** `Step = 1 | 2 | 3` and `pendingCreateAction: 'generate' | 'quickCreate' | null` in `frontend/src/pages/setup/CreateWalletPage.tsx`.

**Transitions.** Step 1 picks 12 or 24 words and may open the app-password modal. Step 2 shows the seed. Step 3 checks three words and persists. Encrypted blobs are kept so step 3 can persist without holding the mnemonic. There is no back transition.

**Invariants to keep.**

- Step 3 is unreachable without the blobs from step 1.
- `pendingCreateAction` is set only while the password modal is the thing blocking persist.
- Quick-create and generate do not both run.

**Ticket scope.** One wizard. Import (`ImportWalletPage`) is a single validating form (`isValid: boolean | null`, then a restore mutation) and does not belong in this ticket.

---

## ISM-10 Password change and upgrade

**Why.** The same three phases are copied in two modals. Dismiss during `running` is blocked by a condition, not by the absence of a dismiss event.

**States.** `Phase = 'form' | 'running' | 'success'` in `frontend/src/components/ChangeAppPasswordModal.tsx` and `frontend/src/components/UpgradeFromNearZeroPasswordModal.tsx`.

**Transitions.** Submit moves to `running`. Success stays on `success`. Failure returns to `form`. Dismiss is available from `form` and `success`.

**Ticket scope.** One shared machine, two hosts. `SetAppPasswordModal` only has `isSubmitting` and can stay as it is.

---

## ISM-11 Delete wallet

**Why.** Three dialogs and a probe flag. The probe decides the next dialog. Probe failure reopens the first dialog. More than one dialog open is a bug the close-all helper papers over.

**States** (`frontend/src/components/wallet/DeleteWalletSection.tsx`): closed, first confirmation, probing mainnet balance, mainnet warning, mainnet blocked (unbacked seed), deleting.

Fields today: `firstDialogOpen`, `probingMainnet`, `mainnetWarnOpen`, `mainnetBlockedOpen`, plus the delete mutation.

**Transitions.** Confirm starts the probe when the wallet can hold mainnet funds. A positive balance opens the warning. An unbacked seed opens the blocked dialog. An empty probe deletes. `autoOpenFirstDialog` opens the first confirmation once the wallet is unlocked.

**Invariants to keep.**

- The warning, the blocked dialog, and the first confirmation are exclusive.
- Delete runs only from the first confirmation with an empty probe, or from the warning after the user accepts the balance.
- The blocked dialog never deletes.

**Ticket scope.** One dialog machine inside `DeleteWalletSection`.

---

## ISM-12 Descriptor switch

**Why.** The sequence is ordered and the failure policy changes by step, but the only stored marker is `isSwitching` plus a status string.

**Where.**

- `switchDescriptorWallet` in `frontend/src/lib/wallet/settings-switch-wallet.ts`
- `useDescriptorWalletSwitchMutation` in `frontend/src/hooks/useDescriptorWalletSwitchMutation.ts` (`switchPhaseMessage`)
- Copy in `frontend/src/lib/settings/network-switch-status-messages.ts`
- Context: `network | addressType`

**States to name.** idle, saving the previous network or address type, loading the target, syncing Esplora, committed, failed before commit. Lab skips the Esplora step.

**Invariants to keep.**

- Load failure does not commit the store.
- Sync failure still commits, and the session stays open (`walletStatus` returns to `unlocked`).
- A second switch does not start while `isSwitching` is set.

**Ticket scope.** One switch machine. The status strings become labels for the states. This ticket does not change which rails restart. That stays with the network-switch path described in [wallet-session-context-and-rail-reconciler.md](./wallet-session-context-and-rail-reconciler.md).

---

## ISM-13 Seed phrase backup

Optional. Small, and the illegal pair is easy to see.

**Where.** `frontend/src/components/wallet/SeedPhraseBackup.tsx`: `showPasswordPrompt`, `loading`, `showMnemonic`, `backupConfirmed`.

**States.** idle, password prompt (skipped when near-zero security is on), loading secrets, mnemonic visible, confirming the backup. Confirm clears the no-backup flag and closes the mnemonic. Password prompt and mnemonic visible together is illegal.

**Ticket scope.** One reveal machine. Skip if ISM-10 and ISM-11 are the pattern you want for modal flows and this one is not hurting.

---

## ISM-14 Drawer presence

Optional. Animation state, not wallet state.

**Where.** `useDrawerPresence` in `frontend/src/components/design/use-drawer-presence.ts`.

**States.** Closed (`mounted: false`). Entering (`mounted`, `motion: 'enter'`). Open. Exiting (`mounted`, `motion: 'exit'`), then a 300ms timer unmounts. Reduced motion jumps from open to closed.

**Ticket scope.** Only if drawer bugs keep coming from the render-time `setPresence` calls. Otherwise leave it.

---

## Derived phases, do not ticket as machines

TypeScript picks one label from several inputs. The transition happens in Rust, WASM, or a later sync. An XState machine here would mirror a machine the frontend does not own.

| Name | Path | What it classifies |
|------|------|--------------------|
| `BarkVtxoExitPhase` | `frontend/src/lib/bark/bark-vtxo-exit-phase.ts` | Exit row, vtxo state, and sweep items. Order runs through bumper funding, CPFP, confirmation, timelock, claimable, claiming, claimed, plus four seizure kinds. Seizure wins over the exit row. |
| `BarkExitNodePhase` | `frontend/src/lib/bark/bark-exit-graph-layout.ts` | Graph node `pending \| inProgress \| confirmed`. `inProgress` plus `needsChild` splits into `awaitingBumperFunding` or `awaitingCpfpBroadcast`. |
| `BarkRefreshStatus` | `frontend/src/lib/bark/bark-refresh-status.ts` | `idle \| scheduled \| pending \| warning \| exit_blocked`, stored on the Bark sync snapshot and overwritten by a successful `worker.sync()`. A failed sync keeps the previous value, so `sync-error` can still show a stale `pending`. |
| `LightningInvoice.status` | `frontend/src/stores/lightningStore.ts` | Declared as `pending \| paid \| expired`. `createInvoice` only writes `pending`. Nothing in `frontend/src` sets `paid` or `expired`. |
| `ReceiveMode` | `frontend/src/components/receive/ReceiveModeToggle.tsx` | Tab: `bitcoin \| lightning \| arkade \| bark`. No ordered transitions. |
| `ArkadeSignerMigrationDeprecatedStatus` | `frontend/src/workers/arkade-api.ts` | Deadline label `migratable \| due_now \| expired` beside the migrate intent in ISM-06. |
