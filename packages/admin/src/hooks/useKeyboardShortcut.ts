import { useEffect, useRef, useContext } from 'react'
import { KeyboardShortcutsContext } from '@/context/keyboardShortcuts.tsx'

function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split('+')
  const needsMod = parts.includes('mod')
  const needsShift = parts.includes('shift')
  const key = parts[parts.length - 1]

  return (
    (needsMod ? e.metaKey || e.ctrlKey : !e.metaKey && !e.ctrlKey) &&
    needsShift === e.shiftKey &&
    !e.altKey &&
    e.key.toLowerCase() === key
  )
}

export function useKeyboardShortcut(
  combo: string,
  handler: () => void,
  options?: { enabled?: boolean; label?: string },
) {
  const enabled = options?.enabled ?? true
  const { register } = useContext(KeyboardShortcutsContext)

  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    if (!options?.label) return
    return register(combo, options.label)
  }, [combo, options?.label, register])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (matchesCombo(e, combo)) {
        e.preventDefault()
        if (enabled) handlerRef.current()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [combo, enabled])
}
