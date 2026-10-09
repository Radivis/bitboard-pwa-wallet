//! In-memory [`StorageAdaptor`] for one open Bark network.
//!
//! The encrypted rail stores a versioned dump of Bark `Record` bytes. This
//! module does not interpret VTXO, movement, or exit payloads.

use std::collections::{BTreeMap, HashMap};
use std::ops::RangeBounds;
use std::sync::{Arc, Mutex, MutexGuard};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::JsCast;

use bark::persist::adaptor::partition;
use bark::persist::adaptor::{Query, QueryRange, Record, SortKey, StorageAdaptor};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Serialize};

pub(crate) const BARK_RECORD_DUMP_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
struct BarkRecordDump {
    version: u32,
    records: Vec<Record>,
}

#[derive(Debug, Default)]
struct RecordMap {
    /// Partition, then primary key, then the record.
    partitions: HashMap<u8, BTreeMap<Vec<u8>, Record>>,
}

/// Shared with `StorageAdaptorWrapper` and with the session export path.
#[derive(Clone)]
pub(crate) struct SharedRecordStore {
    records: Arc<Mutex<RecordMap>>,
    durable_flush: Arc<Mutex<Option<DurableFlushHook>>>,
}

#[cfg(not(target_arch = "wasm32"))]
type NativeDurableFlushHook = Arc<dyn Fn(String) -> Result<(), String> + Send + Sync>;

#[derive(Clone)]
enum DurableFlushHook {
    #[cfg(not(target_arch = "wasm32"))]
    Native(NativeDurableFlushHook),
    #[cfg(target_arch = "wasm32")]
    Js(js_sys::Function),
}

#[cfg(target_arch = "wasm32")]
thread_local! {
    static PROCESS_DURABLE_FLUSH_HOOK: std::cell::RefCell<Option<js_sys::Function>> =
        const { std::cell::RefCell::new(None) };
}

impl std::fmt::Debug for SharedRecordStore {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SharedRecordStore")
            .field("records", &self.records)
            .finish_non_exhaustive()
    }
}

impl SharedRecordStore {
    pub(crate) fn empty() -> Self {
        let store = Self {
            records: Arc::new(Mutex::new(RecordMap::default())),
            durable_flush: Arc::new(Mutex::new(None)),
        };
        #[cfg(target_arch = "wasm32")]
        store.adopt_process_flush_hook();
        store
    }

    /// Loads a dump produced by [`Self::export_encoded_dump`].
    ///
    /// An empty string, a bad version, and corrupt bytes are errors. Callers
    /// that have no dump yet use [`Self::empty`] instead of substituting one.
    pub(crate) fn from_encoded_dump(encoded: &str) -> Result<Self, String> {
        if encoded.is_empty() {
            return Err("Bark record dump is empty".to_owned());
        }
        let bytes = STANDARD
            .decode(encoded)
            .map_err(|_| "Bark record dump is not valid base64".to_owned())?;
        let dump: BarkRecordDump =
            postcard::from_bytes(&bytes).map_err(|_| "Bark record dump is corrupt".to_owned())?;
        if dump.version != BARK_RECORD_DUMP_VERSION {
            return Err(format!(
                "Bark record dump version {} is not supported",
                dump.version
            ));
        }

        let store = Self::empty();
        {
            let mut records = store.lock_records()?;
            for record in dump.records {
                let partition = records.partitions.entry(record.partition).or_default();
                partition.insert(record.pk.clone(), record);
            }
        }
        Ok(store)
    }

