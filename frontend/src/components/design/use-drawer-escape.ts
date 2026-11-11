import { useEffect, useRef } from 'react'

export function useDrawerEscape(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      onCloseRef.current()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])
}
