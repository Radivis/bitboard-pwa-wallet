import { useState, useCallback } from 'react'
import { Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { useLightningStore, type LightningChannel } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'
import {
  getChannelTargets,
  DEFAULT_FUNDING_AMOUNT_SATS,
  type ChannelTarget,
} from '@/lib/lightning-utils'
import { truncateAddress } from '@/lib/bitcoin-utils'

const CHANNEL_STATUS_VARIANT: Record<LightningChannel['status'], 'default' | 'outline' | 'secondary'> = {
  pending: 'secondary',
  open: 'default',
  closed: 'outline',
}

function ChannelCard({ channel }: { channel: LightningChannel }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{channel.peerAlias}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {truncateAddress(channel.peerNodeId, 12, 8)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {channel.fundingAmountSats.toLocaleString()} sats
        </span>
        <Badge variant={CHANNEL_STATUS_VARIANT[channel.status]}>
          {channel.status}
        </Badge>
      </div>
    </div>
  )
}

function ChannelTargetRow({
  target,
  selected,
  onSelect,
}: {
  target: ChannelTarget
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border p-3 text-left transition-colors ${
        selected
          ? 'border-primary bg-primary/5'
          : 'hover:bg-muted/50'
      }`}
    >
      <p className="text-sm font-medium">{target.alias}</p>
      <p className="font-mono text-xs text-muted-foreground">
        {truncateAddress(target.nodeId, 12, 8)}
      </p>
      <p className="text-xs text-muted-foreground">{target.host}</p>
    </button>
  )
}

export function LightningChannels() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const channels = useLightningStore((s) => s.channels)
  const addChannel = useLightningStore((s) => s.addChannel)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState<ChannelTarget | null>(null)
  const [useCustomTarget, setUseCustomTarget] = useState(false)
  const [customNodeUri, setCustomNodeUri] = useState('')
  const [fundingAmount, setFundingAmount] = useState(
    DEFAULT_FUNDING_AMOUNT_SATS.toString(),
  )

  const channelTargets = getChannelTargets(networkMode)
  const parsedFunding = parseInt(fundingAmount) || 0

  const canOpenChannel =
    parsedFunding >= 1 &&
    (selectedTarget != null || (useCustomTarget && customNodeUri.trim().length > 0))

  const handleOpenChannel = useCallback(() => {
    if (!canOpenChannel) return

    if (useCustomTarget) {
      const trimmedUri = customNodeUri.trim()
      const atIndex = trimmedUri.indexOf('@')
      const nodeId = atIndex > 0 ? trimmedUri.slice(0, atIndex) : trimmedUri
      addChannel({
        peerNodeId: nodeId,
        peerAlias: 'Custom node',
        fundingAmountSats: parsedFunding,
      })
    } else if (selectedTarget) {
      addChannel({
        peerNodeId: selectedTarget.nodeId,
        peerAlias: selectedTarget.alias,
        fundingAmountSats: parsedFunding,
      })
    }

    toast.success('Channel opening initiated (stub)')
    setShowCreateForm(false)
    setSelectedTarget(null)
    setUseCustomTarget(false)
    setCustomNodeUri('')
    setFundingAmount(DEFAULT_FUNDING_AMOUNT_SATS.toString())
  }, [canOpenChannel, useCustomTarget, customNodeUri, selectedTarget, parsedFunding, addChannel])

  const handleSelectTarget = useCallback((target: ChannelTarget) => {
    setSelectedTarget(target)
    setUseCustomTarget(false)
  }, [])

  const handleSelectCustom = useCallback(() => {
    setUseCustomTarget(true)
    setSelectedTarget(null)
  }, [])

  return (
    <InfomodeWrapper
      infoId="management-lightning-channels-card"
      infoTitle="Lightning channels"
      infoText="Lightning channels are two-way payment links between your node and another Lightning node. Opening a channel locks some bitcoin on-chain as collateral, then lets you send and receive Lightning payments through that link almost instantly and with very low fees. You need at least one open channel to use Lightning."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Lightning Channels
          </CardTitle>
          <CardDescription>
            Manage your Lightning Network payment channels.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {channels.length > 0 && (
            <div className="space-y-2">
              {channels.map((channel) => (
                <ChannelCard key={channel.id} channel={channel} />
              ))}
            </div>
          )}

          {channels.length === 0 && !showCreateForm && (
            <p className="text-sm text-muted-foreground">
              No channels yet. Open a channel to start using Lightning payments.
            </p>
          )}

          {!showCreateForm ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowCreateForm(true)}
            >
              <Zap className="mr-2 h-4 w-4" />
              Create Channel
            </Button>
          ) : (
            <div className="space-y-4 rounded-lg border p-4">
              <h4 className="text-sm font-medium">Select a channel partner</h4>

              <div className="space-y-2">
                {channelTargets.map((target) => (
                  <ChannelTargetRow
                    key={target.nodeId}
                    target={target}
                    selected={!useCustomTarget && selectedTarget?.nodeId === target.nodeId}
                    onSelect={() => handleSelectTarget(target)}
                  />
                ))}

                <button
                  type="button"
                  onClick={handleSelectCustom}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    useCustomTarget
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <p className="text-sm font-medium">Custom target</p>
                  <p className="text-xs text-muted-foreground">
                    Enter a node URI manually
                  </p>
                </button>
              </div>

              {useCustomTarget && (
                <div className="space-y-2">
                  <Label htmlFor="custom-node-uri">Node URI</Label>
                  <Input
                    id="custom-node-uri"
                    value={customNodeUri}
                    onChange={(e) => setCustomNodeUri(e.target.value)}
                    placeholder="nodeId@host:port"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="funding-amount">Funding Amount (sats)</Label>
                <Input
                  id="funding-amount"
                  type="number"
                  value={fundingAmount}
                  onChange={(e) => setFundingAmount(e.target.value)}
                  placeholder="10000"
                  min="1"
                  step="1"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowCreateForm(false)
                    setSelectedTarget(null)
                    setUseCustomTarget(false)
                    setCustomNodeUri('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={!canOpenChannel}
                  onClick={handleOpenChannel}
                >
                  Open Channel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
