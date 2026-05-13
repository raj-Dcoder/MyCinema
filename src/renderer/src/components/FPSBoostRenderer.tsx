import React, { useEffect, useRef, useState } from 'react';

interface FPSBoostRendererProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  enabled: boolean;
  aspectMode: 'contain' | 'cover' | 'fill';
  isPlaying: boolean;
}

const syncCanvasSize = (canvas: HTMLCanvasElement) => {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }

  return false;
};

const getAspectGeometry = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  aspectMode: 'contain' | 'cover' | 'fill'
) => {
  const videoAspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
  const canvasAspect = canvas.width / canvas.height;

  let positionWidth = 1;
  let positionHeight = 1;
  let texLeft = 0;
  let texRight = 1;
  let texTop = 0;
  let texBottom = 1;

  if (aspectMode === 'contain') {
    if (canvasAspect > videoAspect) {
      positionWidth = videoAspect / canvasAspect;
    } else {
      positionHeight = canvasAspect / videoAspect;
    }
  } else if (aspectMode === 'cover') {
    if (canvasAspect > videoAspect) {
      const visibleHeight = videoAspect / canvasAspect;
      texTop = (1 - visibleHeight) / 2;
      texBottom = texTop + visibleHeight;
    } else {
      const visibleWidth = canvasAspect / videoAspect;
      texLeft = (1 - visibleWidth) / 2;
      texRight = texLeft + visibleWidth;
    }
  }

  return {
    positions: new Float32Array([
      -positionWidth, -positionHeight,  positionWidth, -positionHeight, -positionWidth,  positionHeight,
      -positionWidth,  positionHeight,  positionWidth, -positionHeight,  positionWidth,  positionHeight,
    ]),
    texCoords: new Float32Array([
      texLeft, texBottom,  texRight, texBottom,  texLeft, texTop,
      texLeft, texTop,     texRight, texBottom,  texRight, texTop,
    ])
  };
};

