import React, { useEffect, useRef, useState } from 'react';

interface QualityBoostRendererProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  enabled: boolean;
  sharpnessEnabled: boolean;
  vibranceEnabled: boolean;
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

const QualityBoostRenderer: React.FC<QualityBoostRendererProps> = ({ videoRef, enabled, sharpnessEnabled, vibranceEnabled, aspectMode, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const locationsRef = useRef<{
    position: number;
    texCoord: number;
    uResolution: WebGLUniformLocation | null;
    uImage: WebGLUniformLocation | null;
    uSharpenAmount: WebGLUniformLocation | null;
    uVibranceAmount: WebGLUniformLocation | null;
  }>({
    position: -1,
    texCoord: -1,
    uResolution: null,
    uImage: null,
    uSharpenAmount: null,
    uVibranceAmount: null,
  });
  const positionBufferRef = useRef<WebGLBuffer | null>(null);
  const texCoordBufferRef = useRef<WebGLBuffer | null>(null);
  const textureSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const VS_SOURCE = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  // Quality Boost Shader: Sharpening + Shadow Recovery + Soft Contrast + Vibrance
    const FS_SOURCE = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform vec2 u_resolution;
    varying vec2 v_texCoord;

    uniform float u_sharpenAmount;
    uniform float u_vibranceAmount;

    // Constants for the effect
    const float CONTRAST_AMOUNT = 1.08;
    const float SHADOW_LIFT = 0.08;    // Lifts dark areas to reveal detail
    const float GAMMA = 0.90;          // Brightens mid-tones slightly

    void main() {
      vec2 step = 1.0 / u_resolution;
      
      // 1. Sampling for sharpening
      vec4 center = texture2D(u_image, v_texCoord);
      vec4 left   = texture2D(u_image, v_texCoord + vec2(-step.x, 0.0));
      vec4 right  = texture2D(u_image, v_texCoord + vec2(step.x, 0.0));
      vec4 top    = texture2D(u_image, v_texCoord + vec2(0.0, -step.y));
      vec4 bottom = texture2D(u_image, v_texCoord + vec2(0.0, step.y));
      
      // Edge detection (Laplacian)
      vec4 edge = 4.0 * center - left - right - top - bottom;
      vec3 color = center.rgb + u_sharpenAmount * edge.rgb;
      
      // 2. Dynamic Range & Shadow Recovery, grouped with vibrance/color boost
      // Calculate luminance (Rec. 709)
      float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      
      // Shadow Mask: Strongest at 0.0 luminance, fades by 0.4
      float shadowMask = clamp(1.0 - (luminance / 0.4), 0.0, 1.0);
      // Lift shadows while preserving absolute black
      color.rgb += shadowMask * SHADOW_LIFT * u_vibranceAmount * 4.0 * (1.0 - exp(-5.0 * luminance));
      
      // 3. Soft Contrast (using a smooth curve instead of linear math)
      // This avoids "crushing" the blacks and "clipping" the whites
      vec3 contrastColor = color.rgb * color.rgb * (3.0 - 2.0 * color.rgb);
      color.rgb = mix(color.rgb, contrastColor, (CONTRAST_AMOUNT - 1.0) * u_vibranceAmount * 4.0);
      
      // 4. Gamma Correction (Mid-tone lift)
      vec3 gammaColor = pow(clamp(color.rgb, 0.0, 1.0), vec3(GAMMA));
      color.rgb = mix(color.rgb, gammaColor, u_vibranceAmount * 4.0);
      
      // 5. Vibrance (Selective Saturation)
      float average = (color.r + color.g + color.b) / 3.0;
      float mx = max(color.r, max(color.g, color.b));
      float amt = (mx - average) * (-u_vibranceAmount * 3.0);
      color.rgb = mix(color.rgb, vec3(mx), amt);
      
      gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), center.a);
    }
  `;

  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl', { 
      preserveDrawingBuffer: false, 
      alpha: false, // Video is opaque
      antialias: false,
      powerPreference: 'high-performance'
    });
    if (!gl) return;
    glRef.current = gl;

    // Create shaders
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
      uResolution: gl.getUniformLocation(program, 'u_resolution'),
      uImage: gl.getUniformLocation(program, 'u_image'),
      uSharpenAmount: gl.getUniformLocation(program, 'u_sharpenAmount'),
      uVibranceAmount: gl.getUniformLocation(program, 'u_vibranceAmount'),
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
    
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    textureRef.current = texture;

    return () => {
      if (glRef.current) {
        const gl = glRef.current;
        if (textureRef.current) gl.deleteTexture(textureRef.current);
        if (positionBufferRef.current) gl.deleteBuffer(positionBufferRef.current);
        if (texCoordBufferRef.current) gl.deleteBuffer(texCoordBufferRef.current);
        if (programRef.current) gl.deleteProgram(programRef.current);
      }
    };
  }, [videoRef]);

  useEffect(() => {
    if (!glRef.current || !programRef.current) return;

    const canvas = canvasRef.current!;
    const gl = glRef.current;
    const program = programRef.current;
    const locations = locationsRef.current;

    const render = () => {
      // If disabled, we stop the loop and clear the canvas
      if (!enabled) {
        if (glRef.current) {
          glRef.current.clearColor(0, 0, 0, 0);
          glRef.current.clear(glRef.current.COLOR_BUFFER_BIT);
        }
        requestRef.current = undefined;
        return;
      }

      if (!videoRef.current || !glRef.current) {
        requestRef.current = requestAnimationFrame(render);
        return;
      }
      
      const video = videoRef.current;
      const gl = glRef.current;
      
      if (video.readyState >= 2) {
        syncCanvasSize(canvas);
        gl.viewport(0, 0, canvas.width, canvas.height);

        gl.useProgram(program);

        const geometry = getAspectGeometry(video, canvas, aspectMode);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBufferRef.current);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.texCoords, gl.DYNAMIC_DRAW);

        // Position attribute
        gl.enableVertexAttribArray(locations.position);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current);
        gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);

        // TexCoord attribute
        gl.enableVertexAttribArray(locations.texCoord);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBufferRef.current);
        gl.vertexAttribPointer(locations.texCoord, 2, gl.FLOAT, false, 0, 0);

        // Resolution uniform
        gl.uniform2f(locations.uResolution, video.videoWidth || canvas.width, video.videoHeight || canvas.height);
        gl.uniform1f(locations.uSharpenAmount, sharpnessEnabled ? 0.35 : 0.0);
        gl.uniform1f(locations.uVibranceAmount, vibranceEnabled ? 0.25 : 0.0);

        // Update texture with video frame
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
        
        if (textureSizeRef.current.width === video.videoWidth && textureSizeRef.current.height === video.videoHeight) {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
        } else {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          textureSizeRef.current = { width: video.videoWidth, height: video.videoHeight };
        }
        
        gl.uniform1i(locations.uImage, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [enabled, sharpnessEnabled, vibranceEnabled, videoRef, isPlaying, aspectMode]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${
          enabled ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          width: '100%',
          height: '100%',
        }}
      />

    </div>
  );
};

export default QualityBoostRenderer;
