import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const DataContext = createContext(null)

/** A global "data changed" signal so every page refreshes after a quick-add or edit. */
export function DataProvider({ children }) {
  const [version, setVersion] = useState(0)
  const [toasts, setToasts] = useState([])
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const toast = useCallback((message, type = 'ok') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])
  return (
    <DataContext.Provider value={{ version, bump, toast }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === 'error' ? 'error' : ''}`}>
            {t.message}
          </div>
        ))}
      </div>
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)

/** Load data from the API; reloads when deps change or when any data changes. */
export function useApi(loader, deps = []) {
  const { version } = useData()
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const latest = useRef(0)

  const load = useCallback(() => {
    const id = ++latest.current
    setState((s) => ({ ...s, loading: true }))
    loader()
      .then((data) => id === latest.current && setState({ data, error: null, loading: false }))
      .catch((error) => id === latest.current && setState({ data: null, error, loading: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    load()
  }, [load, version])

  return { ...state, reload: load }
}
