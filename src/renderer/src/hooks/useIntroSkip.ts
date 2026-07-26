import { useState, useEffect, useRef, useCallback } from 'react'
import { Video } from '../types'

export type IntroDbSegmentType = 'intro' | 'recap' | 'outro'

export interface IntroDbSegment {
  type: IntroDbSegmentType
  startSec: number
  endSec: number
  confidence: number | null
  submissionCount: number | null
  updatedAt: string | null
  source: 'theintrodb' | 'introdb' | 'chapters'
}

export interface AutoSkipTransitionState {
  show: boolean
  label: string
  id: number
}

export const INTRODB_SKIP_PROMPT_LEAD_SECONDS = 11
export const INTRODB_SKIP_OVERLAP_SECONDS = 1
export const INTRODB_SKIP_END_PADDING_SECONDS = 0.15
export const INTRODB_AUTO_SKIP_CONFIRMATION_MS = 700
export const INTRODB_AUTO_SKIP_STORAGE_KEY = 'mycinema_introdb_auto_skip'
export const INTRODB_AUTO_SKIP_SEEK_TRANSITION_MS = 180
export const INTRODB_AUTO_SKIP_NEXT_TRANSITION_MS = 50
export const INTRODB_RECAP_PROMPT_VISIBLE_SECONDS = 8

export function getIntroDbSegmentKey(segment: IntroDbSegment): string {
  return `${segment.type}:${segment.startSec}:${segment.endSec}`
}

export function getIntroDbSegmentLabel(type: IntroDbSegmentType): string {
  if (type === 'recap') return 'Recap'
  if (type === 'outro') return 'Outro'
  return 'Intro'
}

export function getIntroDbSegmentAccentClass(type: IntroDbSegmentType): string {
  if (type === 'recap') return 'bg-sky-300/70'
  if (type === 'outro') return 'bg-emerald-300/70'
  return 'bg-amber-300/70'
}

const isTorrentStreamPath = (filePath?: string | null) => Boolean(filePath?.startsWith('torrent://'))

interface UseIntroSkipProps {
  currentVideo: Video
  duration: number
  currentTime: number
  canControlPlayback: boolean
  hasNextEpisode: boolean
  onSkipSegment: (segment: IntroDbSegment) => void
  isPlaying: boolean
  isSeeking: boolean
}

