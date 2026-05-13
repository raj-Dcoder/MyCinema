import React, { useEffect, useRef, useState } from 'react'

interface AIEnhancementRendererProps {
  videoRef: React.RefObject<HTMLVideoElement>
  fpsBoostEnabled: boolean
  sharpnessEnabled: boolean
  vibranceEnabled: boolean
  aspectMode: 'contain' | 'cover' | 'fill'
}

const MAX_QUALITY_DPR = 1.5
const MAX_FPS_BOOST_DPR = 1.25

const syncCanvasSize = (canvas: HTMLCanvasElement, fpsBoostEnabled: boolean) => {
  const maxDpr = fpsBoostEnabled ? MAX_FPS_BOOST_DPR : MAX_QUALITY_DPR
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr))

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
    return true
  }

  return false
}

const getAspectGeometry = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  aspectMode: 'contain' | 'cover' | 'fill'
) => {
  const videoAspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9
  const canvasAspect = canvas.width / canvas.height

  let positionWidth = 1
  let positionHeight = 1
  let texLeft = 0
  let texRight = 1
  let texTop = 0
  let texBottom = 1

  if (aspectMode === 'contain') {
    if (canvasAspect > videoAspect) {
      positionWidth = videoAspect / canvasAspect
    } else {
      positionHeight = canvasAspect / videoAspect
    }
  } else if (aspectMode === 'cover') {
    if (canvasAspect > videoAspect) {
      const visibleHeight = videoAspect / canvasAspect
      texTop = (1 - visibleHeight) / 2
      texBottom = texTop + visibleHeight
    } else {
      const visibleWidth = canvasAspect / videoAspect
      texLeft = (1 - visibleWidth) / 2
      texRight = texLeft + visibleWidth
    }
  }

  return {
    positions: new Float32Array([
      -positionWidth, -positionHeight, positionWidth, -positionHeight, -positionWidth, positionHeight,
      -positionWidth, positionHeight, positionWidth, -positionHeight, positionWidth, positionHeight
    ]),
    texCoords: new Float32Array([
      texLeft, texBottom, texRight, texBottom, texLeft, texTop,
      texLeft, texTop, texRight, texBottom, texRight, texTop
    ])
  }
}

const compileShader = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create enhancement shader')

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }

  return shader
}

const createProgram = (gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create enhancement program')

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown shader link error'
    gl.deleteProgram(program)
    throw new Error(message)
  }

  return program
}

