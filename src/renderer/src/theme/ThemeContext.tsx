import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type AppTheme = 'dark' | 'light'

export type AccentKey =
  | 'crimson'
  | 'azure'
  | 'amethyst'
  | 'emerald'
  | 'solaris'
  | 'tangerine'
  | 'fuchsia'
  | 'glacier'
  | 'indigo'
  | 'voltage'
  | 'terracotta'
  | 'platinum'

export interface AccentDef {
  id: AccentKey
  name: string
  subtitle: string
  hex: string
  rgb: string
  secondaryRgb: string
}

export const ACCENT_PALETTE: AccentDef[] = [
  {
    id: 'crimson',
    name: 'Cinema Crimson',
    subtitle: 'Signature Netflix Red',
    hex: '#e50914',
    rgb: '229 9 20',
    secondaryRgb: '185 28 28',
  },
  {
    id: 'azure',
    name: 'Horizon Azure',
    subtitle: 'Electric Apple Blue',
    hex: '#007aff',
    rgb: '0 122 255',
    secondaryRgb: '59 130 246',
  },
  {
    id: 'amethyst',
    name: 'Amethyst Violet',
    subtitle: 'Cyberpunk Neon Purple',
    hex: '#8b5cf6',
    rgb: '139 92 246',
    secondaryRgb: '168 85 247',
  },
  {
    id: 'emerald',
    name: 'Matrix Emerald',
    subtitle: 'Luminous Vivid Green',
    hex: '#10b981',
    rgb: '16 185 129',
    secondaryRgb: '5 150 105',
  },
  {
    id: 'solaris',
    name: 'Solaris Gold',
    subtitle: 'Warm Amber Cinema',
    hex: '#f59e0b',
    rgb: '245 158 11',
    secondaryRgb: '217 119 6',
  },
  {
    id: 'tangerine',
    name: 'Sunset Tangerine',
    subtitle: 'Radiant Coral Orange',
    hex: '#f97316',
    rgb: '249 115 22',
    secondaryRgb: '234 88 12',
  },
  {
    id: 'fuchsia',
    name: 'Neon Fuchsia',
    subtitle: 'Vibrant Magenta Pink',
    hex: '#ec4899',
    rgb: '236 72 153',
    secondaryRgb: '219 39 119',
  },
  {
    id: 'glacier',
    name: 'Glacier Cyan',
    subtitle: 'Crisp Arctic Aqua',
    hex: '#06b6d4',
    rgb: '6 182 212',
    secondaryRgb: '14 165 233',
  },
  {
    id: 'indigo',
    name: 'Royal Indigo',
    subtitle: 'Deep Twilight Cobalt',
    hex: '#6366f1',
    rgb: '99 102 241',
    secondaryRgb: '79 70 229',
  },
  {
    id: 'voltage',
    name: 'Lime Voltage',
    subtitle: 'High-Watt Electric Lime',
    hex: '#84cc16',
    rgb: '132 204 22',
    secondaryRgb: '101 163 13',
  },
  {
    id: 'terracotta',
    name: 'Tuscan Terracotta',
    subtitle: 'Warm Earth & Cinema Clay',
    hex: '#ea580c',
    rgb: '234 88 12',
    secondaryRgb: '194 65 12',
  },
  {
    id: 'platinum',
    name: 'Polar Platinum',
    subtitle: 'Minimalist Frosted Silver',
    hex: '#e2e8f0',
    rgb: '226 232 240',
    secondaryRgb: '148 163 184',
  },
]

export type HaloIntensityKey = 'stealth' | 'whisper' | 'theater' | 'supercharged'

export interface HaloIntensityPreset {
  id: HaloIntensityKey
  label: string
  sublabel: string
  baseOpacity: number
}

