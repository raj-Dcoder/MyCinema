import React, { useMemo } from 'react'
import { useTheme } from '../theme/ThemeContext'

interface AmbientAtmosphereProps {
  isPlaybackActive?: boolean
  className?: string
}

export const AmbientAtmosphere: React.FC<AmbientAtmosphereProps> = ({
  isPlaybackActive = false,
  className = '',
}) => {
  const { currentAccent, haloIntensity, currentHaloPreset, haloDiffusion, haloChroma, theme } = useTheme()

  const isStealth = haloIntensity === 'stealth' || isPlaybackActive

  // Calculate dynamic opacity based on preset, chroma, and light/dark theme
  const computedStyle = useMemo(() => {
    if (isStealth) {
      return {
        leftOrbOpacity: 0,
        rightOrbOpacity: 0,
        blurPx: 120,
        scale: 1,
      }
    }

    const baseOpacity = currentHaloPreset.baseOpacity
    const chromaFactor = 0.5 + (haloChroma / 100) * 0.5
    // In light mode, soften ambient glow slightly to preserve contrast on light surfaces
    const themeFactor = theme === 'light' ? 0.45 : 0.85
    const netOpacity = Math.min(1.0, baseOpacity * chromaFactor * themeFactor)

    const diffusionFactor = haloDiffusion / 100
    // Blur scales from 70px to 170px based on diffusion radius
    const blurPx = Math.round(70 + diffusionFactor * 50)
    // Scale scales from 0.85 to 1.35
    const scale = Math.max(0.85, Math.min(1.4, 0.85 + diffusionFactor * 0.25))

    return {
      leftOrbOpacity: netOpacity * 0.42,
      rightOrbOpacity: netOpacity * 0.32,
      blurPx,
      scale,
    }
  }, [isStealth, currentHaloPreset, haloChroma, haloDiffusion, theme])

  if (isStealth) {
    return null
  }

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden select-none transition-opacity duration-700 ${className}`}
      aria-hidden="true"
    >
      {/* Primary Top-Left Atmospheric Halo Orb */}
      <div
        className="pointer-events-none absolute -top-40 -left-40 h-[36rem] w-[36rem] rounded-full transition-all duration-700 ease-out will-change-transform"
        style={{
          background: `radial-gradient(circle at 45% 45%, rgb(${currentAccent.rgb} / ${computedStyle.leftOrbOpacity.toFixed(3)}) 0%, rgb(${currentAccent.rgb} / ${(computedStyle.leftOrbOpacity * 0.35).toFixed(3)}) 42%, transparent 72%)`,
          filter: `blur(${computedStyle.blurPx}px)`,
          transform: `scale(${computedStyle.scale}) translate3d(0,0,0)`,
        }}
      />

      {/* Secondary Top-Right Atmospheric Halo Orb (Harmonic Tone) */}
      <div
        className="pointer-events-none absolute -top-32 -right-32 h-[34rem] w-[34rem] rounded-full transition-all duration-700 ease-out will-change-transform"
        style={{
          background: `radial-gradient(circle at 55% 45%, rgb(${currentAccent.secondaryRgb} / ${computedStyle.rightOrbOpacity.toFixed(3)}) 0%, rgb(${currentAccent.secondaryRgb} / ${(computedStyle.rightOrbOpacity * 0.3).toFixed(3)}) 45%, transparent 70%)`,
          filter: `blur(${Math.round(computedStyle.blurPx * 1.15)}px)`,
          transform: `scale(${computedStyle.scale * 0.95}) translate3d(0,0,0)`,
        }}
      />

      {/* Ambient Floor Feather (Subtle bottom-left reflection) */}
      <div
        className="pointer-events-none absolute -bottom-48 left-1/4 h-[28rem] w-[32rem] rounded-full opacity-60 transition-all duration-700 ease-out will-change-transform"
        style={{
          background: `radial-gradient(circle, rgb(${currentAccent.rgb} / ${(computedStyle.leftOrbOpacity * 0.22).toFixed(3)}) 0%, transparent 68%)`,
          filter: `blur(${Math.round(computedStyle.blurPx * 1.25)}px)`,
          transform: `scale(${computedStyle.scale * 0.9}) translate3d(0,0,0)`,
        }}
      />

      {/* Center Contrast Shield Vignette (Guarantees 100% crisp text readability) */}
      <div
        className={`pointer-events-none absolute inset-0 ${
          theme === 'light'
            ? 'bg-radial-gradient from-transparent via-[#f1f3f6]/40 to-[#f1f3f6]/80'
            : 'bg-radial-gradient from-transparent via-[#05080d]/30 to-[#05080d]/65'
        }`}
      />
    </div>
  )
}

export default AmbientAtmosphere
