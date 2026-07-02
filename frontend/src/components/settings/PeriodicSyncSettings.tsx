import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { DashboardRailId } from '@/components/wallet/RailSyncControl'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useFeatureStore } from '@/stores/featureStore'
import {
  clampIntervalSeconds,
  usePeriodicSyncStore,
} from '@/stores/periodicSyncStore'
import {
  MAX_PERIODIC_SYNC_INTERVAL_SECONDS,
  MIN_PERIODIC_SYNC_INTERVAL_SECONDS,
} from '@/lib/wallet/periodic-sync/periodic-sync-constants'

const RAIL_LABELS: Record<DashboardRailId, string> = {
  onchain: 'On-chain',
  lightning: 'Lightning',
  arkade: 'Arkade',
}

function PeriodicSyncRailRow({ rail }: { rail: DashboardRailId }) {
  const isEnabled = usePeriodicSyncStore((state) => state.rails[rail].isEnabled)
  const intervalSeconds = usePeriodicSyncStore(
    (state) => state.rails[rail].intervalSeconds,
  )
  const setRailPeriodicSyncEnabled = usePeriodicSyncStore(
    (state) => state.setRailPeriodicSyncEnabled,
  )
  const setRailPeriodicSyncIntervalSeconds = usePeriodicSyncStore(
    (state) => state.setRailPeriodicSyncIntervalSeconds,
  )

  const [editIntervalSeconds, setEditIntervalSeconds] = useState(String(intervalSeconds))

  useEffect(() => {
    setEditIntervalSeconds(String(intervalSeconds))
  }, [intervalSeconds])

  const commitInterval = useCallback(() => {
    const parsed = Number.parseInt(editIntervalSeconds, 10)
    if (!Number.isFinite(parsed)) {
      toast.error(
        `Enter a whole number between ${MIN_PERIODIC_SYNC_INTERVAL_SECONDS} and ${MAX_PERIODIC_SYNC_INTERVAL_SECONDS} seconds.`,
      )
      setEditIntervalSeconds(String(intervalSeconds))
      return
    }
    const clamped = clampIntervalSeconds(parsed)
    if (clamped !== parsed) {
      toast.message(
        `Interval adjusted to ${clamped} seconds (allowed range ${MIN_PERIODIC_SYNC_INTERVAL_SECONDS}–${MAX_PERIODIC_SYNC_INTERVAL_SECONDS}).`,
      )
    }
    setRailPeriodicSyncIntervalSeconds(rail, clamped)
    setEditIntervalSeconds(String(clamped))
  }, [editIntervalSeconds, intervalSeconds, rail, setRailPeriodicSyncIntervalSeconds])

  const inputId = `periodic-sync-interval-${rail}`
  const switchId = `periodic-sync-enabled-${rail}`

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`periodic-sync-row-${rail}`}
    >
      <span className="text-sm font-medium text-foreground">{RAIL_LABELS[rail]}</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor={inputId} className="sr-only">
            {RAIL_LABELS[rail]} polling interval in seconds
          </Label>
          <Input
            id={inputId}
            type="number"
            min={MIN_PERIODIC_SYNC_INTERVAL_SECONDS}
            max={MAX_PERIODIC_SYNC_INTERVAL_SECONDS}
            value={editIntervalSeconds}
            onChange={(event) => setEditIntervalSeconds(event.target.value)}
            onBlur={() => commitInterval()}
            className="w-28"
            aria-label={`${RAIL_LABELS[rail]} polling interval in seconds`}
          />
          <span className="text-sm text-muted-foreground">seconds</span>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <Label htmlFor={switchId} className="cursor-pointer text-sm text-muted-foreground">
            periodic sync enabled
          </Label>
          <Switch
            id={switchId}
            checked={isEnabled}
            onCheckedChange={(checked) => setRailPeriodicSyncEnabled(rail, checked)}
            aria-label={`${RAIL_LABELS[rail]} periodic sync enabled`}
          />
        </div>
      </div>
    </div>
  )
}

export function PeriodicSyncSettings() {
  const isLightningEnabled = useFeatureStore((state) => state.isLightningEnabled)
  const isArkadeEnabled = useFeatureStore((state) => state.isArkadeEnabled)

  const visibleRails: DashboardRailId[] = ['onchain']
  if (isLightningEnabled) {
    visibleRails.push('lightning')
  }
  if (isArkadeEnabled) {
    visibleRails.push('arkade')
  }

  return (
    <InfomodeWrapper
      infoId="settings-periodic-sync-card"
      infoTitle="Periodic sync"
      infoText="When enabled under Features, each rail can poll its provider on a timer while the wallet is loaded and this browser tab is visible. Hydration after unlock and manual sync always run regardless. Turn off per-rail polling here if you prefer fewer background network requests."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Periodic sync
          </CardTitle>
          <CardDescription>
            Control background polling per rail. Default interval is 300 seconds when
            the feature is first enabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {visibleRails.map((rail) => (
            <PeriodicSyncRailRow key={rail} rail={rail} />
          ))}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
