import React, { useState, useEffect } from 'react'
import { Play, Bookmark, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { Video } from '../types'

interface HeroCarouselProps {
  items: Video[]
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
}

const HeroCarousel: React.FC<HeroCarouselProps> = ({ items, onPlay, onShowDetail }) => {
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
      <div className="w-full aspect-[2.4/1] bg-white/5 rounded-3xl animate-pulse flex items-center justify-center">
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
    <div className="relative w-full aspect-[2.4/1] rounded-3xl overflow-hidden group shadow-2xl">
      {/* Background Backdrops */}
      {items.map((item, idx) => (
        <div
          key={item.tmdb_id || item.id}
          className={`absolute inset-0 transition-all duration-1000 ease-in-out ${
            idx === currentIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-110'
          }`}
        >
          <img
            src={item.backdrop_path || item.poster_path || ''}
            className="w-full h-full object-cover"
            alt=""
          />
          {/* Overlays */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#05080d] via-transparent to-transparent" />
        </div>
      ))}

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-center px-12 md:px-20 space-y-6">
        <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-4 duration-700">
          <div className="px-3 py-1 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-2">
            <Star size={16} className="text-yellow-400 fill-yellow-400" />
            <span className="text-white font-black text-sm">{current.vote_average?.toFixed(1) || '8.5'}</span>
          </div>
          {current.isExternal && (
            <span className="text-[10px] font-black uppercase tracking-widest bg-primary/20 text-primary px-2 py-1 rounded-md border border-primary/30 italic">Trending</span>
          )}
        </div>

        <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter uppercase italic leading-[0.9] max-w-2xl animate-in fade-in slide-in-from-left-8 duration-700 delay-100">
          {current.title}
        </h2>

        <div className="flex items-center gap-4 text-white/60 font-bold text-sm animate-in fade-in slide-in-from-left-12 duration-700 delay-200">
          <span>{current.release_year || '2024'}</span>
          <span className="w-1 h-1 bg-white/20 rounded-full" />
          <span className="uppercase tracking-widest">{current.type === 'series' ? 'Web Series' : 'Action • Movie'}</span>
          <span className="w-1 h-1 bg-white/20 rounded-full" />
          <span className="px-2 py-0.5 border border-white/20 rounded text-[10px] font-black">U/A 13+</span>
        </div>

        <p className="text-white/40 text-sm md:text-base font-medium max-w-xl line-clamp-2 animate-in fade-in slide-in-from-left-16 duration-700 delay-300">
          {current.overview || "Loading description..."}
        </p>

        <div className="flex items-center gap-4 pt-4 animate-in fade-in slide-in-from-left-20 duration-700 delay-500">
          <button
            onClick={() => onShowDetail(current)}
            className="flex items-center gap-3 bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-2xl font-black text-sm tracking-widest transition-all shadow-lg hover:scale-105 active:scale-95 group/btn uppercase italic"
          >
            <Play fill="white" size={20} className="group-hover/btn:scale-110 transition-transform" />
            Play Now
          </button>
          <button
            onClick={() => {
              // Add to watchlist logic
              if (current.isExternal) {
                window.api.addToWatchlistExternal(current)
              } else {
                window.api.toggleWatchlist(current.id)
              }
              alert('Added to Watchlist!')
            }}
            className="flex items-center gap-3 bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-2xl font-black text-sm tracking-widest transition-all border border-white/10 hover:scale-105 active:scale-95 uppercase italic glass-effect"
          >
            <Bookmark size={20} />
            Watchlist
          </button>
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="absolute bottom-10 right-12 flex items-center gap-4">
        <button
          onClick={prev}
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
          onClick={next}
          className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all border border-white/5 hover:scale-110"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  )
}

export default HeroCarousel