const AIEnhancementRenderer: React.FC<AIEnhancementRendererProps> = ({
  videoRef,
  fpsBoostEnabled,
  sharpnessEnabled,
  vibranceEnabled,
  aspectMode
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const requestRef = useRef<number>()
  const rvfcRef = useRef<number>()
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)
  const texturesRef = useRef<WebGLTexture[]>([])
  const positionBufferRef = useRef<WebGLBuffer | null>(null)
  const texCoordBufferRef = useRef<WebGLBuffer | null>(null)
  const textureSizeRef = useRef({ width: 0, height: 0 })
  const geometryKeyRef = useRef('')
  const framesReceivedRef = useRef(0)
  const lastMediaTimeRef = useRef(0)
  const lastFrameTimeRef = useRef(0)
  const frameIntervalRef = useRef(1000 / 24)
  const frameDirtyRef = useRef(false)
  const renderStatusRef = useRef(false)
  const [isRendering, setIsRendering] = useState(false)

  const locationsRef = useRef<{
    position: number
    texCoord: number
    uImage0: WebGLUniformLocation | null
    uImage1: WebGLUniformLocation | null
    uResolution: WebGLUniformLocation | null
    uBlend: WebGLUniformLocation | null
    uSharpenAmount: WebGLUniformLocation | null
    uVibranceAmount: WebGLUniformLocation | null
  }>({
    position: -1,
    texCoord: -1,
    uImage0: null,
    uImage1: null,
    uResolution: null,
    uBlend: null,
    uSharpenAmount: null,
    uVibranceAmount: null
  })

  const enhancementsEnabled = fpsBoostEnabled || sharpnessEnabled || vibranceEnabled

  const setRenderStatus = (nextStatus: boolean) => {
    if (renderStatusRef.current === nextStatus) return
    renderStatusRef.current = nextStatus
    setIsRendering(nextStatus)
  }

  const VS_SOURCE = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;

    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `

  const FS_SOURCE = `
    precision mediump float;

    uniform sampler2D u_image0;
    uniform sampler2D u_image1;
    uniform vec2 u_resolution;
    uniform float u_blend;
    uniform float u_sharpenAmount;
    uniform float u_vibranceAmount;

    varying vec2 v_texCoord;

    const float CONTRAST_AMOUNT = 1.08;
    const float SHADOW_LIFT = 0.08;
    const float GAMMA = 0.90;

    vec4 sourceAt(vec2 coord) {
      vec4 currentFrame = texture2D(u_image0, coord);
      vec4 previousFrame = texture2D(u_image1, coord);
      return mix(currentFrame, previousFrame, u_blend);
    }

    void main() {
      vec4 center = sourceAt(v_texCoord);
      vec3 color = center.rgb;

      if (u_sharpenAmount > 0.001) {
        vec2 step = 1.0 / u_resolution;
        vec4 left = sourceAt(v_texCoord + vec2(-step.x, 0.0));
        vec4 right = sourceAt(v_texCoord + vec2(step.x, 0.0));
        vec4 top = sourceAt(v_texCoord + vec2(0.0, -step.y));
        vec4 bottom = sourceAt(v_texCoord + vec2(0.0, step.y));
        vec4 edge = 4.0 * center - left - right - top - bottom;
        color += u_sharpenAmount * edge.rgb;
      }

      if (u_vibranceAmount > 0.001) {
        float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
        float shadowMask = clamp(1.0 - (luminance / 0.4), 0.0, 1.0);
        color += shadowMask * SHADOW_LIFT * u_vibranceAmount * 4.0 * (1.0 - exp(-5.0 * luminance));

        vec3 contrastColor = color * color * (3.0 - 2.0 * color);
        color = mix(color, contrastColor, (CONTRAST_AMOUNT - 1.0) * u_vibranceAmount * 4.0);

        vec3 gammaColor = pow(clamp(color, 0.0, 1.0), vec3(GAMMA));
        color = mix(color, gammaColor, u_vibranceAmount * 4.0);

        float average = (color.r + color.g + color.b) / 3.0;
        float mx = max(color.r, max(color.g, color.b));
        float amt = (mx - average) * (-u_vibranceAmount * 3.0);
        color = mix(color, vec3(mx), amt);
      }

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), center.a);
    }
  `

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !videoRef.current) return

    try {
      const gl = canvas.getContext('webgl', {
        preserveDrawingBuffer: false,
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance'
      })

      if (!gl) {
        setRenderStatus(false)
        return
      }

      const program = createProgram(gl, VS_SOURCE, FS_SOURCE)
      glRef.current = gl
      programRef.current = program

      locationsRef.current = {
        position: gl.getAttribLocation(program, 'a_position'),
        texCoord: gl.getAttribLocation(program, 'a_texCoord'),
        uImage0: gl.getUniformLocation(program, 'u_image0'),
        uImage1: gl.getUniformLocation(program, 'u_image1'),
        uResolution: gl.getUniformLocation(program, 'u_resolution'),
        uBlend: gl.getUniformLocation(program, 'u_blend'),
        uSharpenAmount: gl.getUniformLocation(program, 'u_sharpenAmount'),
        uVibranceAmount: gl.getUniformLocation(program, 'u_vibranceAmount')
      }

      positionBufferRef.current = gl.createBuffer()
      texCoordBufferRef.current = gl.createBuffer()
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)

      const createVideoTexture = () => {
        const texture = gl.createTexture()
        if (!texture) throw new Error('Unable to create enhancement texture')

        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        return texture
      }

      texturesRef.current = [createVideoTexture(), createVideoTexture()]
    } catch (err) {
      console.warn('[AI Enhancements] WebGL initialization failed:', err)
      setRenderStatus(false)
    }

    return () => {
      setRenderStatus(false)

      const gl = glRef.current
      if (gl) {
        texturesRef.current.forEach(texture => gl.deleteTexture(texture))
        if (positionBufferRef.current) gl.deleteBuffer(positionBufferRef.current)
        if (texCoordBufferRef.current) gl.deleteBuffer(texCoordBufferRef.current)
        if (programRef.current) gl.deleteProgram(programRef.current)
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      }

      glRef.current = null
      programRef.current = null
      texturesRef.current = []
      positionBufferRef.current = null
      texCoordBufferRef.current = null
      textureSizeRef.current = { width: 0, height: 0 }
      geometryKeyRef.current = ''
    }
  }, [videoRef])

  useEffect(() => {
    const gl = glRef.current
    const program = programRef.current
    const canvas = canvasRef.current
    const video = videoRef.current

    if (!gl || !program || !canvas || !video || !enhancementsEnabled) {
      setRenderStatus(false)
      return
    }

    const hasVideoFrameCallback = 'requestVideoFrameCallback' in video

    const resetFrames = () => {
      framesReceivedRef.current = 0
      lastMediaTimeRef.current = 0
      lastFrameTimeRef.current = 0
      frameIntervalRef.current = 1000 / 24
      frameDirtyRef.current = true
    }

    const updateGeometry = () => {
      const resized = syncCanvasSize(canvas, fpsBoostEnabled)
      const key = [
        canvas.width,
        canvas.height,
        video.videoWidth || 0,
        video.videoHeight || 0,
        aspectMode
      ].join(':')

      if (!resized && key === geometryKeyRef.current) return false

      const geometry = getAspectGeometry(video, canvas, aspectMode)
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current)
      gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBufferRef.current)
      gl.bufferData(gl.ARRAY_BUFFER, geometry.texCoords, gl.STATIC_DRAW)
      geometryKeyRef.current = key
      return true
    }

    const uploadFrame = (frameTime: number, mediaTime: number) => {
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return false

      if (lastMediaTimeRef.current !== 0) {
        const delta = (mediaTime - lastMediaTimeRef.current) * 1000
        if (delta > 5 && delta < 200) {
          frameIntervalRef.current = frameIntervalRef.current * 0.85 + delta * 0.15
        } else if (Math.abs(delta) > 200) {
          frameIntervalRef.current = 1000 / 24
        }
      }

      const temp = texturesRef.current[1]
      texturesRef.current[1] = texturesRef.current[0]
      texturesRef.current[0] = temp

      try {
        if (
          textureSizeRef.current.width !== video.videoWidth ||
          textureSizeRef.current.height !== video.videoHeight
        ) {
          for (const texture of texturesRef.current) {
            gl.bindTexture(gl.TEXTURE_2D, texture)
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              video.videoWidth,
              video.videoHeight,
              0,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              null
            )
          }

          textureSizeRef.current = { width: video.videoWidth, height: video.videoHeight }
        }

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[0])
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video)

        if (framesReceivedRef.current === 0) {
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[1])
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video)
        }
      } catch (err) {
        console.warn('[AI Enhancements] Falling back to native video; frame upload failed:', err)
        setRenderStatus(false)
        return false
      }

      framesReceivedRef.current += 1
      lastMediaTimeRef.current = mediaTime
      lastFrameTimeRef.current = frameTime
      frameDirtyRef.current = true
      return true
    }

    const drawFrame = (now: number) => {
      if (!framesReceivedRef.current || !enhancementsEnabled || video.readyState < 2) {
        setRenderStatus(false)
        return
      }

      try {
        const geometryChanged = updateGeometry()
        if (!fpsBoostEnabled && !frameDirtyRef.current && !geometryChanged) return

        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(program)

        const locations = locationsRef.current
        gl.enableVertexAttribArray(locations.position)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current)
        gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0)

        gl.enableVertexAttribArray(locations.texCoord)
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBufferRef.current)
        gl.vertexAttribPointer(locations.texCoord, 2, gl.FLOAT, false, 0, 0)

        const timeSinceLastFrame = now - lastFrameTimeRef.current
        const progress = Math.max(0, Math.min(timeSinceLastFrame / frameIntervalRef.current, 1.2))
        const easedProgress = Math.min(progress, 1) * Math.min(progress, 1) * (3 - 2 * Math.min(progress, 1))
        const blend = fpsBoostEnabled && framesReceivedRef.current >= 2 ? 1 - easedProgress : 0

        gl.uniform1i(locations.uImage0, 0)
        gl.uniform1i(locations.uImage1, 1)
        gl.uniform2f(locations.uResolution, video.videoWidth || canvas.width, video.videoHeight || canvas.height)
        gl.uniform1f(locations.uBlend, blend)
        gl.uniform1f(locations.uSharpenAmount, sharpnessEnabled ? 0.35 : 0)
        gl.uniform1f(locations.uVibranceAmount, vibranceEnabled ? 0.25 : 0)

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[0])
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[1])

        gl.drawArrays(gl.TRIANGLES, 0, 6)
        frameDirtyRef.current = false
        setRenderStatus(true)
      } catch (err) {
        console.warn('[AI Enhancements] Falling back to native video; render failed:', err)
        setRenderStatus(false)
      }
    }

    const onVideoFrame = (_now: number, metadata?: { mediaTime?: number; expectedDisplayTime?: number }) => {
      if (!videoRef.current || !glRef.current || !enhancementsEnabled) {
        rvfcRef.current = undefined
        setRenderStatus(false)
        return
      }

      const frameTime = metadata?.expectedDisplayTime ?? performance.now()
      const mediaTime = metadata?.mediaTime ?? video.currentTime
      uploadFrame(frameTime, mediaTime)

      if (hasVideoFrameCallback) {
        rvfcRef.current = (video as any).requestVideoFrameCallback(onVideoFrame)
      }
    }

    const render = (now: number) => {
      const activeVideo = videoRef.current
      if (!activeVideo || !glRef.current || !enhancementsEnabled) {
        setRenderStatus(false)
        return
      }

      if (activeVideo.readyState >= 2 && framesReceivedRef.current === 0) {
        uploadFrame(performance.now(), activeVideo.currentTime)
      } else if (!hasVideoFrameCallback && activeVideo.currentTime !== lastMediaTimeRef.current) {
        uploadFrame(performance.now(), activeVideo.currentTime)
      }

      drawFrame(now)
      requestRef.current = requestAnimationFrame(render)
    }

    resetFrames()
    video.addEventListener('seeking', resetFrames)
    video.addEventListener('play', resetFrames)

    if (hasVideoFrameCallback) {
      rvfcRef.current = (video as any).requestVideoFrameCallback(onVideoFrame)
    }

    requestRef.current = requestAnimationFrame(render)

    return () => {
      setRenderStatus(false)
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
      if (rvfcRef.current && 'cancelVideoFrameCallback' in video) {
        ;(video as any).cancelVideoFrameCallback(rvfcRef.current)
      }
      video.removeEventListener('seeking', resetFrames)
      video.removeEventListener('play', resetFrames)
      requestRef.current = undefined
      rvfcRef.current = undefined
    }
  }, [
    enhancementsEnabled,
    fpsBoostEnabled,
    sharpnessEnabled,
    vibranceEnabled,
    aspectMode,
    videoRef
  ])

  return (
    <div className="absolute inset-0 pointer-events-none">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full ${
          enhancementsEnabled && isRendering ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  )
}

export default AIEnhancementRenderer
