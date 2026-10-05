/**
 * Esplora-compatible gateway for arkade-regtest.
 *
 * mempool/backend v3.3.1 (electrum mode) exposes GET /tx/:txId/hex but not /raw.
 * rust-esplora-client and bitboard-arkade use GET /tx/:txId/raw for relay detection.
 *
 * This service serves from bitcoind when authoritative:
 * - GET /api/tx/:txid/raw — mempool or confirmed chain only (not wallet-only stubs)
 * - GET /api/tx/:txid/status — confirmed txs (mempool electrum often stays confirmed:false)
 * - GET /api/tx/:txid — same confirmation overlay on the JSON body Bark's client reads
 *
 * POST /api/txs/package — bitcoind `submitpackage` (mempool electrum returns a generic RPC error)
 * All other paths are proxied to mempool_web unchanged.
 */
import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 8080);
const BITCOIN_RPC_HOST = process.env.BITCOIN_RPC_HOST || 'bitcoin';
const BITCOIN_RPC_PORT = Number(process.env.BITCOIN_RPC_PORT || 18443);
const BITCOIN_RPC_USER = process.env.BITCOIN_RPC_USER || 'admin1';
const BITCOIN_RPC_PASSWORD = process.env.BITCOIN_RPC_PASSWORD || '123';
const UPSTREAM_ESPLORA = process.env.UPSTREAM_ESPLORA || 'http://mempool_web';

const TXID_RAW_PATH = /^\/api\/tx\/([0-9a-f]{64})\/raw$/i;
const TXID_JSON_PATH = /^\/api\/tx\/([0-9a-f]{64})$/i;
const TXID_OUTSPEND_PATH = /^\/api\/tx\/([0-9a-f]{64})\/outspend\/(\d+)$/i;
const TXID_STATUS_PATH = /^\/api\/tx\/([0-9a-f]{64})\/status$/i;
const TXID_MERKLE_PROOF_PATH = /^\/api\/tx\/([0-9a-f]{64})\/merkle-proof$/i;
const TXS_PACKAGE_PATH = '/api/txs/package';
const TX_BROADCAST_PATH = '/api/tx';

/** Match mempool_web CORS so browser WASM can fetch from the Vite dev origin. */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Accept,Authorization,Cache-Control,Content-Type,DNT,If-Modified-Since,Keep-Alive,Origin,User-Agent,X-Requested-With',
  'Access-Control-Expose-Headers': 'X-Total-Count,X-Mempool-Auth',
};

function withCorsHeaders(headers = {}) {
  return { ...CORS_HEADERS, ...headers };
}

function sendOptionsPreflight(res) {
  res.writeHead(204, withCorsHeaders());
  res.end();
}

const BITCOIN_RPC_AUTH = Buffer.from(
  `${BITCOIN_RPC_USER}:${BITCOIN_RPC_PASSWORD}`,
).toString('base64');

let rpcRequestId = 0;

/**
 * Bitcoin Core JSON-RPC error codes (see bitcoind `rpc/protocol.h`).
 * `getrawtransaction` / `getmempoolentry` signal a missing tx with -5; -8 is treated
 * the same for robustness when bitcoind returns it for unknown txids.
 */
const BITCOIN_RPC_INVALID_ADDRESS_OR_KEY = -5;
const BITCOIN_RPC_INVALID_PARAMETER = -8;

function isBitcoinRpcNotFound(error) {
  return (
    error?.code === BITCOIN_RPC_INVALID_ADDRESS_OR_KEY ||
    error?.code === BITCOIN_RPC_INVALID_PARAMETER ||
    String(error?.message || '')
      .toLowerCase()
      .includes('no such mempool or blockchain transaction')
  );
}

async function bitcoinRpc(method, params = []) {
  const response = await fetch(`http://${BITCOIN_RPC_HOST}:${BITCOIN_RPC_PORT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${BITCOIN_RPC_AUTH}`,
    },
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: `esplora-gateway-${++rpcRequestId}`,
      method,
      params,
    }),
  });

  const payload = await response.json();
  if (payload.error) {
    const error = new Error(payload.error.message || 'bitcoin RPC failed');
    error.code = payload.error.code;
    throw error;
  }

  if (!response.ok) {
    throw new Error(`bitcoind RPC HTTP ${response.status}`);
  }

  return payload.result;
}

