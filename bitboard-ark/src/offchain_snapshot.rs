use std::str::FromStr;

use ark_core::VtxoList;
use ark_core::history;
use ark_core::history::OutgoingTransaction;
use ark_core::history::Transaction;
use ark_core::history::sort_transactions_by_created_at;
use ark_core::server::VirtualTxOutPoint;
use bitcoin::hex::DisplayHex;
use bitcoin::hex::FromHex;
use bitcoin::{Amount, OutPoint, ScriptBuf, Txid};

use crate::error::{ArkResult, ArkWasmError};
use crate::persistence::{
    OffchainVtxoSnapshot, VirtualTxOutPointAssetRecord, VirtualTxOutPointRecord,
};

pub fn vtxo_list_from_snapshot(snapshot: &OffchainVtxoSnapshot) -> ArkResult<VtxoList> {
    let dust = Amount::from_sat(snapshot.dust_sats);
    let points = snapshot
        .virtual_tx_outpoints
        .iter()
        .map(virtual_tx_outpoint_from_record)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(VtxoList::new(dust, points))
}

pub fn offchain_balance_sats_from_snapshot(
    snapshot: &OffchainVtxoSnapshot,
) -> ArkResult<(u64, u64, u64)> {
    let vtxo_list = vtxo_list_from_snapshot(snapshot)?;
    let pre_confirmed = vtxo_list
        .pre_confirmed()
        .fold(Amount::ZERO, |acc, x| acc + x.amount)
        .to_sat();
    let confirmed = vtxo_list
        .confirmed()
        .fold(Amount::ZERO, |acc, x| acc + x.amount)
        .to_sat();
    let recoverable = vtxo_list
        .recoverable()
        .fold(Amount::ZERO, |acc, x| acc + x.amount)
        .to_sat();
    Ok((pre_confirmed, confirmed, recoverable))
}

pub fn offchain_history_from_snapshot(
    snapshot: &OffchainVtxoSnapshot,
    boarding_commitment_transactions: &[Txid],
) -> ArkResult<Vec<Transaction>> {
    let vtxo_list = vtxo_list_from_snapshot(snapshot)?;
    let spent_outpoints = vtxo_list.spent().cloned().collect::<Vec<_>>();
    let unspent_outpoints = vtxo_list.all_unspent().cloned().collect::<Vec<_>>();

    let mut transactions = generate_incoming_vtxo_transaction_history(
        &spent_outpoints,
        &unspent_outpoints,
        boarding_commitment_transactions,
    )?;

    let outgoing_txs =
        generate_outgoing_vtxo_transaction_history(&spent_outpoints, &unspent_outpoints)?;

    for tx in outgoing_txs {
        let tx = match tx {
            OutgoingTransaction::Complete(tx) => tx,
            OutgoingTransaction::Incomplete(incomplete_tx) => {
                let first_outpoint = incomplete_tx.first_outpoint();
                let Some(virtual_tx_outpoint) = spent_outpoints
                    .iter()
                    .chain(unspent_outpoints.iter())
                    .find(|vtp| vtp.outpoint == first_outpoint)
                else {
                    continue;
                };
                match incomplete_tx.finish(virtual_tx_outpoint) {
                    Ok(tx) => tx,
                    Err(_) => continue,
                }
            }
            OutgoingTransaction::IncompleteOffboard(incomplete_offboard) => {
                incomplete_offboard.finish(None)
            }
        };
        transactions.push(tx);
    }

    sort_transactions_by_created_at(&mut transactions);
    Ok(transactions)
}

pub fn snapshot_from_virtual_tx_outpoints(
    dust_sats: u64,
    synced_at: i64,
    virtual_tx_outpoints: Vec<VirtualTxOutPoint>,
) -> OffchainVtxoSnapshot {
    OffchainVtxoSnapshot {
        synced_at,
        dust_sats,
        virtual_tx_outpoints: virtual_tx_outpoints
            .into_iter()
            .map(virtual_tx_outpoint_to_record)
            .collect(),
    }
}

