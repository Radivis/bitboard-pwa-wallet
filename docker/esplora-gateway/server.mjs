/**
 * Esplora-compatible gateway for arkade-regtest.
 *
 * mempool/backend v3.3.1 (electrum mode) exposes GET /tx/:txId/hex but not /raw.
 * rust-esplora-client and bitboard-ark use GET /tx/:txId/raw for relay detection.
 *
 * This service serves from bitcoind when authoritative:
 * - GET /api/tx/:txid/raw — mempool or confirmed chain only (not wallet-only stubs)
 * - GET /api/tx/:txid/status — confirmed txs (mempool electrum often stays confirmed:false)
 *
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
const TXID_STATUS_PATH = /^\/api\/tx\/([0-9a-f]{64})\/status$/i;
const TXID_MERKLE_PROOF_PATH = /^\/api\/tx\/([0-9a-f]{64})\/merkle-proof$/i;

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

/**
 * Mempool returns HTTP 500 for many regtest txs; rust-esplora-client retries 500 six
 * times with backoff. bitboard-ark treats 404/500 as "no merkle proof" and falls back
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

  proxyToUpstream(req, res);
});

server.listen(PORT, () => {
  console.log(
    `esplora-gateway listening on :${PORT} (upstream=${UPSTREAM_ESPLORA}, bitcoind=${BITCOIN_RPC_HOST}:${BITCOIN_RPC_PORT})`,
  );
});
