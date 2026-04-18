import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useLocation, useRouter } from '@tanstack/react-router'
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

type PopupState = {
  anchorElement: HTMLElement
  infoId: string
} | null

/**
 * When TanStack Router is available, close the Infomode popup whenever the
 * location changes (e.g. user followed a link inside the popup). If the popup
 * was open, also turn Infomode off so the user is not left in "explain" mode
 * after navigating away (e.g. to the Library).
 */
function InfomodeCloseOnNavigateIfRouter({
  setPopupState,
  isPopupOpen,
}: {
  setPopupState: Dispatch<SetStateAction<PopupState>>
  isPopupOpen: boolean
}) {
  const router = useRouter({ warn: false })
  if (!router) {
    return null
  }
  return (
    <InfomodeCloseOnNavigate
      setPopupState={setPopupState}
      isPopupOpen={isPopupOpen}
    />
  )
}

function InfomodeCloseOnNavigate({
  setPopupState,
  isPopupOpen,
}: {
  setPopupState: Dispatch<SetStateAction<PopupState>>
  isPopupOpen: boolean
}) {
  const setInfomodeActive = useInfomodeStore((s) => s.setInfomodeActive)
  const locationKey = useLocation({
    select: (loc) => `${loc.pathname}${loc.searchStr}${loc.hash}`,
    structuralSharing: false,
  })

  const previousLocationKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (previousLocationKeyRef.current === null) {
      previousLocationKeyRef.current = locationKey
      return
    }
    if (previousLocationKeyRef.current !== locationKey) {
      previousLocationKeyRef.current = locationKey
      if (isPopupOpen) {
        setInfomodeActive(false)
      }
      setPopupState(null)
    }
  }, [locationKey, isPopupOpen, setInfomodeActive, setPopupState])

  return null
}

export function InfomodeProvider({ children }: InfomodeProviderProps) {
  const isActive = useInfomodeStore((state) => state.isActive)
  const registryRef = useRef(new Map<string, InfomodeRegistryEntry>())
  const [popupState, setPopupState] = useState<PopupState>(null)

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
      <InfomodeCloseOnNavigateIfRouter
        setPopupState={setPopupState}
        isPopupOpen={popupState !== null}
      />
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