    /// Native tests install this. A missing hook does not flush.
    /// WASM installs a JavaScript hook and refuses a durable write without one.
    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) fn set_durable_flush_hook(&self, hook: NativeDurableFlushHook) {
        self.store_flush_hook(DurableFlushHook::Native(hook));
    }

    #[cfg(target_arch = "wasm32")]
    pub(crate) fn install_js_durable_flush_hook(&self, hook: js_sys::Function) {
        self.store_flush_hook(DurableFlushHook::Js(hook));
    }

    fn store_flush_hook(&self, hook: DurableFlushHook) {
        if let Ok(mut slot) = self.durable_flush.lock() {
            *slot = Some(hook);
        }
    }

    #[cfg(target_arch = "wasm32")]
    fn adopt_process_flush_hook(&self) {
        PROCESS_DURABLE_FLUSH_HOOK.with(|slot| {
            if let Some(hook) = slot.borrow().clone() {
                self.store_flush_hook(DurableFlushHook::Js(hook));
            }
        });
    }

    pub(crate) fn export_encoded_dump(&self) -> Result<String, String> {
        let records = self.lock_records()?;
        let dump = BarkRecordDump {
            version: BARK_RECORD_DUMP_VERSION,
            records: collect_records(&records),
        };
        let bytes = postcard::to_allocvec(&dump)
            .map_err(|_| "Bark record dump could not be encoded".to_owned())?;
        Ok(STANDARD.encode(bytes))
    }

    fn lock_records(&self) -> Result<MutexGuard<'_, RecordMap>, String> {
        self.records
            .lock()
            .map_err(|_| "Bark record store lock is poisoned".to_owned())
    }

    async fn flush_if_durable(&self, partition_id: u8) -> anyhow::Result<()> {
        if !is_durable_partition(partition_id) {
            return Ok(());
        }
        let Some(hook) = self.durable_flush_hook()? else {
            return Ok(());
        };
        let record_dump = self
            .export_encoded_dump()
            .map_err(|err| anyhow::anyhow!(err))?;
        invoke_durable_flush(&hook, record_dump)
            .await
            .map_err(|err| anyhow::anyhow!(err))
    }

    fn durable_flush_hook(&self) -> anyhow::Result<Option<DurableFlushHook>> {
        let slot = self
            .durable_flush
            .lock()
            .map_err(|_| anyhow::anyhow!("Bark record store lock is poisoned"))?;
        if let Some(hook) = slot.as_ref() {
            return Ok(Some(hook.clone()));
        }
        #[cfg(target_arch = "wasm32")]
        return Err(anyhow::anyhow!(
            "Bark durable record flush hook is not installed"
        ));
        #[cfg(not(target_arch = "wasm32"))]
        Ok(None)
    }
}

#[cfg(target_arch = "wasm32")]
pub(crate) fn set_process_durable_flush_hook(hook: js_sys::Function) {
    PROCESS_DURABLE_FLUSH_HOOK.with(|slot| {
        *slot.borrow_mut() = Some(hook);
    });
}

fn is_durable_partition(partition_id: u8) -> bool {
    partition_id == partition::WALLET_ACTION_CHECKPOINT
        || partition_id == partition::EXIT_VTXO
        || partition_id == partition::EXIT_CHILD_TX
}

#[cfg(not(target_arch = "wasm32"))]
async fn invoke_durable_flush(hook: &DurableFlushHook, record_dump: String) -> Result<(), String> {
    let DurableFlushHook::Native(flush) = hook;
    flush(record_dump)
}

#[cfg(target_arch = "wasm32")]
async fn invoke_durable_flush(hook: &DurableFlushHook, record_dump: String) -> Result<(), String> {
    let DurableFlushHook::Js(flush) = hook;
    // The hook persists the dump. It must not call back into this WASM module.
    let result = flush
        .call1(
            &wasm_bindgen::JsValue::NULL,
            &wasm_bindgen::JsValue::from_str(&record_dump),
        )
        .map_err(js_value_message)?;
    let promise = result
        .dyn_into::<js_sys::Promise>()
        .map_err(|_| "Bark durable flush hook did not return a promise".to_owned())?;
    wasm_bindgen_futures::JsFuture::from(promise)
        .await
        .map(|_| ())
        .map_err(js_value_message)
}

#[cfg(target_arch = "wasm32")]
fn js_value_message(value: wasm_bindgen::JsValue) -> String {
    if let Some(message) = value.as_string() {
        return message;
    }
    if let Some(error) = value.dyn_ref::<js_sys::Error>() {
        return String::from(error.message());
    }
    "Bark durable record flush failed".to_owned()
}

fn collect_records(records: &RecordMap) -> Vec<Record> {
    let mut collected = Vec::new();
    for partition in records.partitions.values() {
        collected.extend(partition.values().cloned());
    }
    collected
}

