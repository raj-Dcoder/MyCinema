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
  const { atmosphericStudioEnabled, currentAccent, haloIntensity, currentHaloPreset, haloDiffusion, haloChroma, theme, haloBreathing } = useTheme()

  const isStealth = !atmosphericStudioEnabled || haloIntensity === 'stealth' || isPlaybackActive

  // Calculate dynamic intense opacity and blur parameters
  const computedStyle = useMemo(() => {
    if (isStealth) {
      return {
        topWashOpacity: 0,
        leftOrbOpacity: 0,
        rightOrbOpacity: 0,
        sideGlowOpacity: 0,
        blurPx: 60,
        scale: 1,
      }
    }

    const baseOpacity = currentHaloPreset.baseOpacity // 0.35, 0.75, 1.0
    const chromaFactor = haloChroma / 100 // 0.5 to 2.5
    const diffusionFactor = haloDiffusion / 100 // 0.5 to 2.5

    // In light theme, soften slightly so light paper cards stay crisp; in dark theme, full radiance!
    const themeFactor = theme === 'light' ? 0.6 : 1.0
    // Net intensity scales vigorously with base preset and chroma vibrancy
    const netIntensity = baseOpacity * (0.55 + chromaFactor * 0.45) * themeFactor

    // Rich, luminous individual opacities
    const topWashOpacity = Math.min(0.88, netIntensity * 0.75)
    const leftOrbOpacity = Math.min(0.95, netIntensity * 0.88)
    const rightOrbOpacity = Math.min(0.88, netIntensity * 0.78)
    const sideGlowOpacity = Math.min(0.65, netIntensity * 0.55)

    // Tighter, punchier blur radius so color stays intensely saturated
    const blurPx = Math.round(35 + diffusionFactor * 28)
    const scale = Math.max(0.9, Math.min(1.45, 0.9 + diffusionFactor * 0.22))

    return {
      topWashOpacity,
      leftOrbOpacity,
      rightOrbOpacity,
      sideGlowOpacity,
      blurPx,
      scale,
    }
  }, [isStealth, currentHaloPreset, haloChroma, haloDiffusion, theme])

  if (isStealth) {
    return null
  }

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden select-none transition-opacity duration-700 ${
        haloBreathing ? 'animate-halo-breath' : ''
      } ${className}`}
      aria-hidden="true"
    >
      {/* 1. Broad Horizon Ambient Wash (Floods the entire upper viewport with ambient light) */}
      <div
        className="pointer-events-none absolute -top-16 inset-x-0 h-[30rem] w-full transition-all duration-700 ease-out will-change-transform"
        style={{
          background: `radial-gradient(ellipse 110% 80% at 50% -12%, rgb(${currentAccent.rgb} / ${computedStyle.topWashOpacity.toFixed(3)}) 0%, rgb(${currentAccent.rgb} / ${(computedStyle.topWashOpacity * 0.58).toFixed(3)}) 38%, rgb(${currentAccent.secondaryRgb} / ${(computedStyle.topWashOpacity * 0.25).toFixed(3)}) 65%, transparent 84%)`,
          filter: `blur(${Math.round(computedStyle.blurPx * 1.15)}px)`,
          transform: `scaleY(${computedStyle.scale}) translate3d(0,0,0)`,
        }}
      />

      {/* 2. Primary Top-Left Atmospheric Halo Orb (Illuminates sidebar & top-left workspace) */}
      <div
        className="pointer-events-none absolute -top-28 -left-24 h-[44rem] w-[44rem] rounded-full transition-all duration-700 ease-out will-change-transform"
        style={{
          background: `radial-gradient(circle at 45% 45%, rgb(${currentAccent.rgb} / ${computedStyle.leftOrbOpacity.toFixed(3)}) 0%, rgb(${currentAccent.rgb} / ${(computedStyle.leftOrbOpacity * 0.74).toFixed(3)}) 32%, rgb(${currentAccent.rgb} / ${(computedStyle.leftOrbOpacity * 0.35).toFixed(3)}) 60%, transparent 82%)`,
          filter: `blur(${computedStyle.blurPx}px)`,
          transform: `scale(${computedStyle.scale}) translate3d(0,0,0)`,
        }}
      />

      {/* 3. Secondary Top-Right Atmospheric Halo Orb (Harmonic Tone) */}
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-[40rem] w-[40rem] rounded-full transition-all duration-700 ease-out will-change-transform"
        style={{
          background: `radial-gradient(circle at 55% 45%, rgb(${currentAccent.secondaryRgb} / ${computedStyle.rightOrbOpacity.toFixed(3)}) 0%, rgb(${currentAccent.secondaryRgb} / ${(computedStyle.rightOrbOpacity * 0.68).toFixed(3)}) 34%, rgb(${currentAccent.secondaryRgb} / ${(computedStyle.rightOrbOpacity * 0.30).toFixed(3)}) 62%, transparent 80%)`,
          filter: `blur(${Math.round(computedStyle.blurPx * 1.1)}px)`,
          transform: `scale(${computedStyle.scale * 0.96}) translate3d(0,0,0)`,
        }}
      />

      {/* 4. Lateral Edge Rim Glow (Feathers gracefully down the left border) */}
      <div
        className="pointer-events-none absolute top-48 -left-20 h-[36rem] w-[26rem] rounded-full transition-all duration-700 ease-out will-change-transform"
        style={{
          background: `radial-gradient(ellipse 60% 80% at 20% 50%, rgb(${currentAccent.rgb} / ${computedStyle.sideGlowOpacity.toFixed(3)}) 0%, rgb(${currentAccent.rgb} / ${(computedStyle.sideGlowOpacity * 0.4).toFixed(3)}) 48%, transparent 75%)`,
          filter: `blur(${Math.round(computedStyle.blurPx * 1.2)}px)`,
          transform: `scale(${computedStyle.scale * 0.92}) translate3d(0,0,0)`,
        }}
      />
    </div>
  )
}

export default AmbientAtmosphere
