import { createElement, useEffect, type ComponentType, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useInfomodeRegistry } from '@/components/infomode/InfomodeProvider'
import type { InfomodeRegistryEntry } from '@/components/infomode/infomode-types'

type InfomodeRootTag = 'div' | 'span' | 'section'

export type InfomodeWrapperProps = {
  infoId: string
  children: ReactNode
  infoTitle?: string
  infoText?: string
  infoComponent?: ComponentType
  as?: InfomodeRootTag
} & Omit<HTMLAttributes<HTMLElement>, 'children'>

function hasExactlyOneInfomodeVariant(
  infoTitle: string | undefined,
  infoText: string | undefined,
  InfoComponent: ComponentType | undefined,
): boolean {
  const hasInline = infoTitle != null && infoText != null
  const hasComponent = InfoComponent != null
  return hasInline !== hasComponent
}

export function InfomodeWrapper({
  infoId,
  infoTitle,
  infoText,
  infoComponent: InfoComponent,
  as = 'div',
  className,
  children,
  ...rest
}: InfomodeWrapperProps) {
  const { register } = useInfomodeRegistry()

  useEffect(() => {
    if (!hasExactlyOneInfomodeVariant(infoTitle, infoText, InfoComponent)) {
      console.error(
        'InfomodeWrapper: provide exactly one of (infoTitle + infoText) or infoComponent for',
        infoId,
      )
      return
    }

    let entry: InfomodeRegistryEntry
    if (InfoComponent) {
      entry = { kind: 'component', infoId, Content: InfoComponent }
    } else {
      entry = {
        kind: 'inline',
        infoId,
        title: infoTitle as string,
        text: infoText as string,
      }
    }

    return register(infoId, entry)
  }, [InfoComponent, infoId, infoText, infoTitle, register])

  return createElement(
    as,
    {
      'data-infomode-id': infoId,
      className: cn(className),
      ...rest,
    },
    children,
  )
}
