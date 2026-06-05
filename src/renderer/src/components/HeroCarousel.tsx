import React, { useState, useEffect } from 'react'
import { Play, ChevronLeft, ChevronRight } from 'lucide-react'
import { Video } from '../types'

interface HeroCarouselProps {
  items: Video[]
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
}

const getHeroImageUrl = (path?: string | null) => {
  if (!path) return ''
  if (path.startsWith('https://image.tmdb.org/t/p/')) {
    return path.replace(/\/t\/p\/[^/]+\//, '/t/p/w1280/')
  }
  return path.startsWith('http') ? path : `media://file/${encodeURIComponent(path)}`
}

const getHeroLogoUrl = (path?: string | null) => {
  if (!path) return ''
  return path.startsWith('http') ? path : `media://file/${encodeURIComponent(path)}`
}

const getHeroItemKey = (video: Video) => `${video.type}:${video.tmdb_id || video.id}`
const hasOwnLogoResolution = (logoPaths: Record<string, string | null>, key: string) => (
  Object.prototype.hasOwnProperty.call(logoPaths, key)
)

const HeroCarousel: React.FC<HeroCarouselProps> = ({ items, onPlay, onShowDetail }) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)
  const [resolvedLogoPaths, setResolvedLogoPaths] = useState<Record<string, string | null>>({})
  const [failedLogoKeys, setFailedLogoKeys] = useState<Set<string>>(() => new Set())
  const [slowLogoKeys, setSlowLogoKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!isAutoPlaying || items.length === 0) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [isAutoPlaying, items.length])

  useEffect(() => {
    const candidateMap = new Map<string, Video>()
    items.forEach(item => {
      const key = getHeroItemKey(item)
      if (
        item.type !== 'video' &&
        Boolean(item.tmdb_id) &&
        !item.logo_path &&
        !hasOwnLogoResolution(resolvedLogoPaths, key)
      ) {
        candidateMap.set(key, item)
      }
    })
    const logoCandidates = Array.from(candidateMap.values())

    if (logoCandidates.length === 0) return
    let cancelled = false

    Promise.all(logoCandidates.map(async item => {
      const key = getHeroItemKey(item)
      const tmdbId = item.tmdb_id
      if (!tmdbId || item.type === 'video') return [key, null] as const

      try {
        const logoPath = await window.api.getTmdbTitleLogo(item.type, tmdbId)
        return [key, logoPath] as const
      } catch (error) {
        console.error(`[HeroCarousel] Failed to fetch title logo for ${key}:`, error)
        return [key, null] as const
      }
    })).then(entries => {
      if (cancelled) return
      setResolvedLogoPaths(previous => {
        const next = { ...previous }
        entries.forEach(([key, logoPath]) => {
          next[key] = logoPath
        })
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [items, resolvedLogoPaths])

  const logoWaitItem = items[currentIndex]
  const logoWaitKey = logoWaitItem ? getHeroItemKey(logoWaitItem) : ''
  const shouldWaitForLogo = Boolean(
    logoWaitItem &&
    logoWaitItem.type !== 'video' &&
    logoWaitItem.tmdb_id &&
    !logoWaitItem.logo_path &&
    !failedLogoKeys.has(logoWaitKey) &&
    !hasOwnLogoResolution(resolvedLogoPaths, logoWaitKey)
  )

  useEffect(() => {
    if (!shouldWaitForLogo || !logoWaitKey) return

    const timer = window.setTimeout(() => {
      setSlowLogoKeys(previous => {
        const next = new Set(previous)
        next.add(logoWaitKey)
        return next
      })
    }, 1500)

    return () => window.clearTimeout(timer)
  }, [shouldWaitForLogo, logoWaitKey])

  if (items.length === 0) {
    return (
      <div className="w-full min-h-[570px] h-[73vh] max-h-[800px] bg-white/5 animate-pulse flex items-center justify-center">
        <div className="text-white/10 font-black text-4xl uppercase italic">Loading Featured Content...</div>
      </div>
    )
  }

  const current = items[currentIndex]
  const currentKey = getHeroItemKey(current)
  const displayTitle = current.type === 'series' && current.series_name ? current.series_name : current.title
  const canResolveTmdbLogo = current.type !== 'video' && Boolean(current.tmdb_id)
  const logoLookupComplete = Boolean(current.logo_path) || !canResolveTmdbLogo || hasOwnLogoResolution(resolvedLogoPaths, currentKey)
  const resolvedLogoPath = current.logo_path || resolvedLogoPaths[currentKey] || null
  const visibleLogoPath = failedLogoKeys.has(currentKey) ? null : resolvedLogoPath
  const shouldShowTextFallback = logoLookupComplete || slowLogoKeys.has(currentKey)
  const progressPercent = current.last_watched_time && current.duration
    ? Math.min(100, Math.max(0, (current.last_watched_time / current.duration) * 100))
    : 0
  const actionLabel = progressPercent > 0 ? 'Resume' : 'Play Now'
  const mediaLabel = current.type === 'series'
    ? current.season && current.episode
      ? `S${current.season} E${current.episode}`
      : 'Web Series'
    : current.type === 'video'
      ? 'Video'
      : 'Movie'

  const next = () => {
    setIsAutoPlaying(false)
    setCurrentIndex((prev) => (prev + 1) % items.length)
  }

  const prev = () => {
    setIsAutoPlaying(false)
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length)
  }

  return (
    <div
      className="relative w-full min-h-[570px] h-[73vh] max-h-[800px] overflow-hidden bg-black group cursor-pointer"
      onClick={() => onShowDetail(current)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onShowDetail(current)
        }
      }}
    >
      {/* Background Backdrops */}
      {items.map((item, idx) => {
        const previousIndex = (currentIndex - 1 + items.length) % items.length
        const nextIndex = (currentIndex + 1) % items.length
        const shouldRenderVisuals = idx === currentIndex || idx === previousIndex || idx === nextIndex
        const imageUrl = shouldRenderVisuals ? getHeroImageUrl(item.backdrop_path || item.poster_path) : ''

        return (
          <div
            key={item.tmdb_id || item.id}
            className={`absolute inset-0 transition-all duration-1000 ease-in-out ${
              idx === currentIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-110'
            }`}
          >
            {shouldRenderVisuals && (
              <>
                <img
                  src={imageUrl}
                  className="absolute inset-0 h-full w-full scale-110 object-cover object-center blur-2xl opacity-70"
                  alt=""
                  loading={idx === currentIndex ? 'eager' : 'lazy'}
                  decoding="async"
                  fetchPriority={idx === currentIndex ? 'high' : 'auto'}
                />
                <img
                  src={imageUrl}
                  className="relative z-10 h-full w-full object-cover object-[center_28%]"
                  alt=""
                  loading={idx === currentIndex ? 'eager' : 'lazy'}
                  decoding="async"
                  fetchPriority={idx === currentIndex ? 'high' : 'auto'}
                />
                {/* Overlays */}
                <div className="absolute inset-0 z-20 bg-gradient-to-r from-black/88 via-black/42 to-black/5" />
                <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#05080d] via-transparent to-black/20" />
                <div className="absolute inset-y-0 right-0 z-20 w-1/4 bg-gradient-to-l from-black/55 to-transparent" />
              </>
            )}
          </div>
        )
      })}

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end px-8 pb-16 pt-24 md:px-16 md:pb-20 md:pt-20 space-y-3">
        {visibleLogoPath ? (
          <img
            src={getHeroLogoUrl(visibleLogoPath)}
            alt={displayTitle}
            className="max-h-28 w-auto max-w-[min(620px,74vw)] object-contain object-left drop-shadow-[0_8px_28px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-left-8 duration-700 delay-100"
            decoding="async"
            onError={() => {
              setFailedLogoKeys(previous => {
                const next = new Set(previous)
                next.add(currentKey)
                return next
              })
            }}
          />
        ) : shouldShowTextFallback ? (
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase italic leading-[0.9] max-w-2xl animate-in fade-in slide-in-from-left-8 duration-700 delay-100">
            {displayTitle}
          </h2>
        ) : (
          <div className="h-14 md:h-20" aria-hidden="true" />
        )}

        <div className="flex items-center gap-3 text-white/60 font-bold text-xs animate-in fade-in slide-in-from-left-12 duration-700 delay-200">
          {current.release_year && (
            <>
              <span>{current.release_year}</span>
              <span className="w-1 h-1 bg-white/20 rounded-full" />
            </>
          )}
          <span className="uppercase tracking-widest">{mediaLabel}</span>
          {progressPercent > 0 && (
            <>
              <span className="w-1 h-1 bg-white/20 rounded-full" />
              <span className="uppercase tracking-widest">{Math.round(progressPercent)}% watched</span>
            </>
          )}
        </div>

        <p className="text-white/45 text-xs md:text-sm font-medium max-w-lg line-clamp-2 animate-in fade-in slide-in-from-left-16 duration-700 delay-300">
          {current.overview || "Loading description..."}
        </p>

        <div className="flex items-center gap-4 pt-1 animate-in fade-in slide-in-from-left-20 duration-700 delay-500">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPlay(current)
            }}
            className="flex items-center gap-2.5 bg-red-600 hover:bg-red-700 text-white px-7 py-3.5 rounded-2xl font-black text-xs tracking-widest transition-all shadow-lg hover:scale-105 active:scale-95 group/btn uppercase italic"
          >
            <Play fill="white" size={18} className="group-hover/btn:scale-110 transition-transform" />
            {actionLabel}
          </button>
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="absolute bottom-8 right-8 md:right-12 flex items-center gap-4">
        <button
          onClick={(e) => {
            e.stopPropagation()
            prev()
          }}
          className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all border border-white/5 hover:scale-110"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex gap-2">
          {items.map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                idx === currentIndex ? 'w-8 bg-red-600' : 'w-1.5 bg-white/20'
              }`}
            />
          ))}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            next()
          }}
          className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all border border-white/5 hover:scale-110"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  )
}

export default HeroCarousel
