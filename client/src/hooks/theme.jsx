import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)
const KEY = 'wf-theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function readSaved() {
  try {
    return localStorage.getItem(KEY) || 'system'
  } catch {
    return 'system'
  }
}

export function ThemeProvider({ children, onPersist }) {
  const [mode, setModeState] = useState(readSaved)
  const [systemDark, setSystemDark] = useState(() => media().matches)

  useEffect(() => {
    const mq = media()
    const listener = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])

  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  const setMode = useCallback(
    (next, { persist = true } = {}) => {
      setModeState(next)
      try {
        localStorage.setItem(KEY, next)
      } catch {
        /* storage unavailable */
      }
      if (persist) onPersist?.(next)
    },
    [onPersist],
  )

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

/** Chart colours read from CSS tokens so charts follow the active theme. */
export function useChartColors() {
  const { resolved } = useTheme()
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement)
    const v = (name) => css.getPropertyValue(name).trim()
    return {
      text: v('--text-2'),
      grid: v('--border'),
      surface: v('--surface'),
      primary: v('--primary'),
      positive: v('--positive'),
      negative: v('--negative'),
      warning: v('--warning'),
      info: v('--info'),
      series:
        resolved === 'dark'
          ? ['#6ea2ff', '#22d3ee', '#fbbf24', '#f472b6', '#a78bfa', '#4ade80', '#fb923c', '#94a3b8', '#e879f9', '#2dd4bf']
          : ['#1e40af', '#0891b2', '#d97706', '#db2777', '#7c3aed', '#16a34a', '#ea580c', '#64748b', '#c026d3', '#0d9488'],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved])
}
