import React, { useState, useEffect, useRef } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import { Bookmark, BookmarkCheck, Film, Loader2, Search, Tv, X } from 'lucide-react'

interface WatchlistProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
}

interface TMDBResult {
  id: number
  title?: string
  name?: string
  media_type: 'movie' | 'tv'
  poster_path: string | null
  backdrop_path: string | null
  overview: string
  release_date?: string
  first_air_date?: string
  vote_average: number
}

const TMDB_IMG = 'https://image.tmdb.org/t/p'

const Watchlist: React.FC<WatchlistProps> = ({ onPlay, onShowDetail }) => {
  const [items, setItems] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TMDBResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState<number | null>(null)
  const isInitialLoad = useRef(true)

  const fetchWatchlist = async () => {
    if (isInitialLoad.current) {
      setLoading(true)
    }

    try {
      const data = await window.api.getWatchlist()
      setItems(data)
    } finally {
      setLoading(false)
      isInitialLoad.current = false
    }
  }

  const isInWatchlist = (tmdbId: number) => items.some(item => item.tmdb_id === tmdbId)

  const toExternalVideo = (item: TMDBResult): Video => {
    const title = item.title || item.name || 'Untitled'
    const type = item.media_type === 'tv' ? 'series' : 'movie'
    const releaseYear = (item.release_date || item.first_air_date || '').slice(0, 4)

    return {
      id: item.id,
      tmdb_id: item.id,
      title,
      file_path: '',
      type,
      poster_path: item.poster_path ? `${TMDB_IMG}/w500${item.poster_path}` : undefined,
      backdrop_path: item.backdrop_path ? `${TMDB_IMG}/w1280${item.backdrop_path}` : undefined,
      overview: item.overview,
      vote_average: item.vote_average,
      release_year: releaseYear ? Number(releaseYear) : undefined,
      isExternal: true,
      is_watchlist: true
    }
  }

  const handleSearch = async () => {
    const trimmed = query.trim()
    if (!trimmed) return

    setSearching(true)
    try {
      const data = await window.api.searchTMDB(trimmed)
      setResults((data || []).slice(0, 12))
    } catch (err) {
      console.error('[Watchlist] TMDB search error:', err)
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const clearSearch = () => {
    setQuery('')
    setResults([])
  }

  const handleAddToWatchlist = async (item: TMDBResult, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (isInWatchlist(item.id)) return

    setAddingId(item.id)
    try {
      await window.api.addToWatchlistExternal(toExternalVideo(item))
      await fetchWatchlist()
    } catch (err) {
      console.error('[Watchlist] Add error:', err)
    } finally {
      setAddingId(null)
    }
  }

  useEffect(() => {
    fetchWatchlist()
    window.api.onLibraryUpdated(fetchWatchlist)
    return () => window.api.removeAllLibraryUpdateListeners()
  }, [])

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-primary/10 rounded-2xl text-primary">
            <Bookmark size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Your Watchlist</h2>
            <p className="text-white/30 font-bold text-sm tracking-wide">Search movies and series, then save them here for later</p>
          </div>
        </div>

        <div className="flex items-center bg-surface/80 backdrop-blur-xl border border-secondary rounded-2xl overflow-hidden focus-within:border-primary/50 transition-colors shadow-lg shadow-black/10">
          <Search size={18} className="ml-5 text-muted flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search for a movie or series to add..."
            className="flex-1 px-4 py-4 bg-transparent text-text text-sm outline-none placeholder:text-muted/60"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="p-3 text-muted hover:text-text transition-colors"
              title="Clear search"
            >
              <X size={16} />
            </button>
          )}
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="px-6 py-4 bg-primary/10 hover:bg-primary/20 text-primary font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white/50 uppercase tracking-widest">Search Results</h3>
            <button
              onClick={clearSearch}
              className="text-xs font-bold text-muted hover:text-primary transition-colors"
            >
              Back to Watchlist
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {results.map(item => {
              const alreadyAdded = isInWatchlist(item.id)
              return (
                <button
                  key={`${item.media_type}-${item.id}`}
                  onClick={(e) => handleAddToWatchlist(item, e)}
                  disabled={alreadyAdded || addingId === item.id}
                  className="group text-left disabled:cursor-default"
                  title={alreadyAdded ? 'Already in Watchlist' : 'Add to Watchlist'}
                >
                  <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-secondary shadow-lg ring-1 ring-white/5 group-hover:ring-primary/50 transition-all duration-300 group-hover:-translate-y-1">
                    {item.poster_path ? (
                      <img
                        src={`${TMDB_IMG}/w342${item.poster_path}`}
                        alt={item.title || item.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted/40">
                        <Film size={36} />
                      </div>
                    )}

                    <div className="absolute top-3 left-3 z-10 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-1.5">
                      {item.media_type === 'movie' ? <Film size={10} /> : <Tv size={10} />}
                      <span className="text-[8px] font-black text-white uppercase tracking-widest">
                        {item.media_type === 'movie' ? 'Movie' : 'Series'}
                      </span>
                    </div>

                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-transform duration-300 ${
                        alreadyAdded ? 'bg-primary text-white scale-100' : 'bg-red-600 text-white scale-75 group-hover:scale-100'
                      }`}>
                        {addingId === item.id ? (
                          <Loader2 size={22} className="animate-spin" />
                        ) : alreadyAdded ? (
                          <BookmarkCheck size={22} fill="currentColor" />
                        ) : (
                          <Bookmark size={22} />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 px-1 pt-3">
                    <h3 className="text-sm font-bold text-white truncate leading-tight group-hover:text-primary transition-colors">
                      {item.title || item.name}
                    </h3>
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider">
                      {(item.release_date || item.first_air_date || '----').slice(0, 4)}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : results.length === 0 && items.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {items.map(video => (
            <VideoCard key={video.tmdb_id || video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-40 text-center space-y-6 opacity-20">
          <Bookmark size={80} strokeWidth={1} />
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase italic">Watchlist is empty</h3>
            <p className="text-sm font-bold uppercase tracking-widest">Search movies or series and add them to your list.</p>
          </div>
        </div>
      ) : (
        null
      )}
    </div>
  )
}

export default Watchlist
