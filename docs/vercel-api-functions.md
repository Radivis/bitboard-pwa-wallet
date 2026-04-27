# Vercel API Functions with Prebuilt Deployments

This document captures lessons learned when setting up Vercel API functions (Node.js serverless) with a Vite frontend using prebuilt deployments (`vercel build --prebuilt`).

## Background

The app uses a same-origin proxy (`/api/esplora/*`, `/api/faucet/*`) to avoid CORS issues when the browser-based WASM Bitcoin client calls external Esplora APIs.

## Key Findings

### 1. Edge Functions Don't Work with Prebuilt + Vite

**Problem**: When using `runtime: 'edge'` in function files with `vercel build --prebuilt`, Edge Functions are not detected or built. The deployment shows zero functions.

**Why**: Vite has no native Vercel adapter. Edge Functions in prebuilt mode require explicit `.vercel/output/functions/` structures with `.vc-config.json` files that Vite doesn't generate.

**Solution**: Use Node.js functions (the default runtime) instead. They work automatically with prebuilt deployments.

```typescript
// Use VercelRequest/VercelResponse, NOT Web API Request/Response
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ...
}
```

### 2. Catch-All Routes Need Explicit Rewrites

**Problem**: Catch-all routes like `api/esplora/[...path].ts` only match single-segment paths (e.g., `/api/esplora/foo`) but not multi-segment paths (e.g., `/api/esplora/foo/bar/baz`).

**Solution**: Add explicit rewrites in `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/api/esplora/:path*", "destination": "/api/esplora/[...path]" },
    { "source": "/api/faucet/:path*", "destination": "/api/faucet/[...path]" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

### 3. Imports from Outside `api/` Don't Work

**Problem**: Vercel's bundler cannot resolve imports from outside the `api/` directory (e.g., `import { foo } from '../../src/lib/utils'`). Functions crash with `FUNCTION_INVOCATION_FAILED`.

**Why**: The bundler only processes files within the function directory. `includeFiles` in `vercel.json` adds files to the deployment but doesn't make them importable.

**Solution**: Inline the necessary code directly into the API function files. This duplicates some code but ensures reliability.

### 4. CORS Requires OPTIONS Handling

**Problem**: Browser preflight requests (OPTIONS) return 405 Method Not Allowed, causing CORS failures.

**Solution**: Handle OPTIONS explicitly and set CORS headers on all responses:

```typescript
function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
  res.setHeader('Access-Control-Max-Age', '86400')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res)
  
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  // ... rest of handler
}
```

### 5. Don't Forward `content-encoding` Headers

**Problem**: Upstream APIs (e.g., mempool.space) return gzip-compressed responses with `content-encoding: gzip`. Node.js `fetch()` auto-decompresses, but if you forward the header, the browser tries to decompress already-decompressed data, causing "Failed to fetch" errors.

**Solution**: Drop these headers when proxying:

```typescript
const HEADERS_TO_DROP = new Set([
  'content-encoding',  // fetch auto-decompresses; Vercel re-compresses
  'content-length',    // length changes after decompression
  'transfer-encoding',
  // ... other hop-by-hop headers
])
```

### 6. Use Buffered Responses, Not Streaming

**Problem**: Streaming response bodies can cause issues with WASM fetch clients.

**Solution**: Buffer the entire response before sending:

```typescript
const body = await upstream.arrayBuffer()
res.status(upstream.status).send(Buffer.from(body))
```

## Final `vercel.json` Configuration

```json
{
  "functions": {
    "api/**/*.ts": {
      "includeFiles": "src/lib/**"
    }
  },
  "rewrites": [
    { "source": "/api/esplora/:path*", "destination": "/api/esplora/[...path]" },
    { "source": "/api/faucet/:path*", "destination": "/api/faucet/[...path]" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

## Debugging Tips

1. **Functions not building**: Check `vercel inspect <deployment-url>` - the "Builds" section should show λ symbols for functions
2. **FUNCTION_INVOCATION_FAILED**: Usually an import resolution issue or runtime error
3. **404 on multi-segment paths**: Missing rewrites for catch-all routes
4. **"Failed to fetch" with 200 status**: Check `content-encoding` header mismatch
5. **curl works but browser fails**: CORS issue - check OPTIONS handling
