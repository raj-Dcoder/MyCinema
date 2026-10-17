import React, { useState } from 'react'
import { Check, CheckCircle2, Loader2, Play, Radio } from 'lucide-react'
import type { FtVideo } from '../../types'
import { avatarHue, formatDuration, formatRelativeTime, formatViews, thumbnailUrl } from '../../utils/focusTube'

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

  const duration = formatDuration(video.duration)

  return (
    <div className="group relative isolate overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.035] to-white/[0.015] transition duration-300 hover:-translate-y-0.5 hover:border-white/[0.13] hover:shadow-[0_18px_44px_-28px_rgba(0,0,0,0.95)]">
      <div className="relative isolate overflow-hidden rounded-t-2xl">
        <button
          type="button"
          onClick={() => onPlay(video)}
          className="relative block aspect-video w-full overflow-hidden rounded-t-2xl bg-[#101116] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/70"
          aria-label={`Play ${video.title}`}
        >
          {!thumbBroken ? (
            <img
              src={thumbnailUrl(video.videoId, variant)}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
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
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          >
            <span className="flex h-12 w-12 scale-90 items-center justify-center rounded-full bg-primary/90 text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.9)] backdrop-blur transition-transform duration-300 group-hover:scale-100">
              <Play size={20} className="ml-0.5" fill="currentColor" />
            </span>
          </span>
        </button>

        {video.isLive && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-lg">
            <Radio size={10} /> Live
          </span>
        )}

        {!video.isLive && video.isShort && (
          <span className="absolute top-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-sm">
            Short
          </span>
        )}

        {duration && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/85 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white backdrop-blur-sm">
            {duration}
          </span>
        )}

        {video.seen && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/85 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400 backdrop-blur-sm">
            <CheckCircle2 size={11} /> Watched
          </span>
        )}

        {video.position > 5 && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
            <span
              className="block h-full rounded-r-full bg-primary"
              style={{
                width: `${Math.min(100, video.duration ? (video.position / video.duration) * 100 : 0)}%`,
              }}
            />
          </span>
        )}

        {!video.embeddable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4 text-center text-[11px] font-bold uppercase tracking-wide text-amber-400 backdrop-blur-[2px]">
            Embedding disabled by the creator
          </div>
        )}
      </div>

      <div className="flex items-start gap-2.5 px-3.5 pb-3.5 pt-3">
        {video.channelAvatarUrl && !avatarFailed ? (
          <img
            src={video.channelAvatarUrl}
            alt={video.channelTitle}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setAvatarFailed(true)}
            className="mt-0.5 h-9 w-9 shrink-0 rounded-full border border-white/10 bg-white/[0.06] object-cover ring-1 ring-white/10"
          />
        ) : (
          <div
            title={video.channelTitle}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black shadow ring-1 ring-white/10"
            style={{
              backgroundColor: `hsl(${avatarHue(video.channelTitle)}, 45%, 26%)`,
              color: `hsl(${avatarHue(video.channelTitle)}, 90%, 82%)`,
            }}
          >
            {video.channelTitle?.trim().charAt(0).toUpperCase() || '?'}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-white/90 transition-colors group-hover:text-white">
            {video.title}
          </h3>
          <p className="mt-1 truncate text-xs font-semibold text-white/60">
            {video.channelTitle}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-white/35">
            {video.views ? `${formatViews(video.views)} • ` : ''}
            {formatRelativeTime(video.publishedAt)} ago
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (marking) return
            setMarking(true)
            onToggleSeen(video)
            // The parent reloads the feed (this card usually disappears
            // underneath when "Unseen only" is on); clear the spinner shortly
            // after in case the card stays mounted.
            window.setTimeout(() => setMarking(false), 1200)
          }}
          title={video.seen ? 'Mark as unwatched' : 'Mark as watched'}
          aria-label={video.seen ? 'Mark as unwatched' : 'Mark as watched'}
          aria-pressed={video.seen}
          className={`shrink-0 rounded-lg p-1.5 transition-all disabled:cursor-wait ${
            video.seen
              ? 'bg-emerald-400/15 text-emerald-300'
              : 'text-white/20 hover:bg-white/[0.07] hover:text-white/70'
          }`}
        >
          {marking ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Check size={16} strokeWidth={video.seen ? 3.5 : 2.5} />
          )}
        </button>
      </div>
    </div>
  )
}

export default FocusTubeCard