fn record_matches_sort_range(record: &Record, range: &impl RangeBounds<SortKey>) -> bool {
    let Some(sort_key) = &record.sort_key else {
        return false;
    };
    range.contains(sort_key)
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait::async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait::async_trait(?Send))]
impl StorageAdaptor for SharedRecordStore {
    async fn put(&mut self, record: Record) -> anyhow::Result<()> {
        let partition_id = record.partition;
        {
            let mut records = self.lock_records().map_err(|err| anyhow::anyhow!(err))?;
            let partition_records = records.partitions.entry(record.partition).or_default();
            partition_records.insert(record.pk.clone(), record);
        }
        self.flush_if_durable(partition_id).await
    }

    async fn get(&self, partition: u8, pk: &[u8]) -> anyhow::Result<Option<Record>> {
        let records = self.lock_records().map_err(|err| anyhow::anyhow!(err))?;
        let Some(partition_records) = records.partitions.get(&partition) else {
            return Ok(None);
        };
        Ok(partition_records.get(pk).cloned())
    }

    async fn delete(&mut self, partition_id: u8, pk: &[u8]) -> anyhow::Result<Option<Record>> {
        let removed = {
            let mut records = self.lock_records().map_err(|err| anyhow::anyhow!(err))?;
            records
                .partitions
                .get_mut(&partition_id)
                .and_then(|partition_records| partition_records.remove(pk))
        };
        self.flush_if_durable(partition_id).await?;
        Ok(removed)
    }

    async fn query_sorted<R: QueryRange>(&self, query: Query<R>) -> anyhow::Result<Vec<Record>> {
        let records = self.lock_records().map_err(|err| anyhow::anyhow!(err))?;
        let Some(partition_records) = records.partitions.get(&query.partition) else {
            return Ok(Vec::new());
        };

        let mut matches: Vec<Record> = partition_records
            .values()
            .filter(|record| record_matches_sort_range(record, &query.range))
            .cloned()
            .collect();
        matches.sort_by(|left, right| left.sort_key.cmp(&right.sort_key));
        if let Some(limit) = query.limit {
            matches.truncate(limit);
        }
        Ok(matches)
    }

