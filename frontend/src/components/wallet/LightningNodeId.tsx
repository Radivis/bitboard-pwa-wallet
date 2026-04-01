import { useState, useCallback } from 'react'
import { Zap, Copy, Check } from 'lucide-react'
import { useCryptoStore } from '@/stores/cryptoStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function LightningNodeId() {
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const generateNodeId = useCryptoStore((s) => s.generateNodeId)

  const handleGenerate = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const seed = crypto.getRandomValues(new Uint8Array(32))
      const result = await generateNodeId(seed)
      setNodeId(result.nodeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [generateNodeId])

  const handleCopy = useCallback(async () => {
    if (!nodeId) return
    await navigator.clipboard.writeText(nodeId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [nodeId])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Lightning Node (LDK PoC)
        </CardTitle>
        <CardDescription>
          Generate a Lightning node identity using LDK compiled to WASM.
          This is a proof of concept — no networking or channels yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!nodeId ? (
          <Button
            variant="outline"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Generate Node ID'}
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Node Public Key
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs font-mono">
                {nodeId}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                title="Copy to clipboard"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? 'Regenerating...' : 'Regenerate'}
            </Button>
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  )
}