const FPSBoostRenderer: React.FC<FPSBoostRendererProps> = ({ videoRef, enabled, aspectMode, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const rvfcRef = useRef<number>();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const texturesRef = useRef<WebGLTexture[]>([]);
  const locationsRef = useRef<{
    position: number;
    texCoord: number;
    uImage0: WebGLUniformLocation | null;
    uImage1: WebGLUniformLocation | null;
    uBlend: WebGLUniformLocation | null;
  }>({
    position: -1,
    texCoord: -1,
    uImage0: null,
    uImage1: null,
    uBlend: null,
  });
  const lastTimeRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const frameIntervalRef = useRef<number>(1000 / 24); // Default to 24fps
  const positionBufferRef = useRef<WebGLBuffer | null>(null);
  const texCoordBufferRef = useRef<WebGLBuffer | null>(null);
  const textureSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const framesReceivedRef = useRef<number>(0);
  const renderStatusRef = useRef(false);
  const [isRendering, setIsRendering] = useState(false);

  const setRenderStatus = (nextStatus: boolean) => {
    if (renderStatusRef.current === nextStatus) return;
    renderStatusRef.current = nextStatus;
    setIsRendering(nextStatus);
  };

  // FPS Tracking
  const [fps, setFps] = useState<number>(0);
  const fpsRef = useRef<{ count: number; lastTime: number; videoUpdates: number }>({ count: 0, lastTime: performance.now(), videoUpdates: 0 });

  const VS_SOURCE = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  const FS_SOURCE = `
    precision mediump float;
    uniform sampler2D u_image0;
    uniform sampler2D u_image1;
    uniform float u_blend;
    varying vec2 v_texCoord;
    void main() {
      vec4 color0 = texture2D(u_image0, v_texCoord);
      vec4 color1 = texture2D(u_image1, v_texCoord);
      gl_FragColor = mix(color0, color1, u_blend);
    }
  `;

  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl', { 
      preserveDrawingBuffer: false, 
      alpha: false, // Video is opaque, no need for alpha blending with background
      antialias: false,
      powerPreference: 'high-performance'
    });
    if (!gl) {
      setRenderStatus(false);
      return;
    }
    glRef.current = gl;

    // Create program
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VS_SOURCE);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FS_SOURCE);
    gl.compileShader(fs);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    programRef.current = program;

    // Cache locations
    locationsRef.current = {
      position: gl.getAttribLocation(program, 'a_position'),
      texCoord: gl.getAttribLocation(program, 'a_texCoord'),
      uImage0: gl.getUniformLocation(program, 'u_image0'),
      uImage1: gl.getUniformLocation(program, 'u_image1'),
      uBlend: gl.getUniformLocation(program, 'u_blend'),
    };

    // Set up geometry
    positionBufferRef.current = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]), gl.STATIC_DRAW);

    texCoordBufferRef.current = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBufferRef.current);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,  1, 0,  0, 1,
      0, 1,  1, 0,  1, 1,
    ]), gl.STATIC_DRAW);
    
    // Keep the texture upload orientation aligned with the inverted texture
    // coordinates below. Flipping here as well turns boosted playback upside down.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    
    const t0 = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const t1 = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    texturesRef.current = [t0, t1];

    return () => {
      setRenderStatus(false);
      if (glRef.current) {
        const gl = glRef.current;
        texturesRef.current.forEach(t => gl.deleteTexture(t));
        if (positionBufferRef.current) gl.deleteBuffer(positionBufferRef.current);
        if (texCoordBufferRef.current) gl.deleteBuffer(texCoordBufferRef.current);
        if (programRef.current) gl.deleteProgram(programRef.current);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      glRef.current = null;
      programRef.current = null;
      texturesRef.current = [];
      positionBufferRef.current = null;
      texCoordBufferRef.current = null;
      textureSizeRef.current = { width: 0, height: 0 };
    };
  }, [videoRef]);

  useEffect(() => {
    if (!enabled || !glRef.current || !programRef.current) {
      setRenderStatus(false);
      return;
    }

    const canvas = canvasRef.current!;
    const gl = glRef.current;
    const program = programRef.current;

    const onVideoFrame = (_now: number, metadata: any) => {
      const video = videoRef.current;
      if (!video || !glRef.current || !enabled) {
        rvfcRef.current = undefined;
        setRenderStatus(false);
        return;
      }
      
      const gl = glRef.current;
      const performanceNow = performance.now();
      
      fpsRef.current.videoUpdates++;
      framesReceivedRef.current++;
      
      // Use rvfc metadata for more precise timing if available
      const currentTime = metadata ? metadata.mediaTime : video.currentTime;
      const frameTime = metadata ? metadata.expectedDisplayTime : performanceNow;
      
      // Estimate frame interval for smoother blending
      if (lastTimeRef.current !== 0) {
        const delta = (currentTime - lastTimeRef.current) * 1000;
        if (delta > 5 && delta < 200) {
          // Use a stronger smoothing factor for frame interval to avoid jitter
          frameIntervalRef.current = frameIntervalRef.current * 0.85 + delta * 0.15;
        } else if (Math.abs(delta) > 200) {
          frameIntervalRef.current = 1000 / 24;
        }
      }

      const temp = texturesRef.current[1];
      texturesRef.current[1] = texturesRef.current[0];
      texturesRef.current[0] = temp;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[0]);
      
      // Use texSubImage2D if texture size is already established for better performance
      try {
        if (textureSizeRef.current.width !== video.videoWidth || textureSizeRef.current.height !== video.videoHeight) {
          // Allocate both textures first correctly
          gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[0]);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, video.videoWidth, video.videoHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[1]);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, video.videoWidth, video.videoHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          
          textureSizeRef.current = { width: video.videoWidth, height: video.videoHeight };
          
          // Rebind current texture
          gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[0]);
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } catch (err) {
        console.warn('[FPS Boost] Falling back to native video; frame upload failed:', err);
        setRenderStatus(false);
        return;
      }
      
      lastTimeRef.current = currentTime;
      lastFrameTimeRef.current = frameTime;

      if ('requestVideoFrameCallback' in video) {
        rvfcRef.current = (video as any).requestVideoFrameCallback(onVideoFrame);
      }
    };

    const resetFrames = () => {
      framesReceivedRef.current = 0;
      lastTimeRef.current = 0;
      lastFrameTimeRef.current = 0;
    };

    const video = videoRef.current!;
    video.addEventListener('seeking', resetFrames);
    video.addEventListener('play', resetFrames);

    const render = (now: number) => {
      if (!videoRef.current || !glRef.current || !enabled) {
        setRenderStatus(false);
        return;
      }

      const video = videoRef.current;
      const gl = glRef.current;
      const locations = locationsRef.current;
      
      if (video.readyState >= 2 && framesReceivedRef.current >= 2) {
        // Calculate FPS
        fpsRef.current.count++;
        if (now - fpsRef.current.lastTime >= 1000) {
          const calculatedFps = Math.round((fpsRef.current.count * 1000) / (now - fpsRef.current.lastTime));
          const videoFps = Math.round((fpsRef.current.videoUpdates * 1000) / (now - fpsRef.current.lastTime));
          setFps(calculatedFps);
          const logMsg = `[FPS Boost] Stats: Rendering @ ${calculatedFps} FPS | Source Video @ ${videoFps} FPS`;
          if (window.api && (window.api as any).log) {
            (window.api as any).log(logMsg);
          }
          fpsRef.current.count = 0;
          fpsRef.current.videoUpdates = 0;
          fpsRef.current.lastTime = now;
        }

        syncCanvasSize(canvas);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);

        const geometry = getAspectGeometry(video, canvas, aspectMode);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBufferRef.current);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.texCoords, gl.DYNAMIC_DRAW);

        // Attributes setup (using cached locations)
        gl.enableVertexAttribArray(locations.position);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current);
        gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(locations.texCoord);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBufferRef.current);
        gl.vertexAttribPointer(locations.texCoord, 2, gl.FLOAT, false, 0, 0);

        // Fallback if rvfc is not supported
        const currentTime = video.currentTime;
        if (!('requestVideoFrameCallback' in video) && currentTime !== lastTimeRef.current) {
          onVideoFrame(performance.now(), null);
        }

        // Calculate blend factor with more robustness
        const timeSinceLastFrame = now - lastFrameTimeRef.current;
        const blendDuration = frameIntervalRef.current;
        
        // Progress should be between 0 and 1, but we allow it to go slightly over
        // to handle frame timing jitter without "snapping"
        const progress = Math.max(0, Math.min(timeSinceLastFrame / blendDuration, 1.2));
        
        // Use a cubic easing for even smoother transitions
        // This reduces the perceived "jumpiness" when frames are slightly off
        const t = Math.min(progress, 1.0);
        const easeProgress = t * t * (3 - 2 * t);
        
        // Blend between current frame (textures[0]) and previous frame (textures[1])
        // When progress is 0 (new frame just displayed), blend is 1.0 -> shows textures[1] (prev)
        // When progress is 1, blend is 0.0 -> shows textures[0] (current)
        const blend = 1.0 - easeProgress;

        gl.uniform1i(locations.uImage0, 0);
        gl.uniform1i(locations.uImage1, 1);
        gl.uniform1f(locations.uBlend, blend);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[0]);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[1]);

        try {
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          setRenderStatus(true);
        } catch (err) {
          console.warn('[FPS Boost] Falling back to native video; draw failed:', err);
          setRenderStatus(false);
        }
      } else if (video.readyState >= 2 && framesReceivedRef.current < 2) {
        syncCanvasSize(canvas);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Just draw the current frame if we don't have enough for interpolation yet
        gl.useProgram(program);
        const geometry = getAspectGeometry(video, canvas, aspectMode);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBufferRef.current);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.texCoords, gl.DYNAMIC_DRAW);

        gl.enableVertexAttribArray(locations.position);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current);
        gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(locations.texCoord);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBufferRef.current);
        gl.vertexAttribPointer(locations.texCoord, 2, gl.FLOAT, false, 0, 0);

        gl.uniform1i(locations.uImage0, 0);
        gl.uniform1i(locations.uImage1, 0); // Both same
        gl.uniform1f(locations.uBlend, 0.0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[0]);
        try {
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          setRenderStatus(true);
        } catch (err) {
          console.warn('[FPS Boost] Falling back to native video; draw failed:', err);
          setRenderStatus(false);
        }
      }

      requestRef.current = requestAnimationFrame(render);
    };

    if (videoRef.current && 'requestVideoFrameCallback' in videoRef.current) {
      rvfcRef.current = (videoRef.current as any).requestVideoFrameCallback(onVideoFrame);
    }
    requestRef.current = requestAnimationFrame(render);

    return () => {
      setRenderStatus(false);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (rvfcRef.current && videoRef.current && 'cancelVideoFrameCallback' in videoRef.current) {
        (videoRef.current as any).cancelVideoFrameCallback(rvfcRef.current);
      }
      if (video) {
        video.removeEventListener('seeking', resetFrames);
        video.removeEventListener('play', resetFrames);
      }
    };
  }, [enabled, videoRef, isPlaying, aspectMode]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${
          enabled && isRendering ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          width: '100%',
          height: '100%',
        }}
      />

    </div>
  );
};

export default FPSBoostRenderer;