    async fn get_all(&self, partition: u8) -> anyhow::Result<Vec<Record>> {
        let records = self.lock_records().map_err(|err| anyhow::anyhow!(err))?;
        let Some(partition_records) = records.partitions.get(&partition) else {
            return Ok(Vec::new());
        };
        Ok(partition_records.values().cloned().collect())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;

    struct RecordedFlushes {
        dumps: Arc<Mutex<Vec<String>>>,
        hook: NativeDurableFlushHook,
    }

    fn record(partition: u8, pk: &str, sort_key: Option<SortKey>, data: &[u8]) -> Record {
        Record {
            partition,
            pk: pk.as_bytes().to_vec(),
            sort_key,
            data: data.to_vec(),
        }
    }

    fn primary_keys(records: &[Record]) -> Vec<String> {
        records
            .iter()
            .map(|record| String::from_utf8(record.pk.clone()).expect("pk is utf-8"))
            .collect()
    }

    #[tokio::test]
    async fn query_sorted_returns_full_range_in_sort_key_order() {
        let mut store = SharedRecordStore::empty();
        store
            .put(record(0, "late", Some(SortKey::u32_asc(30)), b"c"))
            .await
            .unwrap();
        store
            .put(record(0, "early", Some(SortKey::u32_asc(10)), b"a"))
            .await
            .unwrap();
        store
            .put(record(0, "middle", Some(SortKey::u32_asc(20)), b"b"))
            .await
            .unwrap();
        store
            .put(record(1, "other", Some(SortKey::u32_asc(1)), b"z"))
            .await
            .unwrap();

        let sorted = store.query_sorted(Query::new_full_range(0)).await.unwrap();

        assert_eq!(primary_keys(&sorted), ["early", "middle", "late"]);

        let mut descending = SharedRecordStore::empty();
        descending
            .put(record(0, "small", Some(SortKey::u64_desc(1)), b"s"))
            .await
            .unwrap();
        descending
            .put(record(0, "large", Some(SortKey::u64_desc(100)), b"l"))
            .await
            .unwrap();
        let amount_order = descending
            .query_sorted(Query::new_full_range(0))
            .await
            .unwrap();
        assert_eq!(primary_keys(&amount_order), ["large", "small"]);
    }

    #[tokio::test]
    async fn query_sorted_limit_keeps_the_first_sorted_records() {
        let mut store = SharedRecordStore::empty();
        for (pk, value) in [("c", 30u32), ("a", 10), ("b", 20)] {
            store
                .put(record(0, pk, Some(SortKey::u32_asc(value)), b"x"))
                .await
                .unwrap();
        }

        let limited = store
            .query_sorted(Query::new_full_range(0).limit(2))
            .await
            .unwrap();

        assert_eq!(primary_keys(&limited), ["a", "b"]);
    }

    #[tokio::test]
    async fn query_sorted_skips_records_without_a_sort_key() {
        let mut store = SharedRecordStore::empty();
        store
            .put(record(0, "sorted", Some(SortKey::u32_asc(1)), b"s"))
            .await
            .unwrap();
        store.put(record(0, "unsorted", None, b"u")).await.unwrap();

        let sorted = store.query_sorted(Query::new_full_range(0)).await.unwrap();
        assert_eq!(primary_keys(&sorted), ["sorted"]);

        let mut all_keys = primary_keys(&store.get_all(0).await.unwrap());
        all_keys.sort();
        assert_eq!(all_keys, ["sorted", "unsorted"]);
    }

    #[tokio::test]
    async fn export_import_round_trips_records() {
        let mut store = SharedRecordStore::empty();
        store
            .put(record(4, "vtxo", Some(SortKey::u32_asc(7)), b"chain"))
            .await
            .unwrap();
        store.put(record(9, "exit", None, b"raw")).await.unwrap();

        let encoded = store.export_encoded_dump().unwrap();
        let restored = SharedRecordStore::from_encoded_dump(&encoded).unwrap();

        let original = store.get(4, b"vtxo").await.unwrap();
        let imported = restored.get(4, b"vtxo").await.unwrap();
        assert_eq!(original, imported);
        assert_eq!(
            store.get(9, b"exit").await.unwrap(),
            restored.get(9, b"exit").await.unwrap()
        );
    }

    #[test]
    fn unknown_dump_version_is_refused() {
        let dump = BarkRecordDump {
            version: BARK_RECORD_DUMP_VERSION + 1,
            records: Vec::new(),
        };
        let bytes = postcard::to_allocvec(&dump).unwrap();
        let encoded = STANDARD.encode(bytes);

        let error = SharedRecordStore::from_encoded_dump(&encoded).unwrap_err();

        assert!(error.contains("version"));
        assert!(error.contains('2'));
    }

    #[test]
    fn corrupt_dump_bytes_are_refused() {
        let error = SharedRecordStore::from_encoded_dump("not-base64!!!").unwrap_err();
        assert!(error.contains("base64"));

        let encoded = STANDARD.encode(b"not a postcard dump");
        let error = SharedRecordStore::from_encoded_dump(&encoded).unwrap_err();
        assert!(error.contains("corrupt"));
    }

    fn flush_log() -> RecordedFlushes {
        let dumps = Arc::new(Mutex::new(Vec::new()));
        let record_dumps = Arc::clone(&dumps);
        let hook: NativeDurableFlushHook = Arc::new(move |record_dump| {
            record_dumps.lock().expect("flush log").push(record_dump);
            Ok(())
        });
        RecordedFlushes { dumps, hook }
    }

    /// The flush-log lock must end before the restored store is awaited.
    fn open_only_flushed_dump(flushed_dumps: &Mutex<Vec<String>>) -> SharedRecordStore {
        let dumps = flushed_dumps.lock().expect("flush log");
        assert_eq!(dumps.len(), 1);
        dumped_store(&dumps[0])
    }

    fn dumped_store(record_dump: &str) -> SharedRecordStore {
        SharedRecordStore::from_encoded_dump(record_dump).expect("dump round-trips")
    }

    #[tokio::test]
    async fn checkpoint_put_flushes_the_dump_before_put_returns() {
        let mut store = SharedRecordStore::empty();
        let RecordedFlushes {
            dumps: flushed_dumps,
            hook,
        } = flush_log();
        store.set_durable_flush_hook(hook);
        store
            .put(record(
                partition::VTXO,
                "coin",
                Some(SortKey::u32_asc(1)),
                b"already-there",
            ))
            .await
            .unwrap();

        store
            .put(record(
                partition::WALLET_ACTION_CHECKPOINT,
                "board.txid.0",
                None,
                b"broadcasting",
            ))
            .await
            .unwrap();

        let restored = open_only_flushed_dump(&flushed_dumps);
        let checkpoint = restored
            .get(partition::WALLET_ACTION_CHECKPOINT, b"board.txid.0")
            .await
            .unwrap()
            .expect("checkpoint is in the flushed dump");
        assert_eq!(checkpoint.data, b"broadcasting");
        let coin = restored
            .get(partition::VTXO, b"coin")
            .await
            .unwrap()
            .expect("earlier records are in the same dump");
        assert_eq!(coin.data, b"already-there");
    }

    #[tokio::test]
    async fn vtxo_put_does_not_flush() {
        let mut store = SharedRecordStore::empty();
        let RecordedFlushes {
            dumps: flushed_dumps,
            hook,
        } = flush_log();
        store.set_durable_flush_hook(hook);
        store
            .put(record(
                partition::VTXO,
                "coin",
                Some(SortKey::u32_asc(1)),
                b"row",
            ))
            .await
            .unwrap();
        assert!(flushed_dumps.lock().expect("flush log").is_empty());
    }

    #[tokio::test]
    async fn checkpoint_delete_flushes_the_dump_without_the_record() {
        let mut store = SharedRecordStore::empty();
        let RecordedFlushes {
            dumps: flushed_dumps,
            hook,
        } = flush_log();
        store.set_durable_flush_hook(hook);
        store
            .put(record(
                partition::WALLET_ACTION_CHECKPOINT,
                "board.txid.0",
                None,
                b"broadcasting",
            ))
            .await
            .unwrap();
        flushed_dumps.lock().expect("flush log").clear();

        store
            .delete(partition::WALLET_ACTION_CHECKPOINT, b"board.txid.0")
            .await
            .unwrap();

        let restored = open_only_flushed_dump(&flushed_dumps);
        assert!(
            restored
                .get(partition::WALLET_ACTION_CHECKPOINT, b"board.txid.0")
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn flush_hook_error_fails_put_and_keeps_the_record() {
        let mut store = SharedRecordStore::empty();
        store.set_durable_flush_hook(std::sync::Arc::new(|_record_dump| {
            Err("disk full".to_owned())
        }));

        let error = store
            .put(record(
                partition::WALLET_ACTION_CHECKPOINT,
                "board.txid.0",
                None,
                b"broadcasting",
            ))
            .await
            .unwrap_err();

        assert!(error.to_string().contains("disk full"));
        let kept = store
            .get(partition::WALLET_ACTION_CHECKPOINT, b"board.txid.0")
            .await
            .unwrap();
        assert_eq!(
            kept.expect("failed flush keeps the in-memory record").data,
            b"broadcasting"
        );
    }

    #[tokio::test]
    async fn exit_vtxo_and_exit_child_puts_and_deletes_flush() {
        for exit_partition in [partition::EXIT_VTXO, partition::EXIT_CHILD_TX] {
            let mut store = SharedRecordStore::empty();
            let RecordedFlushes {
                dumps: flushed_dumps,
                hook,
            } = flush_log();
            store.set_durable_flush_hook(hook);
            store
                .put(record(exit_partition, "exit", None, b"row"))
                .await
                .unwrap();
            assert_eq!(flushed_dumps.lock().expect("flush log").len(), 1);

            flushed_dumps.lock().expect("flush log").clear();
            store.delete(exit_partition, b"exit").await.unwrap();
            let restored = open_only_flushed_dump(&flushed_dumps);
            assert!(
                restored
                    .get(exit_partition, b"exit")
                    .await
                    .unwrap()
                    .is_none()
            );
        }
    }
}
