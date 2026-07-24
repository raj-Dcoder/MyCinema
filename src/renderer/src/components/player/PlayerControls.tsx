import React, { useEffect, useState } from 'react'
import { Video } from '../../types'
import { IntroDbSegment, getIntroDbSegmentKey, getIntroDbSegmentLabel, getIntroDbSegmentAccentClass } from '../../hooks/useIntroSkip'
import { AudioBoostProfile, AudioBoostIntensity, AUDIO_BOOST_PROFILES, AUDIO_BOOST_INTENSITIES } from '../../hooks/useAudioBoost'
import {
  SkipForward as SkipNext, Loader2, Rewind, Pause, Play, FastForward, Volume2, ListVideo, FolderOpen,
  Users, Info, Crop, RectangleHorizontal, Monitor, Sparkles, Zap, Wand2, PictureInPicture2,
  Minimize, Maximize, Bookmark, Clock, Activity
} from 'lucide-react'

export interface PlayerControlsProps {
  showControls: boolean
  hoverTime: number | null
  hoverPosition: number
  seekPreviewImageSrc: string | null
  seekPreviewLoading: boolean
  duration: number
  currentTime: number
  seekPreview: number | null
  introDbSegments: IntroDbSegment[]
  isPlaying: boolean
  isHost: boolean
  roomId: string | null
  volume: number
  currentVideo: Video
  canControlPlayback: boolean
  showEpisodesPanel: boolean
  showInfoPanel: boolean
  isTorrentStream: boolean
  aspectMode: 'cover' | 'fill' | 'contain'
  showAdvancedMenu: boolean
  showSpeedMenu: boolean
  fpsBoostEnabled: boolean
  highSpeedMotionPaused: boolean
  audioBoostEnabled: boolean
  audioBoostProfile: AudioBoostProfile
  audioBoostIntensity: AudioBoostIntensity
  qualitySharpnessEnabled: boolean
  qualityVibranceEnabled: boolean
  autoSkipIntroOutroEnabled: boolean
  playbackRate: number
  isPiPActive: boolean
  isPiPSupported: boolean
  isAnyFullscreen: boolean
  highSpeedPerformanceRate: number

  sleepTimerEnd: number | null
  showSleepMenu: boolean
  showStats: boolean
  bookmarks: { time: number }[]

  handleProgressMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void
  handleProgressMouseLeave: () => void
  handleSeekChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleSeekMouseDown: () => void
  handleSeekMouseUp: (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => void
  seek: (seconds: number) => void
  seekToTime: (time: number) => void
  togglePlay: (e: React.MouseEvent) => void
  handleVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  setShowEpisodesPanel: (show: boolean) => void
  handleOpenFolder: () => void
  setShowWatchTogetherState: (show: boolean) => void
  handleToggleInfoPanel: () => void
  cycleAspectRatio: () => void
  setShowAdvancedMenu: (show: boolean) => void
  setShowSleepMenu: (show: boolean) => void
  setShowSpeedMenu: (show: boolean) => void
  setShowMediaMenu: (show: boolean) => void
  setFpsBoostEnabled: (enabled: boolean) => void
  setAudioBoostEnabled: (enabled: boolean) => void
  setAudioBoostProfile: (profile: AudioBoostProfile) => void
  setAudioBoostIntensity: (intensity: AudioBoostIntensity) => void
  setQualitySharpnessEnabled: (enabled: boolean) => void
  setQualityVibranceEnabled: (enabled: boolean) => void
  toggleAutoSkipIntroOutro: () => void
  changeSpeed: (rate: number) => void
  togglePictureInPicture: () => void
  toggleFullscreen: () => void

  setSleepTimerEnd: (time: number | null) => void
  setShowStats: (show: boolean) => void
  toggleBookmark: () => void
  removeBookmark: (time: number) => void
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  showControls,
  hoverTime,
  hoverPosition,
  seekPreviewImageSrc,
  seekPreviewLoading,
  duration,
  currentTime,
  seekPreview,
  introDbSegments,
  isPlaying,
  isHost,
  roomId,
  volume,
  currentVideo,
  canControlPlayback,
  showEpisodesPanel,
  showInfoPanel,
  isTorrentStream,
  aspectMode,
  showAdvancedMenu,
  showSpeedMenu,
  fpsBoostEnabled,
  highSpeedMotionPaused,
  audioBoostEnabled,
  audioBoostProfile,
  audioBoostIntensity,
  qualitySharpnessEnabled,
  qualityVibranceEnabled,
  autoSkipIntroOutroEnabled,
  playbackRate,
  isPiPActive,
  isPiPSupported,
  isAnyFullscreen,
  highSpeedPerformanceRate,
  sleepTimerEnd,
  showSleepMenu,
  showStats,
  bookmarks,

  handleProgressMouseMove,
  handleProgressMouseLeave,
  handleSeekChange,
  handleSeekMouseDown,
  handleSeekMouseUp,
  seek,
  seekToTime,
  togglePlay,
  handleVolumeChange,
  setShowEpisodesPanel,
  handleOpenFolder,
  setShowWatchTogetherState,
  handleToggleInfoPanel,
  cycleAspectRatio,
  setShowAdvancedMenu,
  setShowSleepMenu,
  setShowSpeedMenu,
  setShowMediaMenu,
  setFpsBoostEnabled,
  setAudioBoostEnabled,
  setAudioBoostProfile,
  setAudioBoostIntensity,
  setQualitySharpnessEnabled,
  setQualityVibranceEnabled,
  toggleAutoSkipIntroOutro,
  changeSpeed,
  togglePictureInPicture,
  toggleFullscreen,
  setSleepTimerEnd,
  setShowStats,
  toggleBookmark,
  removeBookmark
}) => {
  const [, setTick] = useState(0)
  
  useEffect(() => {
    if (!sleepTimerEnd) return
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [sleepTimerEnd])

  const [tourStep, setTourStep] = useState(0)

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('hasSeenPlayerFeaturesTour_v1')
    if (!hasSeenTour) {
      setTourStep(1)
    }
  }, [])

  const nextTourStep = () => {
    if (tourStep === 3) {
      localStorage.setItem('hasSeenPlayerFeaturesTour_v1', 'true')
      setTourStep(0)
    } else {
      setTourStep(prev => prev + 1)
    }
  }

  return (
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
        
        {/* Bookmarks */}
        {duration > 0 && bookmarks.map((bookmark) => {
          const leftPercent = (bookmark.time / duration) * 100
          return (
            <div
              key={bookmark.time}
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-400 cursor-pointer shadow-lg z-30 transition-transform hover:scale-150"
              style={{ left: `calc(${leftPercent}% - 4px)` }}
              title={`Bookmark at ${formatTime(bookmark.time)} (Click to remove)`}
              onClick={(e) => {
                e.stopPropagation();
                if (e.altKey || e.shiftKey) {
                  removeBookmark(bookmark.time)
                } else {
                  seekToTime(bookmark.time)
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                removeBookmark(bookmark.time)
              }}
            />
          )
        })}

        <div 
          className="absolute w-3 h-3 bg-primary rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity top-1/2 -translate-y-1/2 z-10 group-hover/progress:scale-125"
          style={{ left: `calc(${(currentTime / duration) * 100}% - 6px)` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <button onClick={() => seek(-10)} className="text-white hover:text-primary hover:-translate-x-1 transition-all" title="Rewind 10s">
            <Rewind size={28} fill="currentColor" />
          </button>
          <button onClick={togglePlay} className="text-white hover:scale-110 transition-transform">
            {isPlaying ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" />}
          </button>
          <button onClick={() => seek(10)} className="text-white hover:text-primary hover:translate-x-1 transition-all" title="Forward 10s">
            <FastForward size={28} fill="currentColor" />
          </button>

          {/* Volume */}
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
          
          {/* Toggle Bookmark */}
          {(() => {
            const hasBookmark = bookmarks.some(b => Math.abs(b.time - currentTime) < 1)
            return (
              <div className="relative flex items-center">
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleBookmark(); }}
                  className={`transition-colors ml-4 ${hasBookmark ? 'text-amber-400 hover:text-white' : 'text-white hover:text-amber-400'}`}
                  title={hasBookmark ? "Remove Bookmark" : "Add Bookmark"}
                >
                  <Bookmark size={20} className="opacity-90 hover:opacity-100" fill={hasBookmark ? "currentColor" : "none"} />
                </button>
                {tourStep === 1 && (
                  <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-64 bg-primary text-black p-4 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95">
                    <h4 className="font-black text-[15px] mb-1 leading-tight tracking-tight">New: Bookmarks! 🔖</h4>
                    <p className="text-[12px] font-medium mb-3 text-black/80">Click here to save any moment. Dots will appear on the timeline to let you jump back anytime.</p>
                    <button onClick={(e) => { e.stopPropagation(); nextTourStep(); }} className="w-full bg-black text-white rounded-md py-2 text-[11px] uppercase tracking-wider font-bold hover:bg-black/80 transition-colors">Got it</button>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-primary" />
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        <div className="flex items-center gap-5">
          {/* Episodes */}
          {currentVideo.type === 'series' && currentVideo.series_name && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowEpisodesPanel(!showEpisodesPanel); }}
              className={`transition-colors flex items-center ${showEpisodesPanel ? 'text-primary' : 'text-white hover:text-primary'}`}
              title="Episodes"
            >
              <ListVideo size={22} className="opacity-90 hover:opacity-100" />
            </button>
          )}

          {/* Open Folder */}
          {!isTorrentStream && (
            <button
              onClick={(e) => { e.stopPropagation(); handleOpenFolder(); }}
              className="text-white hover:text-primary transition-colors"
              title="Open in Explorer"
            >
              <FolderOpen size={22} className="opacity-90 hover:opacity-100" />
            </button>
          )}

          {/* Watch Together */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowWatchTogetherState(true); }}
            className={`transition-colors ${roomId !== null ? 'text-indigo-400' : 'text-white hover:text-indigo-400'}`}
            title="Watch Together"
          >
            <Users size={22} className="opacity-90 hover:opacity-100" />
          </button>

          {/* Media Info */}
          {!isTorrentStream && (
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleInfoPanel(); }}
              className={`transition-colors ${showInfoPanel ? 'text-primary' : 'text-white hover:text-primary'}`}
              title="Media Info (I)"
            >
              <Info size={22} className="opacity-90 hover:opacity-100" />
            </button>
          )}

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
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowSleepMenu(!showSleepMenu)
              }}
              className={`transition-colors flex items-center relative ${sleepTimerEnd || showSleepMenu ? 'text-amber-400' : 'text-white hover:text-amber-400'}`}
              title="Sleep Timer"
            >
              <Clock size={22} className="opacity-90 hover:opacity-100" />
              {sleepTimerEnd && (() => {
                const msLeft = sleepTimerEnd - Date.now()
                if (msLeft <= 0) return null
                const minsLeft = Math.floor(msLeft / 60000)
                const secsLeft = Math.floor(msLeft / 1000)
                const text = minsLeft > 0 ? `${minsLeft}m` : `${secsLeft}s`
                return (
                  <span className="absolute -top-2 -right-2 bg-amber-400 text-black text-[9px] font-bold px-1 rounded-sm shadow-md">
                    {text}
                  </span>
                )
              })()}
            </button>

            {tourStep === 2 && (
              <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-64 bg-primary text-black p-4 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95">
                <h4 className="font-black text-[15px] mb-1 leading-tight tracking-tight">New: Sleep Timer ⏱️</h4>
                <p className="text-[12px] font-medium mb-3 text-black/80">Set an automatic timer to pause the player so you don't lose your spot when falling asleep.</p>
                <button onClick={(e) => { e.stopPropagation(); nextTourStep(); }} className="w-full bg-black text-white rounded-md py-2 text-[11px] uppercase tracking-wider font-bold hover:bg-black/80 transition-colors">Got it</button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-primary" />
              </div>
            )}

            {showSleepMenu && (
              <div 
                className="absolute bottom-full right-0 mb-6 bg-[#111111]/90 backdrop-blur-2xl rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-white/10 overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-300 w-[240px]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                  <div className="flex items-center space-x-2">
                    <Clock size={14} className="text-amber-400" />
                    <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Sleep Timer</h3>
                  </div>
                </div>
                
                <div className="p-2 space-y-1">
                  <div className="grid grid-cols-4 gap-1">
                    {[15, 30, 45, 60].map((mins) => {
                      const isActive = sleepTimerEnd !== null && Math.abs(sleepTimerEnd - (Date.now() + mins * 60000)) < 60000
                      return (
                        <button
                          key={mins}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSleepTimerEnd(Date.now() + mins * 60000)
                            setShowSleepMenu(false)
                          }}
                          className={`rounded-md py-1.5 text-[11px] font-bold transition-all ${
                            isActive 
                              ? 'bg-amber-400/20 text-amber-400' 
                              : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90'
                          }`}
                        >
                          {mins}m
                        </button>
                      )
                    })}
                  </div>
                  
                  <div className="pt-2 px-1 pb-1">
                    <p className="text-[10px] font-bold tracking-tight text-white/50 mb-1.5 uppercase">Custom Time</p>
                    <div className="flex space-x-2">
                      <input 
                        type="number"
                        min="1"
                        max="720"
                        placeholder="Minutes"
                        className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[11px] text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(e.currentTarget.value)
                            if (!isNaN(val) && val > 0) {
                              setSleepTimerEnd(Date.now() + val * 60000)
                              setShowSleepMenu(false)
                            }
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="pt-1 mt-1 border-t border-white/5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSleepTimerEnd(null)
                        setShowSleepMenu(false)
                      }}
                      className={`w-full rounded-md py-1.5 text-[11px] font-bold transition-all ${
                        sleepTimerEnd === null 
                          ? 'bg-white/10 text-white' 
                          : 'text-white/40 hover:bg-white/10 hover:text-white/80'
                      }`}
                    >
                      Turn Off Timer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

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
                      <p className="mt-0.5 text-[10px] font-medium leading-snug text-white/55">FPS Boost resumes below {highSpeedPerformanceRate}x. Sharpness and vibrance stay on.</p>
                    </div>
                  )}

                  {/* Stats for Nerds */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowStats(!showStats)
                    }}
                    className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-200 group ${showStats ? 'bg-primary/10 text-primary' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                  >
                    <div className="flex items-center space-x-3">
                      <Activity size={18} className={showStats ? "text-primary" : "text-white/30"} />
                      <div className="text-left">
                        <p className="text-[13px] font-bold tracking-tight">Stats for Nerds</p>
                        <p className="text-[10px] opacity-50 font-medium">Resolution, FPS, Drops</p>
                      </div>
                    </div>
                    <div className={`flex-shrink-0 w-8 h-4.5 rounded-full relative transition-colors duration-300 ${showStats ? 'bg-primary' : 'bg-white/10'}`}>
                      <div className={`absolute top-0.75 left-0.75 w-3 h-3 rounded-full bg-white transition-transform duration-300 ${showStats ? 'translate-x-3.5' : 'translate-x-0'}`} />
                    </div>
                  </button>

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
            {tourStep === 3 && (
              <div className="absolute bottom-full right-0 mb-4 w-64 bg-primary text-black p-4 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95">
                <h4 className="font-black text-[15px] mb-1 leading-tight tracking-tight">New: Stats for Nerds 📊</h4>
                <p className="text-[12px] font-medium mb-3 text-black/80">Geek out with real-time video stats like framerate and resolution. Find it here in Advanced Settings.</p>
                <button onClick={(e) => { e.stopPropagation(); nextTourStep(); }} className="w-full bg-black text-white rounded-md py-2 text-[11px] uppercase tracking-wider font-bold hover:bg-black/80 transition-colors">Got it</button>
                <div className="absolute top-full right-[2px] border-8 border-transparent border-t-primary" />
              </div>
            )}
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
  )
}
