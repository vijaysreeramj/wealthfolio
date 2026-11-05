import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading, null = signed out

  useEffect(() => {
    api.get('/auth/me').then(setUser).catch(() => setUser(null))
    const onUnauthorized = () => setUser(null)
    window.addEventListener('wf:unauthorized', onUnauthorized)
    return () => window.removeEventListener('wf:unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(async (email, password) => setUser(await api.post('/auth/login', { email, password })), [])
  const register = useCallback(async (data) => setUser(await api.post('/auth/register', data)), [])
  const logout = useCallback(async () => {
    await api.post('/auth/logout')
    setUser(null)
  }, [])
  const updateProfile = useCallback(async (data) => setUser(await api.patch('/auth/me', data)), [])

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateProfile }}>{children}</AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
