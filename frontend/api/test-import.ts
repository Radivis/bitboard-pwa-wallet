import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isKnownEsploraProviderId } from '../src/lib/esplora-service-whitelist'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.json({ 
    message: 'Import test', 
    isDefaultKnown: isKnownEsploraProviderId('default') 
  })
}
