import { toast } from 'sonner'
import { DesignInfoToggle } from '@/components/design/DesignInfoToggle'
import { useInfomodeStore } from '@/stores/infomodeStore'

const INFO_MODE_TOGGLE_TOAST_DURATION_MS = 6_000

interface DesignInfomodeToggleProps {
  /** Extra classes for the toggle button. */
  className?: string
}

export function DesignInfomodeToggle({ className }: DesignInfomodeToggleProps) {
  const isActive = useInfomodeStore((state) => state.isActive)
  const toggleInfomode = useInfomodeStore((state) => state.toggleInfomode)
  const lightbulbSuppressionCue = useInfomodeStore((state) => state.lightbulbSuppressionCue)

  return (
    <DesignInfoToggle
      key={lightbulbSuppressionCue}
      pressed={isActive}
      aria-label={isActive ? 'Turn off infomode' : 'Turn on infomode'}
      className={className}
      iconClassName={
        lightbulbSuppressionCue > 0 ? 'infomode-lightbulb-jitter--active' : undefined
      }
      onClick={() => {
        const willBeActive = !isActive
        toggleInfomode()
        if (willBeActive) {
          toast.info('Infomode on', {
            description:
              'Anything with a cyan border is an explainer zone—tap it to read what that part of the app does. (Taps there open help instead of the control underneath.)',
            duration: INFO_MODE_TOGGLE_TOAST_DURATION_MS,
          })
          return
        }
        toast.info('Infomode off', {
          description:
            'Normal behavior is back: buttons, links, and fields respond the usual way when you tap them.',
          duration: INFO_MODE_TOGGLE_TOAST_DURATION_MS,
        })
      }}
    />
  )
}
