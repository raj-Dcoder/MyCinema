import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, Rewind, FastForward, X, Maximize, Minimize, Volume2, VolumeX, Subtitles, Music, SkipForward as SkipNext, ArrowLeft, MessageSquareText, AlertTriangle, Check, Monitor, RectangleHorizontal, Crop, FolderOpen, Info, Film, HardDrive, ChevronDown, ChevronUp, ListVideo, Users, Search, Globe, Loader2, Download, RotateCcw, Zap, Sparkles, Wand2, PictureInPicture2, Mic, MicOff } from 'lucide-react'
import { Video } from '../types'
import { useWatchTogether } from '../hooks/useWatchTogether'
import { WatchTogetherModal } from './WatchTogetherModal'
import AIEnhancementRenderer from './AIEnhancementRenderer'
import {
  SUBTITLE_SYNC_COARSE_STEP_MS,
  SUBTITLE_SYNC_FINE_STEP_MS,
  SUBTITLE_SYNC_MAX_MS,
  SUBTITLE_SYNC_MIN_MS,
  clampSubtitleOffsetMs,
  createSubtitleSyncStorageKey,
  formatSubtitleOffsetMs,
  parseStoredSubtitleOffsetMs,
  resolveSubtitleCue,
  type SubCue
} from '../utils/subtitleSync'

type AudioBoostProfile = 'auto' | 'dialogue' | 'night' | 'laptop' | 'cinema'
type AudioBoostIntensity = 'low' | 'medium' | 'high'
type IntroDbSegmentType = 'intro' | 'recap' | 'outro'

interface IntroDbSegment {
  type: IntroDbSegmentType
  startSec: number
  endSec: number
  confidence: number | null
  submissionCount: number | null
  updatedAt: string | null
  source: 'theintrodb' | 'introdb' | 'chapters'
}

interface AutoSkipTransitionState {
  show: boolean
  label: string
  id: number
}

interface SeriesSubtitleStatus {
  label: string
  current: number
  total: number
  ready: number
  failed: number
  done: boolean
}

const SUBTITLE_OVERLAY_Z_INDEX = 35
const SEEK_PREVIEW_BUCKET_SECONDS = 5
const SEEK_PREVIEW_DEBOUNCE_MS = 90
const HIGH_SPEED_PERFORMANCE_RATE = 1.5
const HIGH_SPEED_QUALITY_SAMPLE_MS = 1500
const HIGH_SPEED_MIN_FRAME_SAMPLE = 24
const HIGH_SPEED_DROPPED_FRAME_LIMIT = 8
const HIGH_SPEED_DROPPED_FRAME_RATIO = 0.18
const BUFFERING_INDICATOR_DELAY_MS = 450
const INTRODB_SKIP_PROMPT_LEAD_SECONDS = 3
const INTRODB_SKIP_END_PADDING_SECONDS = 0.15
const INTRODB_AUTO_SKIP_STORAGE_KEY = 'mycinema_introdb_auto_skip'
const INTRODB_AUTO_SKIP_SEEK_TRANSITION_MS = 180
const INTRODB_AUTO_SKIP_NEXT_TRANSITION_MS = 240
const INTRODB_AUTO_SKIP_CONFIRMATION_MS = 700
const INTRODB_RECAP_PROMPT_VISIBLE_SECONDS = 8
const SERIES_SUBTITLE_AUTO_LOAD_VALUE = 'external'

const AUDIO_BOOST_PROFILES: Record<AudioBoostProfile, {
  label: string
  detail: string
  bassGain: number
  lowMidGain: number
  dialogGain: number
  presenceGain: number
  airGain: number
  compressorThreshold: number
  compressorKnee: number
  compressorRatio: number
  compressorAttack: number
  compressorRelease: number
  limiterThreshold: number
  outputGain: number
}> = {
  auto: {
    label: 'Auto',
    detail: 'Voices + leveler',
    bassGain: 2.8,
    lowMidGain: -2.8,
    dialogGain: 4.6,
    presenceGain: 2.2,
    airGain: 1.5,
    compressorThreshold: -30,
    compressorKnee: 22,
    compressorRatio: 5.2,
    compressorAttack: 0.006,
    compressorRelease: 0.22,
    limiterThreshold: -3.5,
    outputGain: 1.22
  },
  dialogue: {
    label: 'Dialogue',
    detail: 'Lift voices',
    bassGain: 0.8,
    lowMidGain: -4.2,
    dialogGain: 6.4,
    presenceGain: 3.4,
    airGain: 1.0,
    compressorThreshold: -31,
    compressorKnee: 20,
    compressorRatio: 4.8,
    compressorAttack: 0.005,
    compressorRelease: 0.18,
    limiterThreshold: -3.5,
    outputGain: 1.18
  },
  night: {
    label: 'Night',
    detail: 'Tame loud scenes',
    bassGain: -1.4,
    lowMidGain: -2.4,
    dialogGain: 5.4,
    presenceGain: 1.8,
    airGain: 0.8,
    compressorThreshold: -34,
    compressorKnee: 30,
    compressorRatio: 8.0,
    compressorAttack: 0.004,
    compressorRelease: 0.28,
    limiterThreshold: -6,
    outputGain: 1.14
  },
  laptop: {
    label: 'Laptop',
    detail: 'Small speakers',
    bassGain: 1.8,
    lowMidGain: -5.0,
    dialogGain: 5.4,
    presenceGain: 4.0,
    airGain: 2.0,
    compressorThreshold: -32,
    compressorKnee: 20,
    compressorRatio: 5.8,
    compressorAttack: 0.004,
    compressorRelease: 0.2,
    limiterThreshold: -3.8,
    outputGain: 1.26
  },
  cinema: {
    label: 'Cinema',
    detail: 'Bigger impact',
    bassGain: 5.4,
    lowMidGain: -1.8,
    dialogGain: 3.2,
    presenceGain: 1.6,
    airGain: 2.8,
    compressorThreshold: -26,
    compressorKnee: 22,
    compressorRatio: 4.0,
    compressorAttack: 0.008,
    compressorRelease: 0.2,
    limiterThreshold: -3,
    outputGain: 1.2
  }
}

const AUDIO_BOOST_INTENSITIES: Record<AudioBoostIntensity, {
  label: string
  amount: number
  outputScale: number
}> = {
  low: { label: 'Low', amount: 0.72, outputScale: 0.82 },
  medium: { label: 'Med', amount: 1, outputScale: 1 },
  high: { label: 'High', amount: 1.28, outputScale: 1.12 }
}

// ── VTT Parser (runs once per track selection, no React state) ──────────────
function parseVTTTime(s: string): number {
  const clean = s.split(' ')[0]
  const parts = clean.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return parts[0] * 60 + (parts[1] || 0)
}
function parseVTT(content: string): SubCue[] {
  const cues: SubCue[] = []
  // Normalize Windows CRLF line endings that FFmpeg produces on Windows
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  const blocks = normalized.split(/\n\s*\n/)
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (
      lines.length === 0 ||
      lines[0].startsWith('WEBVTT') ||
      lines[0].startsWith('NOTE') ||
      lines[0].startsWith('STYLE') ||
      lines[0].startsWith('REGION')
    ) continue

    const arrowLine = lines.find(l => l.includes('-->'))
    if (!arrowLine) continue
    const [startStr, endStr] = arrowLine.split('-->').map(s => s.trim().split(/\s+/)[0])
    const start = parseVTTTime(startStr)
    const end = parseVTTTime(endStr)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue

    const textLines = lines.slice(lines.indexOf(arrowLine) + 1).filter(l => l.trim() !== '' && !l.trim().match(/^\d+$/))
    if (textLines.length === 0) continue
    // Strip VTT tags like <c>, <i>, position cues etc.
    const text = textLines
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()
    if (text) cues.push({ start, end, text })
  }
  return cues
}

function getIntroDbSegmentKey(segment: IntroDbSegment): string {
  return `${segment.type}:${segment.startSec}:${segment.endSec}`
}

function getIntroDbSegmentLabel(type: IntroDbSegmentType): string {
  if (type === 'recap') return 'Recap'
  if (type === 'outro') return 'Outro'
  return 'Intro'
}

function getIntroDbSegmentAccentClass(type: IntroDbSegmentType): string {
  if (type === 'recap') return 'bg-sky-300/70'
  if (type === 'outro') return 'bg-emerald-300/70'
  return 'bg-amber-300/70'
}

function getPreferenceSeriesKey(video: Video) {
  return video.type === 'series' && video.series_name ? video.series_name : 'global'
}

function getSeriesSubtitleAutoLoadStorageKey(seriesKey: string) {
  return `mycinema_series_subtitle_auto_${seriesKey}`
}

