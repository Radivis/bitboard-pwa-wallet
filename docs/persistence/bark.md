# Bark persistence

Bark (Second's Ark wallet) is a **separate rail** from on-chain BDK and from Arkade. Balances and VTXOs come from the Bark server and `bitboard-bark` WASM. They are not added to the on-chain total or the Arkade total.

For save/sync orchestration, see [wallet rail lifecycle](../wallet-rail-lifecycle.md).

## Encrypted payload (`wallet_secrets`)

Each Bark network is one entry in `WalletSecretsPayload.barkRails`:

```typescript
type BarkRailNetwork = 'signet' | 'mainnet'

interface StoredBarkRail {
  serverUrl: string
  fingerprint: string
  lastSuccessfulSyncAt?: string
  receiveKeyIndex?: number
  recordDump?: string // versioned Bark Record bytes, standard base64
}

barkRails?: Partial<Record<BarkRailNetwork, StoredBarkRail>>
```

The map key is the network. The rail record does not repeat it. Signet `serverUrl` is `https://ark.signet.2nd.dev`. This build opens Signet only. A mainnet entry, if present, is preserved and is not rewritten by a Signet flush.

A legacy singular `barkRail` with `network: 'signet'` is read once into `barkRails.signet` (metadata only, no dump).

**Size limit:** each `recordDump` must not exceed 10 MB of UTF-8 (`BARK_RECORD_DUMP_MAX_BYTES` in `wallet-domain-types.ts`). An over-cap dump is kept on the payload. Session open refuses it. Dropping it would open an empty wallet and lose the exit chain.

## Rust record store (`bitboard-bark`)

File: `bitboard-bark/src/record_store.rs`

| Type | Purpose |
|------|---------|
| `SharedRecordStore` | In-memory `StorageAdaptor` (put, get, delete, query_sorted, get_all) |
| Encoded dump | `version: 1` plus `Vec<Record>`, postcard bytes, standard base64 |

`StorageAdaptorWrapper` implements `BarkPersister`. Bitboard does not re-declare VTXO, movement, or exit tables. `query_sorted` uses Bark's `SortKey` order and skips records that have no sort key.

`bark_open_session` loads the open network's dump, then `Wallet::open` with that persister and `MemoryLockManager`. `datadir` is unset, so Bark does not open its platform IndexedDB. An empty dump string means there is no encrypted dump yet. A corrupt dump or an unknown version fails the open.

`bark_export_record_dump` exports the open network after a wallet call returns. The worker does not export on every `put`.

## Worker persistence flow

```mermaid
sequenceDiagram
  participant Main
  participant BW as bark.worker
  participant EW as encryption.worker
  participant DB as wallet_secrets

  Main->>BW: openSession for signet
  BW->>EW: decrypt barkRails.signet.recordDump
  BW->>BW: load StorageAdaptor, Wallet.open Signet

  Note over BW: sync send board exit mutate the map

  BW->>BW: export Record bytes for signet
  BW->>EW: encrypt payload
  BW->>Main: ciphertext only
  Main->>DB: CAS write
```

Key modules:

| Module | Role |
|--------|------|
| `frontend/src/workers/bark.worker.ts` | Session, export, flush after mutating calls |
| `frontend/src/workers/bark-persistence-channel.ts` | Worker ↔ encryption channel |
| `frontend/src/workers/bark-worker-metadata.ts` | CAS write of `barkRails.signet` only |
| `frontend/src/lib/bark/bark-rail-metadata.ts` | Merge helpers that leave the other network and Arkade untouched |

Main thread code handles **ciphertext only**. Plaintext records stay in the Bark worker.

A flush replaces `barkRails.signet.recordDump` and leaves `barkRails.mainnet.recordDump` and every `sdkPersistenceJson` as they were read. An Arkade flush leaves both Bark dumps as they were read. The `wallet_secrets` row is still one ciphertext, so the row is re-encrypted either way.

Flush runs after open, reveal, sync, board prepare, board submit, Arkoor, on-chain send, offboard, and emergency-exit start, progress, CPFP, cancel, and drain. A failed call still flushes when the session is open, so a checkpoint written before the error is not dropped. Peek, balance, history, VTXO list, estimates, exit list, and exit topology do not flush.

`Wallet::open` receives the in-memory persister. Bark does not open IndexedDB. An empty `recordDump` starts a new in-memory store.
