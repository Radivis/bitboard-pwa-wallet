//! One-time copy of Bark's fingerprint IndexedDB into the in-memory record store.
//!
//! `IndexedDbClient::get_all` creates a missing object store, so this lists
//! existing `bark.v1.{partition}` stores first and reads only those.

use bark::persist::adaptor::StorageAdaptor;
use bark::persist::adaptor::indexed_db::IndexedDbClient;
use js_sys::Array;
use wasm_bindgen::JsCast;
use wasm_bindgen::JsValue;
use wasm_bindgen_futures::JsFuture;

use crate::record_store::SharedRecordStore;

const OBJECT_STORE_PREFIX: &str = "bark.v1.";

fn partition_from_store_name(name: &str) -> Option<u8> {
    let suffix = name.strip_prefix(OBJECT_STORE_PREFIX)?;
    suffix.parse().ok()
}

async fn legacy_database_exists(name: &str) -> Result<bool, String> {
    let global = js_sys::global();
    let factory = js_sys::Reflect::get(&global, &JsValue::from_str("indexedDB"))
        .map_err(|_| "indexedDB is unavailable".to_owned())?;
    if factory.is_null() || factory.is_undefined() {
        return Err("indexedDB is unavailable".to_owned());
    }
    let databases = js_sys::Reflect::get(&factory, &JsValue::from_str("databases"))
        .map_err(|_| "indexedDB.databases is unavailable".to_owned())?;
    let databases_fn = databases
        .dyn_ref::<js_sys::Function>()
        .ok_or_else(|| "indexedDB.databases is unavailable".to_owned())?;
    let promise_value = databases_fn
        .call0(&factory)
        .map_err(|_| "indexedDB.databases() failed".to_owned())?;
    let promise = promise_value
        .dyn_into::<js_sys::Promise>()
        .map_err(|_| "indexedDB.databases() did not return a promise".to_owned())?;
    let listed = JsFuture::from(promise)
        .await
        .map_err(|_| "indexedDB.databases() failed".to_owned())?;
    let Some(listed) = listed.dyn_ref::<Array>() else {
        return Err("indexedDB.databases() did not return a list".to_owned());
    };

    for entry in listed.iter() {
        let db_name =
            js_sys::Reflect::get(&entry, &JsValue::from_str("name")).unwrap_or(JsValue::UNDEFINED);
        if db_name.as_string().as_deref() == Some(name) {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn existing_bark_partitions(fingerprint: &str) -> Result<Vec<u8>, String> {
    let factory = indexed_db::Factory::<std::io::Error>::get()
        .map_err(|err| format!("legacy Bark IndexedDB: {err}"))?;
    let database = factory
        .open_latest_version(fingerprint)
        .await
        .map_err(|err| format!("legacy Bark IndexedDB: {err}"))?;
    let partitions = database
        .object_store_names()
        .iter()
        .filter_map(|name| partition_from_store_name(name))
        .collect();
    database.close();
    Ok(partitions)
}

/// Copies the fingerprint database when it exists.
///
/// Returns true when that database was present. The caller deletes it only
/// after the encrypted dump is written.
pub(crate) async fn copy_legacy_indexed_db_if_present(
    fingerprint: &str,
    store: &mut SharedRecordStore,
) -> Result<bool, String> {
    if !legacy_database_exists(fingerprint).await? {
        return Ok(false);
    }

    let partitions = existing_bark_partitions(fingerprint).await?;
    let client = IndexedDbClient::open(fingerprint)
        .await
        .map_err(|err| format!("legacy Bark IndexedDB: {err:#}"))?;
    for partition in partitions {
        let records = client
            .get_all(partition)
            .await
            .map_err(|err| format!("legacy Bark IndexedDB: {err:#}"))?;
        for record in records {
            store
                .put(record)
                .await
                .map_err(|err| format!("legacy Bark IndexedDB: {err:#}"))?;
        }
    }
    Ok(true)
}
