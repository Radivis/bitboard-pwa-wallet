import { Bitcoin, Zap } from 'lucide-react'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { BarkIcon } from '@/components/icons/BarkIcon'
import { ReceiveModeArkadeInfomodeContent } from '@/components/arkade/infomode/ReceiveModeArkadeInfomodeContent'
import { DesignSwitch, type DesignSwitchOption } from '@/components/design/DesignSwitch'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'

export type ReceiveMode = 'bitcoin' | 'lightning' | 'arkade' | 'bark'

interface ReceiveModeToggleProps {
  mode: ReceiveMode
  onModeChange: (mode: ReceiveMode) => void
  showLightning: boolean
  showArkade: boolean
  showBark: boolean
}

export function ReceiveModeToggle({
  mode,
  onModeChange,
  showLightning,
  showArkade,
  showBark,
}: ReceiveModeToggleProps) {
  return (
    <InfomodeWrapper
      infoId="receive-mode-toggle"
      infoComponent={ReceiveModeArkadeInfomodeContent}
    >
      <DesignSwitch
        aria-label="Receive rail"
        wrap
        value={mode}
        onValueChange={onModeChange}
        options={receiveRailOptions({ showLightning, showArkade, showBark })}
      />
    </InfomodeWrapper>
  )
}

function receiveRailOptions({
  showLightning,
  showArkade,
  showBark,
}: {
  showLightning: boolean
  showArkade: boolean
  showBark: boolean
}): DesignSwitchOption<ReceiveMode>[] {
  const options: DesignSwitchOption<ReceiveMode>[] = [
    {
      value: 'bitcoin',
      label: 'Bitcoin',
      showLabel: true,
      icon: <Bitcoin aria-hidden />,
    },
  ]
  if (showLightning) {
    options.push({
      value: 'lightning',
      label: 'Lightning',
      showLabel: true,
      icon: <Zap aria-hidden />,
    })
  }
  if (showArkade) {
    options.push({
      value: 'arkade',
      label: 'Arkade',
      showLabel: true,
      icon: <ArkadeIcon className="size-6" />,
    })
  }
  if (showBark) {
    options.push({
      value: 'bark',
      label: 'Bark',
      showLabel: true,
      icon: <BarkIcon className="size-6" />,
    })
  }
  return options
}
