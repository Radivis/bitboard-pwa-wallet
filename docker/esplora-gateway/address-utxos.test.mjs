import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { btcToSats, esploraUtxosForAddress } from './address-utxos.mjs';

const ADDRESS = 'bcrt1pdyxawfq6plrcehx84f7prh8qu05c0pmp8wlwz6veszxncgd5asvs97qxzx';
const OTHER = 'bcrt1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq000000';
const BLOCK_HASH = 'aa'.repeat(32);
const CONFIRMED_TXID = '11'.repeat(32);
const MEMPOOL_TXID = '22'.repeat(32);
const SPEND_TXID = '33'.repeat(32);

describe('btcToSats', () => {
  it('converts a regtest faucet amount without float dust', () => {
    assert.equal(btcToSats(0.002), 200_000);
  });
});

describe('esploraUtxosForAddress', () => {
  const blockTimeByHash = new Map([[BLOCK_HASH, 1_700_000_000]]);

  it('maps a confirmed scantxoutset hit to an Esplora UTXO', () => {
    const utxos = esploraUtxosForAddress({
      address: ADDRESS,
      unspents: [
        {
          txid: CONFIRMED_TXID,
          vout: 1,
          amount: 0.002,
          height: 102,
          blockhash: BLOCK_HASH,
        },
      ],
      mempoolTransactions: [],
      blockTimeByHash,
    });

    assert.deepEqual(utxos, [
      {
        txid: CONFIRMED_TXID,
        vout: 1,
        status: {
          confirmed: true,
          block_height: 102,
          block_hash: BLOCK_HASH,
          block_time: 1_700_000_000,
        },
        value: 200_000,
      },
    ]);
  });

  it('drops a confirmed output that a mempool transaction spends', () => {
    const utxos = esploraUtxosForAddress({
      address: ADDRESS,
      unspents: [
        {
          txid: CONFIRMED_TXID,
          vout: 0,
          amount: 0.002,
          height: 102,
          blockhash: BLOCK_HASH,
        },
      ],
      mempoolTransactions: [
        {
          txid: SPEND_TXID,
          vin: [{ txid: CONFIRMED_TXID, vout: 0 }],
          vout: [{ value: 0.001, scriptPubKey: { address: OTHER } }],
        },
      ],
      blockTimeByHash,
    });

    assert.deepEqual(utxos, []);
  });

  it('includes an unconfirmed output to the address and skips other addresses', () => {
    const utxos = esploraUtxosForAddress({
      address: ADDRESS,
      unspents: [],
      mempoolTransactions: [
        {
          txid: MEMPOOL_TXID,
          vin: [{ coinbase: '00' }],
          vout: [
            { value: 0.001, scriptPubKey: { address: OTHER } },
            { value: 0.002, scriptPubKey: { address: ADDRESS } },
          ],
        },
      ],
      blockTimeByHash,
    });

    assert.deepEqual(utxos, [
      {
        txid: MEMPOOL_TXID,
        vout: 1,
        status: { confirmed: false },
        value: 200_000,
      },
    ]);
  });

  it('omits a mempool output spent by a later mempool transaction', () => {
    const utxos = esploraUtxosForAddress({
      address: ADDRESS,
      unspents: [],
      mempoolTransactions: [
        {
          txid: MEMPOOL_TXID,
          vin: [],
          vout: [{ value: 0.002, scriptPubKey: { address: ADDRESS } }],
        },
        {
          txid: SPEND_TXID,
          vin: [{ txid: MEMPOOL_TXID, vout: 0 }],
          vout: [{ value: 0.001, scriptPubKey: { address: OTHER } }],
        },
      ],
      blockTimeByHash,
    });

    assert.deepEqual(utxos, []);
  });
});