async function bitcoinGetRawTransactionVerbose(txid) {
  try {
    return await bitcoinRpc('getrawtransaction', [txid, true]);
  } catch (error) {
    if (isBitcoinRpcNotFound(error)) {
      return null;
    }
    throw error;
  }
}

async function bitcoinTxInMempool(txid) {
  try {
    await bitcoinRpc('getmempoolentry', [txid]);
    return true;
  } catch (error) {
    if (isBitcoinRpcNotFound(error)) {
      return false;
    }
    throw error;
  }
}

/** True when bitcoind has the tx in mempool or an active chain block (relay signal). */
async function bitcoinTxOnNetwork(txid) {
  if (await bitcoinTxInMempool(txid)) {
    return true;
  }
  const verbose = await bitcoinGetRawTransactionVerbose(txid);
  return verbose != null && typeof verbose.confirmations === 'number' && verbose.confirmations > 0;
}

async function bitcoinGetRawTransactionHexOnNetwork(txid) {
  if (!(await bitcoinTxOnNetwork(txid))) {
    return null;
  }
  try {
    return await bitcoinRpc('getrawtransaction', [txid, false]);
  } catch (error) {
    if (isBitcoinRpcNotFound(error)) {
      return null;
    }
    throw error;
  }
}

async function bitcoinConfirmedTxStatus(txid) {
  const verbose = await bitcoinGetRawTransactionVerbose(txid);
  if (
    verbose == null ||
    typeof verbose.confirmations !== 'number' ||
    verbose.confirmations <= 0 ||
    verbose.blockhash == null
  ) {
    return null;
  }

  let blockHeight = verbose.blockheight;
  if (typeof blockHeight !== 'number') {
    const header = await bitcoinRpc('getblockheader', [verbose.blockhash]);
    blockHeight = header.height;
  }

  return {
    confirmed: true,
    block_height: blockHeight,
    block_hash: verbose.blockhash,
    block_time: verbose.blocktime ?? verbose.time ?? null,
  };
}

/**
 * Bark's Esplora client reads confirmation from `GET /tx/:txid` (`status.block_height`),
 * not from `/status`. Electrum leaves that field false after the tx is mined, so a
 * confirmed bitcoind status replaces `status` on the upstream JSON.
 */
