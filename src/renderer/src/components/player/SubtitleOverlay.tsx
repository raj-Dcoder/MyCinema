import React, { useEffect, useRef } from 'react'
import { resolveSubtitleCue, type SubCue } from '../../utils/subtitleSync'

export type SubtitleStyle = 'default' | 'clean' | 'ott'

export const SUBTITLE_STYLE_KEY = 'mycinema_subtitle_style'
export const SUBTITLE_FONT_SIZE_KEY = 'mycinema_subtitle_font_size'
export const SUBTITLE_POSITION_KEY = 'mycinema_subtitle_position'

export interface SubtitleOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>
  activeSubKey: string | null
  subtitleCuesRef: React.MutableRefObject<SubCue[]>
  subtitleOffsetMs: number
  subtitleBottom: string
  subtitleLoading: boolean
  subtitleStyle?: SubtitleStyle
  subtitleFontSize?: number
  subtitlePositionOffset?: number
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  videoRef,
  activeSubKey,
  subtitleCuesRef,
  subtitleOffsetMs,
  subtitleBottom,
  subtitleLoading,
  subtitleStyle = 'default',
  subtitleFontSize = 24,
  subtitlePositionOffset = 0,
}) => {
  const subtitleDivRef = useRef<HTMLDivElement>(null)
  const activeSubtitleCueIndexRef = useRef<number>(-1)
  const rafRef = useRef<number>()

  const renderSubtitleAtTime = (playbackTime: number) => {
    if (!subtitleDivRef.current || activeSubKey === null) return

    const { cue, index } = resolveSubtitleCue(
      subtitleCuesRef.current,
      playbackTime,
      subtitleOffsetMs,
      activeSubtitleCueIndexRef.current
    )

    activeSubtitleCueIndexRef.current = index

    const nextText = cue ? cue.text : ''
    if (subtitleDivRef.current.textContent !== nextText) {
      subtitleDivRef.current.textContent = nextText
      subtitleDivRef.current.style.display = nextText ? 'block' : 'none'
    }
  }

  // Handle RAF loop
  useEffect(() => {
    if (activeSubKey === null) {
      if (subtitleDivRef.current) {
        subtitleDivRef.current.textContent = ''
        subtitleDivRef.current.style.display = 'none'
      }
      return
    }

    const renderLoop = () => {
      if (videoRef.current) {
        renderSubtitleAtTime(videoRef.current.currentTime)
      }
      rafRef.current = requestAnimationFrame(renderLoop)
    }
    
    rafRef.current = requestAnimationFrame(renderLoop)
    
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [activeSubKey, subtitleOffsetMs])

  // Clear cue index when track changes, or offset changes, or loading finishes
  useEffect(() => {
    activeSubtitleCueIndexRef.current = -1
    if (videoRef.current) {
       renderSubtitleAtTime(videoRef.current.currentTime)
    }
  }, [activeSubKey, subtitleOffsetMs, subtitleLoading])

  const baseBottom = parseInt(subtitleBottom, 10)
  const adjustedBottom = `${baseBottom + subtitlePositionOffset}px`

  const styleMap: Record<SubtitleStyle, React.CSSProperties> = {
    default: {
      fontWeight: 600,
      color: 'white',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      padding: '6px 22px',
      borderRadius: '12px',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      textShadow: '0px 2px 4px rgba(0,0,0,0.5)',
    },
    clean: {
      fontWeight: 600,
      color: 'white',
      background: 'none',
      padding: '0px',
      borderRadius: '0px',
      border: 'none',
      textShadow: '0px 1px 3px rgba(0,0,0,0.6)',
      backdropFilter: 'none',
    },
    ott: {
      fontWeight: 400,
      color: 'white',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      padding: '2px 10px',
      borderRadius: '4px',
      border: 'none',
      textShadow: 'none',
      backdropFilter: 'none',
    },
  }

  const dynamicStyle: React.CSSProperties = {
    bottom: adjustedBottom,
    fontSize: `${subtitleFontSize}px`,
    textAlign: 'center',
    maxWidth: '85%',
    lineHeight: 1.4,
    whiteSpace: 'pre-line',
    display: 'none',
    ...styleMap[subtitleStyle],
  }

  return (
    <div
      ref={subtitleDivRef}
      className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-30 transition-[bottom] duration-300"
      style={dynamicStyle}
    />
  )
}
