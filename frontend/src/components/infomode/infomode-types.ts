import type { ComponentType } from 'react'

export type InfomodeInlineEntry = {
  kind: 'inline'
  infoId: string
  title: string
  text: string
}

export type InfomodeComponentEntry = {
  kind: 'component'
  infoId: string
  Content: ComponentType
}

export type InfomodeRegistryEntry = InfomodeInlineEntry | InfomodeComponentEntry
