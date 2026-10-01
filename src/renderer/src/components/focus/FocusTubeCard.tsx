import React, { useState } from 'react'
import { Bookmark, CheckCircle2, Radio } from 'lucide-react'
import type { FtVideo } from '../../types'
import { formatDuration, formatRelativeTime, formatViews, thumbnailUrl } from '../../utils/focusTube'

interface FocusTubeCardProps {
  video: FtVideo
  onPlay: (video: FtVideo) => void
  onToggleSaved: (video: FtVideo) => void
}

// 16:9 card. The RSS feed only publishes 4:3 hqdefault thumbnails, so we try
// maxresdefault first and step down through the fallbacks on load failure.
const FocusTubeCard: React.FC<FocusTubeCardProps> = ({ video, onPlay, onToggleSaved }) => {
  const [variant, setVariant] = useState(0)
  const [thumbBroken, setThumbBroken] = useState(false)

  const duration = formatDuration(video.duration)

  return (
    <div className="group">
      <div className="relative">
        <button
          type="button"
          onClick={() => onPlay(video)}
          className="block w-full aspect-video rounded-xl overflow-hidden bg-white/5 border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          aria-label={`Play ${video.title}`}
        >
          {!thumbBroken ? (
            <img
              src={thumbnailUrl(video.videoId, variant)}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={() => {
                if (variant < 3) setVariant((v) => v + 1)
                else setThumbBroken(true)
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20 text-xs font-bold uppercase tracking-widest">
              No preview
            </div>
          )}
        </button>

        {video.isLive && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
            <Radio size={11} /> Live
          </span>
        )}

        {!video.isLive && video.isShort && (
          <span className="absolute top-2 left-2 rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-sm">
            Short
          </span>
        )}

        {duration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/85 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {duration}
          </span>
        )}

        {video.seen && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/85 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
            <CheckCircle2 size={11} /> Watched
          </span>
        )}

        {video.position > 5 && (
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/15">
            <span
              className="block h-full bg-primary"
              style={{
                width: `${Math.min(100, video.duration ? (video.position / video.duration) * 100 : 0)}%`,
              }}
            />
          </span>
        )}

        {!video.embeddable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4 text-center text-[11px] font-bold uppercase tracking-wide text-amber-400">
            Embedding disabled by the creator
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white/90 leading-snug line-clamp-2">
            {video.title}
          </h3>
          <p className="mt-1 text-xs text-white/40 font-semibold truncate">
            {video.channelTitle}
          </p>
          <p className="text-xs text-white/30 font-semibold">
            {[formatRelativeTime(video.publishedAt), formatViews(video.views)].filter(Boolean).join(' · ')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onToggleSaved(video)}
          title={video.saved ? 'Remove from saved' : 'Save for later'}
          aria-label={video.saved ? 'Remove from saved' : 'Save for later'}
          className={`shrink-0 rounded-lg p-1.5 transition-colors ${
            video.saved ? 'text-primary' : 'text-white/25 hover:text-white/60 hover:bg-white/5'
          }`}
        >
          <Bookmark size={16} fill={video.saved ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  )
}

export default FocusTubeCard
