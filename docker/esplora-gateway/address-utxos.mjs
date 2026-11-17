/**
 * Map bitcoind scantxoutset + mempool transactions onto Esplora
 * `GET /address/:address/utxo` objects (value in sats).
 *
 * Fulcrum's address index can lag a mined block by longer than arkd's
 * cooperative boarding window. Bitcoind already has the UTXO.
 */

/** @param {unknown} amount BTC as returned by bitcoind JSON-RPC. */
export function btcToSats(amount) {
  const sats = Math.round(Number(amount) * 1e8);
  if (!Number.isSafeInteger(sats) || sats < 0) {
    throw new Error(`invalid BTC amount: ${amount}`);
  }
  return sats;
}

function outpointKey(txid, vout) {
  return `${txid}:${vout}`;
}

/**
 * Outpoints spent by mempool inputs. Coinbase inputs have no prevout.
 *
 * @param {ReadonlyArray<{ vin?: ReadonlyArray<{ txid?: string, vout?: number }> }>} mempoolTransactions
 */
function mempoolSpentOutpoints(mempoolTransactions) {
  const spent = new Set();
  for (const transaction of mempoolTransactions) {
    for (const input of transaction.vin ?? []) {
      if (input.txid == null || input.vout == null) continue;
      spent.add(outpointKey(input.txid, input.vout));
    }
  }
  return spent;
}

/**
 * @param {object} input
 * @param {string} input.address
 * @param {ReadonlyArray<{ txid: string, vout: number, amount: number, height: number, blockhash?: string }>} input.unspents
 * @param {ReadonlyArray<{ txid: string, vin?: ReadonlyArray<{ txid?: string, vout?: number }>, vout?: ReadonlyArray<{ value: number, scriptPubKey?: { address?: string } }> }>} input.mempoolTransactions
 * @param {ReadonlyMap<string, number>} input.blockTimeByHash
 */
export function esploraUtxosForAddress({
  address,
  unspents,
  mempoolTransactions,
  blockTimeByHash,
}) {
  const spent = mempoolSpentOutpoints(mempoolTransactions);
  const confirmed = [];
  for (const unspent of unspents) {
    if (spent.has(outpointKey(unspent.txid, unspent.vout))) continue;
    const blockHash = unspent.blockhash ?? null;
    const blockTime = blockHash == null ? null : (blockTimeByHash.get(blockHash) ?? null);
    confirmed.push({
      txid: unspent.txid,
      vout: unspent.vout,
      status: {
        confirmed: true,
        block_height: unspent.height,
        block_hash: blockHash,
        block_time: blockTime,
      },
      value: btcToSats(unspent.amount),
    });
  }

  const unconfirmed = [];
  for (const transaction of mempoolTransactions) {
    const outputs = transaction.vout ?? [];
    for (let vout = 0; vout < outputs.length; vout += 1) {
      const output = outputs[vout];
      if (output.scriptPubKey?.address !== address) continue;
      if (spent.has(outpointKey(transaction.txid, vout))) continue;
      unconfirmed.push({
        txid: transaction.txid,
        vout,
        status: { confirmed: false },
        value: btcToSats(output.value),
      });
    }
  }

  return [...confirmed, ...unconfirmed];
}