interface VideoPlayerProps {
  video: Video
  onClose: () => void
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showControls, setShowControls] = useState(true)

  const { isHost, roomId, participants, localPeerId, isConnecting, error, voiceError, voiceEnabled, isMicActive, remoteAudioStreams, startHosting, joinRoom, leaveRoom, broadcastState, startVoiceSession, setPushToTalkActive, onReceiveSyncObj, debugLogs } = useWatchTogether()
  const [showWatchTogetherState, setShowWatchTogetherState] = useState(false)
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null)
  const [talkResumeCountdown, setTalkResumeCountdown] = useState<number | null>(null)
  const shouldShowTalkControl = roomId !== null && (showControls || isMicActive || activeSpeakerId !== null || talkResumeCountdown !== null || voiceError !== null)
  const talkResumeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const talkResumeIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const conversationWasPlayingRef = useRef(false)
  const isPushToTalkActiveRef = useRef(false)
  const activeSpeakerIdRef = useRef<string | null>(null)
  const allowGuestPlaybackEventRef = useRef(false)

  const clearTalkResumeTimers = (updateState = true) => {
    if (talkResumeTimerRef.current) {
      clearTimeout(talkResumeTimerRef.current)
      talkResumeTimerRef.current = null
    }
    if (talkResumeIntervalRef.current) {
      clearInterval(talkResumeIntervalRef.current)
      talkResumeIntervalRef.current = null
    }
    if (updateState) setTalkResumeCountdown(null)
  }

  const pauseForConversation = (speakerId: string | null) => {
    clearTalkResumeTimers()
    setActiveSpeakerId(speakerId)
    activeSpeakerIdRef.current = speakerId
    if (videoRef.current) {
      conversationWasPlayingRef.current = !videoRef.current.paused
      allowGuestPlaybackEventRef.current = true
      videoRef.current.pause()
      setIsPlaying(false)
      if (audioRef.current && audioRef.current.src) audioRef.current.pause()
    }
  }

  const scheduleConversationResume = (shouldBroadcast: boolean) => {
    setActiveSpeakerId(null)
    activeSpeakerIdRef.current = null
    if (!conversationWasPlayingRef.current) return

    setTalkResumeCountdown(2)
    talkResumeIntervalRef.current = setInterval(() => {
      setTalkResumeCountdown(prev => {
        if (prev === null || prev <= 1) return null
        return prev - 1
      })
    }, 1000)

    talkResumeTimerRef.current = setTimeout(() => {
      clearTalkResumeTimers()
      if (activeSpeakerIdRef.current || !videoRef.current) return
      allowGuestPlaybackEventRef.current = true
      videoRef.current.play().catch(e => console.log(e))
      setIsPlaying(true)
      if (shouldBroadcast) {
        broadcastState({ type: 'PLAY', time: videoRef.current.currentTime })
      }
    }, 1800)
  }

  useEffect(() => {
    onReceiveSyncObj.current = (msg) => {
      switch (msg.type) {
        case 'PLAY':
          if (videoRef.current) {
            allowGuestPlaybackEventRef.current = true;
            videoRef.current.currentTime = msg.time;
            videoRef.current.play().catch(e => console.log(e));
            setIsPlaying(true);
          }
          break;
        case 'PAUSE':
          if (videoRef.current) {
            allowGuestPlaybackEventRef.current = true;
            videoRef.current.pause();
            setIsPlaying(false);
            videoRef.current.currentTime = msg.time;
          }
          break;
        case 'SEEK':
          if (videoRef.current) {
            videoRef.current.currentTime = msg.time;
            setCurrentTime(msg.time);
          }
          break;
        case 'SYNC':
          if (videoRef.current && Math.abs(videoRef.current.currentTime - msg.time) > 1.0) {
            videoRef.current.currentTime = msg.time;
          }
          break;
        case 'SPEED':
          if (msg.rate !== undefined) {
            setPlaybackRate(msg.rate);
            if (videoRef.current) videoRef.current.playbackRate = msg.rate;
            const audioEl = document.querySelector('audio');
            if (audioEl) audioEl.playbackRate = msg.rate;
          }
          break;
        case 'TALK_START': {
          const speaker = msg.speakerId || 'friend';
          pauseForConversation(speaker);
          if (isHost) {
            broadcastState({ type: 'PAUSE', time: videoRef.current?.currentTime || msg.time });
          }
          break;
        }
        case 'TALK_END':
          scheduleConversationResume(isHost);
          break;
      }
    };
  }, [broadcastState, isHost, onReceiveSyncObj]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isHost && isPlaying) {
      interval = setInterval(() => {
        if (videoRef.current) broadcastState({ type: 'SYNC', time: videoRef.current.currentTime });
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isHost, isPlaying, broadcastState]);
  const [forceRestart, setForceRestart] = useState(false)
  const [subtitlePath, setSubtitlePath] = useState<string | null>(null)
  const [volume, setVolume] = useState(1)
  const [currentVideo, setCurrentVideo] = useState<Video>(video)
  const currentVideoRef = useRef<Video>(video)
  currentVideoRef.current = currentVideo
  const [isSeeking, setIsSeeking] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false)
  const [isPiPActive, setIsPiPActive] = useState(false)
  const [isPiPSupported, setIsPiPSupported] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [audioTracks, setAudioTracks] = useState<any[]>([])
  const [selectedAudioId, setSelectedAudioId] = useState<string>('')
  const [hasVideoMetadata, setHasVideoMetadata] = useState(false)
  const [audioProbeReady, setAudioProbeReady] = useState(false)
  const [startupProgressReady, setStartupProgressReady] = useState(false)
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false)
  const [playbackRate, setPlaybackRate] = useState<number>(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [seekPopup, setSeekPopup] = useState<{ show: boolean, text: string, id: number }>({ show: false, text: '', id: 0 })
  const [volumePopup, setVolumePopup] = useState<{ show: boolean, volume: number, isMuted: boolean, id: number }>({ show: false, volume: 1, isMuted: false, id: 0 })
  const [speedPopup, setSpeedPopup] = useState<{ show: boolean, rate: number, id: number }>({ show: false, rate: 1, id: 0 })
  const [performanceNotice, setPerformanceNotice] = useState<{ show: boolean, text: string, id: number }>({ show: false, text: '', id: 0 })
  const [highSpeedPerformanceMode, setHighSpeedPerformanceMode] = useState(false)
  const ASPECT_MODES: ('contain' | 'cover' | 'fill')[] = ['contain', 'cover', 'fill'];
  const [aspectMode, setAspectMode] = useState<('contain' | 'cover' | 'fill')>('contain');
  const [trackPopup, setTrackPopup] = useState<{ show: boolean, type: 'audio' | 'subtitle' | 'subtitleSync' | 'aspect' | 'skip', text: string, id: number }>({ show: false, type: 'subtitle', text: '', id: 0 })
  const [seekPreview, setSeekPreview] = useState<number | null>(null)
  const seekPreviewRef = useRef<number>(0)
  const [embeddedSubs, setEmbeddedSubs] = useState<any[]>([])
  const [embeddedAudio, setEmbeddedAudio] = useState<any[]>([])
  const [convertedSubPaths, setConvertedSubPaths] = useState<Map<string, string>>(new Map())
  const [lastSeekTime, setLastSeekTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const lastSeekTimeRef = useRef(0)
  const [hasNextEpisode, setHasNextEpisode] = useState(false)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const timeRef = useRef(0)
  const durationRef = useRef(1)
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const wasHoldingRef = useRef(false)
  const [isHolding2x, setIsHolding2x] = useState(false)
  const [isHoldingRev2x, setIsHoldingRev2x] = useState(false)
  const reverseRafRef = useRef<number | null>(null)
  const forwardIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const arrowHoldTimerRef = useRef<NodeJS.Timeout | null>(null)
  const seekPreviewIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const wasPlayingBeforeRevRef = useRef<boolean>(false)
  const lastReverseStepRef = useRef<number>(0)
  const spaceHoldTimerRef = useRef<NodeJS.Timeout | null>(null)
  const speedToastRef = useRef<HTMLDivElement | null>(null)
  const highSpeedNoticeLockRef = useRef(false)
  const highSpeedQualityRef = useRef<{ dropped: number; total: number } | null>(null)
  const bufferingIndicatorTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastTimeUpdateRef = useRef(0)
  const subtitleRafRef = useRef<number | null>(null)
  // Custom subtitle renderer refs — never triggers React re-renders
  const subtitleDivRef = useRef<HTMLDivElement | null>(null)
  const subtitleCuesRef = useRef<SubCue[]>([])
  const activeSubKeyRef = useRef<string | null>(null)
  const activeSubtitleCueIndexRef = useRef(-1)
  const subtitleOffsetStorageKeyRef = useRef<string | null>(null)
  const subtitleOffsetRef = useRef(0)

  const getSpeakerLabel = (speakerId: string | null) => {
    if (!speakerId) return 'Someone'
    if (speakerId === localPeerId) return 'You'
    if (speakerId.startsWith('mycinema-wt-')) return 'Host'
    const guestIndex = participants.indexOf(speakerId)
    return guestIndex >= 0 ? `Guest ${guestIndex + 1}` : 'Friend'
  }

  const beginPushToTalk = async () => {
    if (!roomId || isPushToTalkActiveRef.current) return
    const voiceReady = voiceEnabled || await startVoiceSession()
    if (!voiceReady) return

    isPushToTalkActiveRef.current = true
    setPushToTalkActive(true)
    const speakerId = localPeerId || (isHost && roomId ? `mycinema-wt-${roomId}` : 'you')
    pauseForConversation(speakerId)
    broadcastState({ type: 'TALK_START', time: videoRef.current?.currentTime || 0, speakerId })
    if (isHost) {
      broadcastState({ type: 'PAUSE', time: videoRef.current?.currentTime || 0 })
    }
  }

  const endPushToTalk = () => {
    if (!isPushToTalkActiveRef.current) return
    isPushToTalkActiveRef.current = false
    setPushToTalkActive(false)
    broadcastState({ type: 'TALK_END', time: videoRef.current?.currentTime || 0, speakerId: localPeerId || undefined })
    scheduleConversationResume(isHost)
  }

  useEffect(() => {
    return () => {
      clearTalkResumeTimers()
    }
  }, [])
  const [activeSubKey, setActiveSubKey] = useState<string | null>(null)
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState(0)
  const [subtitleLoading, setSubtitleLoading] = useState(false)
  const [fpsBoostEnabled, setFpsBoostEnabled] = useState(() => {
    return localStorage.getItem('mycinema_fps_boost') === 'true'
  })
  const [qualitySharpnessEnabled, setQualitySharpnessEnabled] = useState(() => {
    const storedSharpness = localStorage.getItem('mycinema_ai_sharpness')
    return storedSharpness === 'true'
  })
  const [qualityVibranceEnabled, setQualityVibranceEnabled] = useState(() => {
    const storedVibrance = localStorage.getItem('mycinema_ai_vibrance')
    return storedVibrance === 'true'
  })
  const [audioBoostEnabled, setAudioBoostEnabled] = useState(() => {
    return localStorage.getItem('mycinema_audio_boost') === 'true'
  })
  const [audioBoostProfile, setAudioBoostProfile] = useState<AudioBoostProfile>(() => {
    const stored = localStorage.getItem('mycinema_audio_boost_profile')
    if (stored === 'balanced') return 'auto'
    if (stored === 'rich') return 'cinema'
    if (stored === 'dialogue' || stored === 'night' || stored === 'laptop' || stored === 'cinema' || stored === 'auto') return stored
    return 'auto'
  })
  const [audioBoostIntensity, setAudioBoostIntensity] = useState<AudioBoostIntensity>(() => {
    const stored = localStorage.getItem('mycinema_audio_boost_intensity')
    return stored === 'low' || stored === 'high' ? stored : 'medium'
  })
  const [autoSkipIntroOutroEnabled, setAutoSkipIntroOutroEnabled] = useState(() => {
    return localStorage.getItem(INTRODB_AUTO_SKIP_STORAGE_KEY) !== 'false'
  })
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [showEpisodesPanel, setShowEpisodesPanel] = useState(false)
  const [seriesEpisodes, setSeriesEpisodes] = useState<Video[]>([])
  const [mediaInfo, setMediaInfo] = useState<any>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [showAllAudioInfo, setShowAllAudioInfo] = useState(false)
  const [showSubtitleSyncPanel, setShowSubtitleSyncPanel] = useState(false)
  const [introDbSegments, setIntroDbSegments] = useState<IntroDbSegment[]>([])
  const [dismissedIntroDbSegmentKeys, setDismissedIntroDbSegmentKeys] = useState<Set<string>>(new Set())
  const [autoSkipTransition, setAutoSkipTransition] = useState<AutoSkipTransitionState | null>(null)
  
  // Online subtitle search state
  const [onlineSubResults, setOnlineSubResults] = useState<any[]>([])
  const [onlineSubLoading, setOnlineSubLoading] = useState(false)
  const [onlineSubError, setOnlineSubError] = useState<string | null>(null)
  const [showOnlineSearch, setShowOnlineSearch] = useState(false)
  const [downloadingSubId, setDownloadingSubId] = useState<number | null>(null)
  const [seriesSubtitleStatus, setSeriesSubtitleStatus] = useState<SeriesSubtitleStatus | null>(null)
  const [seriesSubtitleRefreshToken, setSeriesSubtitleRefreshToken] = useState(0)
  
  const playerShellRef = useRef<HTMLDivElement>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = useState<number>(0)
  const [seekPreviewImageSrc, setSeekPreviewImageSrc] = useState<string | null>(null)
  const [seekPreviewLoading, setSeekPreviewLoading] = useState(false)
  const seekPreviewThumbTimerRef = useRef<NodeJS.Timeout | null>(null)
  const seekPreviewThumbRequestRef = useRef(0)
  const lastSeekPreviewBucketRef = useRef<number | null>(null)
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9)
  const isAnyFullscreen = isFullscreen || isWindowFullscreen
  const forceRestartRef = useRef(false)
  const startupPlaybackTokenRef = useRef(0)
  const startupPlaybackPendingRef = useRef(true)
  const startupPlaybackLaunchingRef = useRef(false)
  const startupResumeTimeRef = useRef(0)
  const startupExternalAudioBarrierRef = useRef(false)
  const startupDriftCorrectionUntilRef = useRef(0)
  const lastRelaxedAudioSyncCheckRef = useRef(0)
  const externalAudioSeekBarrierRef = useRef(false)
  const externalAudioSeekTokenRef = useRef(0)
  const suppressNextSeekSyncRef = useRef(false)
  const seekWasPlayingRef = useRef(false)
  const pendingControlledSeekTimeRef = useRef<number | null>(null)
  const pendingControlledSeekResumeRef = useRef(false)
  const playerSessionTokenRef = useRef(0)
  const subtitleLoadTokenRef = useRef(0)
  const isPlayerClosingRef = useRef(false)
  const seriesSubtitleStatusTimerRef = useRef<NodeJS.Timeout | null>(null)
  const autoSkipInFlightKeyRef = useRef<string | null>(null)
  const autoSkipTransitionTimerRef = useRef<NodeJS.Timeout | null>(null)
  const highSpeedPlaybackActive = playbackRate >= HIGH_SPEED_PERFORMANCE_RATE || isHolding2x
  const highSpeedDisplayRate = isHolding2x ? 2 : playbackRate
  const highSpeedMotionPaused = fpsBoostEnabled && highSpeedPlaybackActive && highSpeedPerformanceMode
  const effectiveFpsBoostEnabled = fpsBoostEnabled && !highSpeedMotionPaused
  const effectiveSharpnessEnabled = qualitySharpnessEnabled
  const effectiveVibranceEnabled = qualityVibranceEnabled
  const canControlPlayback = isHost || roomId === null
  const activeIntroDbSegment = canControlPlayback
    ? introDbSegments.find(segment => {
        const key = getIntroDbSegmentKey(segment)
        const segmentEnd = duration > 0 ? Math.min(segment.endSec, duration) : segment.endSec
        const promptStart = Math.max(0, segment.startSec - INTRODB_SKIP_PROMPT_LEAD_SECONDS)
        const promptEnd = segment.type === 'recap'
          ? Math.min(segmentEnd - 0.25, segment.startSec + INTRODB_RECAP_PROMPT_VISIBLE_SECONDS)
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
    ? Math.max(0, Math.min(1, 1 - ((activeIntroDbSegment.startSec - currentTime) / INTRODB_SKIP_PROMPT_LEAD_SECONDS)))
    : 0

  const activateHighSpeedPerformanceMode = useCallback((message?: string) => {
    if (!fpsBoostEnabled) return

    setHighSpeedPerformanceMode(true)
    if (highSpeedNoticeLockRef.current) return

    highSpeedNoticeLockRef.current = true
    setPerformanceNotice({
      show: true,
      text: message || `FPS Boost eased for smoother ${highSpeedDisplayRate}x playback`,
      id: Date.now()
    })
  }, [fpsBoostEnabled, highSpeedDisplayRate])

  const showBufferingIndicatorSoon = useCallback(() => {
    if (bufferingIndicatorTimerRef.current || isBuffering) return

    bufferingIndicatorTimerRef.current = setTimeout(() => {
      bufferingIndicatorTimerRef.current = null
      setIsBuffering(true)
    }, BUFFERING_INDICATOR_DELAY_MS)
  }, [isBuffering])

  const hideBufferingIndicator = useCallback(() => {
    if (bufferingIndicatorTimerRef.current) {
      clearTimeout(bufferingIndicatorTimerRef.current)
      bufferingIndicatorTimerRef.current = null
    }
    setIsBuffering(false)
  }, [])

  const releaseMediaElement = (mediaEl: HTMLMediaElement | null) => {
    if (!mediaEl) return
    try {
      mediaEl.pause()
      mediaEl.removeAttribute('src')
      mediaEl.load()
    } catch (error) {
      console.warn('[VideoPlayer] Media release failed:', error)
    }
  }

  const clearPlayerRuntimeWork = (releaseMedia = false) => {
    playerSessionTokenRef.current += 1
    subtitleLoadTokenRef.current += 1
    seekPreviewThumbRequestRef.current += 1
    externalAudioSeekTokenRef.current += 1
    startupPlaybackTokenRef.current += 1
    startupPlaybackPendingRef.current = false
    startupPlaybackLaunchingRef.current = false
    startupExternalAudioBarrierRef.current = false
    externalAudioSeekBarrierRef.current = false
    suppressNextSeekSyncRef.current = false
    pendingControlledSeekTimeRef.current = null
    pendingControlledSeekResumeRef.current = false

    clearTalkResumeTimers(false)

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current)
      holdTimeoutRef.current = null
    }
    if (arrowHoldTimerRef.current) {
      clearTimeout(arrowHoldTimerRef.current)
      arrowHoldTimerRef.current = null
    }
    if (spaceHoldTimerRef.current) {
      clearTimeout(spaceHoldTimerRef.current)
      spaceHoldTimerRef.current = null
    }
    if (seekPreviewIntervalRef.current) {
      clearInterval(seekPreviewIntervalRef.current)
      seekPreviewIntervalRef.current = null
    }
    if (forwardIntervalRef.current) {
      clearInterval(forwardIntervalRef.current)
      forwardIntervalRef.current = null
    }
    if (seekPreviewThumbTimerRef.current) {
      clearTimeout(seekPreviewThumbTimerRef.current)
      seekPreviewThumbTimerRef.current = null
    }
    if (autoSkipTransitionTimerRef.current) {
      clearTimeout(autoSkipTransitionTimerRef.current)
      autoSkipTransitionTimerRef.current = null
    }
    if (seriesSubtitleStatusTimerRef.current) {
      clearTimeout(seriesSubtitleStatusTimerRef.current)
      seriesSubtitleStatusTimerRef.current = null
    }
    if (window.controlsTimeout) {
      clearTimeout(window.controlsTimeout)
    }
    if (reverseRafRef.current !== null) {
      cancelAnimationFrame(reverseRafRef.current)
      reverseRafRef.current = null
    }
    if (subtitleRafRef.current !== null) {
      cancelAnimationFrame(subtitleRafRef.current)
      subtitleRafRef.current = null
    }
    if (speedToastRef.current) {
      speedToastRef.current.remove()
      speedToastRef.current = null
    }
    if (subtitleContainerRef.current) {
      subtitleContainerRef.current.remove()
      subtitleContainerRef.current = null
      subtitleDivRef.current = null
    }
    hideBufferingIndicator()

    subtitleCuesRef.current = []
    activeSubKeyRef.current = null
    activeSubtitleCueIndexRef.current = -1
    lastSeekPreviewBucketRef.current = null
    isPushToTalkActiveRef.current = false
    activeSpeakerIdRef.current = null
    autoSkipInFlightKeyRef.current = null
    setAutoSkipTransition(null)
    setSeriesSubtitleStatus(null)

    if (releaseMedia) {
      const doc = document as Document & {
        pictureInPictureElement?: Element | null
        exitPictureInPicture?: () => Promise<void>
      }
      if (doc.pictureInPictureElement === videoRef.current && doc.exitPictureInPicture) {
        doc.exitPictureInPicture().catch(() => {})
      }
      if (document.fullscreenElement === playerShellRef.current) {
        document.exitFullscreen().catch(() => {})
      }
      releaseMediaElement(audioRef.current)
      releaseMediaElement(videoRef.current)
    }
  }

  useEffect(() => {
    isPlayerClosingRef.current = false

    return () => {
      isPlayerClosingRef.current = true
      clearPlayerRuntimeWork(true)
      leaveRoom()
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
        videoSourceNodeRef.current = null
        audioSourceNodeRef.current = null
        bassFilterRef.current = null
        clarityFilterRef.current = null
        airFilterRef.current = null
        compressorRef.current = null
        limiterRef.current = null
        boostGainRef.current = null
        audioBoostChainConnectedRef.current = false
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('mycinema_fps_boost', fpsBoostEnabled.toString())
  }, [fpsBoostEnabled])

  useEffect(() => {
    setSeekPreviewImageSrc(null)
    setSeekPreviewLoading(false)
    lastSeekPreviewBucketRef.current = null
    seekPreviewThumbRequestRef.current += 1

    return () => {
      if (seekPreviewThumbTimerRef.current) {
        clearTimeout(seekPreviewThumbTimerRef.current)
        seekPreviewThumbTimerRef.current = null
      }
    }
  }, [currentVideo.file_path])

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
      .then(result => {
        if (isCancelled) return
        setIntroDbSegments((result?.segments || []).filter(segment =>
          Number.isFinite(segment.startSec) &&
          Number.isFinite(segment.endSec) &&
          segment.endSec > segment.startSec
        ))
      })
      .catch(err => {
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

  useEffect(() => {
    localStorage.setItem('mycinema_ai_sharpness', qualitySharpnessEnabled.toString())
  }, [qualitySharpnessEnabled])

  useEffect(() => {
    localStorage.setItem('mycinema_ai_vibrance', qualityVibranceEnabled.toString())
  }, [qualityVibranceEnabled])

  useEffect(() => {
    localStorage.setItem('mycinema_audio_boost', audioBoostEnabled.toString())
  }, [audioBoostEnabled])

  useEffect(() => {
    localStorage.setItem('mycinema_audio_boost_profile', audioBoostProfile)
  }, [audioBoostProfile])

  useEffect(() => {
    localStorage.setItem('mycinema_audio_boost_intensity', audioBoostIntensity)
  }, [audioBoostIntensity])

  useEffect(() => {
    localStorage.setItem(INTRODB_AUTO_SKIP_STORAGE_KEY, autoSkipIntroOutroEnabled.toString())
  }, [autoSkipIntroOutroEnabled])

  useEffect(() => {
    if (!performanceNotice.show) return

    const timer = setTimeout(() => {
      setPerformanceNotice(prev => ({ ...prev, show: false }))
    }, 2600)

    return () => clearTimeout(timer)
  }, [performanceNotice.id, performanceNotice.show])

  useEffect(() => {
    if (!highSpeedPlaybackActive || !fpsBoostEnabled) {
      setHighSpeedPerformanceMode(false)
      highSpeedNoticeLockRef.current = false
      highSpeedQualityRef.current = null
      return
    }
  }, [fpsBoostEnabled, highSpeedPlaybackActive])

  useEffect(() => {
    if (!isPlaying || !highSpeedPlaybackActive || !fpsBoostEnabled || highSpeedMotionPaused) {
      highSpeedQualityRef.current = null
      return
    }

    const timer = setInterval(() => {
      const videoEl = videoRef.current as (HTMLVideoElement & {
        getVideoPlaybackQuality?: () => { droppedVideoFrames?: number; totalVideoFrames?: number }
      }) | null
      if (!videoEl || typeof videoEl.getVideoPlaybackQuality !== 'function') return

      const quality = videoEl.getVideoPlaybackQuality()
      const dropped = quality.droppedVideoFrames ?? 0
      const total = quality.totalVideoFrames ?? 0
      const previous = highSpeedQualityRef.current
      highSpeedQualityRef.current = { dropped, total }
      if (!previous) return

      const droppedDelta = dropped - previous.dropped
      const totalDelta = total - previous.total
      if (
        totalDelta >= HIGH_SPEED_MIN_FRAME_SAMPLE &&
        droppedDelta >= HIGH_SPEED_DROPPED_FRAME_LIMIT &&
        droppedDelta / totalDelta >= HIGH_SPEED_DROPPED_FRAME_RATIO
      ) {
        activateHighSpeedPerformanceMode('Dropped frames detected; FPS Boost eased while sharpness stays on')
      }
    }, HIGH_SPEED_QUALITY_SAMPLE_MS)

    return () => clearInterval(timer)
  }, [
    activateHighSpeedPerformanceMode,
    fpsBoostEnabled,
    highSpeedMotionPaused,
    highSpeedPlaybackActive,
    isPlaying
  ])

  // ─── Audio Boost Logic (Web Audio API) ──────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null)
  const videoSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const audioSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const bassFilterRef = useRef<BiquadFilterNode | null>(null)
  const lowMidFilterRef = useRef<BiquadFilterNode | null>(null)
  const clarityFilterRef = useRef<BiquadFilterNode | null>(null)
  const presenceFilterRef = useRef<BiquadFilterNode | null>(null)
  const airFilterRef = useRef<BiquadFilterNode | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)
  const limiterRef = useRef<DynamicsCompressorNode | null>(null)
  const boostGainRef = useRef<GainNode | null>(null)
  const audioBoostChainConnectedRef = useRef(false)

  const getActiveAudioChannelCount = () => {
    const fallback = embeddedAudio[0]?.channels || 2
    if (!selectedAudioId) return fallback

    const nativeMatch = selectedAudioId.match(/^nat-(\d+)$/)
    if (nativeMatch) {
      const nativeIndex = Number(nativeMatch[1])
      return embeddedAudio[nativeIndex]?.channels || fallback
    }

    const externalMatch = selectedAudioId.match(/^ext-(\d+)$/)
    if (externalMatch) {
      const streamIndex = Number(externalMatch[1])
      return embeddedAudio.find(track => track.index === streamIndex)?.channels || fallback
    }

    return fallback
  }

  useEffect(() => {
    const setParam = (param: AudioParam, value: number, time: number, ramp = 0.08) => {
      param.setTargetAtTime(value, time, ramp)
    }

    const initAudio = () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
        }
        const ctx = audioCtxRef.current

        // Create nodes if they don't exist
        if (!bassFilterRef.current) {
          bassFilterRef.current = ctx.createBiquadFilter()
          bassFilterRef.current.type = 'lowshelf'
          bassFilterRef.current.frequency.value = 115
        }

        if (!lowMidFilterRef.current) {
          lowMidFilterRef.current = ctx.createBiquadFilter()
          lowMidFilterRef.current.type = 'peaking'
          lowMidFilterRef.current.frequency.value = 360
          lowMidFilterRef.current.Q.value = 1.05
        }
        
        if (!clarityFilterRef.current) {
          clarityFilterRef.current = ctx.createBiquadFilter()
          clarityFilterRef.current.type = 'peaking'
          clarityFilterRef.current.frequency.value = 1750
          clarityFilterRef.current.Q.value = 1.0
        }

        if (!presenceFilterRef.current) {
          presenceFilterRef.current = ctx.createBiquadFilter()
          presenceFilterRef.current.type = 'peaking'
          presenceFilterRef.current.frequency.value = 3400
          presenceFilterRef.current.Q.value = 1.2
        }

        if (!airFilterRef.current) {
          airFilterRef.current = ctx.createBiquadFilter()
          airFilterRef.current.type = 'highshelf'
          airFilterRef.current.frequency.value = 8500
        }

        if (!compressorRef.current) {
          compressorRef.current = ctx.createDynamicsCompressor()
          compressorRef.current.attack.value = 0.008
          compressorRef.current.release.value = 0.18
        }

        if (!limiterRef.current) {
          limiterRef.current = ctx.createDynamicsCompressor()
          limiterRef.current.threshold.value = -3
          limiterRef.current.knee.value = 0
          limiterRef.current.ratio.value = 14
          limiterRef.current.attack.value = 0.002
          limiterRef.current.release.value = 0.08
        }

        if (!boostGainRef.current) {
          boostGainRef.current = ctx.createGain()
        }

        // Connect videoRef
        if (videoRef.current && !videoSourceNodeRef.current) {
          videoSourceNodeRef.current = ctx.createMediaElementSource(videoRef.current)
          videoSourceNodeRef.current.connect(bassFilterRef.current)
        }

        // Connect audioRef (for external tracks)
        if (audioRef.current && !audioSourceNodeRef.current) {
          audioSourceNodeRef.current = ctx.createMediaElementSource(audioRef.current)
          audioSourceNodeRef.current.connect(bassFilterRef.current)
        }

        if (!audioBoostChainConnectedRef.current) {
          // Chain: bass warmth -> mud cut -> dialogue lift -> presence -> air -> leveler -> limiter.
          bassFilterRef.current.connect(lowMidFilterRef.current)
          lowMidFilterRef.current.connect(clarityFilterRef.current)
          clarityFilterRef.current.connect(presenceFilterRef.current)
          presenceFilterRef.current.connect(airFilterRef.current)
          airFilterRef.current.connect(compressorRef.current)
          compressorRef.current.connect(limiterRef.current)
          limiterRef.current.connect(boostGainRef.current)
          boostGainRef.current.connect(ctx.destination)
          audioBoostChainConnectedRef.current = true
        }

        if (ctx.state === 'suspended') {
          ctx.resume()
        }
      } catch (e) {
        console.error('Audio Boost initialization failed:', e)
      }
    }

    if (isPlaying && audioBoostEnabled) {
      initAudio()
    }

    if (audioCtxRef.current) {
      const now = audioCtxRef.current.currentTime
      const profile = AUDIO_BOOST_PROFILES[audioBoostProfile]
      const intensity = AUDIO_BOOST_INTENSITIES[audioBoostIntensity]
      const active = audioBoostEnabled
      const intensityAmount = active ? intensity.amount : 0
      const channelCount = getActiveAudioChannelCount()
      const surroundDialogLift = active && channelCount >= 6 ? 1.18 : 1
      const scaledGain = (value: number) => value * intensityAmount
      const scaledOutputGain = active
        ? 1 + ((profile.outputGain - 1) * intensity.outputScale) + (channelCount >= 6 ? 0.04 : 0)
        : 1.0
      const scaledThreshold = active
        ? profile.compressorThreshold + ((1 - intensity.amount) * 8)
        : 0

      if (bassFilterRef.current) {
        setParam(bassFilterRef.current.gain, scaledGain(profile.bassGain), now)
      }
      if (lowMidFilterRef.current) {
        setParam(lowMidFilterRef.current.gain, scaledGain(profile.lowMidGain), now)
      }
      if (clarityFilterRef.current) {
        setParam(clarityFilterRef.current.gain, scaledGain(profile.dialogGain * surroundDialogLift), now)
      }
      if (presenceFilterRef.current) {
        setParam(presenceFilterRef.current.gain, scaledGain(profile.presenceGain * surroundDialogLift), now)
      }
      if (airFilterRef.current) {
        setParam(airFilterRef.current.gain, scaledGain(profile.airGain), now)
      }
      if (compressorRef.current) {
        setParam(compressorRef.current.threshold, scaledThreshold, now)
        setParam(compressorRef.current.knee, active ? profile.compressorKnee : 0, now)
        setParam(compressorRef.current.ratio, active ? 1 + ((profile.compressorRatio - 1) * intensity.amount) : 1, now)
        setParam(compressorRef.current.attack, active ? profile.compressorAttack : 0.003, now)
        setParam(compressorRef.current.release, active ? profile.compressorRelease : 0.25, now)
      }
      if (limiterRef.current) {
        setParam(limiterRef.current.threshold, active ? profile.limiterThreshold : 0, now)
        setParam(limiterRef.current.ratio, active ? 14 : 1, now)
      }
      if (boostGainRef.current) {
        setParam(boostGainRef.current.gain, scaledOutputGain, now)
      }
    }

    return () => {
      // We don't necessarily want to close the context on every effect run,
      // but we should ensure it's suspended if we're not playing.
      if (audioCtxRef.current && !isPlaying) {
        audioCtxRef.current.suspend()
      }
    }
  }, [audioBoostEnabled, audioBoostProfile, audioBoostIntensity, isPlaying, selectedAudioId, embeddedAudio])

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
        audioCtxRef.current = null
      }
    }
  }, [])

  // Sync internal state when the video prop changes (e.g. user opens a new file while player is already open)
  // This ensures that switching from one external file to another (both with ID -1) triggers a re-load.
  useEffect(() => {
    setCurrentVideo(video)
  }, [video])

  const handleOpenFolder = () => {
    window.api.openFolder(currentVideo.file_path)
  }

  const handleToggleInfoPanel = async () => {
    setShowEpisodesPanel(false)
    if (!showInfoPanel && !mediaInfo) {
      setInfoLoading(true)
      const info = await window.api.getMediaInfo(currentVideo.file_path)
      setMediaInfo(info)
      setInfoLoading(false)
    }
    setShowInfoPanel(p => !p)
  }

  const checkNextEpisode = async (video: Video) => {
    if (video.type === 'series' && video.series_name) {
      const episodes: Video[] = await window.api.getSeriesInfo(video.series_name)
      setSeriesEpisodes(episodes)
      const currentIndex = episodes.findIndex(e => e.id === video.id)
      setHasNextEpisode(currentIndex !== -1 && currentIndex < episodes.length - 1)
    } else {
      setSeriesEpisodes([])
      setHasNextEpisode(false)
    }
  }

  const formatTrackLabel = (track: any, defaultIndex: number) => {
    let langName = ''
    if (track.language && track.language !== 'und' && track.language !== 'Unknown') {
      try {
        const displayNames = new Intl.DisplayNames(['en'], { type: 'language' })
        langName = displayNames.of(track.language) || track.language
      } catch (e) {
        langName = track.language.toUpperCase()
      }
    }
    
    if (langName) {
      langName = langName.charAt(0).toUpperCase() + langName.slice(1)
    }

    const title = track.title
    
    if (title && title.toLowerCase() !== track.language?.toLowerCase() && title.toLowerCase() !== langName.toLowerCase()) {
      return langName ? `${langName} (${title})` : title
    }
    
    if (langName) return langName
    return `Track ${defaultIndex}`
  }

  const availableSubtitles: any[] = []
  let trackIdx = 0
  if (subtitlePath) {
    availableSubtitles.push({ idx: trackIdx++, id: 'external-0', label: 'External SRT' })
  }
  embeddedSubs.forEach((sub) => {
    availableSubtitles.push({ idx: trackIdx++, id: `embedded-${sub.index}`, label: formatTrackLabel(sub, sub.index) })
  })

  const availableAudio = React.useMemo(() => {
    if (!hasVideoMetadata) return []

    const arr: any[] = []
    if (audioTracks.length > 0) {
      audioTracks.forEach((t, i) => {
        arr.push({ id: `nat-${i}`, index: i, native: true, label: formatTrackLabel(embeddedAudio[i] || t, i + 1) })
      })
      embeddedAudio.slice(audioTracks.length).forEach((t, i) => {
        arr.push({ id: `ext-${t.index}`, index: t.index, native: false, label: formatTrackLabel(t, audioTracks.length + i + 1) })
      })
    } else if (embeddedAudio.length > 0) {
      embeddedAudio.forEach((t, i) => {
        arr.push({ id: `ext-${t.index}`, index: t.index, native: false, label: formatTrackLabel(t, i + 1) })
      })
    }
    return arr
  }, [embeddedAudio, audioTracks, hasVideoMetadata])

  const primeNativeAudioTrack = () => {
    const videoEl = videoRef.current
    if (!videoEl || videoEl.readyState < 1) return

    try {
      const targetTime = Math.min(
        Math.max(videoEl.currentTime + 0.001, 0),
        Number.isFinite(videoEl.duration) ? Math.max(videoEl.duration - 0.001, 0) : videoEl.currentTime + 0.001
      )
      videoEl.currentTime = targetTime
    } catch (error) {
      console.warn('Native audio prime failed:', error)
    }
  }

  const applyStartupResumeTime = () => {
    const videoEl = videoRef.current
    if (!videoEl) return

    const rawTargetTime = Math.max(0, startupResumeTimeRef.current || 0)
    if (rawTargetTime <= 0) return

    const boundedTargetTime = Number.isFinite(videoEl.duration) && videoEl.duration > 0
      ? Math.min(rawTargetTime, Math.max(videoEl.duration - 0.001, 0))
      : rawTargetTime

    videoEl.currentTime = boundedTargetTime
    setCurrentTime(boundedTargetTime)
    timeRef.current = boundedTargetTime
  }

  const releaseStartupVideoPlayback = async (token: number) => {
    const videoEl = videoRef.current
    if (!videoEl || token !== startupPlaybackTokenRef.current || !startupPlaybackPendingRef.current) return

    startupPlaybackPendingRef.current = false
    startupPlaybackLaunchingRef.current = false
    applyStartupResumeTime()

    try {
      await videoEl.play()
      if (audioCtxRef.current?.state === 'suspended') {
        await audioCtxRef.current.resume()
      }
    } catch (error) {
      console.error('Startup video play failed:', error)
    }
  }

  const prepareExternalAudioTrack = (
    trackIndex: number,
    time: number,
    isCurrentRequest: () => boolean
  ): Promise<boolean> => {
    const audioEl = audioRef.current
    if (!audioEl || !isCurrentRequest()) return Promise.resolve(false)

    const safeTime = Math.max(0, time || 0)
    lastSeekTimeRef.current = safeTime
    setLastSeekTime(safeTime)
    audioEl.pause()
    audioEl.volume = volume
    audioEl.playbackRate = playbackRate
    audioEl.src = `audio://file/${encodeURIComponent(currentVideo.file_path)}?track=${trackIndex}&time=${safeTime}`

    return new Promise((resolve) => {
      let settled = false
      const finish = (ready: boolean) => {
        if (settled) return
        settled = true
        audioEl.removeEventListener('canplay', handleReady)
        audioEl.removeEventListener('loadeddata', handleReady)
        audioEl.removeEventListener('error', handleError)
        resolve(ready && isCurrentRequest())
      }
      const handleReady = () => finish(true)
      const handleError = () => finish(false)

      audioEl.addEventListener('canplay', handleReady, { once: true })
      audioEl.addEventListener('loadeddata', handleReady, { once: true })
      audioEl.addEventListener('error', handleError, { once: true })
      audioEl.load()
    })
  }

  const startStartupExternalAudioPlayback = async (trackIndex: number, token: number) => {
    const videoEl = videoRef.current
    const audioEl = audioRef.current
    if (!videoEl || !audioEl || token !== startupPlaybackTokenRef.current || !startupPlaybackPendingRef.current) return

    startupExternalAudioBarrierRef.current = true
    videoEl.pause()
    applyStartupResumeTime()

    const ready = await prepareExternalAudioTrack(
      trackIndex,
      startupResumeTimeRef.current,
      () => token === startupPlaybackTokenRef.current
    )
    if (!ready || token !== startupPlaybackTokenRef.current) {
      startupExternalAudioBarrierRef.current = false
      await releaseStartupVideoPlayback(token)
      return
    }

    startupPlaybackPendingRef.current = false
    startupPlaybackLaunchingRef.current = false
    startupDriftCorrectionUntilRef.current = Date.now() + 5000
    applyStartupResumeTime()

    try {
      await Promise.allSettled([audioEl.play(), videoEl.play()])
      if (audioCtxRef.current?.state === 'suspended') {
        await audioCtxRef.current.resume()
      }
    } catch (error) {
      console.error('Startup external audio sync play failed:', error)
    } finally {
      startupExternalAudioBarrierRef.current = false
    }
  }

  const startExternalAudioTrack = (trackIndex: number, time: number, shouldPlay: boolean) => {
    const audioEl = audioRef.current
    if (!audioEl) return

    const safeTime = Math.max(0, time || 0)
    lastSeekTimeRef.current = safeTime
    setLastSeekTime(safeTime)
    audioEl.pause()
    audioEl.volume = volume
    audioEl.playbackRate = playbackRate
    audioEl.src = `audio://file/${encodeURIComponent(currentVideo.file_path)}?track=${trackIndex}&time=${safeTime}`
    audioEl.load()

    if (shouldPlay) {
      audioEl.play().catch(e => console.log('Audio play failed:', e))
    }
  }

  const syncSelectedExternalAudio = async (
    time: number,
    shouldPlay: boolean,
    options: { keepVideoPlayingWhilePreparing?: boolean } = {}
  ) => {
    const trackObj = availableAudio.find(a => a.id === selectedAudioId)
    const videoEl = videoRef.current
    const audioEl = audioRef.current

    if (!trackObj || trackObj.native || !videoEl || !audioEl) return

    const syncToken = ++externalAudioSeekTokenRef.current
    externalAudioSeekBarrierRef.current = true
    hideBufferingIndicator()
    audioEl.pause()
    const keepVideoPlaying = shouldPlay && options.keepVideoPlayingWhilePreparing
    if (keepVideoPlaying) {
      videoEl.play().catch(e => console.log('Video resume while audio sync prepares failed:', e))
      setIsPlaying(true)
    } else {
      videoEl.pause()
    }

    const ready = await prepareExternalAudioTrack(
      trackObj.index,
      time,
      () => syncToken === externalAudioSeekTokenRef.current
    )
    if (!ready || syncToken !== externalAudioSeekTokenRef.current) {
      externalAudioSeekBarrierRef.current = false
      if (shouldPlay && syncToken === externalAudioSeekTokenRef.current) {
        videoEl.play().catch(e => console.log('Video resume after audio seek failed:', e))
      }
      return
    }

    startupDriftCorrectionUntilRef.current = Date.now() + 3000
    if (!shouldPlay) {
      externalAudioSeekBarrierRef.current = false
      return
    }

    try {
      if (keepVideoPlaying) {
        await audioEl.play()
      } else {
        await Promise.allSettled([audioEl.play(), videoEl.play()])
      }
    } finally {
      externalAudioSeekBarrierRef.current = false
    }
  }

  const getSelectedExternalAudioTrack = () => {
    const trackObj = availableAudio.find(a => a.id === selectedAudioId)
    return trackObj && !trackObj.native ? trackObj : null
  }

  const resumeNativeVideoAfterSeek = (shouldResume: boolean) => {
    const videoEl = videoRef.current
    if (!shouldResume || !videoEl || getSelectedExternalAudioTrack()) return

    videoEl.play().catch(e => console.log('Video resume after seek failed:', e))
    setIsPlaying(true)
  }

  useEffect(() => {
    if (availableAudio.length > 0) {
      if (!availableAudio.find(a => a.id === selectedAudioId)) {
        const seriesKey = currentVideo.type === 'series' && currentVideo.series_name ? currentVideo.series_name : 'global'
        const savedPref = localStorage.getItem(`mycinema_audio_pref_${seriesKey}`)
        
        let target = availableAudio[0]
        if (savedPref) {
           const match = availableAudio.find(a => a.label === savedPref)
           if (match) target = match
        }
        
        setSelectedAudioId(target.id)
        
        if (!target.native) {
          if (videoRef.current) videoRef.current.muted = true
          if (audioRef.current && videoRef.current) {
            const time = videoRef.current.currentTime
            startExternalAudioTrack(target.index, time, !videoRef.current.paused)
          }
        } else {
           if (videoRef.current && (videoRef.current as any).audioTracks) {
              const tracks = (videoRef.current as any).audioTracks
              for (let i = 0; i < tracks.length; i++) {
                tracks[i].enabled = i === target.index
              }
           }
           if (videoRef.current) {
             videoRef.current.muted = volume === 0
             setTimeout(primeNativeAudioTrack, 60)
           }
        }
      }
    }
  }, [availableAudio, selectedAudioId, currentVideo.file_path, currentVideo.series_name, volume, playbackRate])

  useEffect(() => {
    if (!hasVideoMetadata || !audioProbeReady || !startupProgressReady || !startupPlaybackPendingRef.current || startupPlaybackLaunchingRef.current) return

    const token = startupPlaybackTokenRef.current
    const seriesKey = currentVideo.type === 'series' && currentVideo.series_name ? currentVideo.series_name : 'global'
    const savedPref = localStorage.getItem(`mycinema_audio_pref_${seriesKey}`)
    let target = availableAudio[0] || null

    if (savedPref) {
      const match = availableAudio.find(a => a.label === savedPref)
      if (match) target = match
    }

    if (!target) {
      startupPlaybackLaunchingRef.current = true
      void releaseStartupVideoPlayback(token)
      return
    }

    startupPlaybackLaunchingRef.current = true
    if (selectedAudioId !== target.id) {
      setSelectedAudioId(target.id)
    }

    if (target.native) {
      if (videoRef.current && (videoRef.current as any).audioTracks) {
        const tracks = (videoRef.current as any).audioTracks
        for (let i = 0; i < tracks.length; i++) {
          tracks[i].enabled = i === target.index
        }
      }
      if (videoRef.current) {
        videoRef.current.muted = volume === 0
        setTimeout(primeNativeAudioTrack, 60)
      }
      void releaseStartupVideoPlayback(token)
      return
    }

    if (videoRef.current) {
      videoRef.current.muted = true
    }
    void startStartupExternalAudioPlayback(target.index, token)
  }, [availableAudio, audioProbeReady, currentVideo.series_name, currentVideo.type, hasVideoMetadata, selectedAudioId, startupProgressReady, volume])

  useEffect(() => {
    if (seekPopup.show) {
      const timer = setTimeout(() => {
        setSeekPopup(prev => ({ ...prev, show: false }))
      }, 1300)
      return () => clearTimeout(timer)
    }
  }, [seekPopup.id, seekPopup.show])

  useEffect(() => {
    let isCancelled = false
    let metadataTrackLoader: (() => void) | null = null
    const startupVideoEl = videoRef.current
    clearPlayerRuntimeWork(false)
    const sessionToken = playerSessionTokenRef.current

    const fetchProgress = async () => {
      const progress = await window.api.getVideoProgress(currentVideo.id)
      if (isCancelled || isPlayerClosingRef.current || sessionToken !== playerSessionTokenRef.current) return
      let targetTime = progress?.last_watched_time || 0
      
      if (progress?.completed) {
        targetTime = 0
      }
      
      if (forceRestart || forceRestartRef.current) {
        targetTime = 0
        forceRestartRef.current = false
        setForceRestart(false)
      }

      startupResumeTimeRef.current = Math.max(0, targetTime)

      if (videoRef.current && targetTime > 0 && videoRef.current.readyState >= 1) {
        applyStartupResumeTime()
      }

      if (!isCancelled) setStartupProgressReady(true)
    }

    const fetchMediaTracks = async () => {
      const srt = await window.api.getSubtitlePath(currentVideo.file_path)
      if (isCancelled || isPlayerClosingRef.current || sessionToken !== playerSessionTokenRef.current) return
      if (srt) setSubtitlePath(srt)
      else setSubtitlePath(null)

      try {
        const [embeddedS, embeddedA] = await Promise.all([
           window.api.getEmbeddedSubtitles(currentVideo.file_path),
            window.api.getEmbeddedAudio(currentVideo.file_path)
        ])
        if (isCancelled || isPlayerClosingRef.current || sessionToken !== playerSessionTokenRef.current) return
        setEmbeddedSubs(embeddedS || [])
        setEmbeddedAudio(embeddedA || [])
        setAudioProbeReady(true)

        const seriesKey = getPreferenceSeriesKey(currentVideo)
        const savedSubPref = localStorage.getItem(`mycinema_sub_pref_${seriesKey}`)
        const seriesSubtitleAutoLoad = localStorage.getItem(getSeriesSubtitleAutoLoadStorageKey(seriesKey))
        let restoredId = null
        
        if (srt && currentVideo.type === 'series' && seriesSubtitleAutoLoad === SERIES_SUBTITLE_AUTO_LOAD_VALUE && savedSubPref !== 'Off') {
          restoredId = 'external-0'
        } else if (savedSubPref && savedSubPref !== 'Off') {
          const tempSubs: any[] = []
          if (srt) tempSubs.push({ id: 'external-0', label: 'External SRT' })
          for (const sub of (embeddedS || [])) {
            tempSubs.push({ id: `embedded-${sub.index}`, label: formatTrackLabel(sub, sub.index) })
          }
          const match = tempSubs.find(s => s.label === savedSubPref)
          if (match) restoredId = match.id
        }

        if (restoredId) {
          await selectSubtitleTrack(restoredId, {
            closeMenu: false,
            persistPreference: false,
            externalSubtitlePath: srt
          })
        } else {
          clearActiveSubtitleSelection(false)
        }
      } catch (err) {
        console.error('Failed to get embedded tracks:', err)
        if (!isCancelled) setAudioProbeReady(true)
      } finally {
      }
    }

    // ── Reset external audio to prevent stale audio bleed on episode switch ──
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
    }
    lastSeekTimeRef.current = 0
    setLastSeekTime(0)
    startupPlaybackTokenRef.current += 1
    startupPlaybackPendingRef.current = true
    startupPlaybackLaunchingRef.current = false
    startupResumeTimeRef.current = 0
    startupExternalAudioBarrierRef.current = false
    startupDriftCorrectionUntilRef.current = 0
    lastRelaxedAudioSyncCheckRef.current = 0
    externalAudioSeekBarrierRef.current = false
    externalAudioSeekTokenRef.current = 0
    suppressNextSeekSyncRef.current = false
    // Reset audio track state so the availableAudio effect re-selects properly
    setSelectedAudioId('')
    setAudioTracks([])
    setHasVideoMetadata(false)
    setAudioProbeReady(false)
    setStartupProgressReady(false)
    setEmbeddedAudio([])
    setEmbeddedSubs([])
    clearActiveSubtitleSelection(false)
    setConvertedSubPaths(new Map())

    fetchProgress()
    checkNextEpisode(currentVideo)
    setIsPlaying(false)
    if (startupVideoEl) {
      startupVideoEl.volume = volume
      startupVideoEl.muted = false
      startupVideoEl.load()

      metadataTrackLoader = () => {
        applyStartupResumeTime()
        void fetchMediaTracks()
      }

      if (startupVideoEl.readyState >= 1) {
        metadataTrackLoader()
      } else {
        startupVideoEl.addEventListener('loadedmetadata', metadataTrackLoader, { once: true })
      }
    }

    // Auto-enter fullscreen on first mount
    if (!document.fullscreenElement && playerShellRef.current) {
      playerShellRef.current.requestFullscreen().catch(() => {})
    }

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      isCancelled = true
      if (startupVideoEl && metadataTrackLoader) {
        startupVideoEl.removeEventListener('loadedmetadata', metadataTrackLoader)
      }
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [currentVideo.id, currentVideo.file_path])

  useEffect(() => {
    let isMounted = true

    window.api.isFullscreen()
      .then((windowFullscreen) => {
        if (isMounted) setIsWindowFullscreen(windowFullscreen)
      })
      .catch(() => {})

    const unsubscribe = window.api.onFullscreenChanged(setIsWindowFullscreen)
    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const videoEl = videoRef.current
    const doc = document as Document & {
      pictureInPictureEnabled?: boolean
      pictureInPictureElement?: Element | null
      exitPictureInPicture?: () => Promise<void>
    }
    const canUsePiP = !!(
      videoEl &&
      doc.pictureInPictureEnabled &&
      typeof (videoEl as HTMLVideoElement & { requestPictureInPicture?: () => Promise<PictureInPictureWindow> }).requestPictureInPicture === 'function'
    )

    setIsPiPSupported(canUsePiP)
    setIsPiPActive(doc.pictureInPictureElement === videoEl)
    if (!videoEl || !canUsePiP) return

    const handleEnterPiP = () => setIsPiPActive(true)
    const handleLeavePiP = () => setIsPiPActive(false)

    videoEl.addEventListener('enterpictureinpicture', handleEnterPiP)
    videoEl.addEventListener('leavepictureinpicture', handleLeavePiP)

    return () => {
      videoEl.removeEventListener('enterpictureinpicture', handleEnterPiP)
      videoEl.removeEventListener('leavepictureinpicture', handleLeavePiP)
      if (doc.pictureInPictureElement === videoEl && doc.exitPictureInPicture) {
        doc.exitPictureInPicture().catch(() => {})
      }
    }
  }, [currentVideo.id, currentVideo.file_path])

  // ─────────────────────────────────────────────────────────────────────────────
  // ── Imperative subtitle overlay (matches the working 2x Speed Toast pattern) ──
  // ─────────────────────────────────────────────────────────────────────────────
  const subtitleContainerRef = useRef<HTMLDivElement | null>(null)
  const subtitleBottom = showControls ? '136px' : '48px'

  useEffect(() => {
    // Clean up existing container if it exists
    if (subtitleContainerRef.current) {
      subtitleContainerRef.current.remove()
      subtitleContainerRef.current = null
      subtitleDivRef.current = null
    }

    if (activeSubKey !== null && videoRef.current?.parentElement) {
      const parent = videoRef.current.parentElement

      // Keep subtitles above the video while leaving the controls/seek preview layer on top.
      const container = document.createElement('div')
      container.style.cssText = [
        'position:fixed',
        `bottom:${subtitleBottom}`,
        'left:0',
        'right:0',
        'display:flex',
        'justify-content:center',
        'pointer-events:none',
        `z-index:${SUBTITLE_OVERLAY_Z_INDEX}`,
        'will-change:transform',
        'transition:bottom 0.3s ease',
        `bottom:${subtitleBottom}`,
      ].join(';')

      if (subtitleLoading) {
        const loadingSpan = document.createElement('span')
        loadingSpan.style.cssText = [
          "font-family:'Inter',system-ui,sans-serif",
          'font-size:14px',
          'color:rgba(255,255,255,0.5)',
          'background:rgba(0,0,0,0.5)',
          'padding:4px 12px',
          'border-radius:999px',
        ].join(';')
        loadingSpan.textContent = '⏳ Loading subtitles…'
        container.appendChild(loadingSpan)
      } else {
        const textDiv = document.createElement('div')
        textDiv.style.cssText = [
          "font-family:'Inter',system-ui,sans-serif",
          'font-size:26px',
          'font-weight:600',
          'color:white',
          'background-color:rgba(0, 0, 0, 0.65)',
          'padding:6px 22px',
          'border-radius:12px',
          'backdrop-filter:blur(8px)',
          'border:1px solid rgba(255, 255, 255, 0.1)',
          'text-shadow:0px 2px 4px rgba(0,0,0,0.5)',
          'text-align:center',
          'max-width:85%',
          'line-height:1.4',
          'white-space:pre-line',
          'display:none',
        ].join(';')
        container.appendChild(textDiv)
        subtitleDivRef.current = textDiv
      }

      parent.appendChild(container)
      subtitleContainerRef.current = container

      return () => {
        container.remove()
        if (subtitleContainerRef.current === container) {
          subtitleContainerRef.current = null
          subtitleDivRef.current = null
        }
      }
    }
  }, [activeSubKey, subtitleLoading]) // Re-run when track changes or loading status changes

  // Update subtitle position when controls show/hide
  useEffect(() => {
    if (subtitleContainerRef.current) {
      subtitleContainerRef.current.style.bottom = subtitleBottom
    }
  }, [subtitleBottom])

  useEffect(() => {
    if (activeSubKey !== null && videoRef.current) {
      renderSubtitleAtTime(videoRef.current.currentTime)
    }
  }, [activeSubKey, subtitleOffsetMs, subtitleLoading])

  useEffect(() => {
    if (activeSubKey === null || subtitleLoading || !isPlaying) {
      if (subtitleRafRef.current !== null) {
        cancelAnimationFrame(subtitleRafRef.current)
        subtitleRafRef.current = null
      }
      return
    }

    const renderLoop = () => {
      if (videoRef.current) {
        renderSubtitleAtTime(videoRef.current.currentTime)
      }
      subtitleRafRef.current = requestAnimationFrame(renderLoop)
    }

    subtitleRafRef.current = requestAnimationFrame(renderLoop)

    return () => {
      if (subtitleRafRef.current !== null) {
        cancelAnimationFrame(subtitleRafRef.current)
        subtitleRafRef.current = null
      }
    }
  }, [activeSubKey, subtitleLoading, isPlaying])

  useEffect(() => {
    if (!showMediaMenu || showOnlineSearch) {
      setShowSubtitleSyncPanel(false)
    }
  }, [showMediaMenu, showOnlineSearch])

  // ─────────────────────────────────────────────────────────────────────────────
  // ── Subtitle track state ──
  // ─────────────────────────────────────────────────────────────────────────────


  const showVolumeToast = (vol: number, muted: boolean) => {
    setVolumePopup({ show: true, volume: vol, isMuted: muted, id: Date.now() })
    setTimeout(() => {
      setVolumePopup(prev => prev.id === Date.now() ? { ...prev, show: false } : prev)
    }, 1000)
  }

  const showSpeedToast = (rate: number) => {
    const id = Date.now()
    setSpeedPopup({ show: true, rate, id })
    setTimeout(() => {
      setSpeedPopup(prev => prev.id === id ? { ...prev, show: false } : prev)
    }, 1000)
  }

  const showTrackToast = (type: 'audio' | 'subtitle' | 'subtitleSync' | 'aspect' | 'skip', text: string) => {
    const id = Date.now()
    setTrackPopup({ show: true, type, text, id })
    setTimeout(() => {
      setTrackPopup(prev => prev.id === id ? { ...prev, show: false } : prev)
    }, 1500)
  }

  const updateSeriesSubtitleStatus = (status: SeriesSubtitleStatus, autoClear = false) => {
    if (seriesSubtitleStatusTimerRef.current) {
      clearTimeout(seriesSubtitleStatusTimerRef.current)
      seriesSubtitleStatusTimerRef.current = null
    }

    setSeriesSubtitleStatus(status)

    if (autoClear) {
      seriesSubtitleStatusTimerRef.current = setTimeout(() => {
        setSeriesSubtitleStatus(null)
        seriesSubtitleStatusTimerRef.current = null
      }, 6500)
    }
  }

  const clearRenderedSubtitle = () => {
    activeSubtitleCueIndexRef.current = -1
    if (subtitleDivRef.current) {
      subtitleDivRef.current.textContent = ''
      subtitleDivRef.current.style.display = 'none'
    }
  }

  const getSubtitleSourceId = (key: string | null, externalPathOverride?: string | null) => {
    if (key === null) return null
    if (key === 'external-0') {
      const resolvedPath = externalPathOverride ?? subtitlePath ?? currentVideo.file_path
      return `external:${resolvedPath}`
    }

    if (key.startsWith('embedded-')) {
      return `embedded:${key.replace('embedded-', '')}`
    }

    return key
  }

  const applySubtitleOffset = (
    nextOffsetMs: number,
    options: { persist?: boolean; showToast?: boolean } = {}
  ) => {
    const clamped = clampSubtitleOffsetMs(nextOffsetMs)
    subtitleOffsetRef.current = clamped
    setSubtitleOffsetMs(clamped)
    activeSubtitleCueIndexRef.current = -1

    if (options.persist !== false && subtitleOffsetStorageKeyRef.current) {
      localStorage.setItem(subtitleOffsetStorageKeyRef.current, String(clamped))
    }

    if (options.showToast) {
      showTrackToast('subtitleSync', formatSubtitleOffsetMs(clamped))
    }
  }

  const loadSubtitleOffsetForTrack = (key: string | null, externalPathOverride?: string | null) => {
    const sourceId = getSubtitleSourceId(key, externalPathOverride)
    subtitleOffsetStorageKeyRef.current = sourceId
      ? createSubtitleSyncStorageKey(currentVideo.file_path, sourceId)
      : null

    const storedOffset = subtitleOffsetStorageKeyRef.current
      ? parseStoredSubtitleOffsetMs(localStorage.getItem(subtitleOffsetStorageKeyRef.current))
      : 0

    applySubtitleOffset(storedOffset, { persist: false })
  }

  const getSubtitleConversionCacheKey = (key: string, sourceFile: string) => {
    return key === 'external-0'
      ? `external:${sourceFile}`
      : `embedded:${currentVideo.file_path}:${key}`
  }

  const clearActiveSubtitleSelection = (closeMenu = true) => {
    activeSubKeyRef.current = null
    setActiveSubKey(null)
    setSubtitleLoading(false)
    setShowSubtitleSyncPanel(false)
    subtitleCuesRef.current = []
    loadSubtitleOffsetForTrack(null)
    clearRenderedSubtitle()
    if (closeMenu) setShowMediaMenu(false)
  }

  const nudgeSubtitleOffset = (deltaMs: number) => {
    if (activeSubKeyRef.current === null) return
    const nextOffset = subtitleOffsetRef.current + deltaMs
    applySubtitleOffset(nextOffset, { showToast: true })
  }

  const resetSubtitleOffset = () => {
    if (activeSubKeyRef.current === null && subtitleOffsetRef.current === 0) return
    applySubtitleOffset(0, { showToast: true })
  }

  const renderSubtitleAtTime = (playbackTime: number) => {
    if (!subtitleDivRef.current || activeSubKeyRef.current === null) return

    const { cue, index } = resolveSubtitleCue(
      subtitleCuesRef.current,
      playbackTime,
      subtitleOffsetRef.current,
      activeSubtitleCueIndexRef.current
    )

    activeSubtitleCueIndexRef.current = index

    const nextText = cue ? cue.text : ''
    if (subtitleDivRef.current.textContent !== nextText) {
      subtitleDivRef.current.textContent = nextText
      subtitleDivRef.current.style.display = nextText ? 'block' : 'none'
    }
  }

  const cycleAspectRatio = () => {
    if (playerShellRef.current && !document.fullscreenElement) {
      playerShellRef.current.requestFullscreen().catch((err) => console.log(err))
    }
    
    setAspectMode(prev => {
      const nextIdx = (ASPECT_MODES.indexOf(prev) + 1) % ASPECT_MODES.length;
      const mode = ASPECT_MODES[nextIdx];
      
      let label = 'Fit'
      if (mode === 'cover') label = 'Zoom'
      if (mode === 'fill') label = 'Stretch'
      
      showTrackToast('aspect', label)
      return mode;
    });
  }

  // Dedicated Keyboard Shortcuts Effect
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only block shortcuts for actual text inputs (not range sliders, checkboxes etc)
      const active = document.activeElement as HTMLInputElement | null
      if (active?.tagName === 'INPUT' && active?.type !== 'range') return

      if (!isHost && roomId !== null && ['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault()
        return
      }

      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code) || (roomId && e.code === 'KeyV')) e.preventDefault()

      if (roomId && e.code === 'KeyV' && !e.repeat) {
        beginPushToTalk()
        return
      }

      // Space hold = 2x speed
      if (e.code === 'Space' && !e.repeat) {
        spaceHoldTimerRef.current = setTimeout(() => {
          if (videoRef.current && !videoRef.current.paused) {
            setIsHolding2x(true)
            videoRef.current.playbackRate = 2
            if (audioRef.current) audioRef.current.playbackRate = 2
            if (isHost) broadcastState({ type: 'SPEED', time: videoRef.current?.currentTime || 0, rate: 2 });
            spaceHoldTimerRef.current = null
            // Imperatively inject toast into the fullscreen container so it is
            // always visible regardless of React stacking context or showControls.
            if (!speedToastRef.current) {
              // Inject keyframe animation once
              const styleId = '__speed_toast_style__'
              if (!document.getElementById(styleId)) {
                const s = document.createElement('style')
                s.id = styleId
                s.textContent = `
                  @keyframes _speedToastIn {
                    from { opacity:0; transform:translateY(-6px); }
                    to   { opacity:1; transform:translateY(0); }
                  }
                  .__speed_toast {
                    animation: _speedToastIn 0.18s ease-out forwards;
                  }
                `
                document.head.appendChild(s)
              }

              // Outer wrapper: full-width row, flex-centered — guarantees pixel-perfect centering
              const wrapper = document.createElement('div')
              wrapper.style.cssText = [
                'position:fixed',
                'top:40px',
                'left:0',
                'right:0',
                'display:flex',
                'justify-content:center',
                'z-index:2147483647',
                'pointer-events:none',
              ].join(';')

              const toast = document.createElement('div')
              toast.className = '__speed_toast'
              toast.style.cssText = [
                'background:rgba(0,0,0,0.5)',
                'backdrop-filter:blur(16px)',
                '-webkit-backdrop-filter:blur(16px)',
                'border:1px solid rgba(255,255,255,0.08)',
                'color:rgba(255,255,255,0.95)',
                'font-size:13px',
                'font-family:Inter,system-ui,sans-serif',
                'font-weight:700',
                'letter-spacing:0.04em',
                'padding:7px 16px',
                'border-radius:8px',
                'display:flex',
                'align-items:center',
                'gap:8px',
                'pointer-events:none',
                'box-shadow:0 8px 32px rgba(0,0,0,0.45)',
                'white-space:nowrap',
              ].join(';')
              toast.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.85">
                  <polygon points="13 19 22 12 13 5 13 19"></polygon>
                  <polygon points="2 19 11 12 2 5 2 19"></polygon>
                </svg>
                <span>2× Speed</span>
              `
              wrapper.appendChild(toast)
              ;(videoRef.current.parentElement || document.body).appendChild(wrapper)
              speedToastRef.current = wrapper
            }
          }
        }, 350)
      }

      switch(e.code) {
        case 'ArrowRight':
          if (!e.repeat) {
            const currentT = videoRef.current?.currentTime ?? 0
            const nextT = Math.min(videoRef.current?.duration || 0, currentT + 10)
            if (videoRef.current) {
              seekWasPlayingRef.current = !videoRef.current.paused
              pendingControlledSeekTimeRef.current = nextT
              pendingControlledSeekResumeRef.current = seekWasPlayingRef.current
              videoRef.current.currentTime = nextT
              timeRef.current = nextT
            }
            if (isHost) broadcastState({ type: 'SEEK', time: nextT });
            setSeekPopup({ show: true, text: '+10s', id: Date.now() })

            arrowHoldTimerRef.current = setTimeout(() => {
              seekPreviewRef.current = videoRef.current?.currentTime ?? 0
              setSeekPreview(seekPreviewRef.current)
              setShowControls(true)
              clearTimeout(window.controlsTimeout)
              if (seekPreviewIntervalRef.current) clearInterval(seekPreviewIntervalRef.current)
              seekPreviewIntervalRef.current = setInterval(() => {
                const dur = videoRef.current?.duration || 1
                // 10.0s per 100ms = 100x real-time speed
                seekPreviewRef.current = Math.min(dur, seekPreviewRef.current + 10.0)
                setSeekPreview(seekPreviewRef.current)
                // Drive the existing thumbnail preview to show frame at this timestamp
                const pct = (seekPreviewRef.current / dur) * 100
                setHoverTime(seekPreviewRef.current)
                setHoverPosition(pct)
              }, 100)
            }, 400)
          }
          break
        case 'ArrowLeft':
          if (!e.repeat) {
            const currentT = videoRef.current?.currentTime ?? 0
            const nextT = Math.max(0, currentT - 10)
            if (videoRef.current) {
              seekWasPlayingRef.current = !videoRef.current.paused
              pendingControlledSeekTimeRef.current = nextT
              pendingControlledSeekResumeRef.current = seekWasPlayingRef.current
              videoRef.current.currentTime = nextT
              timeRef.current = nextT
            }
            if (isHost) broadcastState({ type: 'SEEK', time: nextT });
            setSeekPopup({ show: true, text: '-10s', id: Date.now() })

            arrowHoldTimerRef.current = setTimeout(() => {
              seekPreviewRef.current = videoRef.current?.currentTime ?? 0
              setSeekPreview(seekPreviewRef.current)
              setShowControls(true)
              clearTimeout(window.controlsTimeout)
              if (seekPreviewIntervalRef.current) clearInterval(seekPreviewIntervalRef.current)
              seekPreviewIntervalRef.current = setInterval(() => {
                const dur = videoRef.current?.duration || 1
                // 10.0s per 100ms = 100x real-time speed
                seekPreviewRef.current = Math.max(0, seekPreviewRef.current - 10.0)
                setSeekPreview(seekPreviewRef.current)
                const pct = (seekPreviewRef.current / dur) * 100
                setHoverTime(seekPreviewRef.current)
                setHoverPosition(pct)
              }, 100)
            }, 400)
          }
          break
        case 'ArrowUp': {
          const nextUp = Math.min(1, volume + 0.05)
          setVolume(nextUp)
          if (videoRef.current) { videoRef.current.volume = nextUp; videoRef.current.muted = nextUp === 0; }
          showVolumeToast(nextUp, nextUp === 0)
          break
        }
        case 'ArrowDown': {
          const nextDown = Math.max(0, volume - 0.05)
          setVolume(nextDown)
          if (videoRef.current) { videoRef.current.volume = nextDown; videoRef.current.muted = nextDown === 0; }
          showVolumeToast(nextDown, nextDown === 0)
          break
        }
        case 'KeyM': {
          const nextM = volume === 0 ? 1 : 0
          setVolume(nextM)
          if (videoRef.current) { videoRef.current.volume = nextM; videoRef.current.muted = nextM === 0; }
          showVolumeToast(nextM, nextM === 0)
          break
        }
        case 'KeyF': toggleFullscreen(); break
        case 'KeyP': togglePictureInPicture(); break
        case 'KeyR': cycleAspectRatio(); break
        case 'KeyN': if (currentVideo.type === 'series' && hasNextEpisode) playNextEpisode(); break
        case 'KeyS':
          if (availableSubtitles.length > 0) {
            const subOptions = [
              { id: null, label: 'Off' },
              ...availableSubtitles.map(s => ({ id: s.id, label: s.label }))
            ]
            const currentIndex = subOptions.findIndex(o => o.id === activeSubKey)
            const next = subOptions[(currentIndex + 1) % subOptions.length]
            selectSubtitleTrack(next.id)
            showTrackToast('subtitle', next.label)
          } else {
            showTrackToast('subtitle', 'None Available')
          }
          break
        case 'KeyL':
          if (availableAudio.length > 1) {
            const currentIndex = availableAudio.findIndex(a => a.id === selectedAudioId)
            const nextIdx = (currentIndex + 1) % availableAudio.length
            const nextTrack = availableAudio[nextIdx]
            selectAudioTrack(nextTrack.id)
            showTrackToast('audio', nextTrack.label)
          } else if (availableAudio.length === 1) {
            showTrackToast('audio', availableAudio[0].label)
          } else {
            showTrackToast('audio', 'None Available')
          }
          break
        case 'BracketLeft':
          if (activeSubKeyRef.current !== null) {
            nudgeSubtitleOffset(-SUBTITLE_SYNC_FINE_STEP_MS)
          }
          break
        case 'BracketRight':
          if (activeSubKeyRef.current !== null) {
            nudgeSubtitleOffset(SUBTITLE_SYNC_FINE_STEP_MS)
          }
          break
        case 'Backslash':
          if (activeSubKeyRef.current !== null && subtitleOffsetRef.current !== 0) {
            resetSubtitleOffset()
          }
          break
        case 'Escape': onClose(); break
        case 'KeyI': handleToggleInfoPanel(); break
        case 'Equal':
        case 'NumpadAdd': {
          const nextRate = Math.min(5, Math.round((playbackRate + 0.1) * 10) / 10)
          changeSpeed(nextRate)
          showSpeedToast(nextRate)
          break
        }
        case 'Minus':
        case 'NumpadSubtract': {
          const nextRate = Math.max(0.1, Math.round((playbackRate - 0.1) * 10) / 10)
          changeSpeed(nextRate)
          showSpeedToast(nextRate)
          break
        }
      }
    }

    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLInputElement | null
      if (active?.tagName === 'INPUT' && active?.type !== 'range') return

      if (!isHost && roomId !== null && ['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault()
        return
      }

      // Space hold/tap logic on keyup
      if (e.code === 'Space') {
        if (spaceHoldTimerRef.current) { 
          clearTimeout(spaceHoldTimerRef.current); 
          spaceHoldTimerRef.current = null;
          togglePlay();
        } else if (isHolding2x) {
          setIsHolding2x(false)
          if (videoRef.current) videoRef.current.playbackRate = playbackRate
          if (audioRef.current) audioRef.current.playbackRate = playbackRate
          if (isHost) broadcastState({ type: 'SPEED', time: videoRef.current?.currentTime || 0, rate: playbackRate });
        }
        // Always remove the imperative toast on space release
        if (speedToastRef.current) {
          speedToastRef.current.remove()
          speedToastRef.current = null
        }
      }

      if (roomId && e.code === 'KeyV') {
        e.preventDefault()
        endPushToTalk()
      }

      // Cancel any pending arrow hold timer
      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        if (arrowHoldTimerRef.current) { clearTimeout(arrowHoldTimerRef.current); arrowHoldTimerRef.current = null; }
      }

      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        if (seekPreviewIntervalRef.current) { clearInterval(seekPreviewIntervalRef.current); seekPreviewIntervalRef.current = null; }
        if (seekPreview !== null) {
          const finalT = seekPreviewRef.current
          if (videoRef.current) {
            pendingControlledSeekTimeRef.current = finalT
            pendingControlledSeekResumeRef.current = seekWasPlayingRef.current
            videoRef.current.currentTime = finalT
            timeRef.current = finalT
            resumeNativeVideoAfterSeek(seekWasPlayingRef.current)
          }
          setSeekPreview(null)
          // Dismiss thumbnail preview
          setHoverTime(null)
          window.controlsTimeout = setTimeout(() => setShowControls(false), 3000)
        }
        setIsHolding2x(false)
        setIsHoldingRev2x(false)
      }
    }

    const handleGlobalMouseDown = (e: MouseEvent) => {
      // Mouse button 3 is the standard "Back" button on most mice
      if (e.button === 3) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    window.addEventListener('keyup', handleGlobalKeyUp)
    window.addEventListener('mousedown', handleGlobalMouseDown)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
      window.removeEventListener('keyup', handleGlobalKeyUp)
      window.removeEventListener('mousedown', handleGlobalMouseDown)
    }
  }, [currentVideo, hasNextEpisode, availableSubtitles, playbackRate, isHolding2x, isHoldingRev2x, volume, seekPreview, roomId, voiceEnabled, localPeerId, isHost, isWindowFullscreen])

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        if (!isHost && roomId !== null) return
        if (videoRef.current && videoRef.current.paused) {
          videoRef.current.play()
          setIsPlaying(true)
        }
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        if (!isHost && roomId !== null) return
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause()
          setIsPlaying(false)
        }
      })
    }
    return () => {
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', null)
          navigator.mediaSession.setActionHandler('pause', null)
        } catch (e) {
          // ignore
        }
      }
    }
  }, [isHost, roomId])

  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const time = videoRef.current.currentTime
        const total = videoRef.current.duration || 1
        const completed = time / total > 0.95
        
        timeRef.current = time
        durationRef.current = total
        
        window.api.updateVideoProgress(currentVideo.id, time, completed, false)
      }
    }, 5000)

    return () => {
      clearInterval(interval)
      const time = timeRef.current
      const total = durationRef.current || 1
      const completed = time / total > 0.95
      window.api.updateVideoProgress(currentVideo.id, time, completed, true)
    }
  }, [currentVideo.id])

  useEffect(() => {
    const driftInterval = setInterval(() => {
      if (isPlaying && videoRef.current && audioRef.current && audioRef.current.src) {
        const now = Date.now()
        const isStartupWindow = now < startupDriftCorrectionUntilRef.current
        if (!isStartupWindow) {
          if (now - lastRelaxedAudioSyncCheckRef.current < 2000) return
          lastRelaxedAudioSyncCheckRef.current = now
        }

        const expectedTime = videoRef.current.currentTime - lastSeekTimeRef.current
        if (expectedTime >= 0) {
          const drift = audioRef.current.currentTime - expectedTime
          const threshold = isStartupWindow ? 0.08 : 0.35
          if (Math.abs(drift) > threshold) {
            audioRef.current.currentTime = expectedTime
          }
        }
      }
    }, 150)
    return () => clearInterval(driftInterval)
  }, [isPlaying, lastSeekTime])

  const handleEnded = async () => {
    playNextEpisode()
  }

  const playNextEpisode = async () => {
    if (currentVideo.type === 'series' && currentVideo.series_name) {
      const episodes: Video[] = seriesEpisodes.length > 0 ? seriesEpisodes : await window.api.getSeriesInfo(currentVideo.series_name)
      const currentIndex = episodes.findIndex(e => e.id === currentVideo.id)
      if (currentIndex !== -1 && currentIndex < episodes.length - 1) {
        forceRestartRef.current = true
        setForceRestart(true)
        setCurrentVideo(episodes[currentIndex + 1])
      } else {
        onClose()
      }
    } else {
      onClose()
    }
  }

  const togglePlay = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation()
    if (!isHost && roomId !== null) return;
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
        setIsPlaying(true)
        if (isHost) broadcastState({ type: 'PLAY', time: videoRef.current.currentTime });
      } else {
        videoRef.current.pause()
        setIsPlaying(false)
        if (isHost) broadcastState({ type: 'PAUSE', time: videoRef.current.currentTime });
      }
    }
  }

  const handleContainerClick = (e: React.MouseEvent) => {
    if (wasHoldingRef.current) return

    // Safely enforce visibility extension when a user actively clicks any UI control buttons
    if ((e.target as HTMLElement).closest('.video-controls')) {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current)
        clickTimeoutRef.current = null
      }
      setShowControls(true)
      clearTimeout(window.controlsTimeout)
      window.controlsTimeout = setTimeout(() => setShowControls(false), 4000)
      return
    }

    const hadOpenPopup =
      showMediaMenu ||
      showOnlineSearch ||
      showSubtitleSyncPanel ||
      showSpeedMenu ||
      showAdvancedMenu ||
      showEpisodesPanel ||
      showInfoPanel ||
      showWatchTogetherState

    if (hadOpenPopup) {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current)
        clickTimeoutRef.current = null
      }
      setShowMediaMenu(false)
      setShowOnlineSearch(false)
      setShowSubtitleSyncPanel(false)
      setShowSpeedMenu(false)
      setShowAdvancedMenu(false)
      setShowEpisodesPanel(false)
      setShowInfoPanel(false)
      setShowWatchTogetherState(false)
      return
    }

    if (clickTimeoutRef.current) {
      // It's a double click!
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
      toggleFullscreen()
    } else {
      // First click!
      clickTimeoutRef.current = setTimeout(() => {
        togglePlay()
        clickTimeoutRef.current = null
      }, 300)
    }
  }

  const handlePointerDown = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.video-controls')) return
    
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current)
    wasHoldingRef.current = false
    
    holdTimeoutRef.current = setTimeout(() => {
      if (videoRef.current?.paused) return
      
      wasHoldingRef.current = true
      setIsHolding2x(true)
      
      if (videoRef.current) videoRef.current.playbackRate = 2
      if (audioRef.current) audioRef.current.playbackRate = 2
      if (isHost) broadcastState({ type: 'SPEED', time: videoRef.current?.currentTime || 0, rate: 2 });
    }, 450)
  }

  const handlePointerUpOrLeave = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current)
      holdTimeoutRef.current = null
    }

    if (wasHoldingRef.current) {
      setIsHolding2x(false)
      if (videoRef.current) videoRef.current.playbackRate = playbackRate
      if (audioRef.current) audioRef.current.playbackRate = playbackRate
      if (isHost) broadcastState({ type: 'SPEED', time: videoRef.current?.currentTime || 0, rate: playbackRate });
      
      setTimeout(() => {
        wasHoldingRef.current = false
      }, 50)
    }
  }

  const selectAudioTrack = (trackId: string) => {
    const trackObj = availableAudio.find(a => a.id === trackId)
    if (!trackObj) return

    const seriesKey = getPreferenceSeriesKey(currentVideo)
    localStorage.setItem(`mycinema_audio_pref_${seriesKey}`, trackObj.label)

    if (trackObj.native) {
      if (videoRef.current) {
        // @ts-ignore
        const tracks = videoRef.current.audioTracks
        if (tracks) {
          for (let i = 0; i < tracks.length; i++) {
            tracks[i].enabled = i === trackObj.index
          }
        }
        videoRef.current.muted = volume === 0
        setTimeout(primeNativeAudioTrack, 60)
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeAttribute('src')
        audioRef.current.load()
      }
    } else {
      if (videoRef.current) videoRef.current.muted = true
      if (audioRef.current && videoRef.current) {
        const time = videoRef.current.currentTime
        startExternalAudioTrack(trackObj.index, time, !videoRef.current.paused)
      }
    }
    
    setSelectedAudioId(trackId)
    setShowMediaMenu(false)
  }

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate)
    if (videoRef.current) videoRef.current.playbackRate = rate
    if (audioRef.current) audioRef.current.playbackRate = rate
    setShowSpeedMenu(false)
    if (isHost) {
      broadcastState({ type: 'SPEED', time: videoRef.current?.currentTime || 0, rate });
    }
  }

  const selectSubtitleTrack = async (
    key: string | null,
    options: {
      closeMenu?: boolean
      persistPreference?: boolean
      presetVttPath?: string | null
      externalSubtitlePath?: string | null
    } = {}
  ) => {
    const seriesKey = getPreferenceSeriesKey(currentVideo)
    const { closeMenu = true, persistPreference = true, presetVttPath = null, externalSubtitlePath } = options
    const loadToken = ++subtitleLoadTokenRef.current
    const sessionToken = playerSessionTokenRef.current

    if (key === null) {
      subtitleLoadTokenRef.current += 1
      if (persistPreference) {
        localStorage.setItem(`mycinema_sub_pref_${seriesKey}`, 'Off')
        localStorage.removeItem(getSeriesSubtitleAutoLoadStorageKey(seriesKey))
      }
      clearActiveSubtitleSelection(closeMenu)
      return
    }

    const trackObj = availableSubtitles.find(s => s.id === key)
    if (persistPreference) {
      const trackLabel = trackObj?.label || (key === 'external-0' ? 'External SRT' : key)
      localStorage.setItem(`mycinema_sub_pref_${seriesKey}`, trackLabel)
      if (key === 'external-0' && currentVideo.type === 'series') {
        localStorage.setItem(getSeriesSubtitleAutoLoadStorageKey(seriesKey), SERIES_SUBTITLE_AUTO_LOAD_VALUE)
      }
    }

    setActiveSubKey(key)
    setSubtitleLoading(true)
    if (closeMenu) setShowMediaMenu(false)
    activeSubKeyRef.current = key
    subtitleCuesRef.current = []
    loadSubtitleOffsetForTrack(key, externalSubtitlePath)
    clearRenderedSubtitle()

    try {
      const isExternal = key === 'external-0'
      const trackIndex = isExternal ? 0 : parseInt(key.replace('embedded-', ''), 10)
      const sourceFile = isExternal ? (externalSubtitlePath ?? subtitlePath ?? currentVideo.file_path) : currentVideo.file_path
      const conversionCacheKey = getSubtitleConversionCacheKey(key, sourceFile)
      let vttPath = presetVttPath || convertedSubPaths.get(conversionCacheKey) || null
      if (presetVttPath) {
        setConvertedSubPaths(prev => new Map(prev).set(conversionCacheKey, presetVttPath))
      }

      if (!vttPath) {
        vttPath = await window.api.preConvertSubtitle(sourceFile, trackIndex, isExternal)
        if (
          isPlayerClosingRef.current ||
          loadToken !== subtitleLoadTokenRef.current ||
          sessionToken !== playerSessionTokenRef.current ||
          activeSubKeyRef.current !== key
        ) return
        if (vttPath) setConvertedSubPaths(prev => new Map(prev).set(conversionCacheKey, vttPath!))
      }

      if (!vttPath) {
        if (
          isPlayerClosingRef.current ||
          loadToken !== subtitleLoadTokenRef.current ||
          sessionToken !== playerSessionTokenRef.current ||
          activeSubKeyRef.current !== key
        ) return
        clearRenderedSubtitle()
        setSubtitleLoading(false)
        return
      }

      // Fetch and parse VTT into memory once for high-speed DOM rendering
      const res = await fetch(`media://file/${encodeURIComponent(vttPath)}`)
      const text = await res.text()
      
      // Guard: ignore stale response if user switched tracks during conversion
      if (
        isPlayerClosingRef.current ||
        loadToken !== subtitleLoadTokenRef.current ||
        sessionToken !== playerSessionTokenRef.current ||
        activeSubKeyRef.current !== key
      ) return
      
      const parsedCues = parseVTT(text)
      if (parsedCues.length === 0) {
        console.warn('[Subtitle] Converted track has no readable cues:', key, vttPath)
        activeSubKeyRef.current = null
        setActiveSubKey(null)
        subtitleCuesRef.current = []
        clearRenderedSubtitle()
        showTrackToast('subtitle', 'Not Readable')
        return
      }

      subtitleCuesRef.current = parsedCues
      activeSubtitleCueIndexRef.current = -1
      if (videoRef.current) {
        renderSubtitleAtTime(videoRef.current.currentTime)
      }
      console.log('[Subtitle] Loaded', subtitleCuesRef.current.length, 'cues for', key)
    } catch (err) {
      console.error('[Subtitle] Failed to load cues:', err)
      clearRenderedSubtitle()
    } finally {
      if (
        !isPlayerClosingRef.current &&
        loadToken === subtitleLoadTokenRef.current &&
        sessionToken === playerSessionTokenRef.current &&
        activeSubKeyRef.current === key
      ) setSubtitleLoading(false)
    }
  }

  useEffect(() => {
    if (seriesSubtitleRefreshToken === 0) return

    let isCancelled = false
    const videoToRefresh = currentVideo

    const refreshExternalSubtitle = async () => {
      const seriesKey = getPreferenceSeriesKey(videoToRefresh)
      if (
        videoToRefresh.type !== 'series' ||
        localStorage.getItem(getSeriesSubtitleAutoLoadStorageKey(seriesKey)) !== SERIES_SUBTITLE_AUTO_LOAD_VALUE ||
        localStorage.getItem(`mycinema_sub_pref_${seriesKey}`) === 'Off'
      ) {
        return
      }

      const srt = await window.api.getSubtitlePath(videoToRefresh.file_path)
      if (
        isCancelled ||
        isPlayerClosingRef.current ||
        currentVideoRef.current.id !== videoToRefresh.id ||
        !srt
      ) {
        return
      }

      setSubtitlePath(srt)
      await selectSubtitleTrack('external-0', {
        closeMenu: false,
        persistPreference: false,
        externalSubtitlePath: srt,
      })
    }

    void refreshExternalSubtitle()

    return () => {
      isCancelled = true
    }
  }, [seriesSubtitleRefreshToken, currentVideo.id, currentVideo.file_path, currentVideo.series_name])

  // ─── Online Subtitle Search (OpenSubtitles) ──────────────────────────────────
  const getSubtitleSearchLanguage = (sub?: any) => {
    const language = typeof sub?.language === 'string' ? sub.language.trim().toLowerCase() : ''
    return language && language !== 'unknown' ? language : 'en,hi'
  }

  const buildOnlineSubtitleSearchParams = (targetVideo: Video, languages = 'en,hi') => {
    const params: any = {
      languages,
      videoFilePath: targetVideo.file_path,
    }

    const videoAny = targetVideo as any
    if (videoAny.tmdb_id) {
      params.tmdbId = videoAny.tmdb_id
      params.mediaType = targetVideo.type === 'series' ? 'tv' : 'movie'
    } else {
      params.query = targetVideo.type === 'series' && targetVideo.series_name
        ? targetVideo.series_name
        : targetVideo.title
    }

    if (targetVideo.type === 'series') {
      if (targetVideo.season) params.season = targetVideo.season
      if (targetVideo.episode) params.episode = targetVideo.episode
    }

    return params
  }

  const pickBestSubtitleForLanguage = (results: any[], languages: string) => {
    const preferredLanguages = languages
      .split(',')
      .map(language => language.trim().toLowerCase())
      .filter(Boolean)

    if (preferredLanguages.length === 0) return results[0]

    return results.find(result =>
      preferredLanguages.includes(String(result.language || '').toLowerCase())
    ) || results[0]
  }

  const downloadSeriesSubtitles = async (selectedSub: any, sourceVideo: Video) => {
    if (sourceVideo.type !== 'series' || !sourceVideo.series_name) return

    let episodes: Video[] = []
    try {
      episodes = await window.api.getSeriesInfo(sourceVideo.series_name)
    } catch (error) {
      console.error('[OpenSubtitles] Failed to load series episodes:', error)
      return
    }

    const seenPaths = new Set<string>([sourceVideo.file_path])
    const targets = episodes.filter(episode => {
      if (!episode.file_path || seenPaths.has(episode.file_path)) return false
      seenPaths.add(episode.file_path)
      return episode.type === 'series' && Boolean(episode.season) && Boolean(episode.episode)
    })

    if (targets.length === 0) return

    const languages = getSubtitleSearchLanguage(selectedSub)
    const total = targets.length + 1
    let downloaded = 0
    let skipped = 0
    let failed = 0

    if (!isPlayerClosingRef.current) {
      showTrackToast('subtitle', 'Downloading series subtitles')
      updateSeriesSubtitleStatus({
        label: 'Starting series subtitle downloads',
        current: 1,
        total,
        ready: 1,
        failed: 0,
        done: false,
      })
    }

    for (const [index, episode] of targets.entries()) {
      const current = index + 2
      const episodeLabel = `S${String(episode.season).padStart(2, '0')} E${String(episode.episode).padStart(2, '0')}`

      if (!isPlayerClosingRef.current) {
        updateSeriesSubtitleStatus({
          label: `Checking ${episodeLabel}`,
          current,
          total,
          ready: downloaded + skipped + 1,
          failed,
          done: false,
        })
      }

      try {
        const existingSubtitle = await window.api.getSubtitlePath(episode.file_path)
        if (existingSubtitle) {
          skipped += 1
          if (currentVideoRef.current.id === episode.id) {
            setSeriesSubtitleRefreshToken(token => token + 1)
          }
          if (!isPlayerClosingRef.current) {
            updateSeriesSubtitleStatus({
              label: `${episodeLabel} already ready`,
              current,
              total,
              ready: downloaded + skipped + 1,
              failed,
              done: false,
            })
          }
          continue
        }

        const response = await window.api.searchOnlineSubtitles(
          buildOnlineSubtitleSearchParams(episode, languages)
        )

        if (response?.error) {
          failed += 1
          if (!isPlayerClosingRef.current) {
            updateSeriesSubtitleStatus({
              label: `${episodeLabel} missing`,
              current,
              total,
              ready: downloaded + skipped + 1,
              failed,
              done: false,
            })
          }
          continue
        }

        const match = pickBestSubtitleForLanguage(response?.results || [], languages)
        if (!match?.fileId) {
          failed += 1
          if (!isPlayerClosingRef.current) {
            updateSeriesSubtitleStatus({
              label: `${episodeLabel} missing`,
              current,
              total,
              ready: downloaded + skipped + 1,
              failed,
              done: false,
            })
          }
          continue
        }

        const result = await window.api.downloadOnlineSubtitle({
          fileId: match.fileId,
          videoFilePath: episode.file_path,
          fileName: match.fileName,
        })

        if (result?.error) {
          failed += 1
        } else {
          downloaded += 1
          if (currentVideoRef.current.id === episode.id) {
            setSeriesSubtitleRefreshToken(token => token + 1)
          }
        }

        if (!isPlayerClosingRef.current) {
          updateSeriesSubtitleStatus({
            label: result?.error ? `${episodeLabel} missing` : `${episodeLabel} downloaded`,
            current,
            total,
            ready: downloaded + skipped + 1,
            failed,
            done: false,
          })
        }
      } catch (error) {
        console.error('[OpenSubtitles] Series subtitle download failed:', error)
        failed += 1
        if (!isPlayerClosingRef.current) {
          updateSeriesSubtitleStatus({
            label: `${episodeLabel} missing`,
            current,
            total,
            ready: downloaded + skipped + 1,
            failed,
            done: false,
          })
        }
      }
    }

    if (isPlayerClosingRef.current) return

    const ready = downloaded + skipped + 1
    const finalLabel = failed > 0
      ? `${ready}/${total} ready, ${failed} missing`
      : `${ready}/${total} ready`

    updateSeriesSubtitleStatus({
      label: finalLabel,
      current: total,
      total,
      ready,
      failed,
      done: true,
    }, true)

    if (failed > 0) {
      showTrackToast('subtitle', `Series subtitles ${ready}/${total}`)
    } else {
      showTrackToast('subtitle', `Series subtitles ${ready}/${total}`)
    }
  }

  const searchOnlineSubs = async () => {
    setOnlineSubLoading(true)
    setOnlineSubError(null)
    setOnlineSubResults([])
    setShowOnlineSearch(true)

    try {
      const params = buildOnlineSubtitleSearchParams(currentVideo)
      const response = await window.api.searchOnlineSubtitles(params)

      if (response.error) {
        setOnlineSubError(response.error)
      } else {
        setOnlineSubResults(response.results || [])
        if ((response.results || []).length === 0) {
          setOnlineSubError('No subtitles found for this title')
        }
      }
    } catch (err: any) {
      setOnlineSubError(err.message || 'Search failed')
    } finally {
      setOnlineSubLoading(false)
    }
  }

  const downloadOnlineSub = async (sub: any) => {
    setDownloadingSubId(sub.fileId)
    try {
      const result = await window.api.downloadOnlineSubtitle({
        fileId: sub.fileId,
        videoFilePath: currentVideo.file_path,
        fileName: sub.fileName,
      })

      if (result.error) {
        setOnlineSubError(result.error)
        setDownloadingSubId(null)
        return
      }

      // Subtitle downloaded and converted — update the player state
      setSubtitlePath(result.srtPath)
      setShowOnlineSearch(false)

      await selectSubtitleTrack('external-0', {
        closeMenu: false,
        presetVttPath: result.vttPath || null,
        externalSubtitlePath: result.srtPath
      })
      if (currentVideo.type === 'series') {
        void downloadSeriesSubtitles(sub, currentVideo)
      }
      setShowMediaMenu(false)
      showTrackToast('subtitle', `Downloaded (${sub.language.toUpperCase()})`)
    } catch (err: any) {
      setOnlineSubError(err.message || 'Download failed')
    } finally {
      setDownloadingSubId(null)
    }
  }


  const handleCustomAudioSeekSync = (time: number) => {
    const trackObj = availableAudio.find(a => a.id === selectedAudioId)
    if (trackObj && !trackObj.native && audioRef.current) {
      void syncSelectedExternalAudio(time, !!videoRef.current && !videoRef.current.paused)
    }
  }

  const seekToTime = (time: number) => {
    if (!isHost && roomId !== null) return;
    if (videoRef.current) {
      const durationLimit = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : durationRef.current
      const boundedTime = durationLimit > 0
        ? Math.max(0, Math.min(time, durationLimit))
        : Math.max(0, time)
      seekWasPlayingRef.current = !videoRef.current.paused
      pendingControlledSeekTimeRef.current = boundedTime
      pendingControlledSeekResumeRef.current = seekWasPlayingRef.current
      videoRef.current.currentTime = boundedTime
      timeRef.current = boundedTime
      setCurrentTime(boundedTime)
      if (isHost) broadcastState({ type: 'SEEK', time: boundedTime });
    }
  }

  const seek = (seconds: number) => {
    if (!isHost && roomId !== null) return;
    if (videoRef.current) {
      const time = videoRef.current.currentTime + seconds
      seekToTime(time)
      setSeekPopup(prev => ({ show: true, text: seconds > 0 ? `+${seconds}s` : `${seconds}s`, id: prev.id + 1 }))
    }
  }

  const dismissIntroDbSegment = (segment: IntroDbSegment) => {
    setDismissedIntroDbSegmentKeys(prev => {
      const next = new Set(prev)
      next.add(getIntroDbSegmentKey(segment))
      return next
    })
  }

  const performIntroDbSkip = (segment: IntroDbSegment) => {
    const targetTime = segment.endSec + INTRODB_SKIP_END_PADDING_SECONDS
    const isOutroAdvance = segment.type === 'outro' && hasNextEpisode
    if (isOutroAdvance) {
      const completedAt = durationRef.current || duration || segment.endSec
      timeRef.current = completedAt
      window.api.updateVideoProgress(currentVideo.id, completedAt, true, true)
      playNextEpisode()
      return
    }

    seekToTime(targetTime)
  }

  const skipIntroDbSegment = (segment: IntroDbSegment, options: { automatic?: boolean } = {}) => {
    const isOutroAdvance = segment.type === 'outro' && hasNextEpisode

    if (options.automatic) {
      const id = Date.now()
      const transitionMs = isOutroAdvance ? INTRODB_AUTO_SKIP_NEXT_TRANSITION_MS : INTRODB_AUTO_SKIP_SEEK_TRANSITION_MS

      if (autoSkipTransitionTimerRef.current) {
        clearTimeout(autoSkipTransitionTimerRef.current)
        autoSkipTransitionTimerRef.current = null
      }
      setAutoSkipTransition(null)

      autoSkipTransitionTimerRef.current = setTimeout(() => {
        dismissIntroDbSegment(segment)
        performIntroDbSkip(segment)
        if (isOutroAdvance) {
          autoSkipTransitionTimerRef.current = null
          return
        }

        setAutoSkipTransition({
          show: true,
          label: segment.type === 'outro'
            ? 'Credits skipped'
            : `${getIntroDbSegmentLabel(segment.type)} skipped`,
          id
        })
        autoSkipTransitionTimerRef.current = setTimeout(() => {
          autoSkipTransitionTimerRef.current = null
          setAutoSkipTransition(prev => prev?.id === id ? null : prev)
        }, INTRODB_AUTO_SKIP_CONFIRMATION_MS)
      }, transitionMs)
      return
    }

    dismissIntroDbSegment(segment)
    performIntroDbSkip(segment)
  }

  const toggleAutoSkipIntroOutro = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const next = !autoSkipIntroOutroEnabled
    setAutoSkipIntroOutroEnabled(next)
    showTrackToast('skip', next ? 'Auto Skip On' : 'Auto Skip Off')
  }

  useEffect(() => {
    if (
      !autoSkipIntroOutroEnabled ||
      !activeIntroDbSegment ||
      !activeIntroDbSegmentCanAutoSkip ||
      !canControlPlayback ||
      !isPlaying ||
      isSeeking ||
      currentTime < activeIntroDbSegment.startSec ||
      currentTime >= activeIntroDbSegment.endSec - 0.25
    ) {
      return
    }

    const segmentKey = getIntroDbSegmentKey(activeIntroDbSegment)
    if (autoSkipInFlightKeyRef.current === segmentKey) return
    autoSkipInFlightKeyRef.current = segmentKey
    skipIntroDbSegment(activeIntroDbSegment, { automatic: true })
  }, [
    activeIntroDbSegment,
    activeIntroDbSegmentCanAutoSkip,
    autoSkipIntroOutroEnabled,
    canControlPlayback,
    currentTime,
    isPlaying,
    isSeeking
  ])

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    setCurrentTime(time)
    timeRef.current = time
    if (videoRef.current && !isSeeking) {
      videoRef.current.currentTime = time
    }
  }

  const handleSeekMouseUp = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    if (!isHost && roomId !== null) return;
    const time = parseFloat((e.target as HTMLInputElement).value)
    if (videoRef.current) {
      setIsSeeking(false)
      pendingControlledSeekTimeRef.current = time
      pendingControlledSeekResumeRef.current = seekWasPlayingRef.current
      videoRef.current.currentTime = time
      timeRef.current = time
      if (isHost) broadcastState({ type: 'SEEK', time });
    }
  }

  const handleSeekMouseDown = () => {
    if (videoRef.current) {
      seekWasPlayingRef.current = !videoRef.current.paused
    }
    setIsSeeking(true)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setVolume(v)
    if (videoRef.current) {
      videoRef.current.volume = v
      const trackObj = availableAudio.find(a => a.id === selectedAudioId)
      if (trackObj && !trackObj.native) {
        videoRef.current.muted = true
      } else {
        videoRef.current.muted = v === 0
      }
    }
    if (audioRef.current) {
      audioRef.current.volume = v
    }
  }

  const requestSeekPreviewThumbnail = (time: number) => {
    if (!Number.isFinite(time)) return

    const bucketTime = Math.max(0, Math.floor(time / SEEK_PREVIEW_BUCKET_SECONDS) * SEEK_PREVIEW_BUCKET_SECONDS)
    if (lastSeekPreviewBucketRef.current === bucketTime) return
    lastSeekPreviewBucketRef.current = bucketTime

    if (seekPreviewThumbTimerRef.current) {
      clearTimeout(seekPreviewThumbTimerRef.current)
    }

    seekPreviewThumbTimerRef.current = setTimeout(async () => {
      const requestId = ++seekPreviewThumbRequestRef.current
      setSeekPreviewLoading(true)

      try {
        const thumbPath = await window.api.getSeekPreviewThumbnail(currentVideo.file_path, bucketTime)
        if (requestId !== seekPreviewThumbRequestRef.current) return

        setSeekPreviewImageSrc(thumbPath ? `media://file/${encodeURIComponent(thumbPath)}` : null)
      } catch (err) {
        if (requestId === seekPreviewThumbRequestRef.current) {
          setSeekPreviewImageSrc(null)
        }
      } finally {
        if (requestId === seekPreviewThumbRequestRef.current) {
          setSeekPreviewLoading(false)
        }
      }
    }, SEEK_PREVIEW_DEBOUNCE_MS)
  }

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    // The tooltip width is w-48 (192px). Half is 96px.
    const padding = 96
    
    let x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    const time = percentage * duration
    
    setHoverTime(time)

    // Center tooltip unless at margins
    let popupLeft = x
    if (popupLeft < padding) popupLeft = padding
    if (popupLeft > rect.width - padding) popupLeft = rect.width - padding

    setHoverPosition((popupLeft / rect.width) * 100)

    requestSeekPreviewThumbnail(time)
  }

  const handleProgressMouseLeave = () => {
    setHoverTime(null)
    if (seekPreviewThumbTimerRef.current) {
      clearTimeout(seekPreviewThumbTimerRef.current)
      seekPreviewThumbTimerRef.current = null
    }
    seekPreviewThumbRequestRef.current += 1
    lastSeekPreviewBucketRef.current = null
    setSeekPreviewLoading(false)
  }

  const toggleFullscreen = async () => {
    try {
      const hasDocumentFullscreen = !!document.fullscreenElement
      const hasWindowFullscreen = await window.api.isFullscreen().catch(() => isWindowFullscreen)

      if (hasDocumentFullscreen || hasWindowFullscreen) {
        if (hasDocumentFullscreen) {
          await document.exitFullscreen().catch(() => {})
        }

        const stillWindowFullscreen = await window.api.isFullscreen().catch(() => hasWindowFullscreen)
        if (stillWindowFullscreen) {
          const nextState = await window.api.toggleFullscreen()
          setIsWindowFullscreen(nextState)
        } else if (hasWindowFullscreen) {
          setIsWindowFullscreen(false)
        }

        setShowControls(true)
        clearTimeout(window.controlsTimeout)
        window.controlsTimeout = setTimeout(() => setShowControls(false), 3000)
        return
      }

      await playerShellRef.current?.requestFullscreen()
    } catch (err) {
      console.error('Fullscreen toggle failed:', err)
    }
  }

  const togglePictureInPicture = async () => {
    const videoEl = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<PictureInPictureWindow> }) | null
    const doc = document as Document & {
      pictureInPictureEnabled?: boolean
      pictureInPictureElement?: Element | null
      exitPictureInPicture?: () => Promise<void>
    }

    if (!videoEl || !doc.pictureInPictureEnabled || !videoEl.requestPictureInPicture) {
      setIsPiPSupported(false)
      return
    }

    try {
      if (doc.pictureInPictureElement === videoEl) {
        await doc.exitPictureInPicture?.()
        return
      }

      if (doc.pictureInPictureElement && doc.exitPictureInPicture) {
        await doc.exitPictureInPicture()
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen()
      }

      await videoEl.requestPictureInPicture()
      setShowControls(true)
      clearTimeout(window.controlsTimeout)
      window.controlsTimeout = setTimeout(() => setShowControls(false), 3000)
    } catch (err) {
      console.error('Picture-in-Picture failed:', err)
      setIsPiPActive(false)
    }
  }

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    return `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const subtitleSyncDisabled = activeSubKey === null
  const subtitleSyncValue = formatSubtitleOffsetMs(subtitleOffsetMs)
  const subtitleOffsetIsZero = subtitleOffsetMs === 0
  const subtitleSyncRailPercent = `${((clampSubtitleOffsetMs(subtitleOffsetMs) - SUBTITLE_SYNC_MIN_MS) / (SUBTITLE_SYNC_MAX_MS - SUBTITLE_SYNC_MIN_MS)) * 100}%`
  const subtitleSyncControls = [
    {
      key: 'earlier-large',
      value: '-2s',
      title: 'Show subtitles 2 seconds earlier',
      onClick: () => nudgeSubtitleOffset(-SUBTITLE_SYNC_COARSE_STEP_MS),
      disabled: subtitleSyncDisabled
    },
    {
      key: 'earlier-small',
      value: '-250ms',
      title: 'Show subtitles 250 milliseconds earlier',
      onClick: () => nudgeSubtitleOffset(-SUBTITLE_SYNC_FINE_STEP_MS),
      disabled: subtitleSyncDisabled
    },
    {
      key: 'later-small',
      value: '+250ms',
      title: 'Show subtitles 250 milliseconds later',
      onClick: () => nudgeSubtitleOffset(SUBTITLE_SYNC_FINE_STEP_MS),
      disabled: subtitleSyncDisabled
    },
    {
      key: 'later-large',
      value: '+2s',
      title: 'Show subtitles 2 seconds later',
      onClick: () => nudgeSubtitleOffset(SUBTITLE_SYNC_COARSE_STEP_MS),
      disabled: subtitleSyncDisabled
    }
  ] as const

  const updateVideoAspectRatio = () => {
    const videoEl = videoRef.current
    if (videoEl?.videoWidth && videoEl.videoHeight) {
      setVideoAspectRatio(videoEl.videoWidth / videoEl.videoHeight)
    }
  }

  const videoSurfaceStyle: React.CSSProperties = aspectMode === 'contain'
    ? {
        width: `min(100vw, calc(100vh * ${videoAspectRatio}))`,
        height: `min(100vh, calc(100vw / ${videoAspectRatio}))`
      }
    : {
        width: '100vw',
        height: '100vh'
      }

  const videoObjectFit: React.CSSProperties['objectFit'] = aspectMode === 'cover' ? 'cover' : 'fill'

  return (
    <div 
      ref={playerShellRef}
      className={`fixed inset-0 z-50 bg-black flex flex-col items-center justify-center group overflow-hidden ${!showControls ? 'cursor-none' : ''}`}
      onMouseMove={(e) => {
        setShowControls(true)
        clearTimeout(window.controlsTimeout)
        
        // Prevent jarring auto-hide if mouse is directly actively resting on buttons
        if (!(e.target as HTMLElement).closest('.video-controls')) {
          window.controlsTimeout = setTimeout(() => setShowControls(false), 3000)
        } else {
          window.controlsTimeout = setTimeout(() => setShowControls(false), 6000)
        }
      }}
      onClick={handleContainerClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUpOrLeave}
      onPointerLeave={handlePointerUpOrLeave}
      onPointerCancel={handlePointerUpOrLeave}
    >
      <div className="relative overflow-hidden bg-black" style={videoSurfaceStyle}>
        <video
          ref={videoRef}
          src={`media://file/${encodeURIComponent(currentVideo.file_path)}`}
          className={`h-full w-full outline-none ${showControls ? 'subs-up' : 'subs-down'} opacity-100`}
          style={{ 
            objectFit: videoObjectFit,
            clipPath: 'inset(0px)'
          }}
          onTimeUpdate={() => {
          if (!isSeeking && videoRef.current) {
            // Throttle React state to 4×/sec to reduce GC pressure on Chromium GPU pipeline
            const now = Date.now()
            if (now - lastTimeUpdateRef.current >= 250) {
              setCurrentTime(videoRef.current.currentTime)
              lastTimeUpdateRef.current = now
            }
            timeRef.current = videoRef.current.currentTime

            renderSubtitleAtTime(videoRef.current.currentTime)
          }
        }}
        onSeeked={() => {
          if (!videoRef.current) return
          const time = videoRef.current.currentTime
          setCurrentTime(time)
          timeRef.current = time
          if (pendingControlledSeekTimeRef.current !== null) {
            const shouldResume = pendingControlledSeekResumeRef.current
            pendingControlledSeekTimeRef.current = null
            pendingControlledSeekResumeRef.current = false
            resumeNativeVideoAfterSeek(shouldResume)
            void syncSelectedExternalAudio(time, shouldResume, { keepVideoPlayingWhilePreparing: true })
          } else if (suppressNextSeekSyncRef.current) {
            suppressNextSeekSyncRef.current = false
          } else {
            void syncSelectedExternalAudio(time, !videoRef.current.paused)
          }
          activeSubtitleCueIndexRef.current = -1
          renderSubtitleAtTime(time)
        }}
        onDurationChange={() => {
          if (videoRef.current) {
            const nextDuration = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0
            setDuration(nextDuration)
            durationRef.current = nextDuration || 1
          }
        }}
        onPlay={() => {
          if (!isHost && roomId !== null && !allowGuestPlaybackEventRef.current) {
            videoRef.current?.pause()
            return
          }
          allowGuestPlaybackEventRef.current = false
          setIsPlaying(true); 
          const trackObj = availableAudio.find(a => a.id === selectedAudioId);
          if (trackObj && !trackObj.native && audioRef.current && !startupExternalAudioBarrierRef.current && !externalAudioSeekBarrierRef.current) {
            startExternalAudioTrack(trackObj.index, videoRef.current?.currentTime || 0, true)
          }
        }}
        onPause={() => {
          if (!isHost && roomId !== null && !allowGuestPlaybackEventRef.current) {
            videoRef.current?.play().catch(e => console.log('Guest local pause blocked:', e))
            return
          }
          allowGuestPlaybackEventRef.current = false
          setIsPlaying(false)
          if (audioRef.current && audioRef.current.src) audioRef.current.pause()
        }}
        onEnded={handleEnded}
        onWaiting={() => {
          if (startupExternalAudioBarrierRef.current || externalAudioSeekBarrierRef.current) return
          showBufferingIndicatorSoon()
          if (highSpeedPlaybackActive && fpsBoostEnabled) {
            activateHighSpeedPerformanceMode('Buffering at high speed; FPS Boost eased to help playback catch up')
          }
          if (audioRef.current && audioRef.current.src) audioRef.current.pause()
        }}
        onPlaying={() => { 
          hideBufferingIndicator(); 
          const trackObj = availableAudio.find(a => a.id === selectedAudioId);
          if (trackObj && !trackObj.native && audioRef.current && !startupExternalAudioBarrierRef.current && !externalAudioSeekBarrierRef.current) {
            if (!audioRef.current.src) {
              startExternalAudioTrack(trackObj.index, videoRef.current?.currentTime || 0, true)
            } else {
              audioRef.current.play().catch(e => console.log('Audio onPlaying failed:', e));
            }
          }
        }}
        onCanPlay={hideBufferingIndicator}
        onLoadedMetadata={() => {
          if (videoRef.current) {
            setHasVideoMetadata(true)
            updateVideoAspectRatio()
            videoRef.current.playbackRate = playbackRate
            const nextDuration = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0
            setDuration(nextDuration)
            durationRef.current = nextDuration || 1
            // Explicitly set volume on each new load to prevent silent starts
            videoRef.current.volume = volume
            const activeAudio = availableAudio.find(a => a.id === selectedAudioId)
            videoRef.current.muted = activeAudio && !activeAudio.native ? true : volume === 0
          }
          // @ts-ignore
          if (videoRef.current?.audioTracks) {
            // @ts-ignore
            const tracks = videoRef.current.audioTracks
            const tracksArray = []
            for (let i = 0; i < tracks.length; i++) {
              tracksArray.push(tracks[i])
            }
            setAudioTracks(tracksArray)
          }
        }}
        onLoadedData={updateVideoAspectRatio}
        onResize={updateVideoAspectRatio}
        onError={(e) => {
          console.error('Video Error:', e)
          const error = (e.target as HTMLVideoElement).error
          console.error('Video Error Details:', error?.message, error?.code)
        }}
        >
        </video>

        {(effectiveFpsBoostEnabled || effectiveSharpnessEnabled || effectiveVibranceEnabled) && (
          <AIEnhancementRenderer
            videoRef={videoRef}
            fpsBoostEnabled={effectiveFpsBoostEnabled}
            sharpnessEnabled={effectiveSharpnessEnabled}
            vibranceEnabled={effectiveVibranceEnabled}
            aspectMode={aspectMode}
          />
        )}
      </div>

      <style>{`
        @keyframes seekAnim {
          0% { opacity: 0; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1.05); }
          70% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0; transform: scale(1.15); }
        }
        .animate-seek { animation: seekAnim 1.2s ease-in-out forwards; }
        @keyframes autoSkipReceipt {
          0% { opacity: 0; transform: translateY(6px) scale(0.98); }
          16% { opacity: 1; transform: translateY(0) scale(1); }
          72% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-4px) scale(0.99); }
        }
        .auto-skip-receipt {
          animation: autoSkipReceipt ${INTRODB_AUTO_SKIP_CONFIRMATION_MS}ms ease forwards;
        }
      `}</style>

      {/* Subtitle overlay is now injected imperatively via useEffect below — not rendered as JSX */}

      {/* Seek Popup Overlay */}
      {seekPopup.show && (
        <div 
          key={seekPopup.id}
          className={`absolute inset-0 flex items-center pointer-events-none z-50 ${seekPopup.text.includes('+') ? 'justify-end pr-32' : 'justify-start pl-32'}`}
        >
          <div className="bg-black/60 text-white font-bold w-24 h-24 rounded-full backdrop-blur-md flex flex-col justify-center items-center animate-seek shadow-2xl border border-white/10 space-y-1">
            {seekPopup.text.includes('+') ? <FastForward size={32} fill="currentColor" /> : <Rewind size={32} fill="currentColor" />}
            <span className="text-lg tracking-wider">{seekPopup.text}</span>
          </div>
        </div>
      )}

      {/* Volume Popup Overlay */}
      {volumePopup.show && (
        <div 
          key={`vol-${volumePopup.id}`}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
        >
          <div className="bg-black/60 text-white font-bold w-24 h-24 rounded-full backdrop-blur-md flex flex-col justify-center items-center animate-seek shadow-2xl border border-white/10 space-y-1">
            {volumePopup.isMuted ? <VolumeX size={32} /> : <Volume2 size={32} />}
            <span className="text-lg tracking-wider">{volumePopup.isMuted ? 'Muted' : `${Math.round(volumePopup.volume * 100)}%`}</span>
          </div>
        </div>
      )}

      {/* Speed Popup Overlay */}
      {speedPopup.show && (
        <div 
          key={`speed-${speedPopup.id}`}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
        >
          <div className="bg-black/60 text-white font-bold w-24 h-24 rounded-full backdrop-blur-md flex flex-col justify-center items-center animate-seek shadow-2xl border border-white/10 space-y-1">
            <FastForward size={32} />
            <span className="text-lg tracking-wider">{speedPopup.rate}x</span>
          </div>
        </div>
      )}

      {performanceNotice.show && (
        <div
          key={`performance-${performanceNotice.id}`}
          className="absolute top-20 left-1/2 z-[60] -translate-x-1/2 animate-in fade-in zoom-in duration-200 pointer-events-none"
        >
          <div className="flex items-center space-x-2 rounded-xl border border-emerald-400/20 bg-black/70 px-4 py-2.5 text-white shadow-2xl backdrop-blur-xl">
            <Zap size={18} className="text-emerald-300" />
            <span className="max-w-[320px] text-center text-xs font-bold tracking-wide">{performanceNotice.text}</span>
          </div>
        </div>
      )}

      {seriesSubtitleStatus && (
        <div className="pointer-events-none absolute top-20 left-1/2 z-[60] -translate-x-1/2 animate-in fade-in zoom-in duration-200">
          <div className="flex max-w-[min(92vw,440px)] items-center gap-3 rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-white shadow-2xl backdrop-blur-xl">
            <Subtitles size={18} className={seriesSubtitleStatus.done && seriesSubtitleStatus.failed === 0 ? 'text-emerald-300' : 'text-primary'} />
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/35">
                Series subtitles
              </p>
              <p className="mt-0.5 truncate text-xs font-bold tracking-wide text-white/85">
                {seriesSubtitleStatus.label}
              </p>
            </div>
            <span className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black tabular-nums ${
              seriesSubtitleStatus.done
                ? seriesSubtitleStatus.failed > 0
                  ? 'bg-amber-400/15 text-amber-200'
                  : 'bg-emerald-400/15 text-emerald-200'
                : 'bg-primary/15 text-primary'
            }`}>
              {seriesSubtitleStatus.ready}/{seriesSubtitleStatus.total}
            </span>
          </div>
        </div>
      )}

      {/* Track Popup Overlay */}
      {trackPopup.show && (
        <div 
          key={`track-${trackPopup.id}`}
          className="absolute pointer-events-none z-50 bottom-32 left-1/2 -translate-x-1/2"
        >
          <div className="bg-black/60 text-white font-bold backdrop-blur-md items-center animate-seek shadow-2xl border border-white/10 flex flex-row space-x-2 px-5 py-2.5 rounded-full">
            {trackPopup.type === 'skip' ? <SkipNext size={20} className="text-primary" />
             : trackPopup.type === 'audio' ? <Music size={20} className="text-primary" />
             : trackPopup.type === 'subtitle' || trackPopup.type === 'subtitleSync' ? <Subtitles size={20} className="text-primary" />
             : trackPopup.type === 'aspect' && aspectMode === 'cover' ? <Crop size={20} className="text-primary" />
             : trackPopup.type === 'aspect' && aspectMode === 'fill' ? <RectangleHorizontal size={20} className="text-primary" />
             : <Monitor size={20} className="text-primary" />}
            <span className="text-sm font-bold tracking-wide text-center" style={{ maxWidth: '280px' }}>
              {trackPopup.type === 'skip' ? 'Auto Skip' : trackPopup.type === 'audio' ? 'Audio' : trackPopup.type === 'aspect' ? 'Aspect' : trackPopup.type === 'subtitleSync' ? 'Subtitle Sync' : 'Subtitle'}: {trackPopup.text}
            </span>
          </div>
        </div>
      )}

      {/* 2x / Rev2x indicators are now injected imperatively via speedToastRef — no JSX needed here */}

      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {autoSkipTransition?.show && (
        <div
          key={`auto-skip-${autoSkipTransition.id}`}
          className={`pointer-events-none absolute ${shouldShowTalkControl ? 'bottom-52' : 'bottom-32'} right-10 z-[70] flex max-w-[calc(100%-5rem)] justify-end`}
        >
          <div className="auto-skip-receipt flex h-9 items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3.5 text-[12px] font-bold text-white/75 shadow-2xl backdrop-blur-xl">
            <Check size={14} strokeWidth={3} className="text-primary" />
            <span className="whitespace-nowrap">{autoSkipTransition.label}</span>
          </div>
        </div>
      )}

      {activeIntroDbSegment && (
        <div className={`absolute ${shouldShowTalkControl ? 'bottom-52' : 'bottom-32'} right-10 z-[60] flex max-w-[calc(100%-5rem)] items-center justify-end gap-4 video-controls animate-in fade-in slide-in-from-bottom-2 duration-200`}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              dismissIntroDbSegment(activeIntroDbSegment)
            }}
            className="h-14 min-w-[136px] rounded-lg border border-white/10 bg-[#2b2b2d]/95 px-6 text-[15px] font-extrabold text-white/75 shadow-2xl backdrop-blur-xl transition-all hover:bg-[#353537] hover:text-white active:scale-95"
            title={`Keep watching ${activeIntroDbSegment.type === 'outro' ? 'credits' : getIntroDbSegmentLabel(activeIntroDbSegment.type).toLowerCase()}`}
          >
            <span className="block truncate">{activeIntroDbWatchLabel}</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              skipIntroDbSegment(activeIntroDbSegment)
            }}
            className="relative h-14 min-w-[148px] overflow-hidden rounded-lg bg-white/90 px-6 text-[15px] font-extrabold text-black shadow-2xl transition-all hover:bg-white active:scale-95"
            title={`${activeIntroDbActionLabel}${autoSkipIntroOutroEnabled && activeIntroDbSegmentCanAutoSkip && activeIntroDbAutoSkipCountdown > 0 ? ` automatically in ${activeIntroDbAutoSkipCountdown}s` : ''}`}
          >
            {autoSkipIntroOutroEnabled && activeIntroDbSegmentCanAutoSkip && (
              <span
                className="absolute inset-y-0 left-0 bg-black/10 transition-[width] duration-200 ease-linear"
                style={{ width: `${activeIntroDbAutoSkipProgress * 100}%` }}
              />
            )}
            <span className="relative flex items-center justify-center gap-2 whitespace-nowrap">
              <Play size={18} fill="currentColor" />
              <span className="truncate">{activeIntroDbActionLabel}</span>
            </span>
          </button>
        </div>
      )}

      {shouldShowTalkControl && (
        <div className="absolute bottom-32 right-10 z-50 video-controls">
          <div className="flex flex-col items-end gap-2">
            {(activeSpeakerId || talkResumeCountdown !== null || voiceError) && (
              <div className={`rounded-full border px-4 py-2 text-sm font-bold shadow-2xl backdrop-blur-xl ${
                voiceError
                  ? 'border-red-400/30 bg-red-950/70 text-red-200'
                  : activeSpeakerId
                    ? 'border-indigo-300/25 bg-black/65 text-white'
                    : 'border-white/10 bg-black/55 text-white/80'
              }`}>
                {voiceError
                  ? voiceError
                  : activeSpeakerId
                    ? `${getSpeakerLabel(activeSpeakerId)} paused to speak`
                    : `Resuming in ${talkResumeCountdown}...`}
              </div>
            )}
            <button
              onPointerDown={(e) => {
                e.stopPropagation()
                beginPushToTalk()
              }}
              onPointerUp={(e) => {
                e.stopPropagation()
                endPushToTalk()
              }}
              onPointerLeave={(e) => {
                e.stopPropagation()
                endPushToTalk()
              }}
              onPointerCancel={(e) => {
                e.stopPropagation()
                endPushToTalk()
              }}
              className={`h-12 rounded-full border shadow-2xl backdrop-blur-xl transition-all active:scale-95 ${
                isMicActive
                  ? 'min-w-[150px] border-indigo-300/40 bg-indigo-500 px-5 text-white shadow-indigo-500/30'
                  : voiceEnabled || voiceError || activeSpeakerId || talkResumeCountdown !== null
                    ? 'min-w-[150px] border-white/10 bg-black/55 px-5 text-white hover:bg-black/75'
                    : 'w-12 border-white/10 bg-black/45 text-white/80 hover:bg-black/70 hover:text-white'
              }`}
              title="Hold V to pause and talk"
            >
              <span className="flex items-center justify-center gap-3">
                {isMicActive ? <Mic size={20} /> : <MicOff size={20} />}
                {(isMicActive || voiceEnabled || voiceError || activeSpeakerId || talkResumeCountdown !== null) && (
                  <span className="text-sm font-black uppercase tracking-wide">
                    {isMicActive ? 'Speaking' : voiceEnabled ? 'Hold V' : 'Enable Mic'}
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Unified Top Info Bar */}
      <div className={`absolute top-0 left-0 right-0 px-10 pt-10 pb-6 flex items-start justify-between transition-opacity duration-300 video-controls z-40 bg-gradient-to-b from-black/80 to-transparent ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center space-x-4">
          <button 
            onClick={onClose}
            className="p-2 -ml-2 text-white/90 hover:text-white transition-colors"
            title="Close Player"
          >
            <ArrowLeft size={28} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white drop-shadow-md">
              {currentVideo.type === 'series' && currentVideo.series_name ? currentVideo.series_name : currentVideo.title}
            </h2>
            <p className="text-sm font-medium text-gray-300 drop-shadow-sm mt-0.5">
              {currentVideo.type === 'series' 
                ? `S${currentVideo.season} E${currentVideo.episode} ${currentVideo.series_name ? currentVideo.title : ''}` 
                : (currentVideo.duration && currentVideo.duration < 3600 ? 'Video' : 'Movie')
              }
            </p>
          </div>
        </div>

        {/* Top Right Actions */}
        <div className="flex items-center space-x-4">
          <div className="relative">
              <button 
                onClick={(e) => { 
                  e.stopPropagation()
                  setShowSpeedMenu(false)
                  setShowAdvancedMenu(false)
                  setShowMediaMenu(!showMediaMenu)
                }}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg bg-black/50 transition-colors backdrop-blur-md border border-white/5 ${showMediaMenu ? 'text-white bg-black/80' : 'text-white hover:bg-black/80'}`}
              >
                <MessageSquareText size={20} className={showMediaMenu ? "text-primary" : ""} />
                <span className="text-sm font-bold tracking-wide">Audio & Subtitles</span>
              </button>
              
              {/* The Unified Popup Menu */}
              {showMediaMenu && (
                <div 
                  className="absolute top-full right-0 mt-3 bg-[#111111]/90 backdrop-blur-2xl rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-white/10 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-300"
                  style={{ width: '400px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex p-2">
                    {/* Audio Column */}
                    {availableAudio.length > 0 && (
                      <div className="flex-1 min-w-0">
                        <div className="px-4 py-3 border-b border-white/5 mb-1">
                          <h3 className="text-[10px] font-black text-white/40 tracking-[0.15em] uppercase">Audio Tracks</h3>
                        </div>
                        <div className="px-1.5 pb-2 max-h-[320px] overflow-y-auto custom-scrollbar">
                          {availableAudio.map((track) => (
                            <button
                              key={track.id}
                              onClick={(e) => { e.stopPropagation(); selectAudioTrack(track.id); }}
                              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group ${selectedAudioId === track.id ? 'bg-primary/15 text-primary' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                            >
                              <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selectedAudioId === track.id ? 'border-primary bg-primary' : 'border-white/20 group-hover:border-white/40'}`}>
                                {selectedAudioId === track.id && <Check size={12} strokeWidth={4} className="text-white" />}
                              </div>
                              <span className="text-[14px] font-semibold truncate tracking-tight">
                                {track.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Subtitles Column */}
                    <div className={`flex-1 min-w-0 ${availableAudio.length > 0 ? 'border-l border-white/5' : ''}`}>
                      <div className="px-4 py-3 border-b border-white/5 mb-1 flex items-center justify-between gap-3">
                        <h3 className="text-[10px] font-black text-white/40 tracking-[0.15em] uppercase">Subtitles</h3>
                        {!showOnlineSearch && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (subtitleSyncDisabled) return
                              setShowSubtitleSyncPanel(prev => !prev)
                            }}
                            disabled={subtitleSyncDisabled}
                            className={`h-6 shrink-0 rounded-full border px-2.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider transition-all ${
                              subtitleSyncDisabled
                                ? 'border-white/5 bg-white/[0.02] text-white/20 cursor-not-allowed'
                                : showSubtitleSyncPanel
                                  ? 'border-primary/40 bg-primary/15 text-primary'
                                  : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/80'
                            }`}
                            title={subtitleSyncDisabled ? 'Select a subtitle track first' : showSubtitleSyncPanel ? 'Hide subtitle sync controls' : 'Show subtitle sync controls'}
                          >
                            <span>Sync</span>
                            {showSubtitleSyncPanel ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        )}
                      </div>

                      {/* Online Search Results View */}
                      {showOnlineSearch ? (
                        <div className="px-1.5 pb-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowOnlineSearch(false); setOnlineSubError(null); }}
                            className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-all text-left mb-1"
                          >
                            <ArrowLeft size={14} />
                            <span className="text-[12px] font-bold">Back to tracks</span>
                          </button>

                          {onlineSubLoading && (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 size={20} className="text-primary animate-spin" />
                              <span className="ml-2 text-[13px] text-white/40 font-medium">Searching…</span>
                            </div>
                          )}

                          {onlineSubError && !onlineSubLoading && (
                            <div className="px-3 py-4 text-center">
                              <p className="text-[12px] text-white/40 font-medium">{onlineSubError}</p>
                            </div>
                          )}

                          <div className="max-h-[280px] overflow-y-auto custom-scrollbar space-y-0.5">
                            {onlineSubResults.map((sub) => (
                              <button
                                key={sub.fileId}
                                onClick={(e) => { e.stopPropagation(); if (downloadingSubId !== sub.fileId) downloadOnlineSub(sub); }}
                                disabled={downloadingSubId === sub.fileId}
                                className="w-full flex items-start space-x-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-50"
                              >
                                <div className="flex-shrink-0 mt-0.5">
                                  {downloadingSubId === sub.fileId ? (
                                    <Loader2 size={16} className="text-primary animate-spin" />
                                  ) : (
                                    <Download size={16} className="text-white/30 group-hover:text-primary transition-colors" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-white/10 uppercase tracking-wider">
                                      {sub.language}
                                    </span>
                                    {sub.hearingImpaired && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300">CC</span>
                                    )}
                                  </div>
                                  <p className="text-[12px] font-medium mt-1 truncate leading-tight">
                                    {sub.releaseName}
                                  </p>
                                  <p className="text-[10px] text-white/30 mt-0.5">
                                    {sub.downloadCount.toLocaleString()} downloads
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Local Tracks View */
                        <div className="px-1.5 pb-2 space-y-2">
                          {showSubtitleSyncPanel && (
                            <div className={`mx-1.5 mb-3 rounded-xl border transition-all duration-300 ${
                              subtitleSyncDisabled
                                ? 'border-white/5 bg-white/[0.01] opacity-40 grayscale pointer-events-none'
                                : 'border-white/8 bg-white/[0.02]'
                            }`}>
                              {/* Header row */}
                              <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-white/5">
                                <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/30">
                                  Subtitle Sync
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[11px] font-black tabular-nums ${subtitleOffsetIsZero ? 'text-white/40' : 'text-primary'}`}>
                                    {subtitleSyncValue}
                                  </span>
                                  {!subtitleOffsetIsZero && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); resetSubtitleOffset(); }}
                                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold text-white/40 hover:text-white hover:border-white/20 transition-all"
                                      title="Reset subtitle offset"
                                    >
                                      <RotateCcw size={9} />
                                      Reset
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Rail */}
                              <div className="px-3 pt-2.5 pb-1">
                                <div className="flex items-center justify-between mb-1.5 text-[8px] font-black uppercase tracking-[0.18em] text-white/18">
                                  <span>Earlier</span>
                                  <span>Later</span>
                                </div>
                                <div className="relative h-4">
                                  <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-white/8" />
                                  <div className="absolute left-1/2 top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-white/15" />
                                  <div
                                    className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm ${
                                      subtitleOffsetIsZero ? 'bg-white/60' : 'bg-primary shadow-primary/30'
                                    }`}
                                    style={{ left: subtitleSyncRailPercent }}
                                  />
                                </div>
                              </div>

                              {/* Nudge buttons */}
                              <div className="px-3 pb-2.5 grid grid-cols-4 gap-1.5">
                                {subtitleSyncControls.map((control) => (
                                  <button
                                    key={control.key}
                                    onClick={(e) => { e.stopPropagation(); control.onClick(); }}
                                    title={control.title}
                                    className="h-8 rounded-lg border border-white/8 bg-white/[0.03] text-[10px] font-black text-white/60 hover:text-white hover:border-white/18 hover:bg-white/[0.07] transition-all active:scale-95"
                                  >
                                    {control.value}
                                  </button>
                                ))}
                              </div>

                              {/* Keyboard hint */}
                              <div className="px-3 pb-2.5 text-center text-[9px] text-white/25 font-medium tracking-wide">
                                [ ] nudge &nbsp;·&nbsp; \ reset
                              </div>
                            </div>
                          )}

                          <div className="max-h-[232px] overflow-y-auto custom-scrollbar">
                            <button
                              onClick={(e) => { e.stopPropagation(); selectSubtitleTrack(null); }}
                              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group ${activeSubKey === null ? 'bg-primary/15 text-primary' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                            >
                              <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${activeSubKey === null ? 'border-primary bg-primary' : 'border-white/20 group-hover:border-white/40'}`}>
                                {activeSubKey === null && <Check size={12} strokeWidth={4} className="text-white" />}
                              </div>
                              <span className="text-[14px] font-semibold truncate tracking-tight">
                                Off
                              </span>
                            </button>
                            {availableSubtitles.map((track) => {
                                const isActive = activeSubKey !== null && activeSubKey === track.id
                                return (
                                <button
                                  key={track.idx}
                                  onClick={(e) => { e.stopPropagation(); selectSubtitleTrack(track.id); }}
                                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group ${isActive ? 'bg-primary/15 text-primary' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                                >
                                  <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isActive ? 'border-primary bg-primary' : 'border-white/20 group-hover:border-white/40'}`}>
                                    {isActive && <Check size={12} strokeWidth={4} className="text-white" />}
                                  </div>
                                  <span className="text-[14px] font-semibold truncate tracking-tight">
                                    {track.label}
                                  </span>
                                </button>
                                )
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Footer — Search Online button */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); if (!showOnlineSearch) searchOnlineSubs(); }}
                    className="w-full bg-white/[0.03] hover:bg-primary/10 transition-colors p-3 flex justify-center items-center group/footer border-t border-white/5"
                  >
                    <div className="flex items-center space-x-2 text-white/40 group-hover/footer:text-primary transition-colors">
                      <Globe size={13} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        {availableSubtitles.length === 0 ? 'Search Subtitles Online' : 'Find More Subtitles'}
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>

          {currentVideo.type === 'series' && hasNextEpisode && (
            <button 
              onClick={(e) => { e.stopPropagation(); playNextEpisode(); }}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-black/50 transition-colors backdrop-blur-md border border-white/5 text-white hover:bg-black/80 group/next"
            >
              <span className="text-sm font-bold tracking-wide">Next Episode</span>
              <SkipNext size={20} className="group-hover/next:text-primary transition-colors" />
            </button>
          )}

        </div>
      </div>

      {/* Controls */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-10 pb-10 pt-20 transition-opacity duration-300 video-controls z-40 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Progress Bar Wrapper */}
        <div 
          className="group/progress relative h-6 mb-4 flex items-center cursor-pointer"
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
        >
          {/* Hover Preview Tooltip */}
          <div 
            className={`absolute bottom-full mb-4 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-opacity duration-200 z-30 ${hoverTime !== null ? 'opacity-100' : 'opacity-0'}`}
            style={{ left: `${hoverPosition}%` }}
          >
            <div className="w-48 aspect-video bg-black/80 rounded-lg overflow-hidden border border-white/20 shadow-2xl flex items-center justify-center relative">
              {seekPreviewImageSrc ? (
                <img
                  src={seekPreviewImageSrc}
                  className="w-full h-full object-cover"
                  alt=""
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-black/70 text-white/45">
                  {seekPreviewLoading && <Loader2 size={18} className="animate-spin" />}
                </div>
              )}
              <div className="absolute bottom-1 bg-black/60 px-2 py-0.5 rounded text-[10px] font-bold text-white drop-shadow-md">
                {hoverTime !== null ? formatTime(hoverTime) : '0:00'}
              </div>
            </div>
          </div>

          <input 
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={currentTime}
            onChange={handleSeekChange}
            onMouseDown={handleSeekMouseDown}
            onMouseUp={(e) => { handleSeekMouseUp(e); (e.target as HTMLElement).blur(); }}
            onTouchStart={handleSeekMouseDown}
            onTouchEnd={(e) => { handleSeekMouseUp(e); (e.target as HTMLElement).blur(); }}
            disabled={!isHost && roomId !== null}
            className={`absolute inset-0 w-full h-full opacity-0 z-20 ${!isHost && roomId !== null ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          />
          
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-gray-600 rounded-full" />
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full transition-[height] group-hover/progress:h-1.5 duration-100" 
            style={{ width: `${((seekPreview ?? currentTime) / duration) * 100}%` }}
          />
          {duration > 0 && introDbSegments.map(segment => {
            const startPercent = Math.max(0, Math.min(100, (segment.startSec / duration) * 100))
            const endPercent = Math.max(startPercent, Math.min(100, (segment.endSec / duration) * 100))
            return (
              <div
                key={getIntroDbSegmentKey(segment)}
                className={`absolute top-1/2 -translate-y-1/2 rounded-full h-1.5 pointer-events-none ${getIntroDbSegmentAccentClass(segment.type)}`}
                style={{
                  left: `${startPercent}%`,
                  width: `${Math.max(0.35, endPercent - startPercent)}%`
                }}
                title={`${getIntroDbSegmentLabel(segment.type)} ${formatTime(segment.startSec)} - ${formatTime(segment.endSec)}`}
              />
            )
          })}
          {/* Seek Preview Ghost Indicator */}
          {seekPreview !== null && duration > 0 && (
            <>
              <div 
                className="absolute top-1/2 -translate-y-1/2 h-1 bg-white/30 rounded-full"
                style={{ left: `${(currentTime / duration) * 100}%`, width: `${Math.abs((seekPreview - currentTime) / duration) * 100}%`, ...(seekPreview < currentTime ? { left: `${(seekPreview / duration) * 100}%` } : {}) }}
              />
              <div 
                className="absolute w-4 h-4 bg-white rounded-full shadow-xl border-2 border-primary top-1/2 -translate-y-1/2 z-20 pointer-events-none"
                style={{ left: `calc(${(seekPreview / duration) * 100}% - 8px)` }}
              />
              <div
                className="absolute bottom-full mb-3 -translate-x-1/2 bg-black/80 text-white text-xs font-bold px-2 py-1 rounded-md pointer-events-none"
                style={{ left: `${(seekPreview / duration) * 100}%` }}
              >
                {formatTime(seekPreview)}
              </div>
            </>
          )}
          <div 
            className="absolute w-3 h-3 bg-primary rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity top-1/2 -translate-y-1/2 z-10 group-hover/progress:scale-125"
            style={{ left: `calc(${(currentTime / duration) * 100}% - 6px)` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <button onClick={() => seek(-10)} className="text-white hover:text-primary hover:-translate-x-1 transition-all" title="Rewind 10s">
              <Rewind size={28} fill="currentColor" />
            </button>
            <button onClick={togglePlay} className="text-white hover:scale-110 transition-transform">
              {isPlaying ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" />}
            </button>
            <button onClick={() => seek(10)} className="text-white hover:text-primary hover:translate-x-1 transition-all" title="Forward 10s">
              <FastForward size={28} fill="currentColor" />
            </button>
            
            {/* Volume: Speaker icon + always-visible horizontal slider */}
            <div className="flex items-center space-x-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleVolumeChange({ target: { value: volume === 0 ? '1' : '0' } } as any) }}
                className="text-white hover:text-primary transition-colors flex-shrink-0"
                title={volume === 0 ? 'Unmute' : 'Mute'}
              >
                <Volume2 size={22} className={volume === 0 ? 'opacity-40' : ''} />
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                onClick={(e) => e.stopPropagation()}
                className="w-20 h-1 accent-primary cursor-pointer flex-shrink-0"
              />
            </div>

            <div className="text-sm font-medium text-gray-300">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center space-x-6">
            {/* Episodes */}
            {currentVideo.type === 'series' && currentVideo.series_name && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowInfoPanel(false); setShowEpisodesPanel(!showEpisodesPanel); }}
                className={`transition-colors flex items-center ${showEpisodesPanel ? 'text-primary' : 'text-white hover:text-primary'}`}
                title="Episodes"
              >
                <ListVideo size={22} className="opacity-90 hover:opacity-100" />
              </button>
            )}

            {/* Open Folder */}
            <button
              onClick={(e) => { e.stopPropagation(); handleOpenFolder(); }}
              className="text-white hover:text-primary transition-colors"
              title="Open in Explorer"
            >
              <FolderOpen size={22} className="opacity-90 hover:opacity-100" />
            </button>

            {/* Watch Together */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowWatchTogetherState(true); }}
              className={`transition-colors ${roomId !== null ? 'text-indigo-400' : 'text-white hover:text-indigo-400'}`}
              title="Watch Together"
            >
              <Users size={22} className="opacity-90 hover:opacity-100" />
            </button>

            {/* Media Info */}
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleInfoPanel(); }}
              className={`transition-colors ${showInfoPanel ? 'text-primary' : 'text-white hover:text-primary'}`}
              title="Media Info (I)"
            >
              <Info size={22} className="opacity-90 hover:opacity-100" />
            </button>

            <button 
              onClick={(e) => { e.stopPropagation(); cycleAspectRatio(); }}
              className="text-white hover:text-primary transition-colors flex items-center"
              title="Aspect Ratio (R)"
            >
              {aspectMode === 'cover' ? <Crop size={22} className="opacity-90 hover:opacity-100" />
               : aspectMode === 'fill' ? <RectangleHorizontal size={22} className="opacity-90 hover:opacity-100" />
               : <Monitor size={22} className="opacity-90 hover:opacity-100" />}
            </button>

            <div className="relative flex items-center">
              {showAdvancedMenu && (
                <div 
                  className="absolute bottom-full right-0 mb-6 bg-[#111111]/90 backdrop-blur-2xl rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-white/10 overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-300 w-[280px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center space-x-2">
                      <Sparkles size={14} className="text-primary" />
                      <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Advanced Settings</h3>
                    </div>
                  </div>
                  
                  <div className="p-2 space-y-1">
                    {highSpeedMotionPaused && (
                      <div className="mx-1 mb-2 rounded-xl border border-emerald-400/15 bg-emerald-400/10 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Performance Mode</p>
                        <p className="mt-0.5 text-[10px] font-medium leading-snug text-white/55">FPS Boost resumes below {HIGH_SPEED_PERFORMANCE_RATE}x. Sharpness and vibrance stay on.</p>
                      </div>
                    )}

                    {currentVideo.type === 'series' && canControlPlayback && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleAutoSkipIntroOutro()
                        }}
                        aria-pressed={autoSkipIntroOutroEnabled}
                        className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-200 group ${autoSkipIntroOutroEnabled ? 'bg-primary/10 text-primary' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                        title={`Auto Skip Intro/Outro ${autoSkipIntroOutroEnabled ? 'On' : 'Off'}`}
                      >
                        <div className="flex items-center space-x-3">
                          <SkipNext size={18} className={autoSkipIntroOutroEnabled ? "text-primary" : "text-white/30"} />
                          <div className="text-left">
                            <p className="text-[13px] font-bold tracking-tight">Auto Skip</p>
                            <p className="text-[10px] opacity-50 font-medium">Intros & credits</p>
                          </div>
                        </div>
                        <div className={`flex-shrink-0 w-10 h-5 rounded-full relative transition-colors duration-300 ${autoSkipIntroOutroEnabled ? 'bg-primary' : 'bg-white/10'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-300 ${autoSkipIntroOutroEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                      </button>
                    )}

                    {/* FPS Boost Toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const nextEnabled = !fpsBoostEnabled
                        setFpsBoostEnabled(nextEnabled)
                      }}
                      className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-200 group ${fpsBoostEnabled ? 'bg-primary/10 text-primary' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                    >
                      <div className="flex items-center space-x-3">
                        <Zap size={18} className={fpsBoostEnabled ? "text-primary" : "text-white/30"} />
                        <div className="text-left">
                          <p className="text-[13px] font-bold tracking-tight">FPS Boost</p>
                          <p className="text-[10px] opacity-50 font-medium">Smoother GPU motion</p>
                        </div>
                      </div>
                      <div className={`flex-shrink-0 w-8 h-4.5 rounded-full relative transition-colors duration-300 ${fpsBoostEnabled ? 'bg-primary' : 'bg-white/10'}`}>
                        <div className={`absolute top-0.75 left-0.75 w-3 h-3 rounded-full bg-white transition-transform duration-300 ${fpsBoostEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                      </div>
                    </button>

                    {/* Audio Boost */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setAudioBoostEnabled(!audioBoostEnabled); }}
                      className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-200 group ${audioBoostEnabled ? 'bg-primary/10 text-primary' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                    >
                      <div className="flex items-center space-x-3">
                        <Volume2 size={18} className={audioBoostEnabled ? "text-primary" : "text-white/30"} />
                        <div className="text-left">
                          <p className="text-[13px] font-bold tracking-tight">Audio Boost</p>
                          <p className="text-[10px] opacity-50 font-medium">Dialogue & loudness</p>
                        </div>
                      </div>
                      <div className={`flex-shrink-0 w-8 h-4.5 rounded-full relative transition-colors duration-300 ${audioBoostEnabled ? 'bg-primary' : 'bg-white/10'}`}>
                        <div className={`absolute top-0.75 left-0.75 w-3 h-3 rounded-full bg-white transition-transform duration-300 ${audioBoostEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                      </div>
                    </button>

                    {audioBoostEnabled && (
                      <div className="space-y-2 px-1 pb-2">
                        <div className="grid grid-cols-2 gap-1.5">
                          {(Object.entries(AUDIO_BOOST_PROFILES) as [AudioBoostProfile, typeof AUDIO_BOOST_PROFILES[AudioBoostProfile]][]).map(([profileKey, profile]) => (
                            <button
                              key={profileKey}
                              onClick={(e) => {
                                e.stopPropagation()
                                setAudioBoostProfile(profileKey)
                              }}
                              className={`min-w-0 rounded-lg px-2 py-2 text-left transition-all duration-200 ${
                                audioBoostProfile === profileKey
                                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                                  : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
                              }`}
                              title={profile.detail}
                            >
                              <p className="truncate text-[11px] font-black uppercase tracking-wide">{profile.label}</p>
                              <p className="truncate text-[9px] font-semibold opacity-55">{profile.detail}</p>
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(Object.entries(AUDIO_BOOST_INTENSITIES) as [AudioBoostIntensity, typeof AUDIO_BOOST_INTENSITIES[AudioBoostIntensity]][]).map(([intensityKey, intensity]) => (
                            <button
                              key={intensityKey}
                              onClick={(e) => {
                                e.stopPropagation()
                                setAudioBoostIntensity(intensityKey)
                              }}
                              className={`rounded-lg px-2 py-1.5 text-center text-[10px] font-black uppercase tracking-wide transition-all duration-200 ${
                                audioBoostIntensity === intensityKey
                                  ? 'bg-white/15 text-white ring-1 ring-white/25'
                                  : 'bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70'
                              }`}
                            >
                              {intensity.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI Sharpness Toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const nextEnabled = !qualitySharpnessEnabled
                        setQualitySharpnessEnabled(nextEnabled)
                      }}
                      className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-200 group ${qualitySharpnessEnabled ? 'bg-primary/10 text-primary' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                    >
                      <div className="flex items-center space-x-3">
                        <Wand2 size={18} className={qualitySharpnessEnabled ? "text-primary" : "text-white/30"} />
                        <div className="text-left">
                          <p className="text-[13px] font-bold tracking-tight">AI Sharpness</p>
                          <p className="text-[10px] opacity-50 font-medium">Crisper edges and detail</p>
                        </div>
                      </div>
                      <div className={`flex-shrink-0 w-8 h-4.5 rounded-full relative transition-colors duration-300 ${qualitySharpnessEnabled ? 'bg-primary' : 'bg-white/10'}`}>
                        <div className={`absolute top-0.75 left-0.75 w-3 h-3 rounded-full bg-white transition-transform duration-300 ${qualitySharpnessEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                      </div>
                    </button>

                    {/* AI Vibrance Toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const nextEnabled = !qualityVibranceEnabled
                        setQualityVibranceEnabled(nextEnabled)
                      }}
                      className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-200 group ${qualityVibranceEnabled ? 'bg-primary/10 text-primary' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                    >
                      <div className="flex items-center space-x-3">
                        <Sparkles size={18} className={qualityVibranceEnabled ? "text-primary" : "text-white/30"} />
                        <div className="text-left">
                          <p className="text-[13px] font-bold tracking-tight">AI Vibrance</p>
                          <p className="text-[10px] opacity-50 font-medium">Richer color and contrast</p>
                        </div>
                      </div>
                      <div className={`flex-shrink-0 w-8 h-4.5 rounded-full relative transition-colors duration-300 ${qualityVibranceEnabled ? 'bg-primary' : 'bg-white/10'}`}>
                        <div className={`absolute top-0.75 left-0.75 w-3 h-3 rounded-full bg-white transition-transform duration-300 ${qualityVibranceEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                      </div>
                    </button>
                  </div>
                  
                  <div className="px-4 py-2 border-t border-white/5 bg-white/[0.01]">
                    <span className="text-[9px] font-black text-primary/60 uppercase tracking-widest">Beta Features</span>
                  </div>
                </div>
              )}
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setShowMediaMenu(false);
                  setShowSpeedMenu(false);
                  setShowAdvancedMenu(!showAdvancedMenu); 
                }}
                className={`transition-colors flex items-center ${showAdvancedMenu ? 'text-primary' : 'text-white hover:text-primary'}`}
                title="Advanced Settings (Beta)"
              >
                <Sparkles size={22} className={showAdvancedMenu ? "opacity-100" : "opacity-90 hover:opacity-100"} />
              </button>
            </div>
            <div className="relative flex items-center">
              {showSpeedMenu && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 bg-gray-900 rounded-lg shadow-xl border border-gray-700 overflow-hidden min-w-[120px] z-50">
                  <div className="px-3 py-2 bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700">Speed</div>
                  <div className="max-h-56 overflow-y-auto custom-scrollbar flex flex-col">
                    {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5, 4, 4.5, 5].map((rate) => (
                      <button
                        key={rate}
                        onClick={(e) => { e.stopPropagation(); changeSpeed(rate); }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-800 border-b border-gray-800/50 last:border-0 ${playbackRate === rate ? 'text-primary font-medium bg-primary/10' : 'text-gray-300'}`}
                      >
                        {rate === 1 ? 'Normal' : `${rate}x`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setShowMediaMenu(false); 
                  setShowAdvancedMenu(false);
                  setShowSpeedMenu(!showSpeedMenu); 
                }}
                className={`text-white transition-colors text-sm font-bold w-12 flex justify-center ${showSpeedMenu ? 'text-primary' : 'hover:text-primary'}`}
                title="Playback Speed"
              >
                {playbackRate}x
              </button>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); togglePictureInPicture(); }}
              disabled={!isPiPSupported}
              className={`transition-colors ${isPiPActive ? 'text-primary' : isPiPSupported ? 'text-white hover:text-primary' : 'text-white/30 cursor-not-allowed'}`}
              title={isPiPSupported ? (isPiPActive ? 'Exit Picture-in-Picture (P)' : 'Picture-in-Picture (P)') : 'Picture-in-Picture is not available'}
            >
              <PictureInPicture2 size={24} />
            </button>

            <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="text-white hover:text-primary transition-colors" title={isAnyFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
              {isAnyFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
            </button>


          </div>
        </div>
      </div>
      {/* Hidden Custom Audio Extraction Pipeliner */}
      <audio ref={audioRef} style={{ display: 'none' }} />
      {remoteAudioStreams.map(({ peerId, stream }) => (
        <audio
          key={peerId}
          ref={(node) => {
            if (node && node.srcObject !== stream) {
              node.srcObject = stream
              node.play().catch(e => console.log('Remote voice play failed:', e))
            }
          }}
          autoPlay
          playsInline
          style={{ display: 'none' }}
        />
      ))}

      {/* ─── Episodes Slide-in Panel ─────────────────────────────────────── */}
      <div
        className={`absolute top-0 right-0 h-full w-[400px] z-[51] transition-transform duration-300 ease-out ${
          showEpisodesPanel ? 'translate-x-0' : 'translate-x-[120%]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-full bg-black/85 backdrop-blur-2xl border-l border-white/10 flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-2">
              <ListVideo size={16} className="text-primary" />
              <h3 className="text-[14px] font-black text-white uppercase tracking-[0.18em]">Episodes</h3>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowEpisodesPanel(false) }}
              className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/10 text-white/40 hover:text-white transition-all"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 custom-scrollbar">
            {seriesEpisodes.map((episode) => {
              const isActive = episode.id === currentVideo.id;
              return (
                <button
                  key={episode.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isActive) return
                    setShowEpisodesPanel(false)
                    forceRestartRef.current = true
                    setForceRestart(true)
                    setCurrentVideo(episode)
                  }}
                  className={`w-full text-left p-3 rounded-xl flex items-center gap-4 transition-all duration-200 ${
                    isActive 
                      ? 'bg-primary/20 border border-primary/30 shadow-sm' 
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] font-bold truncate ${isActive ? 'text-primary' : 'text-white'}`}>
                      {episode.season ? `S${episode.season} E${episode.episode}` : 'Episode'} - {episode.title}
                    </p>
                    <p className={`text-xs mt-1 truncate ${isActive ? 'text-primary/70' : 'text-gray-400'}`}>
                      {episode.file_path.split(/[/\\]/).pop()}
                    </p>
                  </div>
                  {isActive && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Play size={12} className="fill-black text-black ml-0.5" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ─── Media Info Slide-in Panel ─────────────────────────────────────── */}
      <div
        className={`absolute top-0 right-0 h-full w-80 z-50 transition-transform duration-300 ease-out ${
          showInfoPanel ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-full bg-black/85 backdrop-blur-2xl border-l border-white/10 flex flex-col">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Info size={16} className="text-primary" />
              <h3 className="text-[14px] font-black text-white uppercase tracking-[0.18em]">Media Info</h3>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowInfoPanel(false) }}
              className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/10 text-white/40 hover:text-white transition-all"
            >
              <X size={16} />
            </button>
          </div>

          {/* Panel Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
            {infoLoading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-white/30 text-[12px] font-black uppercase tracking-widest">Analyzing...</p>
              </div>
            ) : mediaInfo?.error ? (
              <p className="text-red-400 text-xs font-medium text-center py-8">{mediaInfo.error}</p>
            ) : mediaInfo ? (
              <>
                {/* File */}
                <PanelSection icon={<HardDrive size={14} className="text-blue-400" />} title="File">
                  <PanelRow label="Name" value={mediaInfo.file?.name} />
                  <PanelRow label="Size" value={mediaInfo.file?.size} />
                  <PanelRow label="Format" value={mediaInfo.container?.format} />
                  <PanelRow label="Bitrate" value={mediaInfo.container?.bitrate} />
                </PanelSection>

                {/* Video */}
                {mediaInfo.video && (
                  <PanelSection icon={<Film size={14} className="text-purple-400" />} title="Video">
                    <PanelRow label="Codec" value={mediaInfo.video.codec} />
                    {mediaInfo.video.profile && <PanelRow label="Profile" value={mediaInfo.video.profile} />}
                    <PanelRow label="Resolution" value={mediaInfo.video.resolution} />
                    <PanelRow label="Frame Rate" value={mediaInfo.video.frameRate} />
                    {mediaInfo.video.bitDepth && <PanelRow label="Bit Depth" value={mediaInfo.video.bitDepth} />}
                    {mediaInfo.video.bitrate && <PanelRow label="Bitrate" value={mediaInfo.video.bitrate} />}
                  </PanelSection>
                )}

                {/* Audio */}
                {mediaInfo.audio?.length > 0 && (
                  <PanelSection icon={<Music size={14} className="text-green-400" />} title={`Audio (${mediaInfo.audio.length})`}>
                    {(showAllAudioInfo ? mediaInfo.audio : mediaInfo.audio.slice(0, 2)).map((track: any, i: number) => (
                      <div key={i} className={i > 0 ? 'border-t border-white/5 pt-2 mt-1' : ''}>
                        {mediaInfo.audio.length > 1 && <p className="text-[10px] font-black text-white/25 uppercase tracking-widest mb-1">Track {track.index}{track.language ? ` · ${track.language.toUpperCase()}` : ''}</p>}
                        <PanelRow label="Codec" value={track.codec} />
                        <PanelRow label="Channels" value={track.channels} />
                        <PanelRow label="Sample Rate" value={track.sampleRate} />
                        {track.bitrate && <PanelRow label="Bitrate" value={track.bitrate} />}
                      </div>
                    ))}
                    {mediaInfo.audio.length > 2 && (
                      <button onClick={() => setShowAllAudioInfo(p => !p)} className="mt-2 flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 font-black uppercase tracking-widest transition-colors">
                        {showAllAudioInfo ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        {showAllAudioInfo ? 'Less' : `+${mediaInfo.audio.length - 2} more`}
                      </button>
                    )}
                  </PanelSection>
                )}

                {/* Subtitles */}
                {mediaInfo.subtitles?.length > 0 && (
                  <PanelSection icon={<Subtitles size={14} className="text-yellow-400" />} title={`Subtitles (${mediaInfo.subtitles.length})`}>
                    <div className="flex flex-wrap gap-1.5">
                      {mediaInfo.subtitles.map((s: any, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[11px] font-bold text-white/50 uppercase tracking-widest">
                          {s.language || s.codec || `#${s.index}`}
                        </span>
                      ))}
                    </div>
                  </PanelSection>
                )}
              </>
            ) : null}
          </div>

          {/* Panel Footer */}
          <div className="px-5 py-3 border-t border-white/5 flex-shrink-0">
            <p className="text-[11px] text-white/20 font-bold uppercase tracking-widest text-center">Press I to toggle</p>
          </div>
        </div>
      </div>

      <WatchTogetherModal
        isHost={isHost}
        roomId={roomId}
        participants={participants}
        isConnecting={isConnecting}
        error={error}
        startHosting={startHosting}
        joinRoom={joinRoom}
        leaveRoom={leaveRoom}
        isOpen={showWatchTogetherState}
        onClose={() => setShowWatchTogetherState(false)}
        debugLogs={debugLogs}
      />
    </div>
  )
}

// ─── Info Panel Helper Components ────────────────────────────────────────────
const PanelSection: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div>
    <div className="flex items-center gap-2 mb-2.5">
      {icon}
      <h4 className="text-[12px] font-black text-white/30 uppercase tracking-[0.2em]">{title}</h4>
    </div>
    <div className="space-y-1.5">{children}</div>
  </div>
)

const PanelRow: React.FC<{ label: string; value: string | null | undefined }> = ({ label, value }) => {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-bold text-white/25 uppercase tracking-wide shrink-0">{label}</span>
      <span className="text-[12px] font-semibold text-white/70 text-right break-all">{value}</span>
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

export default VideoPlayer