export const HALO_INTENSITY_PRESETS: HaloIntensityPreset[] = [
  {
    id: 'stealth',
    label: 'Stealth',
    sublabel: 'Off (0%)',
    baseOpacity: 0,
  },
  {
    id: 'whisper',
    label: 'Whisper',
    sublabel: 'Gentle (35%)',
    baseOpacity: 0.35,
  },
  {
    id: 'theater',
    label: 'Theater Aura',
    sublabel: 'Balanced (75%)',
    baseOpacity: 0.75,
  },
  {
    id: 'supercharged',
    label: 'Supercharged',
    sublabel: 'Max Punch (100%)',
    baseOpacity: 1.0,
  },
]

const THEME_STORAGE_KEY = 'mycinema_theme'
const ACCENT_STORAGE_KEY = 'mycinema_accent_tint'
const HALO_INTENSITY_STORAGE_KEY = 'mycinema_halo_intensity'
const HALO_DIFFUSION_STORAGE_KEY = 'mycinema_halo_diffusion'
const HALO_CHROMA_STORAGE_KEY = 'mycinema_halo_chroma'
const STAGE_PREVIEW_COLLAPSED_KEY = 'mycinema_stage_preview_collapsed'

export interface ThemeContextValue {
  // Existing Base Theme (Untouched)
  theme: AppTheme
  setTheme: (t: AppTheme) => void
  toggleTheme: () => void

  // Atmospheric Lighting & Accent Studio
  accent: AccentKey
  setAccent: (a: AccentKey) => void
  currentAccent: AccentDef

  haloIntensity: HaloIntensityKey
  setHaloIntensity: (h: HaloIntensityKey) => void
  currentHaloPreset: HaloIntensityPreset

  haloDiffusion: number
  setHaloDiffusion: (d: number) => void

  haloChroma: number
  setHaloChroma: (c: number) => void

  stagePreviewCollapsed: boolean
  setStagePreviewCollapsed: React.Dispatch<React.SetStateAction<boolean>>

  resetToDefaults: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
  accent: 'crimson',
  setAccent: () => {},
  currentAccent: ACCENT_PALETTE[0],
  haloIntensity: 'theater',
  setHaloIntensity: () => {},
  currentHaloPreset: HALO_INTENSITY_PRESETS[2],
  haloDiffusion: 100,
  setHaloDiffusion: () => {},
  haloChroma: 100,
  setHaloChroma: () => {},
  stagePreviewCollapsed: false,
  setStagePreviewCollapsed: () => {},
  resetToDefaults: () => {},
})

const VALID_THEMES: AppTheme[] = ['dark', 'light']

const getInitialTheme = (): AppTheme => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme
    if (VALID_THEMES.includes(saved)) return saved
  } catch {}
  return 'dark'
}

const getInitialAccent = (): AccentKey => {
  try {
    const saved = localStorage.getItem(ACCENT_STORAGE_KEY) as AccentKey
    if (ACCENT_PALETTE.some((a) => a.id === saved)) return saved
  } catch {}
  return 'crimson'
}

const getInitialHaloIntensity = (): HaloIntensityKey => {
  try {
    const saved = localStorage.getItem(HALO_INTENSITY_STORAGE_KEY) as HaloIntensityKey
    if (HALO_INTENSITY_PRESETS.some((p) => p.id === saved)) return saved
  } catch {}
  return 'theater'
}

const getInitialClampedNumber = (key: string, defaultVal: number): number => {
  try {
    const saved = localStorage.getItem(key)
    if (saved !== null) {
      const parsed = parseInt(saved, 10)
      if (Number.isFinite(parsed) && parsed >= 50 && parsed <= 250) {
        return parsed
      }
    }
  } catch {}
  return defaultVal
}

