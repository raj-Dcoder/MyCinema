import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

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

export type ButtonAccentMode = 'adaptive' | 'signature' | 'custom'
export type PlayerAmbilightMode = 'blackout' | 'soft_halo' | 'pause_aura'

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
const BUTTON_ACCENT_MODE_KEY = 'mycinema_button_accent_mode'
const CUSTOM_BUTTON_ACCENT_KEY = 'mycinema_custom_button_accent'
const FT_BRAND_LOCK_KEY = 'mycinema_ft_brand_lock'
const PLAYER_AMBILIGHT_MODE_KEY = 'mycinema_player_ambilight_mode'
const HALO_BREATHING_KEY = 'mycinema_halo_breathing'
const DETAIL_AMBIENT_SHADE_KEY = 'mycinema_detail_ambient_shade'
const ATMOSPHERIC_STUDIO_STORAGE_KEY = 'mycinema_atmospheric_studio_enabled'

export interface ThemeContextValue {
  // Existing Base Theme (Untouched)
  theme: AppTheme
  setTheme: (t: AppTheme) => void
  toggleTheme: () => void

  // Atmospheric Cinematic Studio Master Toggle
  atmosphericStudioEnabled: boolean
  setAtmosphericStudioEnabled: (enabled: boolean) => void

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

  // Decoupled Interactive Controls Accent
  buttonAccentMode: ButtonAccentMode
  setButtonAccentMode: (m: ButtonAccentMode) => void
  customButtonAccent: AccentKey
  setCustomButtonAccent: (a: AccentKey) => void
  activeButtonAccent: AccentDef

  // Focus Tube YouTube Brand Lock
  ftBrandLock: boolean
  setFtBrandLock: (locked: boolean) => void

  // In-Player Theater Ambilight
  playerAmbilightMode: PlayerAmbilightMode
  setPlayerAmbilightMode: (m: PlayerAmbilightMode) => void

  // Organic Breathing Pulse
  haloBreathing: boolean
  setHaloBreathing: (b: boolean) => void

  // Movie Details Ambient Shades (Theme ambient vs Classic black)
  detailAmbientShade: boolean
  setDetailAmbientShade: (enabled: boolean) => void

