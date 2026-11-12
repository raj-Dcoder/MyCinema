import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useTheme } from '../theme/ThemeContext'

interface FluidAmbientCanvasProps {
  isPlaybackActive?: boolean
  className?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGH-FIDELITY NATIVE WEBGL FLUID SHADER
// 3D Liquid Silk Mesh Gradient with Domain Warping & Crest Sheen
// ─────────────────────────────────────────────────────────────────────────────

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_pos;
varying vec2 v_uv;

void main() {
  v_uv = (a_pos + 1.0) * 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_color_bg;
uniform vec3 u_color_primary;
uniform vec3 u_color_secondary;
uniform vec3 u_color_tertiary;
uniform vec3 u_color_sheen;
uniform float u_is_light;
uniform float u_intensity;

varying vec2 v_uv;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = v_uv;
  vec2 p = uv;
  p.x *= (u_resolution.x / u_resolution.y);

  // Calm, graceful liquid silk motion
  float t = u_time * 0.24;

  // Flow vectors for organic morphing
  vec2 q = vec2(
    sin(p.x * 1.4 + t * 0.20) + cos(p.y * 1.2 - t * 0.15),
    cos(p.x * 1.1 - t * 0.16) + sin(p.y * 1.5 + t * 0.18)
  );

  // Simplex domain warping
  vec2 r = vec2(
    snoise(p * 1.05 + q * 0.5 + vec2(t * 0.12, -t * 0.09)),
    snoise(p * 1.05 + q * 0.5 + vec2(-t * 0.10, t * 0.14) + vec2(4.2, 1.9))
  );

  // Dual wave interference for rich silk folds
  float wave1 = snoise(p * 1.2 + r * 1.0 + vec2(t * 0.07, t * 0.09));
  float wave2 = sin((p.x + r.x * 0.6) * 2.5 + t * 0.16) * cos((p.y + r.y * 0.6) * 2.0 - t * 0.13);
  float ribbon = wave1 * 0.65 + wave2 * 0.35;

  // Normalize ribbon to 0..1
  float normRibbon = clamp(0.5 + 0.5 * ribbon, 0.0, 1.0);

  // Soft, velvety sheen (smooth, not harsh or shiny)
  float ridge = 1.0 - abs(ribbon - 0.15);
  float sheen = pow(clamp(ridge, 0.0, 1.0), 3.0) * 0.18;

  // Secondary gentle ambient glow
  float softSheen = pow(clamp(1.0 - abs(ribbon + 0.35), 0.0, 1.0), 2.2) * 0.12;

  vec3 col;
  if (u_is_light > 0.5) {
    // High-visibility, soft fluid silk ribbons in Light Mode:
    vec3 ribbonCol = mix(u_color_secondary, u_color_primary, smoothstep(0.20, 0.70, normRibbon));
    ribbonCol = mix(ribbonCol, u_color_tertiary, smoothstep(0.15, 0.65, length(r) * 0.55));
    col = mix(u_color_bg, ribbonCol, 0.28 + 0.34 * normRibbon);
    col += u_color_sheen * (sheen * 0.12 + softSheen * 0.08);
    col = clamp(col, 0.0, 1.0);
  } else {
    // Velvety, matte, atmospheric dark mode (comfortably luminous, zero harsh plastic shine)
    vec3 ribbonCol = mix(u_color_secondary * 0.58, u_color_primary * 0.65, smoothstep(0.20, 0.75, normRibbon));
    ribbonCol = mix(ribbonCol, u_color_tertiary * 0.52, smoothstep(0.12, 0.65, length(r) * 0.50));
    
    // Smooth, comfortably luminous ambient wash (lifted slightly so it is not pitch black)
    col = mix(u_color_bg, ribbonCol, 0.18 + 0.44 * normRibbon);
    // Subtle diffuse glow without harsh specular glints
    col += u_color_sheen * (sheen * 0.04 + softSheen * 0.05) * u_intensity;
  }

  gl_FragColor = vec4(col, 1.0);
}
`

interface PaletteColors {
  p: [number, number, number]
  s: [number, number, number]
  t: [number, number, number]
  darkBg: [number, number, number]
  lightBg: [number, number, number]
  sheenDark: [number, number, number]
}

const CURATED_PALETTES: Record<string, PaletteColors> = {
  emerald: {
    p: [0.06, 0.65, 0.45],
    s: [0.02, 0.52, 0.36],
    t: [0.12, 0.75, 0.55],
    darkBg: [0.04, 0.08, 0.06],
    lightBg: [0.93, 0.96, 0.94],
    sheenDark: [0.25, 0.65, 0.45],
  },
  azure: {
    p: [0.05, 0.42, 0.88],
    s: [0.20, 0.44, 0.85],
    t: [0.40, 0.30, 0.78],
    darkBg: [0.05, 0.07, 0.14],
    lightBg: [0.93, 0.95, 0.97],
    sheenDark: [0.30, 0.55, 0.85],
  },
  crimson: {
    p: [0.72, 0.06, 0.10],
    s: [0.55, 0.08, 0.12],
    t: [0.68, 0.18, 0.15],
    darkBg: [0.08, 0.04, 0.05],
    lightBg: [0.97, 0.93, 0.93],
    sheenDark: [0.60, 0.20, 0.20],
  },
  amethyst: {
    p: [0.50, 0.32, 0.88],
    s: [0.58, 0.28, 0.88],
    t: [0.32, 0.18, 0.78],
    darkBg: [0.08, 0.05, 0.13],
    lightBg: [0.95, 0.93, 0.97],
    sheenDark: [0.55, 0.38, 0.75],
  },
  solaris: {
    p: [0.85, 0.52, 0.05],
    s: [0.75, 0.40, 0.03],
    t: [0.88, 0.68, 0.12],
    darkBg: [0.09, 0.06, 0.02],
    lightBg: [0.97, 0.96, 0.92],
    sheenDark: [0.75, 0.55, 0.25],
  },
  tangerine: {
    p: [0.88, 0.38, 0.08],
    s: [0.80, 0.30, 0.05],
    t: [0.88, 0.55, 0.15],
    darkBg: [0.09, 0.05, 0.02],
    lightBg: [0.97, 0.95, 0.92],
    sheenDark: [0.78, 0.48, 0.22],
  },
  fuchsia: {
    p: [0.82, 0.24, 0.52],
    s: [0.75, 0.14, 0.40],
    t: [0.68, 0.18, 0.75],
    darkBg: [0.09, 0.04, 0.07],
    lightBg: [0.97, 0.93, 0.96],
    sheenDark: [0.75, 0.35, 0.58],
  },
  glacier: {
    p: [0.03, 0.62, 0.75],
    s: [0.05, 0.55, 0.80],
    t: [0.18, 0.72, 0.85],
    darkBg: [0.04, 0.08, 0.10],
    lightBg: [0.92, 0.96, 0.97],
    sheenDark: [0.25, 0.65, 0.78],
  },
  indigo: {
    p: [0.35, 0.35, 0.85],
    s: [0.28, 0.24, 0.80],
    t: [0.55, 0.22, 0.75],
    darkBg: [0.05, 0.05, 0.13],
    lightBg: [0.94, 0.94, 0.97],
    sheenDark: [0.45, 0.40, 0.78],
  },
  voltage: {
    p: [0.46, 0.70, 0.08],
    s: [0.35, 0.55, 0.05],
    t: [0.60, 0.80, 0.14],
    darkBg: [0.05, 0.08, 0.02],
    lightBg: [0.95, 0.97, 0.92],
    sheenDark: [0.55, 0.75, 0.25],
  },
  terracotta: {
    p: [0.82, 0.30, 0.05],
    s: [0.68, 0.22, 0.04],
    t: [0.85, 0.42, 0.12],
    darkBg: [0.09, 0.05, 0.02],
    lightBg: [0.97, 0.94, 0.92],
    sheenDark: [0.72, 0.40, 0.20],
  },
  platinum: {
    p: [0.75, 0.78, 0.82],
    s: [0.50, 0.55, 0.62],
    t: [0.65, 0.70, 0.78],
    darkBg: [0.07, 0.07, 0.09],
    lightBg: [0.96, 0.96, 0.97],
    sheenDark: [0.65, 0.68, 0.75],
  },
}

function parseRgb(rgbStr: string): [number, number, number] {
  if (!rgbStr) return [0.5, 0.5, 0.5]
  const parts = rgbStr.trim().split(/\s+/).map(Number)
  if (parts.length >= 3 && !parts.some(isNaN)) {
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255]
  }
  return [0.5, 0.5, 0.5]
}

export const FluidAmbientCanvas: React.FC<FluidAmbientCanvasProps> = ({
  isPlaybackActive = false,
  className = '',
}) => {
  const {
    atmosphericStudioEnabled,
    accent,
    currentAccent,
    haloIntensity,
    currentHaloPreset,
    haloChroma,
    theme,
  } = useTheme()

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [webGLError, setWebGLError] = useState(false)
  const isStealth = !atmosphericStudioEnabled || haloIntensity === 'stealth' || isPlaybackActive

  // Dynamic curated or procedural palette for the active accent
  const palette = useMemo(() => {
    const isLight = theme === 'light'
    const curated = CURATED_PALETTES[accent]
    if (curated) {
      return {
        p: curated.p,
        s: curated.s,
        t: curated.t,
        bg: isLight ? curated.lightBg : curated.darkBg,
        sheen: isLight ? ([1.0, 1.0, 1.0] as [number, number, number]) : curated.sheenDark,
      }
    }

    // Procedural fallback for any custom accents
    const p = parseRgb(currentAccent.rgb)
    const s = parseRgb(currentAccent.secondaryRgb || currentAccent.rgb)
    const t: [number, number, number] = [
      Math.min(1.0, Math.max(0.05, p[0] * 0.7 + s[1] * 0.3)),
      Math.min(1.0, Math.max(0.05, p[1] * 0.7 + s[2] * 0.3)),
      Math.min(1.0, Math.max(0.05, p[2] * 0.7 + s[0] * 0.3)),
    ]
    const darkBg: [number, number, number] = [
      Math.max(0.05, Math.min(0.14, 0.04 + p[0] * 0.10)),
      Math.max(0.05, Math.min(0.14, 0.04 + p[1] * 0.10)),
      Math.max(0.06, Math.min(0.17, 0.05 + p[2] * 0.12)),
    ]
    const lightBg: [number, number, number] = [0.93, 0.95, 0.97]
    const sheen: [number, number, number] = isLight
      ? [1.0, 1.0, 1.0]
      : [
          Math.min(1.0, 0.85 + p[0] * 0.15),
          Math.min(1.0, 0.88 + p[1] * 0.12),
          Math.min(1.0, 0.92 + p[2] * 0.08),
        ]

    return {
      p,
      s,
      t,
      bg: isLight ? lightBg : darkBg,
      sheen,
    }
  }, [accent, currentAccent, theme])

  const intensityVal = useMemo(() => {
    if (isStealth) return 0
    const base = currentHaloPreset.baseOpacity
    const chroma = haloChroma / 100
    return Math.min(1.3, base * (0.7 + chroma * 0.3))
  }, [isStealth, currentHaloPreset, haloChroma])

  // Mutable refs for animation loop
  const uniformsRef = useRef({
    bg: palette.bg,
    primary: palette.p,
    secondary: palette.s,
    tertiary: palette.t,
    sheen: palette.sheen,
    isLight: theme === 'light' ? 1.0 : 0.0,
    intensity: intensityVal,
  })

  useEffect(() => {
    uniformsRef.current = {
      bg: palette.bg,
      primary: palette.p,
      secondary: palette.s,
      tertiary: palette.t,
      sheen: palette.sheen,
      isLight: theme === 'light' ? 1.0 : 0.0,
      intensity: intensityVal,
    }
  }, [palette, theme, intensityVal])

  // Setup WebGL Shader & Loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || webGLError) return

    // ─────────────────────────────────────────────────────────────────────────
    // VIRTUAL 640x360 RESOLUTION (Zero Lag + Continuous Fluid Motion)
    // ─────────────────────────────────────────────────────────────────────────
    const gl =
      canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
      }) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)

    if (!gl) {
      setWebGLError(true)
      return
    }

    const compileShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Fluid shader compile error:', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE)
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE)
    if (!vs || !fs) {
      setWebGLError(true)
      return
    }

    const program = gl.createProgram()
    if (!program) {
      setWebGLError(true)
      return
    }

    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Fluid program link error:', gl.getProgramInfoLog(program))
      setWebGLError(true)
      return
    }

    gl.useProgram(program)

    // Full-screen quad geometry
    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ])
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

    const aPosLoc = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(aPosLoc)
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0)

    // Uniform locations
    const uResolutionLoc = gl.getUniformLocation(program, 'u_resolution')
    const uTimeLoc = gl.getUniformLocation(program, 'u_time')
    const uBgLoc = gl.getUniformLocation(program, 'u_color_bg')
    const uPrimaryLoc = gl.getUniformLocation(program, 'u_color_primary')
    const uSecondaryLoc = gl.getUniformLocation(program, 'u_color_secondary')
    const uTertiaryLoc = gl.getUniformLocation(program, 'u_color_tertiary')
    const uSheenLoc = gl.getUniformLocation(program, 'u_color_sheen')
    const uLightLoc = gl.getUniformLocation(program, 'u_is_light')
    const uIntensityLoc = gl.getUniformLocation(program, 'u_intensity')

    const updateCanvasDimensions = () => {
      const targetWidth = 640
      const aspect = Math.max(0.1, window.innerWidth / Math.max(window.innerHeight, 1))
      const targetHeight = Math.max(180, Math.round(targetWidth / aspect))
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
        gl.viewport(0, 0, targetWidth, targetHeight)
      }
    }

    updateCanvasDimensions()
    window.addEventListener('resize', updateCanvasDimensions)

    // ─────────────────────────────────────────────────────────────────────────
    // CONTINUOUS RENDER LOOP (Never terminates, instant color updates)
    // ─────────────────────────────────────────────────────────────────────────
    let rafId = 0
    let lastFrameTime = performance.now()
    let accumulatedTime = 0
    let isRunning = true
    let isContextLost = false

    const TARGET_FPS = 30
    const FRAME_INTERVAL = 1000 / TARGET_FPS

    const renderFrame = (now: number) => {
      if (!isRunning || isContextLost) return

      // Suspend computation strictly during active movie playback
      if (isPlaybackActive) {
        lastFrameTime = now
        rafId = requestAnimationFrame(renderFrame)
        return
      }

      const delta = now - lastFrameTime

      if (delta >= FRAME_INTERVAL) {
        lastFrameTime = now - (delta % FRAME_INTERVAL)
        // Advance time smoothly
        accumulatedTime += (delta / 1000)

        // Upload uniforms on every frame for immediate color responsiveness
        gl.uniform1f(uTimeLoc, accumulatedTime)
        gl.uniform2f(uResolutionLoc, canvas.width, canvas.height)

        const u = uniformsRef.current
        gl.uniform3fv(uBgLoc, u.bg)
        gl.uniform3fv(uPrimaryLoc, u.primary)
        gl.uniform3fv(uSecondaryLoc, u.secondary)
        gl.uniform3fv(uTertiaryLoc, u.tertiary)
        gl.uniform3fv(uSheenLoc, u.sheen)
        gl.uniform1f(uLightLoc, u.isLight)
        gl.uniform1f(uIntensityLoc, u.intensity)

        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      rafId = requestAnimationFrame(renderFrame)
    }

    const handleContextLost = (e: Event) => {
      e.preventDefault()
      isContextLost = true
      cancelAnimationFrame(rafId)
    }

    const handleContextRestored = () => {
      isContextLost = false
      lastFrameTime = performance.now()
      rafId = requestAnimationFrame(renderFrame)
    }

    canvas.addEventListener('webglcontextlost', handleContextLost, false)
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false)

    rafId = requestAnimationFrame(renderFrame)

    return () => {
      isRunning = false
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', updateCanvasDimensions)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)

      try {
        gl.deleteBuffer(positionBuffer)
        gl.deleteProgram(program)
        gl.deleteShader(vs)
        gl.deleteShader(fs)
      } catch {}
    }
  }, [webGLError, isPlaybackActive])

  if (webGLError || isStealth) {
    return null
  }

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden select-none transition-opacity duration-700 ${className}`}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out will-change-transform"
        style={{
          filter: 'blur(26px)',
          transform: 'scale(1.05) translate3d(0,0,0)',
        }}
      />
    </div>
  )
}

export default FluidAmbientCanvas
