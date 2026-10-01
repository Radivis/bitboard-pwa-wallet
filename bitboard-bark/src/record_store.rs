//! In-memory [`StorageAdaptor`] for one open Bark network.
//!
//! The encrypted rail stores a versioned dump of Bark `Record` bytes. This
//! module does not interpret VTXO, movement, or exit payloads.

use std::collections::{BTreeMap, HashMap};
use std::ops::RangeBounds;
use std::sync::{Arc, Mutex, MutexGuard};

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
#[derive(Debug, Clone)]
pub(crate) struct SharedRecordStore {
    records: Arc<Mutex<RecordMap>>,
}

impl SharedRecordStore {
    pub(crate) fn empty() -> Self {
        Self {
            records: Arc::new(Mutex::new(RecordMap::default())),
        }
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
        let mut records = self.lock_records().map_err(|err| anyhow::anyhow!(err))?;
        let partition = records.partitions.entry(record.partition).or_default();
        partition.insert(record.pk.clone(), record);
        Ok(())
    }

    async fn get(&self, partition: u8, pk: &[u8]) -> anyhow::Result<Option<Record>> {
        let records = self.lock_records().map_err(|err| anyhow::anyhow!(err))?;
        let Some(partition_records) = records.partitions.get(&partition) else {
            return Ok(None);
        };
        Ok(partition_records.get(pk).cloned())
    }

    async fn delete(&mut self, partition: u8, pk: &[u8]) -> anyhow::Result<Option<Record>> {
        let mut records = self.lock_records().map_err(|err| anyhow::anyhow!(err))?;
        let Some(partition_records) = records.partitions.get_mut(&partition) else {
            return Ok(None);
        };
        Ok(partition_records.remove(pk))
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
    use super::*;

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
}
