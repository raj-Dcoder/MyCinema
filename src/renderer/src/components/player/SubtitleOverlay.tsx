import React, { useEffect, useRef } from 'react'
import { resolveSubtitleCue, type SubCue } from '../../utils/subtitleSync'

export interface SubtitleOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>
  activeSubKey: string | null
  subtitleCuesRef: React.MutableRefObject<SubCue[]>
  subtitleOffsetMs: number
  subtitleBottom: string
  subtitleLoading: boolean
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  videoRef,
  activeSubKey,
  subtitleCuesRef,
  subtitleOffsetMs,
  subtitleBottom,
  subtitleLoading
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

  return (
    <div
      ref={subtitleDivRef}
      className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-30 transition-[bottom] duration-300"
      style={{
        bottom: subtitleBottom,
        fontSize: '26px',
        fontWeight: 600,
        color: 'white',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        padding: '6px 22px',
        borderRadius: '12px',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        textShadow: '0px 2px 4px rgba(0,0,0,0.5)',
        textAlign: 'center',
        maxWidth: '85%',
        lineHeight: 1.4,
        whiteSpace: 'pre-line',
        display: 'none',
      }}
    />
  )
}
