import { ReceiveModeArkadeInfomodeContent } from '@/components/arkade/infomode/ReceiveModeArkadeInfomodeContent'
import { DesignSwitch, type DesignSwitchOption } from '@/components/design/DesignSwitch'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { ReceiveRailIcon, type ReceiveRail } from '@/components/receive/ReceiveRailIcon'

export type ReceiveMode = ReceiveRail

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
      icon: <ReceiveRailIcon rail="bitcoin" className="size-6" />,
    },
  ]
  if (showLightning) {
    options.push({
      value: 'lightning',
      label: 'Lightning',
      showLabel: true,
      icon: <ReceiveRailIcon rail="lightning" className="size-6" />,
    })
  }
  if (showArkade) {
    options.push({
      value: 'arkade',
      label: 'Arkade',
      showLabel: true,
      icon: <ReceiveRailIcon rail="arkade" className="size-6" />,
    })
  }
  if (showBark) {
    options.push({
      value: 'bark',
      label: 'Bark',
      showLabel: true,
      icon: <ReceiveRailIcon rail="bark" className="size-6" />,
    })
  }
  return options
}
