import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type AppTheme = 'dark' | 'light' | 'glass' | 'glass-light'

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

const VALID_THEMES: AppTheme[] = ['dark', 'light', 'glass', 'glass-light']

const getInitialTheme = (): AppTheme => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme
    if (VALID_THEMES.includes(saved)) return saved
  } catch {}
  return 'dark'
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark', 'glass', 'glass-light')

    if (theme === 'light') {
      root.classList.add('light')
      root.style.colorScheme = 'light'
    } else if (theme === 'glass-light') {
      root.classList.add('light', 'glass-light')
      root.style.colorScheme = 'light'
    } else if (theme === 'glass') {
      root.classList.add('dark', 'glass')
      root.style.colorScheme = 'dark'
    } else {
      root.classList.add('dark')
      root.style.colorScheme = 'dark'
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {}
    window.dispatchEvent(new CustomEvent('mycinema_theme_changed', { detail: theme }))
  }, [theme])

  const setTheme = useCallback((t: AppTheme) => setThemeState(t), [])
  const toggleTheme = useCallback(
    () =>
      setThemeState((t) => {
        if (t === 'dark') return 'light'
        if (t === 'light') return 'glass'
        if (t === 'glass') return 'glass-light'
        return 'dark'
      }),
    [],
  )

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