fn virtual_tx_outpoint_to_record(point: VirtualTxOutPoint) -> VirtualTxOutPointRecord {
    VirtualTxOutPointRecord {
        txid: point.outpoint.txid.to_string(),
        vout: point.outpoint.vout,
        created_at: point.created_at,
        expires_at: point.expires_at,
        amount_sats: point.amount.to_sat(),
        script_hex: point.script.to_bytes().to_lower_hex_string(),
        is_preconfirmed: point.is_preconfirmed,
        is_swept: point.is_swept,
        is_unrolled: point.is_unrolled,
        is_spent: point.is_spent,
        spent_by: point.spent_by.map(|txid| txid.to_string()),
        commitment_txids: point
            .commitment_txids
            .iter()
            .map(|txid| txid.to_string())
            .collect(),
        settled_by: point.settled_by.map(|txid| txid.to_string()),
        ark_txid: point.ark_txid.map(|txid| txid.to_string()),
        assets: point
            .assets
            .iter()
            .map(|asset| VirtualTxOutPointAssetRecord {
                asset_id_hex: asset.asset_id.to_string(),
                amount: asset.amount,
            })
            .collect(),
    }
}

fn virtual_tx_outpoint_from_record(
    record: &VirtualTxOutPointRecord,
) -> ArkResult<VirtualTxOutPoint> {
    let txid = Txid::from_str(&record.txid)
        .map_err(|error| ArkWasmError::Message(format!("invalid vtxo txid: {error}")))?;
    let script_bytes = Vec::from_hex(&record.script_hex)
        .map_err(|error| ArkWasmError::Message(format!("invalid vtxo script: {error}")))?;
    let script = ScriptBuf::from_bytes(script_bytes);

    Ok(VirtualTxOutPoint {
        outpoint: OutPoint {
            txid,
            vout: record.vout,
        },
        created_at: record.created_at,
        expires_at: record.expires_at,
        amount: Amount::from_sat(record.amount_sats),
        script,
        is_preconfirmed: record.is_preconfirmed,
        is_swept: record.is_swept,
        is_unrolled: record.is_unrolled,
        is_spent: record.is_spent,
        spent_by: record
            .spent_by
            .as_ref()
            .map(|value| Txid::from_str(value))
            .transpose()
            .map_err(|error| ArkWasmError::Message(format!("invalid spent_by: {error}")))?,
        commitment_txids: record
            .commitment_txids
            .iter()
            .map(|value| Txid::from_str(value))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| ArkWasmError::Message(format!("invalid commitment txid: {error}")))?,
        settled_by: record
            .settled_by
            .as_ref()
            .map(|value| Txid::from_str(value))
            .transpose()
            .map_err(|error| ArkWasmError::Message(format!("invalid settled_by: {error}")))?,
        ark_txid: record
            .ark_txid
            .as_ref()
            .map(|value| Txid::from_str(value))
            .transpose()
            .map_err(|error| ArkWasmError::Message(format!("invalid ark txid: {error}")))?,
        assets: record
            .assets
            .iter()
            .map(|asset| {
                let asset_id = asset
                    .asset_id_hex
                    .parse()
                    .map_err(|error| ArkWasmError::Message(format!("invalid asset id: {error}")))?;
                Ok(ark_core::server::Asset {
                    asset_id,
                    amount: asset.amount,
                })
            })
            .collect::<Result<Vec<_>, ArkWasmError>>()?,
    })
}

fn generate_incoming_vtxo_transaction_history(
    spent_outpoints: &[VirtualTxOutPoint],
    unspent_outpoints: &[VirtualTxOutPoint],
    boarding_commitment_transactions: &[Txid],
) -> ArkResult<Vec<Transaction>> {
    history::generate_incoming_vtxo_transaction_history(
        spent_outpoints,
        unspent_outpoints,
        boarding_commitment_transactions,
    )
    .map_err(|error| ArkWasmError::Message(error.to_string()))
}

fn generate_outgoing_vtxo_transaction_history(
    spent_outpoints: &[VirtualTxOutPoint],
    unspent_outpoints: &[VirtualTxOutPoint],
) -> ArkResult<Vec<OutgoingTransaction>> {
    history::generate_outgoing_vtxo_transaction_history(spent_outpoints, unspent_outpoints)
        .map_err(|error| ArkWasmError::Message(error.to_string()))
        .map(|iterator| iterator.collect())
}