async function handleTxJson(req, res, txid) {
  if (req.method === 'OPTIONS') {
    sendOptionsPreflight(res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Method Not Allowed');
    return;
  }

  const upstreamUrl = new URL(`/api/tx/${txid}`, UPSTREAM_ESPLORA);
  let upstream;
  try {
    upstream = await fetch(upstreamUrl);
  } catch (error) {
    console.error(`GET /api/tx/${txid} upstream error:`, error.message);
    res.writeHead(502, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Bad Gateway');
    return;
  }

  const rawBody = Buffer.from(await upstream.arrayBuffer());
  if (!upstream.ok) {
    const fromBitcoind = await esploraTxJsonFromBitcoind(txid);
    if (fromBitcoind != null) {
      sendJson(res, 200, fromBitcoind);
      return;
    }
    res.writeHead(
      upstream.status,
      withCorsHeaders({
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Content-Length': String(rawBody.length),
      }),
    );
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(rawBody);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    console.error(`GET /api/tx/${txid} is not JSON:`, error.message);
    res.writeHead(502, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Upstream transaction JSON is invalid');
    return;
  }

  try {
    const confirmed = await bitcoinConfirmedTxStatus(txid);
    if (confirmed != null) {
      parsed.status = confirmed;
    }
  } catch (error) {
    console.error(`GET /api/tx/${txid} bitcoind status error:`, error.message);
    res.writeHead(500, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Failed to get transaction status');
    return;
  }

  const body = JSON.stringify(parsed);
  res.writeHead(
    200,
    withCorsHeaders({
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body)),
    }),
  );
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(body);
}

/**
 * Bark asks `GET /tx/:txid/outspend/:vout` for the exit anchor's child.
 * Electrum answers 404, so the exit stays `AwaitingConfirmation` after the
 * package is mined. Bitcoind's mempool lookup covers an unconfirmed child;
 * a short block scan covers a child already confirmed in or after the parent.
 */
async function handleTxOutspend(req, res, txid, vout) {
  if (req.method === 'OPTIONS') {
    sendOptionsPreflight(res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Method Not Allowed');
    return;
  }

  try {
    const unspent = await bitcoinRpc('gettxout', [txid, vout, true]);
    if (unspent != null) {
      sendJson(res, 200, { spent: false });
      return;
    }

    const mempoolSpend = await mempoolSpender(txid, vout);
    if (mempoolSpend != null) {
      sendJson(res, 200, mempoolSpend);
      return;
    }

    const confirmedSpend = await confirmedSpender(txid, vout);
    if (confirmedSpend != null) {
      sendJson(res, 200, confirmedSpend);
      return;
    }

    const parent = await bitcoinGetRawTransactionVerbose(txid);
    if (parent == null) {
      const body = 'No such mempool or blockchain transaction';
      res.writeHead(404, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }

    sendJson(res, 200, { spent: false });
  } catch (error) {
    console.error(`GET /api/tx/${txid}/outspend/${vout} error:`, error.message);
    res.writeHead(500, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Failed to get output spend');
  }
}

async function mempoolSpender(txid, vout) {
  const rows = await bitcoinRpc('gettxspendingprevout', [[{ txid, vout: Number(vout) }]]);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (row == null || typeof row.spendingtxid !== 'string') {
    return null;
  }
  const confirmed = await bitcoinConfirmedTxStatus(row.spendingtxid);
  return {
    spent: true,
    txid: row.spendingtxid,
    vin: row.spendingvin ?? 0,
    status: confirmed ?? { confirmed: false },
  };
}

async function confirmedSpender(txid, vout) {
  const parent = await bitcoinGetRawTransactionVerbose(txid);
  if (parent == null || typeof parent.blockhash !== 'string') {
    return null;
  }
  const startHeight =
    typeof parent.blockheight === 'number'
      ? parent.blockheight
      : (await bitcoinRpc('getblockheader', [parent.blockhash])).height;
  const tipHeight = await bitcoinRpc('getblockcount');
  const voutNumber = Number(vout);
  for (let height = startHeight; height <= tipHeight; height += 1) {
    const blockHash = await bitcoinRpc('getblockhash', [height]);
    const block = await bitcoinRpc('getblock', [blockHash, 2]);
    for (const transaction of block.tx) {
      const inputs = transaction.vin ?? [];
      for (let vin = 0; vin < inputs.length; vin += 1) {
        const input = inputs[vin];
        if (input.txid === txid && input.vout === voutNumber) {
          return {
            spent: true,
            txid: transaction.txid,
            vin,
            status: {
              confirmed: true,
              block_height: height,
              block_hash: blockHash,
              block_time: block.time,
            },
          };
        }
      }
    }
  }
  return null;
}

/**
 * Electrum often 404s `GET /tx/:txid` after the tx has left the mempool.
 * Bark then treats a confirmed offboard as missing and rebroadcasts it forever.
 * This is the Esplora JSON shape `get_tx_info` decodes, filled from bitcoind.
 */
async function esploraTxJsonFromBitcoind(txid) {
  const verbose = await bitcoinGetRawTransactionVerbose(txid);
  if (verbose == null) return null;
  const confirmed = await bitcoinConfirmedTxStatus(txid);
  const status = confirmed ?? { confirmed: false };
  const vin = (verbose.vin ?? []).map((input) => ({
    txid: input.txid ?? '0000000000000000000000000000000000000000000000000000000000000000',
    vout: input.vout ?? 0,
    prevout: null,
    scriptsig: input.scriptSig?.hex ?? '',
    witness: input.txinwitness ?? [],
    sequence: input.sequence ?? 0,
    is_coinbase: typeof input.coinbase === 'string',
  }));
  const vout = (verbose.vout ?? []).map((output) => ({
    value: Math.round(Number(output.value) * 1e8),
    scriptpubkey: output.scriptPubKey?.hex ?? '',
  }));
  const feeSats =
    typeof verbose.fee === 'number' ? Math.round(Math.abs(verbose.fee) * 1e8) : 0;
  return {
    txid: verbose.txid,
    version: verbose.version,
    locktime: verbose.locktime,
    vin,
    vout,
    size: verbose.size,
    weight: verbose.weight ?? verbose.vsize * 4,
    status,
    fee: feeSats,
  };
}

function proxyToUpstream(req, res) {
  const upstreamBase = new URL(UPSTREAM_ESPLORA);
  const requestUrl = new URL(req.url || '/', upstreamBase);

  const headers = { ...req.headers };
  headers.host = upstreamBase.host;
  delete headers.connection;
  delete headers['proxy-connection'];

  const proxyReq = http.request(
    {
      hostname: upstreamBase.hostname,
      port: upstreamBase.port || (upstreamBase.protocol === 'https:' ? 443 : 80),
      path: requestUrl.pathname + requestUrl.search,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (error) => {
    console.error('upstream proxy error:', error.message);
    if (!res.headersSent) {
      res.writeHead(502, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    }
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq);
}

async function handleRawTransaction(req, res, txid) {
  if (req.method === 'OPTIONS') {
    sendOptionsPreflight(res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Method Not Allowed');
    return;
  }

  try {
    const hex = await bitcoinGetRawTransactionHexOnNetwork(txid);
    if (hex == null) {
      res.writeHead(404, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
      res.end('No such mempool or blockchain transaction');
      return;
    }

    if (req.method === 'HEAD') {
      res.writeHead(
        200,
        withCorsHeaders({
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(hex.length / 2),
        }),
      );
      res.end();
      return;
    }

    const rawBytes = Buffer.from(hex, 'hex');
    res.writeHead(
      200,
      withCorsHeaders({
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(rawBytes.length),
      }),
    );
    res.end(rawBytes);
  } catch (error) {
    console.error(`GET /api/tx/${txid}/raw error:`, error.message);
    res.writeHead(500, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Failed to get raw transaction');
  }
}

async function handleTxStatus(req, res, txid) {
  if (req.method === 'OPTIONS') {
    sendOptionsPreflight(res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Method Not Allowed');
    return;
  }

  try {
    const status = await bitcoinConfirmedTxStatus(txid);
    if (status != null) {
      const body = JSON.stringify(status);
      if (req.method === 'HEAD') {
        res.writeHead(
          200,
          withCorsHeaders({
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(body)),
          }),
        );
        res.end();
        return;
      }
      res.writeHead(
        200,
        withCorsHeaders({
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
        }),
      );
      res.end(body);
      return;
    }
  } catch (error) {
    console.error(`GET /api/tx/${txid}/status bitcoind error:`, error.message);
    res.writeHead(500, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Failed to get transaction status');
    return;
  }

  proxyToUpstream(req, res);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(
    statusCode,
    withCorsHeaders({
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body)),
    }),
  );
  res.end(body);
}

/**
 * Esplora `POST /txs/package` is a JSON array of raw tx hex. Bark's board drive
 * broadcasts the funding transaction this way. mempool's electrum backend answers
 * with a generic submitpackage RPC error, so the gateway calls bitcoind directly
 * and returns Core's result object (`package_msg`, `tx-results`).
 */
async function handleTxsPackage(req, res) {
  if (req.method === 'OPTIONS') {
    sendOptionsPreflight(res);
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Method Not Allowed');
    return;
  }

  try {
    const rawBody = await readRequestBody(req);
    const parsed = JSON.parse(rawBody);
    const hexesAreRawTransactions =
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((txHex) => typeof txHex === 'string' && /^[0-9a-fA-F]+$/.test(txHex));
    if (!hexesAreRawTransactions) {
      sendJson(res, 400, { error: 'expected a JSON array of raw transaction hex' });
      return;
    }

    const packageResult = await bitcoinRpc('submitpackage', [parsed]);
    sendJson(res, 200, packageResult);
  } catch (error) {
    console.error('POST /api/txs/package error:', error.message);
    sendJson(res, 400, { error: error.message || 'submitpackage failed' });
  }
}

/**
 * Esplora `POST /tx` is raw transaction hex, and the response body is the txid.
 * mempool electrum answers `sendrawtransaction` with a generic RPC error, so Bark
 * offboard and exit broadcasts never land. This calls bitcoind and returns its message.
 */
async function handleTxBroadcast(req, res) {
  if (req.method === 'OPTIONS') {
    sendOptionsPreflight(res);
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Method Not Allowed');
    return;
  }

  try {
    const rawBody = (await readRequestBody(req)).trim();
    if (!/^[0-9a-fA-F]+$/.test(rawBody)) {
      const body = 'expected raw transaction hex';
      res.writeHead(
        400,
        withCorsHeaders({
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': String(Buffer.byteLength(body)),
        }),
      );
      res.end(body);
      return;
    }

    const txid = await bitcoinRpc('sendrawtransaction', [rawBody]);
    const body = String(txid);
    res.writeHead(
      200,
      withCorsHeaders({
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(body)),
      }),
    );
    res.end(body);
  } catch (error) {
    console.error('POST /api/tx error:', error.message);
    const body = error.message || 'sendrawtransaction failed';
    res.writeHead(
      400,
      withCorsHeaders({
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(body)),
      }),
    );
    res.end(body);
  }
}

/**
 * Mempool returns HTTP 500 for many regtest txs; rust-esplora-client retries 500 six
 * times with backoff. bitboard-arkade treats 404/500 as "no merkle proof" and falls back
 * to /status — answer 404 immediately so progress polls stay fast.
 */
async function handleTxMerkleProof(req, res, txid) {
  if (req.method === 'OPTIONS') {
    sendOptionsPreflight(res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, withCorsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Method Not Allowed');
    return;
  }

  const body = JSON.stringify({
    error: 'No such mempool or blockchain transaction',
  });
  if (req.method === 'HEAD') {
    res.writeHead(
      404,
      withCorsHeaders({
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      }),
    );
    res.end();
    return;
  }

  res.writeHead(
    404,
    withCorsHeaders({
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body)),
    }),
  );
  res.end(body);
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const rawMatch = TXID_RAW_PATH.exec(pathname);
  if (rawMatch) {
    void handleRawTransaction(req, res, rawMatch[1].toLowerCase());
    return;
  }

  const outspendMatch = TXID_OUTSPEND_PATH.exec(pathname);
  if (outspendMatch) {
    void handleTxOutspend(req, res, outspendMatch[1].toLowerCase(), Number(outspendMatch[2]));
    return;
  }

  const txJsonMatch = TXID_JSON_PATH.exec(pathname);
  if (txJsonMatch) {
    void handleTxJson(req, res, txJsonMatch[1].toLowerCase());
    return;
  }

  const statusMatch = TXID_STATUS_PATH.exec(pathname);
  if (statusMatch) {
    void handleTxStatus(req, res, statusMatch[1].toLowerCase());
    return;
  }

  const merkleProofMatch = TXID_MERKLE_PROOF_PATH.exec(pathname);
  if (merkleProofMatch) {
    void handleTxMerkleProof(req, res, merkleProofMatch[1].toLowerCase());
    return;
  }

  if (pathname === TXS_PACKAGE_PATH) {
    void handleTxsPackage(req, res);
    return;
  }

  if (pathname === TX_BROADCAST_PATH) {
    void handleTxBroadcast(req, res);
    return;
  }

  proxyToUpstream(req, res);
});

server.listen(PORT, () => {
  console.log(
    `esplora-gateway listening on :${PORT} (upstream=${UPSTREAM_ESPLORA}, bitcoind=${BITCOIN_RPC_HOST}:${BITCOIN_RPC_PORT})`,
  );
});
