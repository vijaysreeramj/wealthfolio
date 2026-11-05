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
          ? ['#5eb3ff', '#5cd18b', '#f5a524', '#f87171', '#b794f4', '#4fd1c5', '#f687b3', '#a3a3a3', '#7f9cf5', '#f6e05e']
          : ['#318ad8', '#48bb74', '#f6ad55', '#f56565', '#9f7aea', '#38b2ac', '#ed64a6', '#a0aec0', '#667eea', '#ecc94b'],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved])
}
