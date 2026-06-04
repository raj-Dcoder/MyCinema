import React, { useEffect, useMemo, useState, useRef } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import { ArrowUpDown, Check, Film, Search, X } from 'lucide-react'

interface MoviesProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
}

const Movies: React.FC<MoviesProps> = ({ onPlay, onShowDetail }) => {
  const [movies, setMovies] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('All')
  const [sortBy, setSortBy] = useState('newest')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const isInitialLoad = useRef(true)

  const fetchMovies = async () => {
    if (isInitialLoad.current) {
      setLoading(true)
    }

    try {
      const allVideos: Video[] = await window.api.getVideos()
      
      const isMovie = (v: Video) => 
        v.type === 'movie'

      setMovies(allVideos.filter(isMovie))
    } finally {
      setLoading(false)
      isInitialLoad.current = false
    }
  }

  useEffect(() => {
    fetchMovies()
    return window.api.onLibraryUpdated(fetchMovies)
  }, [])

  const filteredMovies = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    let result = movies.filter(movie => {
      if (!query) return true
      return [
        movie.title,
        movie.release_year?.toString(),
        movie.genres
      ].filter(Boolean).join(' ').toLowerCase().includes(query)
    })

    result = result.filter(movie => {
      const progress = movie.last_watched_time || 0
      const duration = movie.duration || 0
      const watched = Boolean(movie.completed) || (duration > 0 && progress >= duration * 0.9)

      if (activeFilter === 'Unwatched') return !watched && progress <= 0
      if (activeFilter === 'In Progress') return !watched && progress > 0
      if (activeFilter === 'Watched') return watched
      if (activeFilter === 'Watchlist') return Boolean(movie.is_watchlist)
      return true
    })

    return [...result].sort((a, b) => {
      if (sortBy === 'name') return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
      if (sortBy === 'year') return (b.release_year || 0) - (a.release_year || 0)
      if (sortBy === 'rating') return (b.vote_average || 0) - (a.vote_average || 0)
      if (sortBy === 'progress') return (b.last_watched_time || 0) - (a.last_watched_time || 0)
      return (b.id || 0) - (a.id || 0)
    })
  }, [movies, searchQuery, activeFilter, sortBy])

  const resetFilters = () => {
    setSearchQuery('')
    setActiveFilter('All')
    setSortBy('newest')
  }

  const sortLabel = sortBy === 'newest'
    ? 'Recently Added'
    : sortBy === 'name'
      ? 'A-Z'
      : sortBy === 'year'
        ? 'Year'
        : sortBy === 'rating'
          ? 'Rating'
          : 'Progress'

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-primary/10 rounded-2xl text-primary">
            <Film size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Movies</h2>
            <p className="text-white/30 font-bold text-sm tracking-wide">Your collection of cinema</p>
          </div>
        </div>

        <div className="flex max-w-full flex-col items-stretch gap-3 lg:items-end">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="group relative w-full sm:w-[270px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 transition-colors group-focus-within:text-primary" size={17} />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search movies"
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] py-2 pl-10 pr-10 text-sm font-bold text-white outline-none transition-all placeholder:text-white/28 focus:border-primary/45 focus:bg-black/25 focus:ring-1 focus:ring-primary/35"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 transition-colors hover:text-white"
                  aria-label="Clear movie search"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSortMenu(value => !value)}
                className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-[10px] font-black uppercase tracking-widest text-white/70 transition-all hover:bg-white/5 hover:text-white"
              >
                <ArrowUpDown size={14} className="text-primary" />
                {sortLabel}
              </button>

              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setShowSortMenu(false)} />
                  <div className="absolute right-0 z-[70] mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#0b1018]/98 p-1 shadow-2xl backdrop-blur-xl">
                    {[
                      { id: 'newest', label: 'Recently Added' },
                      { id: 'name', label: 'Name (A-Z)' },
                      { id: 'year', label: 'Release Year' },
                      { id: 'rating', label: 'Rating' },
                      { id: 'progress', label: 'Watch Progress' }
                    ].map(option => (
                      <button
                        key={option.id}
                        onClick={() => {
                          setSortBy(option.id)
                          setShowSortMenu(false)
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-white/65 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        {option.label}
                        {sortBy === option.id && <Check size={14} className="text-primary" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-white/5 bg-white/[0.03] p-1">
            {['All', 'Unwatched', 'In Progress', 'Watched', 'Watchlist'].map(filter => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeFilter === filter
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'text-white/40 hover:bg-white/5 hover:text-white'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : movies.length > 0 ? (
        filteredMovies.length > 0 ? (
          <section>
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="text-xl font-black tracking-tight text-white">
                {searchQuery || activeFilter !== 'All' ? 'Filtered Movies' : 'All Movies'}
              </h3>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/35">
                Showing {filteredMovies.length} of {movies.length}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {filteredMovies.map(video => (
                <VideoCard key={video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
              ))}
            </div>
          </section>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <Film size={70} strokeWidth={1} className="text-white/15" />
            <h3 className="mt-5 text-xl font-black uppercase italic text-white/70">No matching movies</h3>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-6 text-xs font-black uppercase tracking-widest text-primary transition-colors hover:text-primary/75"
            >
              Reset filters
            </button>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center py-40 text-center space-y-6 opacity-20">
          <Film size={80} strokeWidth={1} />
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase italic">No Movies Found</h3>
            <p className="text-sm font-bold uppercase tracking-widest">Add a folder containing movies to start</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Movies