const getInitialPreviewCollapsed = (): boolean => {
  try {
    return localStorage.getItem(STAGE_PREVIEW_COLLAPSED_KEY) === 'true'
  } catch {}
  return false
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(getInitialTheme)
  const [accent, setAccentState] = useState<AccentKey>(getInitialAccent)
  const [haloIntensity, setHaloIntensityState] = useState<HaloIntensityKey>(getInitialHaloIntensity)
  const [haloDiffusion, setHaloDiffusionState] = useState<number>(() =>
    getInitialClampedNumber(HALO_DIFFUSION_STORAGE_KEY, 100),
  )
  const [haloChroma, setHaloChromaState] = useState<number>(() =>
    getInitialClampedNumber(HALO_CHROMA_STORAGE_KEY, 100),
  )
  const [stagePreviewCollapsed, setStagePreviewCollapsed] = useState<boolean>(getInitialPreviewCollapsed)

  const currentAccent = ACCENT_PALETTE.find((a) => a.id === accent) || ACCENT_PALETTE[0]
  const currentHaloPreset =
    HALO_INTENSITY_PRESETS.find((p) => p.id === haloIntensity) || HALO_INTENSITY_PRESETS[2]

  // Synchronize Base Dark/Light Theme on document element
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark', 'glass', 'glass-light')

    if (theme === 'light') {
      root.classList.add('light')
      root.style.colorScheme = 'light'
    } else {
      root.classList.add('dark')
      root.style.colorScheme = 'dark'
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {}
    window.dispatchEvent(new CustomEvent('mycinema_theme_changed', { detail: theme }))
  }, [theme])

  // Synchronize Accent & Atmospheric Halo CSS variables on document element
  useEffect(() => {
    const root = document.documentElement
    const baseOpacity = currentHaloPreset.baseOpacity
    // Final opacity scales with Chroma Vibrancy (e.g. 100% -> 1.0, 250% -> 1.5 multiplier)
    const chromaMultiplier = 0.4 + (haloChroma / 100) * 0.6
    const computedOpacity = Math.min(1.2, baseOpacity * chromaMultiplier)

    root.style.setProperty('--c-accent', currentAccent.rgb)
    root.style.setProperty('--c-accent-hex', currentAccent.hex)
    root.style.setProperty('--c-accent-secondary', currentAccent.secondaryRgb)
    root.style.setProperty('--halo-opacity', computedOpacity.toFixed(3))
    root.style.setProperty('--halo-diffusion', (haloDiffusion / 100).toFixed(2))
    root.style.setProperty('--halo-chroma', (haloChroma / 100).toFixed(2))

    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, accent)
      localStorage.setItem(HALO_INTENSITY_STORAGE_KEY, haloIntensity)
      localStorage.setItem(HALO_DIFFUSION_STORAGE_KEY, String(haloDiffusion))
      localStorage.setItem(HALO_CHROMA_STORAGE_KEY, String(haloChroma))
      localStorage.setItem(STAGE_PREVIEW_COLLAPSED_KEY, String(stagePreviewCollapsed))
    } catch {}

    window.dispatchEvent(
      new CustomEvent('mycinema_accent_changed', {
        detail: { accent: currentAccent, haloIntensity, haloDiffusion, haloChroma },
      }),
    )
  }, [accent, currentAccent, haloIntensity, currentHaloPreset, haloDiffusion, haloChroma, stagePreviewCollapsed])

  const setTheme = useCallback((t: AppTheme) => setThemeState(t), [])
  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  const setAccent = useCallback((a: AccentKey) => setAccentState(a), [])
  const setHaloIntensity = useCallback((h: HaloIntensityKey) => setHaloIntensityState(h), [])
  const setHaloDiffusion = useCallback((d: number) => {
    setHaloDiffusionState(Math.max(50, Math.min(250, Math.round(d))))
  }, [])
  const setHaloChroma = useCallback((c: number) => {
    setHaloChromaState(Math.max(50, Math.min(250, Math.round(c))))
  }, [])

  const resetToDefaults = useCallback(() => {
    setAccentState('crimson')
    setHaloIntensityState('theater')
    setHaloDiffusionState(100)
    setHaloChromaState(100)
  }, [])

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        accent,
        setAccent,
        currentAccent,
        haloIntensity,
        setHaloIntensity,
        currentHaloPreset,
        haloDiffusion,
        setHaloDiffusion,
        haloChroma,
        setHaloChroma,
        stagePreviewCollapsed,
        setStagePreviewCollapsed,
        resetToDefaults,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
