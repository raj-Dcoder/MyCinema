import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type AppTheme = 'dark' | 'light'

const THEME_STORAGE_KEY = 'mycinema_theme'

const ThemeContext = createContext<{
  theme: AppTheme
  setTheme: (t: AppTheme) => void
  toggleTheme: () => void
}>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
})

const getInitialTheme = (): AppTheme => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  return 'dark'
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('light', theme === 'light')
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {}
    window.dispatchEvent(new CustomEvent('mycinema_theme_changed', { detail: theme }))
  }, [theme])

  const setTheme = useCallback((t: AppTheme) => setThemeState(t), [])
  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
    []
  )

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
