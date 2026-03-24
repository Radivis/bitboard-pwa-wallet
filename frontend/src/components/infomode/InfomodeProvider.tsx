import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useInfomodeStore } from '@/stores/infomodeStore'
import { InfomodePopup } from '@/components/infomode/InfomodePopup'
import type { InfomodeRegistryEntry } from '@/components/infomode/infomode-types'

const INFOMODE_POPUP_SELECTOR = '[data-infomode-popup]'
const INFOMODE_TARGET_SELECTOR = '[data-infomode-id]'

interface InfomodeRegistryContextValue {
  register: (infoId: string, entry: InfomodeRegistryEntry) => () => void
}

const InfomodeRegistryContext = createContext<InfomodeRegistryContextValue | null>(null)

export function useInfomodeRegistry(): InfomodeRegistryContextValue {
  const context = useContext(InfomodeRegistryContext)
  if (!context) {
    throw new Error('useInfomodeRegistry must be used within InfomodeProvider')
  }
  return context
}

interface InfomodeProviderProps {
  children: ReactNode
}

export function InfomodeProvider({ children }: InfomodeProviderProps) {
  const isActive = useInfomodeStore((state) => state.isActive)
  const registryRef = useRef(new Map<string, InfomodeRegistryEntry>())
  const [popupState, setPopupState] = useState<{
    anchorElement: HTMLElement
    infoId: string
  } | null>(null)

  const register = useCallback((infoId: string, entry: InfomodeRegistryEntry) => {
    registryRef.current.set(infoId, entry)
    return () => {
      registryRef.current.delete(infoId)
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    document.documentElement.toggleAttribute('data-infomode-active', isActive)
    if (!isActive) {
      setPopupState(null)
    }
    return () => {
      document.documentElement.removeAttribute('data-infomode-active')
    }
  }, [isActive])

  useEffect(() => {
    if (!isActive) {
      return
    }

    function handleClickCapture(event: MouseEvent) {
      const rawTarget = event.target
      let target: Element | null = null
      if (rawTarget instanceof Element) {
        target = rawTarget
      } else if (rawTarget instanceof Node) {
        target = rawTarget.parentElement
      }
      if (!target) {
        setPopupState(null)
        return
      }

      if (target.closest(INFOMODE_POPUP_SELECTOR)) {
        return
      }

      const infomodeElement = target.closest(INFOMODE_TARGET_SELECTOR)
      if (infomodeElement instanceof HTMLElement) {
        const infoId = infomodeElement.getAttribute('data-infomode-id')
        if (infoId && registryRef.current.has(infoId)) {
          event.preventDefault()
          event.stopPropagation()
          setPopupState({ anchorElement: infomodeElement, infoId })
          return
        }
      }

      setPopupState(null)
    }

    document.addEventListener('click', handleClickCapture, true)
    return () => document.removeEventListener('click', handleClickCapture, true)
  }, [isActive])

  const activeEntry = popupState
    ? registryRef.current.get(popupState.infoId) ?? null
    : null

  return (
    <InfomodeRegistryContext.Provider value={{ register }}>
      {children}
      <InfomodePopup
        open={popupState !== null && activeEntry !== null}
        anchorElement={popupState?.anchorElement ?? null}
        entry={activeEntry}
        onRequestClose={() => setPopupState(null)}
      />
    </InfomodeRegistryContext.Provider>
  )
}
