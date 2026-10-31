import React, { useState, useEffect, useRef } from 'react'
import { Check, Copy, ExternalLink, Loader2, MoreVertical, Radio } from 'lucide-react'
import type { FtVideo } from '../../types'
import { avatarHue, formatDuration, formatRelativeTime, formatViews, thumbnailUrl, watchUrl } from '../../utils/focusTube'

interface FocusTubeCardProps {
  video: FtVideo
  onPlay: (video: FtVideo) => void
  onToggleSeen: (video: FtVideo) => void
}

// 16:9 card. The RSS feed only publishes 4:3 hqdefault thumbnails, so we try
// maxresdefault first and step down through the fallbacks on load failure.
const FocusTubeCard: React.FC<FocusTubeCardProps> = ({ video, onPlay, onToggleSeen }) => {
  const [variant, setVariant] = useState(0)
  const [thumbBroken, setThumbBroken] = useState(false)
  const [marking, setMarking] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAvatarFailed(false)
  }, [video.channelAvatarUrl])

  // Close 3-dots menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const duration = formatDuration(video.duration)
  const relativeTime = formatRelativeTime(video.publishedAt)

  // Progress percentage (if partially watched or seen)
  const progressPct = video.position > 5 && video.duration
    ? Math.min(100, Math.round((video.position / video.duration) * 100))
    : video.seen
      ? 100
      : 0

  const handleToggleWatched = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (marking) return
    setMarking(true)
    onToggleSeen(video)
    window.setTimeout(() => setMarking(false), 1200)
  }

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(false)
    void navigator.clipboard.writeText(watchUrl(video.videoId))
  }

  const handleOpenExternal = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(false)
    if (window.api?.openWebPopup) {
      void window.api.openWebPopup(watchUrl(video.videoId))
    } else {
      window.open(watchUrl(video.videoId), '_blank')
    }
  }

  return (
    <div
      onClick={() => onPlay(video)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPlay(video)
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Play ${video.title}`}
      className="group relative isolate flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0e14]/75 backdrop-blur-sm cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-primary/70 hover:ring-1 hover:ring-primary/25 hover:shadow-[0_0_28px_rgba(var(--c-accent),0.22)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary select-none"
    >
      {/* ── 16:9 Thumbnail Area ── */}
      <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-[#101116]">
        {!thumbBroken ? (
          <img
            src={thumbnailUrl(video.videoId, variant)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => {
              if (variant < 3) setVariant((v) => v + 1)
              else setThumbBroken(true)
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] font-bold uppercase tracking-widest text-white/20">
            No preview
          </div>
        )}

        {/* Live Badge */}
        {video.isLive && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg">
            <Radio size={10} /> Live
          </span>
        )}

        {/* Short Badge */}
        {!video.isLive && video.isShort && (
          <span className="absolute top-2.5 left-2.5 rounded-md bg-black/75 border border-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md">
            Short
          </span>
        )}

        {/* Duration Badge (bottom-right) */}
        {duration && (
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/80 border border-white/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums tracking-tight text-white/95 backdrop-blur-sm shadow-sm">
            {duration}
          </span>
        )}

        {/* Mark as Watched Circular Button (top-right) */}
        <button
          type="button"
          onClick={handleToggleWatched}
          disabled={marking}
          title={video.seen ? 'Mark as unwatched' : 'Mark as watched'}
          aria-label={video.seen ? 'Mark as unwatched' : 'Mark as watched'}
          className={`absolute top-2.5 right-2.5 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-xl backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 ${
            video.seen
              ? 'border-primary/60 bg-primary text-white shadow-[0_0_14px_rgba(var(--c-accent),0.55)] opacity-100 hover:bg-primary/90 hover:border-primary'
              : 'border-white/20 bg-black/70 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 hover:border-white/40 hover:bg-black/90'
          }`}
        >
          {marking ? (
            <Loader2 size={16} className="animate-spin text-white" />
          ) : (
            <Check size={18} strokeWidth={2.5} className="text-white" />
          )}
        </button>

        {/* Flush Bottom Progress Line */}
        {progressPct > 0 ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
            <div
              className="h-full bg-primary shadow-[0_0_8px_rgba(var(--c-accent),0.8)] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.04] transition-colors duration-300 group-hover:bg-primary/70" />
        )}

        {/* Non-embeddable warning */}
        {!video.embeddable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 px-4 text-center text-[11px] font-bold uppercase tracking-wide text-amber-400 backdrop-blur-[2px]">
            Embedding disabled by creator
          </div>
        )}
      </div>

      {/* ── Info Section (Below Thumbnail) ── */}
      <div className="flex items-start gap-3 p-3.5">
        {/* Creator Channel Avatar */}
        {video.channelAvatarUrl && !avatarFailed ? (
          <img
            src={video.channelAvatarUrl}
            alt={video.channelTitle}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setAvatarFailed(true)}
            className="h-9 w-9 shrink-0 rounded-full border border-white/10 bg-white/[0.06] object-cover ring-1 ring-white/10"
          />
        ) : (
          <div
            title={video.channelTitle}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black shadow ring-1 ring-white/10"
            style={{
              backgroundColor: `hsl(${avatarHue(video.channelTitle)}, 45%, 26%)`,
              color: `hsl(${avatarHue(video.channelTitle)}, 90%, 82%)`,
            }}
          >
            {video.channelTitle?.trim().charAt(0).toUpperCase() || '?'}
          </div>
        )}

        {/* Title and Metadata */}
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-sm font-bold leading-tight text-white/95 transition-colors group-hover:text-white"
            title={video.title}
          >
            {video.title}
          </h3>
          <p className="mt-1 truncate text-xs font-medium text-white/50">
            {video.channelTitle}
            {video.views ? ` · ${formatViews(video.views)}` : ''}
            {relativeTime ? ` · ${relativeTime}` : ''}
          </p>
        </div>

        {/* 3-Dots Menu Button */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((prev) => !prev)
            }}
            aria-label="More options"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <MoreVertical size={16} />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 bottom-full mb-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#16181f]/95 p-1 text-xs shadow-2xl backdrop-blur-xl z-20"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handleToggleWatched}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-medium text-white/90 hover:bg-white/10 hover:text-white"
              >
                <Check size={14} className="text-white/70" />
                {video.seen ? 'Mark as unwatched' : 'Mark as watched'}
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-medium text-white/90 hover:bg-white/10 hover:text-white"
              >
                <Copy size={14} className="text-white/70" />
                Copy video link
              </button>
              <button
                type="button"
                onClick={handleOpenExternal}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-medium text-white/90 hover:bg-white/10 hover:text-white"
              >
                <ExternalLink size={14} className="text-white/70" />
                Watch on YouTube
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default FocusTubeCard
