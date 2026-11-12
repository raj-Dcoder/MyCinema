import React, { useMemo } from 'react'
import { useTheme } from '../theme/ThemeContext'
import FluidAmbientCanvas from './FluidAmbientCanvas'

interface AmbientAtmosphereProps {
  isPlaybackActive?: boolean
  className?: string
}

export const AmbientAtmosphere: React.FC<AmbientAtmosphereProps> = ({
  isPlaybackActive = false,
  className = '',
}) => {
  const {
    atmosphericStudioEnabled,
    currentAccent,
    haloIntensity,
    currentHaloPreset,
    haloDiffusion,
    haloChroma,
    theme,
    haloBreathing,
    fluidAmbient,
  } = useTheme()

  const isStealth = !atmosphericStudioEnabled || haloIntensity === 'stealth' || isPlaybackActive

  // If stealth or active playback, render nothing
  if (isStealth) {
    return null
  }

  // When Dynamic Fluid Light is enabled, render the high-performance WebGL shader
  if (fluidAmbient) {
    return <FluidAmbientCanvas isPlaybackActive={isPlaybackActive} className={className} />
  }

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

    // In light theme, keep soft pastel bloom; in dark theme, calibrate to a rich, luminous cinema aura (0.52)
    const themeFactor = theme === 'light' ? 0.55 : 0.52
    // Net intensity scales vigorously with base preset and chroma vibrancy
    const netIntensity = baseOpacity * (0.55 + chromaFactor * 0.45) * themeFactor

    // Rich, luminous individual opacities calibrated for glass refraction
    const topWashOpacity = Math.min(0.72, netIntensity * 0.75)
    const leftOrbOpacity = Math.min(0.70, netIntensity * 0.80)
    const rightOrbOpacity = Math.min(0.58, netIntensity * 0.68)
    const sideGlowOpacity = Math.min(0.40, netIntensity * 0.45)

    // Wide, silky gaussian blur radius so color feathers seamlessly with zero hard rings
    const blurPx = Math.round(85 + diffusionFactor * 55)
    const scale = Math.max(1.0, Math.min(1.55, 1.0 + diffusionFactor * 0.25))

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
      {/* 1. Broad Horizon Ambient Wash (Floods the upper horizon with silky atmospheric light) */}
      <div
        className="pointer-events-none absolute -top-20 inset-x-0 h-[34rem] w-full transition-all duration-700 ease-out will-change-transform"
        style={{
          background: `radial-gradient(ellipse 120% 85% at 55% -15%, rgb(${currentAccent.rgb} / ${computedStyle.topWashOpacity.toFixed(3)}) 0%, rgb(${currentAccent.rgb} / ${(computedStyle.topWashOpacity * 0.55).toFixed(3)}) 40%, rgb(${currentAccent.secondaryRgb} / ${(computedStyle.topWashOpacity * 0.20).toFixed(3)}) 68%, transparent 88%)`,
          filter: `blur(${Math.round(computedStyle.blurPx * 1.2)}px)`,
          transform: `scaleY(${computedStyle.scale}) translate3d(0,0,0)`,
        }}
      />

      {/* 2. Primary Atmospheric Halo Orb (Illuminates upper viewport and refracts through glass sidebar) */}
      <div
        className="pointer-events-none absolute -top-24 -left-10 h-[48rem] w-[48rem] rounded-full transition-all duration-700 ease-out will-change-transform"
        style={{
          background: `radial-gradient(circle at 52% 48%, rgb(${currentAccent.rgb} / ${computedStyle.leftOrbOpacity.toFixed(3)}) 0%, rgb(${currentAccent.rgb} / ${(computedStyle.leftOrbOpacity * 0.68).toFixed(3)}) 34%, rgb(${currentAccent.rgb} / ${(computedStyle.leftOrbOpacity * 0.28).toFixed(3)}) 62%, transparent 84%)`,
          filter: `blur(${computedStyle.blurPx}px)`,
          transform: `scale(${computedStyle.scale}) translate3d(0,0,0)`,
        }}
      />

      {/* 3. Secondary Top-Right Atmospheric Halo Orb (Harmonic Tone) */}
      <div
        className="pointer-events-none absolute -top-20 -right-20 h-[42rem] w-[42rem] rounded-full transition-all duration-700 ease-out will-change-transform"
        style={{
          background: `radial-gradient(circle at 50% 50%, rgb(${currentAccent.secondaryRgb} / ${computedStyle.rightOrbOpacity.toFixed(3)}) 0%, rgb(${currentAccent.secondaryRgb} / ${(computedStyle.rightOrbOpacity * 0.60).toFixed(3)}) 36%, rgb(${currentAccent.secondaryRgb} / ${(computedStyle.rightOrbOpacity * 0.22).toFixed(3)}) 64%, transparent 80%)`,
          filter: `blur(${Math.round(computedStyle.blurPx * 1.15)}px)`,
          transform: `scale(${computedStyle.scale * 0.96}) translate3d(0,0,0)`,
        }}
      />

      {/* 4. Lateral Edge Rim Glow (Feathers gently behind the content shelf) */}
      <div
        className="pointer-events-none absolute top-56 left-4 h-[34rem] w-[28rem] rounded-full transition-all duration-700 ease-out will-change-transform"
        style={{
          background: `radial-gradient(ellipse 65% 80% at 30% 50%, rgb(${currentAccent.rgb} / ${computedStyle.sideGlowOpacity.toFixed(3)}) 0%, rgb(${currentAccent.rgb} / ${(computedStyle.sideGlowOpacity * 0.35).toFixed(3)}) 50%, transparent 75%)`,
          filter: `blur(${Math.round(computedStyle.blurPx * 1.25)}px)`,
          transform: `scale(${computedStyle.scale * 0.92}) translate3d(0,0,0)`,
        }}
      />
    </div>
  )
}

export default AmbientAtmosphere
