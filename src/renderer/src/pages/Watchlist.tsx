import React, { useState, useEffect, useRef } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import { Bookmark, BookmarkCheck, Film, Loader2, Search, Tv } from 'lucide-react'

interface WatchlistProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
  refreshKey?: number
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

// The watchlist is exactly one inbox: search anything, tap once to save.
// Themed lists live in Collections.
const Watchlist: React.FC<WatchlistProps> = ({ onPlay, onShowDetail, refreshKey = 0 }) => {
  const [items, setItems] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TMDBResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState<number | null>(null)
  const isInitialLoad = useRef(true)
  const searchCacheRef = useRef<Map<string, TMDBResult[]>>(new Map())

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
      poster_path: item.poster_path ? `${TMDB_IMG}/w780${item.poster_path}` : undefined,
      backdrop_path: item.backdrop_path ? `${TMDB_IMG}/w1280${item.backdrop_path}` : undefined,
      overview: item.overview,
      vote_average: item.vote_average,
      release_year: releaseYear ? Number(releaseYear) : undefined,
      isExternal: true,
      is_watchlist: true,
      category: 'Watchlist'
    }
  }

  const handleQuickAdd = async (item: TMDBResult) => {
    if (isInWatchlist(item.id) || addingId === item.id) return
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

  const clearSearch = () => {
    setQuery('')
    setResults([])
  }

  useEffect(() => {
    const trimmed = query.trim()

    if (!trimmed) {
      setResults([])
      setSearching(false)
      return
    }

    const cacheKey = trimmed.toLowerCase()
    const cached = searchCacheRef.current.get(cacheKey)
    if (cached) {
      setResults(cached)
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)

    const timer = window.setTimeout(async () => {
      try {
        const data = await window.api.searchTMDB(trimmed)
        if (cancelled) return

        const filtered = (data || [])
          .filter((item: TMDBResult) => item.media_type === 'movie' || item.media_type === 'tv')
          .slice(0, 12)

        searchCacheRef.current.set(cacheKey, filtered)
        setResults(filtered)
      } catch (err) {
        console.error('[Watchlist] TMDB search error:', err)
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    fetchWatchlist()
    return window.api.onLibraryUpdated(fetchWatchlist)
  }, [])

  useEffect(() => {
    if (isInitialLoad.current) return
    fetchWatchlist()
  }, [refreshKey])

  const totalTitles = items.length

  return (
    <div className="space-y-5">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <Bookmark size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold tracking-normal text-white md:text-3xl">Your Watchlist</h2>
          <p className="text-[11px] font-medium text-white/40">
            {totalTitles} saved title{totalTitles === 1 ? '' : 's'} · one-tap save, themed lists live in Collections
          </p>
        </div>
        <div className="group relative w-full sm:w-[270px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 transition-colors group-focus-within:text-primary" size={17} />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search movies or series to save"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] py-2 pl-10 pr-4 text-sm font-bold text-white outline-none transition-all placeholder:text-white/28 focus:border-primary/45 focus:bg-black/25 focus:ring-1 focus:ring-primary/35"
          />
        </div>
      </div>

      {searching && (
        <div className="flex items-center gap-2 text-xs font-bold text-white/40">
          <Loader2 size={14} className="animate-spin" /> Searching…
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/60">Search Results — tap to save</h3>
            <button
              onClick={clearSearch}
              className="text-xs font-bold text-muted hover:text-primary transition-colors"
            >
              Back to Watchlist
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {results.map(item => {
              const alreadyAdded = isInWatchlist(item.id)
              return (
                <button
                  key={`${item.media_type}-${item.id}`}
                  onClick={() => handleQuickAdd(item)}
                  disabled={alreadyAdded || addingId === item.id}
                  className="group text-left disabled:cursor-default"
                  title={alreadyAdded ? 'Already in Watchlist' : 'Save to Watchlist'}
                >
                  <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-secondary shadow-lg ring-1 ring-white/5 group-hover:ring-primary/50 transition-all duration-300 group-hover:-translate-y-1">
                    {item.poster_path ? (
                      <img
                        src={`${TMDB_IMG}/w500${item.poster_path}`}
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : results.length === 0 && items.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map(video => (
            <VideoCard
              key={`${video.isExternal ? 'external' : 'local'}-${video.tmdb_id || video.id}`}
              video={video}
              onPlay={onPlay}
              onShowDetail={onShowDetail}
            />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-40 text-center space-y-6 opacity-20">
          <Bookmark size={80} strokeWidth={1} />
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">Watchlist is empty</h3>
            <p className="text-sm font-medium text-white/60">Search movies or series and tap to save them here.</p>
          </div>
        </div>
      ) : (
        null
      )}
    </div>
  )
}

export default Watchlist
