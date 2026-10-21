import React, { useState, useEffect } from 'react'
import { Check, CheckCircle2, Loader2, Play, Plus, Radio } from 'lucide-react'
import type { FtVideo } from '../../types'
import { avatarHue, formatDuration, formatRelativeTime, formatViews, thumbnailUrl } from '../../utils/focusTube'

interface FocusTubeCardProps {
  video: FtVideo
  onPlay: (video: FtVideo) => void
  onToggleSeen: (video: FtVideo) => void
  isSubscribed?: boolean
  onSubscribe?: (video: FtVideo) => void
}

// 16:9 card. The RSS feed only publishes 4:3 hqdefault thumbnails, so we try
// maxresdefault first and step down through the fallbacks on load failure.
const FocusTubeCard: React.FC<FocusTubeCardProps> = ({ video, onPlay, onToggleSeen, isSubscribed, onSubscribe }) => {
  const [variant, setVariant] = useState(0)
  const [thumbBroken, setThumbBroken] = useState(false)
  const [marking, setMarking] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)

  useEffect(() => {
    setAvatarFailed(false)
  }, [video.channelAvatarUrl])

  const duration = formatDuration(video.duration)

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
      className="group relative isolate flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0c0e14]/75 backdrop-blur-sm cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-red-500/60 hover:ring-1 hover:ring-red-500/25 hover:shadow-[0_0_28px_rgba(229,9,20,0.22)] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 select-none"
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
          <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-black/75 border border-white/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums tracking-tight text-white/95 backdrop-blur-md shadow-sm">
            {duration}
          </span>
        )}

        {/* Watched Indicator (top-right when idle, if seen) */}
        {video.seen && (
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-black/70 border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400 backdrop-blur-md transition-opacity duration-200 group-hover:opacity-0">
            <CheckCircle2 size={11} /> Watched
          </span>
        )}

        {/* Flush Bottom Progress Line */}
        {progressPct > 0 ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
            <div
              className="h-full bg-red-600 shadow-[0_0_8px_rgba(229,9,20,0.8)] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.04] transition-colors duration-300 group-hover:bg-red-600/70" />
        )}

        {/* Non-embeddable warning */}
        {!video.embeddable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 px-4 text-center text-[11px] font-bold uppercase tracking-wide text-amber-400 backdrop-blur-[2px]">
            Embedding disabled by creator
          </div>
        )}

        {/* ── Hover Quick-Action Cluster (Centered Frosted Pills) ── */}
        <div
          className="absolute inset-0 flex items-center justify-center gap-2.5 bg-black/55 backdrop-blur-[3px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          aria-hidden="true"
        >
          {/* Play Button Pill */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPlay(video)
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-black text-black shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Play size={13} fill="currentColor" strokeWidth={0} />
            <span>Play</span>
          </button>

          {/* Watched Toggle Pill */}
          <button
            type="button"
            onClick={handleToggleWatched}
            disabled={marking}
            title={video.seen ? 'Mark as unwatched' : 'Mark as watched'}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold shadow-xl backdrop-blur-md transition-all duration-200 hover:scale-105 active:scale-95 ${
              video.seen
                ? 'border border-emerald-400/40 bg-emerald-500/25 text-emerald-200 hover:bg-emerald-500/35'
                : 'border border-white/20 bg-black/60 text-white hover:bg-white/20'
            }`}
          >
            {marking ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Check size={13} strokeWidth={video.seen ? 3.5 : 2.5} />
            )}
            <span>{video.seen ? 'Watched' : 'Mark Watched'}</span>
          </button>
        </div>
      </div>

      {/* ── Info Section (Below Thumbnail) ── */}
      <div className="flex items-center gap-3 p-3.5">
        {/* Creator Channel Avatar */}
        {video.channelAvatarUrl && !avatarFailed ? (
          <img
            src={video.channelAvatarUrl}
            alt={video.channelTitle}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setAvatarFailed(true)}
            className="h-10 w-10 shrink-0 rounded-full border border-white/10 bg-white/[0.06] object-cover ring-1 ring-white/10"
          />
        ) : (
          <div
            title={video.channelTitle}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black shadow ring-1 ring-white/10"
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
            {video.views ? ` • ${formatViews(video.views)}` : ''}
            {video.publishedAt ? ` • ${formatRelativeTime(video.publishedAt)} ago` : ''}
          </p>
        </div>
        {onSubscribe && isSubscribed !== undefined && (
          isSubscribed ? (
            <span
              title="Subscribed to channel"
              className="shrink-0 flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400"
            >
              <Check size={10} strokeWidth={3} />
              <span>Subscribed</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSubscribe(video)
              }}
              title={`Subscribe to ${video.channelTitle}`}
              className="shrink-0 inline-flex items-center gap-1 rounded-full border border-red-500/50 bg-red-600/20 px-2.5 py-1 text-[11px] font-bold text-red-300 transition-all hover:bg-red-600 hover:text-white hover:border-red-500 hover:scale-105 active:scale-95 shadow-sm"
            >
              <Plus size={11} strokeWidth={2.5} />
              <span>Subscribe</span>
            </button>
          )
        )}
      </div>
    </div>
  )
}

export default FocusTubeCard
