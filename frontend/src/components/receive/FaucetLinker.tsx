import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, ExternalLink, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import {
  checkFaucetReachability,
  faucetsForNetwork,
  type FaucetReachability,
} from '@/lib/faucet/faucet-matching'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

const REACHABILITY_TIMEOUT_MS = 8000

const REACHABILITY_LABEL: Record<FaucetReachability, string> = {
  online: '(ONLINE)',
  offline: '(OFFLINE)',
  unknown: '(UNKNOWN)',
}

function statusClasses(status: FaucetReachability | undefined): string {
  if (status === 'online') return 'fill-green-600 text-green-600 dark:fill-green-500 dark:text-green-500'
  if (status === 'offline') return 'fill-red-600 text-red-600 dark:fill-red-500 dark:text-red-500'
  if (status === 'unknown') return 'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400'
  return 'fill-muted-foreground text-muted-foreground'
}

function reachabilityLabel(
  status: FaucetReachability | undefined,
  checking: boolean,
): string {
  if (status === undefined && checking) return '…'
  if (status === undefined) return '—'
  return REACHABILITY_LABEL[status]
}

export function FaucetLinker() {
  const committedNetworkMode = useWalletStore(selectCommittedNetworkMode)
  const faucets = useMemo(
    () => faucetsForNetwork(committedNetworkMode),
    [committedNetworkMode],
  )

  const [reachabilityById, setReachabilityById] = useState<
    Record<string, FaucetReachability>
  >({})
  const [checking, setChecking] = useState(false)
  const runSeqRef = useRef(0)

  const runChecks = useCallback(async () => {
    if (faucets.length === 0) return
    const runSequence = ++runSeqRef.current
    setChecking(true)
    try {
      const entries = await Promise.all(
        faucets.map(async (faucet) => {
          const controller = new AbortController()
          const timeoutId = globalThis.setTimeout(() => {
            controller.abort()
          }, REACHABILITY_TIMEOUT_MS)
          try {
            const status = await checkFaucetReachability(faucet.id, controller.signal)
            return [faucet.id, status] as const
          } finally {
            globalThis.clearTimeout(timeoutId)
          }
        }),
      )
      if (runSequence !== runSeqRef.current) return
      setReachabilityById(Object.fromEntries(entries))
    } finally {
      if (runSequence === runSeqRef.current) {
        setChecking(false)
      }
    }
  }, [faucets])

  useEffect(() => {
    if (faucets.length === 0) return
    void runChecks()
  }, [faucets, runChecks])

  if (faucets.length === 0) {
    return null
  }

  return (
    <InfomodeWrapper
      infoId="receive-faucet-linker"
      infoTitle="Test faucets"
      infoText="These links point to third-party faucets that may send small amounts of test coins. Bitboard does not operate them; availability changes often. The status indicator only reflects whether this app could get a successful HTTP response from the faucet page—blocked checks (for example due to browser security) show as UNKNOWN, not offline."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Test faucets</CardTitle>
              <CardDescription className="mt-1">
                Third-party sites for getting test coins; Bitboard does not control availability.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => void runChecks()}
              disabled={checking}
              aria-label="Recheck whether each faucet responds over HTTP"
            >
              <RefreshCw
                className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`}
                aria-hidden
              />
              Recheck
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {faucets.map((faucet) => {
              const status = reachabilityById[faucet.id]
              const label = reachabilityLabel(status, checking)
              const ariaStatus =
                status === undefined
                  ? checking
                    ? 'checking'
                    : 'not checked'
                  : label.replace(/[()]/g, '').toLowerCase()
              return (
                <li key={faucet.id}>
                  <a
                    href={faucet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 rounded-md border border-transparent px-1 py-1 text-sm hover:border-border hover:bg-muted/50"
                    aria-label={`${faucet.label}. ${ariaStatus}`}
                  >
                    <Circle
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${statusClasses(status)}`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 font-medium leading-snug">
                      {faucet.label}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {label}
                    </span>
                    <ExternalLink
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </a>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
