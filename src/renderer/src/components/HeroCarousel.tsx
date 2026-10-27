import React, { useState, useEffect } from 'react'
import { Play, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Video } from '../types'
import { getOnlineResumeKey } from '../utils/streamResume'
import { NewEpisodeBadge, OnlineBadge, NextEpisodeBadge } from './StreamBadges'

interface HeroCarouselProps {
  items: Video[]
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
  resumingKey?: string | null
  isActive?: boolean
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

const HeroCarousel: React.FC<HeroCarouselProps> = ({ items, onPlay, onShowDetail, resumingKey, isActive = true }) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)
  const [resolvedLogoPaths, setResolvedLogoPaths] = useState<Record<string, string | null>>({})
  const [failedLogoKeys, setFailedLogoKeys] = useState<Set<string>>(() => new Set())
  const [slowLogoKeys, setSlowLogoKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!isAutoPlaying || !isActive || items.length === 0) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [isAutoPlaying, isActive, items.length])

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
      <div className="hero-spotlight-banner relative w-full min-h-[460px] sm:min-h-[490px] overflow-hidden rounded-[28px] border">
        <div className="flex flex-col lg:flex-row h-full">
          <div className="w-full lg:w-[50%] p-8 md:p-12 space-y-4">
            <div className="h-6 w-28 rounded-md bg-slate-200 dark:bg-white/10 animate-pulse" />
            <div className="h-12 w-3/4 rounded-lg bg-slate-200 dark:bg-white/10 animate-pulse" />
            <div className="flex gap-3">
              <div className="h-4 w-16 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
              <div className="h-4 w-20 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
            </div>
            <div className="space-y-2 pt-2">
              <div className="h-4 w-full rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
              <div className="h-4 w-5/6 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
            </div>
            <div className="flex gap-3 pt-4">
              <div className="h-11 w-32 rounded-2xl bg-slate-200 dark:bg-white/10 animate-pulse" />
              <div className="h-11 w-28 rounded-2xl bg-slate-200 dark:bg-white/10 animate-pulse" />
            </div>
          </div>
          <div className="hidden lg:block flex-1 bg-slate-100 dark:bg-white/5 animate-pulse" />
        </div>
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
  const episodeTag = current.season && current.episode
    ? `S${current.season} E${current.episode}`
    : null
  const actionLabel = current.onlineNewEpisode && episodeTag
    ? `Watch ${episodeTag}`
    : current.onlineNextEpisode && episodeTag
      ? `Play ${episodeTag}`
      : progressPercent > 0 ? 'Resume' : 'Play Now'
  const mediaLabel = current.type === 'series'
    ? episodeTag || 'Web Series'
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
      className="hero-spotlight-banner relative w-full min-h-[460px] sm:min-h-[480px] lg:min-h-[510px] overflow-hidden rounded-[28px] border group cursor-pointer"
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
      {/* Right Side 60%: Prominent Visual Backdrop */}
      <div className="absolute inset-y-0 right-0 w-full lg:w-[62%] xl:w-[65%] h-full overflow-hidden pointer-events-none">
        {items.map((item, idx) => {
          const previousIndex = (currentIndex - 1 + items.length) % items.length
          const nextIndex = (currentIndex + 1) % items.length
          const shouldRenderVisuals = idx === currentIndex || idx === previousIndex || idx === nextIndex
          const imageUrl = shouldRenderVisuals ? getHeroImageUrl(item.backdrop_path || item.poster_path) : ''

          return (
            <div
              key={item.tmdb_id || item.id}
              className={`absolute inset-0 transition-all duration-1000 ease-in-out ${
                idx === currentIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'
              }`}
            >
              {shouldRenderVisuals && (
                <>
                  {/* Subtle Ambient Bloom */}
                  <img
                    src={imageUrl}
                    className="absolute inset-0 h-full w-full object-cover object-center blur-3xl opacity-30 dark:opacity-45 scale-110"
                    alt=""
                    loading={idx === currentIndex ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                  {/* Crisp Movie Artwork */}
                  <img
                    src={imageUrl}
                    className="relative z-10 h-full w-full object-cover object-[center_25%]"
                    alt=""
                    loading={idx === currentIndex ? 'eager' : 'lazy'}
                    decoding="async"
                    fetchPriority={idx === currentIndex ? 'high' : 'auto'}
                  />
                </>
              )}
            </div>
          )
        })}

        {/* Soft Fading Edges: Left-to-right fade & top/bottom edge soften */}
        <div className="hero-split-overlay absolute inset-0 z-20 pointer-events-none" />
      </div>

      {/* Left Side 40-50%: Clean Dedicated Editorial Surface */}
      <div className="relative z-30 flex flex-col justify-center min-h-[460px] sm:min-h-[480px] lg:min-h-[510px] w-full lg:w-[52%] xl:w-[48%] p-7 sm:p-9 md:p-12 lg:p-14 space-y-4">
        {/* Badges / Category Tag */}
        <div className="flex flex-wrap items-center gap-2">
          {current.isOnlineResume && (
            <>
              {current.onlineNewEpisode && <NewEpisodeBadge />}
              {current.onlineNextEpisode && !current.onlineNewEpisode && <NextEpisodeBadge />}
              <OnlineBadge />
            </>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] bg-red-600/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border border-red-600/20">
            {current.type === 'series' ? 'Featured Series' : 'Featured Movie'}
          </span>
          {episodeTag && (
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/70 border border-slate-200 dark:border-white/10">
              {episodeTag}
            </span>
          )}
        </div>

        {/* Title Logo or Title Text */}
        <div className="min-h-[56px] sm:min-h-[68px] flex items-center">
          {visibleLogoPath ? (
            <img
              src={getHeroLogoUrl(visibleLogoPath)}
              alt={displayTitle}
              className="hero-split-logo max-h-16 sm:max-h-20 md:max-h-24 w-auto max-w-[min(440px,90%)] object-contain object-left transition-all duration-300"
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
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black italic tracking-tighter uppercase leading-[0.95] text-slate-900 dark:text-white line-clamp-2">
              {displayTitle}
            </h2>
          ) : (
            <div className="h-12 w-48 rounded-lg bg-slate-200 dark:bg-white/10 animate-pulse" />
          )}
        </div>

        {/* Metadata Line */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500 dark:text-white/60">
          {current.release_year && (
            <span className="text-slate-700 dark:text-white/80">{current.release_year}</span>
          )}
          <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-white/30" />
          <span className="uppercase tracking-wider">{mediaLabel}</span>
          {current.vote_average ? (
            <>
              <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-white/30" />
              <span className="inline-flex items-center gap-1 text-amber-500 dark:text-yellow-400 font-black">
                ★ {current.vote_average.toFixed(1)}
              </span>
            </>
          ) : null}
          {progressPercent > 0 && (
            <>
              <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-white/30" />
              <span className="text-red-600 dark:text-red-400 font-black uppercase tracking-wider">
                {Math.round(progressPercent)}% Watched
              </span>
            </>
          )}
        </div>

        {/* Synopsis */}
        <p className="text-xs sm:text-sm font-medium leading-relaxed text-slate-600 dark:text-white/65 line-clamp-3 max-w-xl">
          {current.overview || "Loading description..."}
        </p>

        {/* Action Buttons + Carousel Controls */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-2">
          {/* Play/Resume Button */}
          <button
            disabled={Boolean(resumingKey) && getOnlineResumeKey(current) === resumingKey}
            onClick={(e) => {
              e.stopPropagation()
              onPlay(current)
            }}
            className="flex items-center gap-2.5 bg-red-600 hover:bg-red-700 text-white px-7 py-3.5 rounded-2xl font-black text-xs tracking-widest uppercase italic shadow-lg shadow-red-600/25 transition-all hover:scale-105 active:scale-95 group/btn disabled:cursor-wait disabled:hover:scale-100"
          >
            {Boolean(resumingKey) && getOnlineResumeKey(current) === resumingKey ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Loading…
              </>
            ) : (
              <>
                <Play fill="white" size={17} className="group-hover/btn:scale-110 transition-transform" />
                {actionLabel}
              </>
            )}
          </button>

          {/* Details Button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onShowDetail(current)
            }}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white px-5 py-3.5 rounded-2xl font-black text-xs tracking-wider uppercase transition-all hover:scale-105 active:scale-95 border border-slate-200/80 dark:border-white/10"
          >
            Details
          </button>

          {/* Slide Controls */}
          <div className="ml-auto flex items-center gap-2">
            <button
              aria-label="Previous slide"
              onClick={(e) => {
                e.stopPropagation()
                prev()
              }}
              className="p-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white/60 dark:hover:text-white transition-all hover:scale-105 active:scale-95 border border-slate-200/60 dark:border-white/5"
            >
              <ChevronLeft size={18} />
            </button>

            {/* Dots */}
            <div className="flex items-center gap-1.5 px-1">
              {items.map((_, idx) => (
                <button
                  key={idx}
                  aria-label={`Go to slide ${idx + 1}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsAutoPlaying(false)
                    setCurrentIndex(idx)
                  }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentIndex
                      ? 'w-6 bg-red-600'
                      : 'w-1.5 bg-slate-300 dark:bg-white/20 hover:bg-slate-400 dark:hover:bg-white/40'
                  }`}
                />
              ))}
            </div>

            <button
              aria-label="Next slide"
              onClick={(e) => {
                e.stopPropagation()
                next()
              }}
              className="p-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white/60 dark:hover:text-white transition-all hover:scale-105 active:scale-95 border border-slate-200/60 dark:border-white/5"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default React.memo(HeroCarousel)
