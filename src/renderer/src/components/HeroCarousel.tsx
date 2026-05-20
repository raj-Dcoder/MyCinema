import React, { useState, useEffect } from 'react'
import { Play, Bookmark, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { Video } from '../types'

interface HeroCarouselProps {
  items: Video[]
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
  onAddToWatchlist: (video: Video) => void
}

const getHeroImageUrl = (path?: string | null) => {
  if (!path) return ''
  if (path.startsWith('https://image.tmdb.org/t/p/')) {
    return path.replace(/\/t\/p\/[^/]+\//, '/t/p/w1280/')
  }
  return path.startsWith('http') ? path : `media://file/${encodeURIComponent(path)}`
}

const HeroCarousel: React.FC<HeroCarouselProps> = ({ items, onPlay, onShowDetail, onAddToWatchlist }) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)

  useEffect(() => {
    if (!isAutoPlaying || items.length === 0) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [isAutoPlaying, items.length])

  if (items.length === 0) {
    return (
      <div className="w-full min-h-[570px] h-[73vh] max-h-[800px] bg-white/5 animate-pulse flex items-center justify-center">
        <div className="text-white/10 font-black text-4xl uppercase italic">Loading Featured Content...</div>
      </div>
    )
  }

  const current = items[currentIndex]

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
        {/* <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-4 duration-700">
          <div className="px-2.5 py-1 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-1.5">
            <Star size={14} className="text-yellow-400 fill-yellow-400" />
            <span className="text-white font-black text-xs">{current.vote_average?.toFixed(1) || '8.5'}</span>
          </div>
          {current.isExternal && (
            <span className="text-[9px] font-black uppercase tracking-widest bg-primary/20 text-primary px-2 py-1 rounded-md border border-primary/30 italic">Trending</span>
          )}
        </div> */}

        {current.logo_path ? (
          <img
            src={getHeroImageUrl(current.logo_path)}
            alt={current.title}
            className="max-h-28 w-auto max-w-[min(620px,74vw)] object-contain object-left drop-shadow-[0_8px_28px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-left-8 duration-700 delay-100"
            decoding="async"
          />
        ) : (
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase italic leading-[0.9] max-w-2xl animate-in fade-in slide-in-from-left-8 duration-700 delay-100">
            {current.title}
          </h2>
        )}

        <div className="flex items-center gap-3 text-white/60 font-bold text-xs animate-in fade-in slide-in-from-left-12 duration-700 delay-200">
          <span>{current.release_year || '2024'}</span>
          <span className="w-1 h-1 bg-white/20 rounded-full" />
          <span className="uppercase tracking-widest">{current.type === 'series' ? 'Web Series' : 'Action • Movie'}</span>
          {/* <span className="w-1 h-1 bg-white/20 rounded-full" />
          <span className="px-2 py-0.5 border border-white/20 rounded text-[9px] font-black">U/A 13+</span> */}
        </div>

        <p className="text-white/45 text-xs md:text-sm font-medium max-w-lg line-clamp-2 animate-in fade-in slide-in-from-left-16 duration-700 delay-300">
          {current.overview || "Loading description..."}
        </p>

        <div className="flex items-center gap-4 pt-1 animate-in fade-in slide-in-from-left-20 duration-700 delay-500">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onShowDetail(current)
            }}
            className="flex items-center gap-2.5 bg-red-600 hover:bg-red-700 text-white px-7 py-3.5 rounded-2xl font-black text-xs tracking-widest transition-all shadow-lg hover:scale-105 active:scale-95 group/btn uppercase italic"
          >
            <Play fill="white" size={18} className="group-hover/btn:scale-110 transition-transform" />
            Play Now
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddToWatchlist(current)
            }}
            className="flex items-center gap-2.5 bg-white/30 hover:bg-white/40 text-white px-7 py-3.5 rounded-2xl font-black text-xs tracking-widest transition-all border border-white/10 hover:scale-105 active:scale-95 uppercase italic glass-effect"
          >
            <Bookmark size={18} />
            Watchlist
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