export function useIntroSkip({
  currentVideo,
  duration,
  currentTime,
  canControlPlayback,
  hasNextEpisode,
  onSkipSegment,
  isPlaying,
  isSeeking
}: UseIntroSkipProps) {
  const [autoSkipIntroOutroEnabled, setAutoSkipIntroOutroEnabled] = useState(() => {
    return localStorage.getItem(INTRODB_AUTO_SKIP_STORAGE_KEY) !== 'false'
  })
  
  const [introDbSegments, setIntroDbSegments] = useState<IntroDbSegment[]>([])
  const [dismissedIntroDbSegmentKeys, setDismissedIntroDbSegmentKeys] = useState<Set<string>>(new Set())
  const [autoSkipTransition, setAutoSkipTransition] = useState<AutoSkipTransitionState | null>(null)
  
  const autoSkipInFlightKeyRef = useRef<string | null>(null)
  const autoSkipTransitionTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    localStorage.setItem(INTRODB_AUTO_SKIP_STORAGE_KEY, autoSkipIntroOutroEnabled.toString())
  }, [autoSkipIntroOutroEnabled])

  useEffect(() => {
    let isCancelled = false
    setIntroDbSegments([])
    setDismissedIntroDbSegmentKeys(new Set())
    setAutoSkipTransition(null)
    autoSkipInFlightKeyRef.current = null
    if (autoSkipTransitionTimerRef.current) {
      clearTimeout(autoSkipTransitionTimerRef.current)
      autoSkipTransitionTimerRef.current = null
    }

    if (
      isTorrentStreamPath(currentVideo.file_path) ||
      currentVideo.type !== 'series' ||
      currentVideo.season == null ||
      currentVideo.episode == null ||
      (!currentVideo.imdb_id && !currentVideo.tmdb_id && !currentVideo.file_path)
    ) {
      return () => {
        isCancelled = true
      }
    }

    window.api.getIntroDbSegments({
      imdbId: currentVideo.imdb_id || null,
      tmdbId: currentVideo.tmdb_id || null,
      season: currentVideo.season,
      episode: currentVideo.episode,
      filePath: currentVideo.file_path || null,
      duration: currentVideo.duration || duration || null
    })
      .then((result: any) => {
        if (isCancelled) return
        setIntroDbSegments((result?.segments || []).filter((segment: IntroDbSegment) =>
          Number.isFinite(segment.startSec) &&
          Number.isFinite(segment.endSec) &&
          segment.endSec > segment.startSec
        ))
      })
      .catch((err: any) => {
        if (!isCancelled) setIntroDbSegments([])
        console.warn('[VideoPlayer] IntroDB lookup failed:', err)
      })

    return () => {
      isCancelled = true
    }
  }, [
    currentVideo.episode,
    currentVideo.id,
    currentVideo.imdb_id,
    currentVideo.file_path,
    currentVideo.season,
    currentVideo.tmdb_id,
    currentVideo.type,
    duration
  ])

  // Computed state for the active segment
  const activeIntroDbSegment = canControlPlayback
    ? introDbSegments.find(segment => {
        const key = getIntroDbSegmentKey(segment)
        const segmentEnd = duration > 0 ? Math.min(segment.endSec, duration) : segment.endSec
        const promptStart = Math.max(0, segment.startSec - INTRODB_SKIP_PROMPT_LEAD_SECONDS)
        const promptEnd = segment.type === 'recap'
          ? Math.min(segmentEnd - 0.25, segment.startSec + INTRODB_RECAP_PROMPT_VISIBLE_SECONDS)
          : segment.type === 'outro'
            ? autoSkipIntroOutroEnabled
              ? segment.startSec + INTRODB_SKIP_OVERLAP_SECONDS + 0.5
              : segmentEnd - 0.25
            : segmentEnd - 0.25
        return !dismissedIntroDbSegmentKeys.has(key) &&
          currentTime >= promptStart &&
          currentTime < promptEnd
      }) || null
    : null

  const activeIntroDbSegmentCanAutoSkip = activeIntroDbSegment?.type === 'intro' || activeIntroDbSegment?.type === 'outro'
  
  const activeIntroDbAutoSkipCountdown = activeIntroDbSegment && activeIntroDbSegmentCanAutoSkip
    ? Math.max(0, Math.ceil(activeIntroDbSegment.startSec - currentTime))
    : 0
    
  const activeIntroDbSegmentIsOutroAdvance = activeIntroDbSegment?.type === 'outro' && hasNextEpisode
  
  const activeIntroDbWatchLabel = activeIntroDbSegment
    ? activeIntroDbSegment.type === 'outro'
      ? 'Watch Credits'
      : `Watch ${getIntroDbSegmentLabel(activeIntroDbSegment.type)}`
    : ''
    
  const activeIntroDbActionLabel = activeIntroDbSegment
    ? activeIntroDbSegmentIsOutroAdvance
      ? 'Next Episode'
      : activeIntroDbSegment.type === 'outro'
        ? 'Skip Credits'
        : `Skip ${getIntroDbSegmentLabel(activeIntroDbSegment.type)}`
    : ''
    
  const activeIntroDbAutoSkipProgress = activeIntroDbSegment && activeIntroDbSegmentCanAutoSkip && autoSkipIntroOutroEnabled
    ? (() => {
        const overlap = activeIntroDbSegment.type === 'outro' ? INTRODB_SKIP_OVERLAP_SECONDS : 0
        const totalWindow = INTRODB_SKIP_PROMPT_LEAD_SECONDS + overlap
        const skipTarget = activeIntroDbSegment.startSec + overlap
        return Math.max(0, Math.min(1, 1 - ((skipTarget - currentTime) / totalWindow)))
      })()
    : 0

  const dismissIntroDbSegment = useCallback((segment: IntroDbSegment) => {
    setDismissedIntroDbSegmentKeys(prev => {
      const next = new Set(prev)
      next.add(getIntroDbSegmentKey(segment))
      return next
    })
  }, [])

  const skipIntroDbSegment = useCallback((segment: IntroDbSegment, options: { automatic?: boolean } = {}) => {
    const isOutroAdvance = segment.type === 'outro' && hasNextEpisode

    if (isOutroAdvance || options.automatic) {
      dismissIntroDbSegment(segment)
      onSkipSegment(segment)
      return
    }

    dismissIntroDbSegment(segment)
    onSkipSegment(segment)
  }, [hasNextEpisode, dismissIntroDbSegment, onSkipSegment])

  // Automatic skip effect
  useEffect(() => {
    if (
      !autoSkipIntroOutroEnabled ||
      !activeIntroDbSegment ||
      !activeIntroDbSegmentCanAutoSkip ||
      !canControlPlayback ||
      !isPlaying ||
      isSeeking
    ) return

    const skipThreshold = activeIntroDbSegment.type === 'outro'
      ? activeIntroDbSegment.startSec + INTRODB_SKIP_OVERLAP_SECONDS
      : activeIntroDbSegment.startSec
    if (
      currentTime < skipThreshold ||
      currentTime >= activeIntroDbSegment.endSec - 0.25
    ) return

    const segmentKey = getIntroDbSegmentKey(activeIntroDbSegment)
    if (autoSkipInFlightKeyRef.current === segmentKey) return

    autoSkipInFlightKeyRef.current = segmentKey
    skipIntroDbSegment(activeIntroDbSegment, { automatic: true })
  }, [
    currentTime,
    activeIntroDbSegment,
    activeIntroDbSegmentCanAutoSkip,
    autoSkipIntroOutroEnabled,
    canControlPlayback,
    isPlaying,
    isSeeking,
    skipIntroDbSegment
  ])

  const clearIntroDbRuntimeWork = useCallback(() => {
    if (autoSkipTransitionTimerRef.current) {
      clearTimeout(autoSkipTransitionTimerRef.current)
      autoSkipTransitionTimerRef.current = null
    }
    autoSkipInFlightKeyRef.current = null
    setAutoSkipTransition(null)
  }, [])

  return {
    introDbSegments,
    autoSkipIntroOutroEnabled,
    setAutoSkipIntroOutroEnabled,
    autoSkipTransition,
    activeIntroDbSegment,
    activeIntroDbSegmentCanAutoSkip,
    activeIntroDbAutoSkipCountdown,
    activeIntroDbWatchLabel,
    activeIntroDbActionLabel,
    activeIntroDbAutoSkipProgress,
    dismissIntroDbSegment,
    skipIntroDbSegment,
    clearIntroDbRuntimeWork
  }
}