  resetToDefaults: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
  atmosphericStudioEnabled: true,
  setAtmosphericStudioEnabled: () => {},
  accent: 'voltage',
  setAccent: () => {},
  currentAccent: ACCENT_PALETTE.find((a) => a.id === 'voltage') || ACCENT_PALETTE[9],
  haloIntensity: 'theater',
  setHaloIntensity: () => {},
  currentHaloPreset: HALO_INTENSITY_PRESETS[2],
  haloDiffusion: 250,
  setHaloDiffusion: () => {},
  haloChroma: 110,
  setHaloChroma: () => {},
  buttonAccentMode: 'adaptive',
  setButtonAccentMode: () => {},
  customButtonAccent: 'voltage',
  setCustomButtonAccent: () => {},
  activeButtonAccent: ACCENT_PALETTE.find((a) => a.id === 'voltage') || ACCENT_PALETTE[9],
  ftBrandLock: true,
  setFtBrandLock: () => {},
  playerAmbilightMode: 'pause_aura',
  setPlayerAmbilightMode: () => {},
  haloBreathing: false,
  setHaloBreathing: () => {},
  detailAmbientShade: true,
  setDetailAmbientShade: () => {},
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
  return 'voltage'
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

const getInitialButtonAccentMode = (): ButtonAccentMode => {
  try {
    const saved = localStorage.getItem(BUTTON_ACCENT_MODE_KEY) as ButtonAccentMode
    if (['adaptive', 'signature', 'custom'].includes(saved)) return saved
  } catch {}
  return 'adaptive'
}

const getInitialCustomButtonAccent = (): AccentKey => {
  try {
    const saved = localStorage.getItem(CUSTOM_BUTTON_ACCENT_KEY) as AccentKey
    if (ACCENT_PALETTE.some((a) => a.id === saved)) return saved
  } catch {}
  return 'voltage'
}

const getInitialFtBrandLock = (): boolean => {
  try {
    const saved = localStorage.getItem(FT_BRAND_LOCK_KEY)
    if (saved !== null) return saved === 'true'
  } catch {}
  return true
}

const getInitialPlayerAmbilightMode = (): PlayerAmbilightMode => {
  try {
    const saved = localStorage.getItem(PLAYER_AMBILIGHT_MODE_KEY) as PlayerAmbilightMode
    if (['blackout', 'soft_halo', 'pause_aura'].includes(saved)) return saved
  } catch {}
  return 'pause_aura'
}

const getInitialHaloBreathing = (): boolean => {
  try {
    return localStorage.getItem(HALO_BREATHING_KEY) === 'true'
  } catch {}
  return false
}

const getInitialDetailAmbientShade = (): boolean => {
  try {
    const saved = localStorage.getItem(DETAIL_AMBIENT_SHADE_KEY)
    if (saved !== null) return saved === 'true'
  } catch {}
  return true // Default: ON (Ambient / Theme Color)
}

const getInitialAtmosphericStudioEnabled = (): boolean => {
  try {
    const saved = localStorage.getItem(ATMOSPHERIC_STUDIO_STORAGE_KEY)
    if (saved !== null) return saved === 'true'
  } catch {}
  return true // Default: ON
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(getInitialTheme)
  const [atmosphericStudioEnabled, setAtmosphericStudioEnabledState] = useState<boolean>(getInitialAtmosphericStudioEnabled)
  const [accent, setAccentState] = useState<AccentKey>(getInitialAccent)
  const [haloIntensity, setHaloIntensityState] = useState<HaloIntensityKey>(getInitialHaloIntensity)
  const [haloDiffusion, setHaloDiffusionState] = useState<number>(() =>
    getInitialClampedNumber(HALO_DIFFUSION_STORAGE_KEY, 250),
  )
  const [haloChroma, setHaloChromaState] = useState<number>(() =>
    getInitialClampedNumber(HALO_CHROMA_STORAGE_KEY, 110),
  )
  const [buttonAccentMode, setButtonAccentModeState] = useState<ButtonAccentMode>(getInitialButtonAccentMode)
  const [customButtonAccent, setCustomButtonAccentState] = useState<AccentKey>(getInitialCustomButtonAccent)
  const [ftBrandLock, setFtBrandLockState] = useState<boolean>(getInitialFtBrandLock)
  const [playerAmbilightMode, setPlayerAmbilightModeState] = useState<PlayerAmbilightMode>(getInitialPlayerAmbilightMode)
  const [haloBreathing, setHaloBreathingState] = useState<boolean>(getInitialHaloBreathing)
  const [detailAmbientShade, setDetailAmbientShadeState] = useState<boolean>(getInitialDetailAmbientShade)

  const currentAccent = ACCENT_PALETTE.find((a) => a.id === accent) || ACCENT_PALETTE[0]
  const currentHaloPreset =
    HALO_INTENSITY_PRESETS.find((p) => p.id === haloIntensity) || HALO_INTENSITY_PRESETS[2]

  const activeButtonAccent = useMemo(() => {
    if (!atmosphericStudioEnabled) {
      return ACCENT_PALETTE.find((a) => a.id === 'crimson') || ACCENT_PALETTE[0]
    }
    if (buttonAccentMode === 'signature') {
      return ACCENT_PALETTE.find((a) => a.id === 'crimson') || ACCENT_PALETTE[0]
    }
    if (buttonAccentMode === 'custom') {
      return ACCENT_PALETTE.find((a) => a.id === customButtonAccent) || ACCENT_PALETTE[0]
    }
    return currentAccent
  }, [atmosphericStudioEnabled, buttonAccentMode, customButtonAccent, currentAccent])

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

    if (!atmosphericStudioEnabled) {
      // Atmospheric studio is turned OFF:
      // Revert completely to classic MyCinema signature crimson accents, zero halo/ambient glow, and blackout scrims
      root.setAttribute('data-atmospheric-studio', 'disabled')
      root.setAttribute('data-halo-intensity', 'stealth')
      root.setAttribute('data-accent', 'crimson')
      root.setAttribute('data-detail-shade', 'black')

      root.style.setProperty('--c-accent', '229 9 20')
      root.style.setProperty('--c-accent-hex', '#e50914')
      root.style.setProperty('--c-accent-secondary', '185 28 28')

      root.style.setProperty('--c-ambient', theme === 'light' ? '241 243 246' : '8 13 22')
      root.style.setProperty('--c-ambient-hex', theme === 'light' ? '#f1f3f6' : '#080d16')
      root.style.setProperty('--c-ambient-secondary', theme === 'light' ? '241 243 246' : '8 13 22')

      root.style.setProperty('--halo-opacity', '0')
      root.style.setProperty('--halo-diffusion', '1.00')
      root.style.setProperty('--halo-chroma', '1.00')

      try {
        localStorage.setItem(ATMOSPHERIC_STUDIO_STORAGE_KEY, 'false')
      } catch {}

      window.dispatchEvent(
        new CustomEvent('mycinema_accent_changed', {
          detail: {
            atmosphericStudioEnabled: false,
            accent: 'crimson',
            activeButtonAccent: ACCENT_PALETTE[0],
            buttonAccentMode: 'signature',
            haloIntensity: 'stealth',
            haloDiffusion: 100,
            haloChroma: 100,
            ftBrandLock: true,
            playerAmbilightMode: 'blackout',
            haloBreathing: false,
            detailAmbientShade: false,
          },
        }),
      )
      return
    }

    // Atmospheric studio is turned ON:
    root.setAttribute('data-atmospheric-studio', 'enabled')
    const baseOpacity = currentHaloPreset.baseOpacity
    // Final opacity scales with Chroma Vibrancy (e.g. 100% -> 1.0, 250% -> 1.5 multiplier)
    const chromaMultiplier = 0.4 + (haloChroma / 100) * 0.6
    const computedOpacity = Math.min(1.2, baseOpacity * chromaMultiplier)

    // Interactive UI controls accent (Buttons, Sliders, Active Chips)
    root.style.setProperty('--c-accent', activeButtonAccent.rgb)
    root.style.setProperty('--c-accent-hex', activeButtonAccent.hex)
    root.style.setProperty('--c-accent-secondary', activeButtonAccent.secondaryRgb)

    // Atmospheric Backlight Ambient Aura (Halo wallpaper wash & preview)
    root.style.setProperty('--c-ambient', currentAccent.rgb)
    root.style.setProperty('--c-ambient-hex', currentAccent.hex)
    root.style.setProperty('--c-ambient-secondary', currentAccent.secondaryRgb)

    root.style.setProperty('--halo-opacity', computedOpacity.toFixed(3))
    root.style.setProperty('--halo-diffusion', (haloDiffusion / 100).toFixed(2))
    root.style.setProperty('--halo-chroma', (haloChroma / 100).toFixed(2))

    root.setAttribute('data-halo-intensity', haloIntensity)
    root.setAttribute('data-accent', accent)
    root.setAttribute('data-detail-shade', detailAmbientShade ? 'ambient' : 'black')

    try {
      localStorage.setItem(ATMOSPHERIC_STUDIO_STORAGE_KEY, 'true')
      localStorage.setItem(ACCENT_STORAGE_KEY, accent)
      localStorage.setItem(HALO_INTENSITY_STORAGE_KEY, haloIntensity)
      localStorage.setItem(HALO_DIFFUSION_STORAGE_KEY, String(haloDiffusion))
      localStorage.setItem(HALO_CHROMA_STORAGE_KEY, String(haloChroma))
      localStorage.setItem(BUTTON_ACCENT_MODE_KEY, buttonAccentMode)
      localStorage.setItem(CUSTOM_BUTTON_ACCENT_KEY, customButtonAccent)
      localStorage.setItem(FT_BRAND_LOCK_KEY, String(ftBrandLock))
      localStorage.setItem(PLAYER_AMBILIGHT_MODE_KEY, playerAmbilightMode)
      localStorage.setItem(HALO_BREATHING_KEY, String(haloBreathing))
      localStorage.setItem(DETAIL_AMBIENT_SHADE_KEY, String(detailAmbientShade))
    } catch {}

    window.dispatchEvent(
      new CustomEvent('mycinema_accent_changed', {
        detail: {
          atmosphericStudioEnabled: true,
          accent: currentAccent,
          activeButtonAccent,
          buttonAccentMode,
          haloIntensity,
          haloDiffusion,
          haloChroma,
          ftBrandLock,
          playerAmbilightMode,
          haloBreathing,
          detailAmbientShade,
        },
      }),
    )
  }, [
    atmosphericStudioEnabled,
    theme,
    accent,
    currentAccent,
    activeButtonAccent,
    buttonAccentMode,
    customButtonAccent,
    haloIntensity,
    currentHaloPreset,
    haloDiffusion,
    haloChroma,
    ftBrandLock,
    playerAmbilightMode,
    haloBreathing,
    detailAmbientShade,
  ])

  const setTheme = useCallback((t: AppTheme) => setThemeState(t), [])
  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  const setAtmosphericStudioEnabled = useCallback((enabled: boolean) => setAtmosphericStudioEnabledState(enabled), [])
  const setAccent = useCallback((a: AccentKey) => setAccentState(a), [])
  const setHaloIntensity = useCallback((h: HaloIntensityKey) => setHaloIntensityState(h), [])
  const setHaloDiffusion = useCallback((d: number) => {
    setHaloDiffusionState(Math.max(50, Math.min(250, Math.round(d))))
  }, [])
  const setHaloChroma = useCallback((c: number) => {
    setHaloChromaState(Math.max(50, Math.min(250, Math.round(c))))
  }, [])

  const setButtonAccentMode = useCallback((m: ButtonAccentMode) => setButtonAccentModeState(m), [])
  const setCustomButtonAccent = useCallback((a: AccentKey) => setCustomButtonAccentState(a), [])
  const setFtBrandLock = useCallback((locked: boolean) => setFtBrandLockState(locked), [])
  const setPlayerAmbilightMode = useCallback((m: PlayerAmbilightMode) => setPlayerAmbilightModeState(m), [])
  const setHaloBreathing = useCallback((b: boolean) => setHaloBreathingState(b), [])
  const setDetailAmbientShade = useCallback((enabled: boolean) => setDetailAmbientShadeState(enabled), [])

  const resetToDefaults = useCallback(() => {
    setAtmosphericStudioEnabledState(true)
    setAccentState('voltage')
    setHaloIntensityState('theater')
    setHaloDiffusionState(250)
    setHaloChromaState(110)
    setButtonAccentModeState('adaptive')
    setCustomButtonAccentState('voltage')
    setFtBrandLockState(true)
    setPlayerAmbilightModeState('pause_aura')
    setHaloBreathingState(false)
    setDetailAmbientShadeState(true)
  }, [])

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        atmosphericStudioEnabled,
        setAtmosphericStudioEnabled,
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
        buttonAccentMode,
        setButtonAccentMode,
        customButtonAccent,
        setCustomButtonAccent,
        activeButtonAccent,
        ftBrandLock,
        setFtBrandLock,
        playerAmbilightMode,
        setPlayerAmbilightMode,
        haloBreathing,
        setHaloBreathing,
        detailAmbientShade,
        setDetailAmbientShade,
        resetToDefaults,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
