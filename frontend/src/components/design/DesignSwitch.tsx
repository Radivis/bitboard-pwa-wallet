import { Fragment, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

import { designFocusClassName } from '@/components/design/design-classes'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

const SELECTED_SURFACE_CLASS_NAME =
  'pointer-events-none absolute top-0 left-0 z-0 rounded-[20px] border border-[var(--design-nav-stroke)] bg-[var(--design-nav-background-selected)] transition-[transform,width,height] duration-[0.3s] ease-out motion-reduce:transition-none'

export type DesignSwitchOption<Value extends string> = {
  value: Value
  label: string
  icon?: ReactNode
  /** Keep the label visible beside the icon. An icon otherwise replaces the label. */
  showLabel?: boolean
}

type DesignSwitchProps<Value extends string> = {
  value: Value
  onValueChange: (value: Value) => void
  options: readonly DesignSwitchOption<Value>[]
  'aria-label': string
  disabled?: boolean
  className?: string
  'data-testid'?: string
  /**
   * Size the group to its parent and let options wrap onto extra rows.
   * An option stays as wide as its label, so a narrow row wraps instead of clipping it.
   */
  wrap?: boolean
  /** Wraps one option button, for example with an explainer target. The button should stay full width. */
  frameOption?: (option: DesignSwitchOption<Value>, optionButton: ReactNode) => ReactNode
}

export function DesignSwitch<Value extends string>({
  value,
  onValueChange,
  options,
  'aria-label': ariaLabel,
  disabled = false,
  className,
  'data-testid': testId,
  wrap = false,
  frameOption,
}: DesignSwitchProps<Value>) {
  const groupRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const optionElementsRef = useRef(new Map<Value, HTMLButtonElement>())
  const valueRef = useRef(value)
  const placeSelectedSurfaceRef = useRef<(animate: boolean) => void>(() => {})
  const animationFrameRef = useRef<number | null>(null)
  valueRef.current = value
  const optionLayoutKey = options
    .map(
      (option) =>
        `${option.value}\u0000${option.label}\u0000${option.icon != null}\u0000${option.showLabel === true}`,
    )
    .join('\u0001')

  placeSelectedSurfaceRef.current = (animate) => {
    const group = groupRef.current
    const indicator = indicatorRef.current
    const selectedOption = optionElementsRef.current.get(valueRef.current)
    if (!group || !indicator || !selectedOption) return
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    const offset = offsetWithin(selectedOption, group)
    const applySurface = () => {
      indicator.style.width = `${selectedOption.offsetWidth}px`
      indicator.style.height = `${selectedOption.offsetHeight}px`
      indicator.style.transform = `translate(${offset.left}px, ${offset.top}px)`
    }
    if (!animate) {
      indicator.style.transition = 'none'
      applySurface()
      return
    }
    indicator.style.transition = ''
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null
      applySurface()
    })
  }

  useLayoutEffect(() => {
    placeSelectedSurfaceRef.current(false)
  }, [optionLayoutKey, wrap])

  const skipInitialSelectionAnimationRef = useRef(true)
  useEffect(() => {
    if (skipInitialSelectionAnimationRef.current) {
      skipInitialSelectionAnimationRef.current = false
      return
    }
    placeSelectedSurfaceRef.current(true)
  }, [value])

  useEffect(() => {
    const group = groupRef.current
    if (!group || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      placeSelectedSurfaceRef.current(false)
    })
    observer.observe(group)
    for (const optionElement of optionElementsRef.current.values()) {
      observer.observe(optionElement)
    }
    return () => observer.disconnect()
  }, [optionLayoutKey, wrap])

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={ariaLabel}
      data-slot="design-switch"
      data-testid={testId}
      className={cn(
        'design-ui relative gap-1 rounded-[24px] border border-[var(--design-nav-stroke)] bg-[var(--design-nav-background)] p-1',
        wrap ? 'flex w-full min-w-0 flex-wrap' : 'inline-flex w-fit',
        className,
      )}
    >
      <div
        ref={indicatorRef}
        aria-hidden
        data-slot="design-switch-indicator"
        className={SELECTED_SURFACE_CLASS_NAME}
      />
      {options.map((option) => {
        const selected = option.value === value
        const showsIcon = option.icon != null
        const showsLabel = !showsIcon || option.showLabel === true
        const optionButton = (
          <button
            ref={(element) => {
              if (element) {
                optionElementsRef.current.set(option.value, element)
                return
              }
              optionElementsRef.current.delete(option.value)
            }}
            type="button"
            aria-pressed={selected}
            aria-label={showsIcon && !showsLabel ? option.label : undefined}
            disabled={disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              designFocusClassName,
              'relative z-10 inline-flex items-center justify-center rounded-[20px] border border-transparent bg-transparent px-3 py-2 whitespace-nowrap disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-6 [&_svg]:shrink-0',
              designTypeClassName.button,
              showsIcon
                ? 'text-[var(--design-input-content)]'
                : 'text-[var(--design-text-regular)]',
              showsIcon && showsLabel && 'gap-2',
              wrap && 'w-full',
            )}
          >
            {showsIcon ? option.icon : null}
            {showsLabel ? option.label : null}
          </button>
        )
        const framedOption = frameOption ? frameOption(option, optionButton) : optionButton
        if (!wrap) {
          return <Fragment key={option.value}>{framedOption}</Fragment>
        }
        return (
          <div key={option.value} className="flex min-w-max grow shrink-0">
            {framedOption}
          </div>
        )
      })}
    </div>
  )
}

function offsetWithin(element: HTMLElement, ancestor: HTMLElement): { left: number; top: number } {
  let left = 0
  let top = 0
  let current: HTMLElement | null = element
  while (current && current !== ancestor) {
    left += current.offsetLeft
    top += current.offsetTop
    const parent = current.offsetParent
    if (!(parent instanceof HTMLElement) || !ancestor.contains(parent)) {
      break
    }
    current = parent
  }
  return { left, top }
}
