import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import HeroCarousel from '../components/HeroCarousel'
import HorizontalScrollRow, { type HorizontalScrollRowHandle } from '../components/HorizontalScrollRow'
import { groupSeriesCards } from '../utils/seriesCards'
import { Search as SearchIcon, Bell, Bookmark, ChevronLeft, ChevronRight, Play, X, Loader2, Star, Film, Tv } from 'lucide-react'

interface HomeProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
  onNavigate: (tab: 'movies' | 'series' | 'history') => void
  refreshKey: number
}

const TRENDING_HERO_LIMIT = 10
const POSTER_RAIL_CARD_CLASS = 'basis-[calc((100%_-_1.25rem)/2)] flex-shrink-0 md:basis-[calc((100%_-_3.75rem)/4)] lg:basis-[calc((100%_-_6.25rem)/6)]'
const HOME_SNAPSHOT_STORAGE_KEY = 'mycinema_home_snapshot_v2'

type HomeSnapshot = {
  continueWatching: Video[]
  recentMovies: Video[]
  recentSeries: Video[]
  trendingMovies: Video[]
  trendingSeries: Video[]
  trendingIndiaMovies: Video[]
  trendingIndiaSeries: Video[]
  trendingIndia?: Video[]
  featured: Video[]
  timestamp: number
}

const readHomeSnapshot = (): HomeSnapshot | null => {
  try {
    const raw = localStorage.getItem(HOME_SNAPSHOT_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<HomeSnapshot>
    if (!parsed || typeof parsed !== 'object') return null

    const legacyTrendingIndia = Array.isArray(parsed.trendingIndia) ? parsed.trendingIndia : []

    return {
      continueWatching: Array.isArray(parsed.continueWatching) ? parsed.continueWatching : [],
      recentMovies: Array.isArray(parsed.recentMovies) ? parsed.recentMovies : [],
      recentSeries: Array.isArray(parsed.recentSeries) ? parsed.recentSeries : [],
      trendingMovies: Array.isArray(parsed.trendingMovies) ? parsed.trendingMovies : [],
      trendingSeries: Array.isArray(parsed.trendingSeries) ? parsed.trendingSeries : [],
      trendingIndiaMovies: Array.isArray(parsed.trendingIndiaMovies)
        ? parsed.trendingIndiaMovies
        : legacyTrendingIndia.filter(video => video.type !== 'series'),
      trendingIndiaSeries: Array.isArray(parsed.trendingIndiaSeries)
        ? parsed.trendingIndiaSeries
        : legacyTrendingIndia.filter(video => video.type === 'series'),
      featured: Array.isArray(parsed.featured) ? parsed.featured : [],
      timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : 0
    }
  } catch {
    return null
  }
}

const writeHomeSnapshot = (snapshot: Omit<HomeSnapshot, 'timestamp'>) => {
  const hasAnyContent = [
    snapshot.continueWatching,
    snapshot.recentMovies,
    snapshot.recentSeries,
    snapshot.trendingMovies,
    snapshot.trendingSeries,
    snapshot.trendingIndiaMovies,
    snapshot.trendingIndiaSeries,
    snapshot.featured
  ].some(items => items.length > 0)

  if (!hasAnyContent) return

  try {
    localStorage.setItem(HOME_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      ...snapshot,
      timestamp: Date.now()
    }))
  } catch (err) {
    console.warn('[Home] Failed to persist startup snapshot:', err)
  }
}

const getImageUrl = (path?: string | null) => {
  if (!path) return null
  return path.startsWith('http') ? path : `media://file/${encodeURIComponent(path)}`
}

const getTmdbImageUrl = (path?: string | null, size: 'w342' | 'w500' | 'w780' | 'w1280' = 'w500') => {
  if (!path) return null
  return path.startsWith('http') ? path : `https://image.tmdb.org/t/p/${size}${path}`
}

const mapTmdbSearchResult = (item: any): Video => {
  const isSeries = item.media_type === 'tv'
  const title = isSeries ? item.name : item.title
  const releaseDate = isSeries ? item.first_air_date : item.release_date
  const releaseYear = releaseDate ? Number(String(releaseDate).slice(0, 4)) : undefined

  return {
    id: -Number(item.id || Date.now()),
    title: title || 'Untitled',
    file_path: '',
    type: isSeries ? 'series' : 'movie',
    series_name: isSeries ? title : undefined,
    poster_path: getTmdbImageUrl(item.poster_path, 'w780') || undefined,
    backdrop_path: getTmdbImageUrl(item.backdrop_path, 'w1280') || undefined,
    overview: item.overview || undefined,
    vote_average: typeof item.vote_average === 'number' ? item.vote_average : undefined,
    release_year: releaseYear,
    tmdb_id: item.id,
    isExternal: true
  }
}

const buildHeroTrendingItems = (movies: Video[], series: Video[]) => {
  const mixed: Video[] = []
  const seen = new Set<string>()
  const maxLength = Math.max(movies.length, series.length)

  for (let i = 0; i < maxLength && mixed.length < TRENDING_HERO_LIMIT; i += 1) {
    for (const video of [movies[i], series[i]]) {
      if (!video) continue
      const key = `${video.type}:${video.tmdb_id || video.id}`
      if (seen.has(key)) continue
      seen.add(key)
      mixed.push(video)
      if (mixed.length >= TRENDING_HERO_LIMIT) break
    }
  }

  return mixed
}

const formatDuration = (seconds?: number) => {
  if (!seconds) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const getProgressPercent = (video: Video) => {
  if (!video.last_watched_time || !video.duration) return 0
  return Math.min(100, Math.max(0, (video.last_watched_time / video.duration) * 100))
}

const getRemainingTime = (video: Video) => {
  if (!video.last_watched_time || !video.duration) return null
  const remaining = Math.max(0, video.duration - video.last_watched_time)
  const formatted = formatDuration(remaining)
  return formatted ? `${formatted} left` : null
}

const isContinueWatchingTitle = (video: Video) => {
  if (video.type === 'series') return true
  return video.type === 'movie'
}

const getEpisodeLabel = (video: Video) => {
  if (video.type !== 'series') return null
  if (video.season && video.episode) return `S${video.season} E${video.episode}`
  if (video.episode) return `Episode ${video.episode}`
  return video.title && video.series_name && video.title !== video.series_name ? video.title : null
}

const groupContinueWatching = (videos: Video[]) => {
  const grouped: Video[] = []
  const seenSeries = new Set<string>()

  for (const video of videos.filter(isContinueWatchingTitle)) {
    if (video.type !== 'series' || !video.series_name) {
      grouped.push(video)
      continue
    }

    const key = video.series_name.toLowerCase()
    if (seenSeries.has(key)) continue

    grouped.push(video)
    seenSeries.add(key)
  }

  return grouped
}

const ContinueWatchingCard: React.FC<{
  video: Video
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
}> = ({ video, onPlay, onShowDetail }) => {
  const imageUrl = getImageUrl(video.backdrop_path) || getImageUrl(video.poster_path)
  const progressPercent = getProgressPercent(video)
  const remainingTime = getRemainingTime(video)
  const title = video.type === 'series' && video.series_name ? video.series_name : video.title
  const tagline = video.tagline || video.overview
  const episodeLabel = getEpisodeLabel(video)

  return (
    <div
      className="group relative aspect-video overflow-hidden rounded-2xl bg-[#0a0f18] ring-1 ring-white/5 cursor-pointer isolate transform-gpu transition-[transform,box-shadow] duration-300 will-change-transform [backface-visibility:hidden] [clip-path:inset(0_round_1rem)] hover:-translate-y-1 hover:scale-[1.02] hover:ring-red-600/55"
      onClick={() => onShowDetail(video)}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={title} className="block h-full w-full object-cover transform-gpu transition-transform duration-500 [backface-visibility:hidden] group-hover:scale-105" />
      ) : (
        <div className="h-full w-full bg-white/5" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20">
        <div className="h-full bg-red-600" style={{ width: `${progressPercent}%` }} />
      </div>
      {remainingTime && (
        <span className="absolute right-5 top-5 rounded-md bg-black/55 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-black/30 backdrop-blur-md">
          {remainingTime}
        </span>
      )}
      <div className="absolute inset-0 flex flex-col justify-end p-5">
        <div className="mb-auto flex items-start justify-between gap-3">
          {episodeLabel && (
            <div className="inline-flex items-center rounded-md bg-black/55 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-lg shadow-black/30 backdrop-blur-md">
              {episodeLabel}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="line-clamp-1 text-lg font-black italic tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            {title}
          </h4>
          {tagline && (
            <p className="line-clamp-1 text-xs font-medium leading-snug text-white/65 transition-all duration-300 group-hover:line-clamp-2 group-hover:text-white/75">
              {tagline}
            </p>
          )}
          <button
            className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white opacity-0 shadow-lg shadow-red-950/40 transition-all duration-300 hover:bg-red-500 group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation()
              onPlay(video)
            }}
          >
            <Play fill="white" size={15} />
            Resume
          </button>
        </div>
      </div>
    </div>
  )
}

const SearchResultCard: React.FC<{
  video: Video
  onSelect: (video: Video) => void
  onWarm: (video: Video) => void
  onAddToWatchlist: (video: Video) => void
}> = ({ video, onSelect, onWarm, onAddToWatchlist }) => {
  const poster = getImageUrl(video.poster_path)
  const title = video.type === 'series' && video.series_name ? video.series_name : video.title

  return (
    <div
      className="group/result flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.035] p-2.5 text-left transition-all duration-200 hover:border-red-500/35 hover:bg-white/[0.07] active:scale-[0.99]"
      onClick={() => onSelect(video)}
      onMouseEnter={() => onWarm(video)}
      onFocus={() => onWarm(video)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(video)
        }
      }}
    >
      <div className="h-[92px] w-[62px] shrink-0 overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/8">
        {poster ? (
          <img src={poster} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover/result:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/20">
            {video.type === 'series' ? <Tv size={20} /> : <Film size={20} />}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-md border border-white/10 bg-black/25 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white/45">
            {video.type === 'series' ? 'Series' : 'Movie'}
          </span>
          {video.release_year && (
            <span className="text-[10px] font-black text-white/30">{video.release_year}</span>
          )}
          {video.vote_average ? (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-black text-yellow-400">
              <Star size={10} fill="currentColor" />
              {video.vote_average.toFixed(1)}
            </span>
          ) : null}
        </div>
        <h4 className="truncate text-sm font-black text-white transition-colors group-hover/result:text-red-100">{title}</h4>
        <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-5 text-white/45">
          {video.overview || 'Open details to explore this title.'}
        </p>
      </div>
      <button
        onClick={(event) => {
          event.stopPropagation()
          onAddToWatchlist(video)
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/45 transition-all hover:bg-amber-500/15 hover:text-amber-400"
        title="Add to Watchlist"
      >
        <Bookmark size={16} />
      </button>
    </div>
  )
}

type SectionHeaderTone = 'red' | 'cyan' | 'amber' | 'violet' | 'emerald'

const sectionHeaderToneClasses: Record<SectionHeaderTone, {
  icon: string
  eyebrow: string
  underline: string
}> = {
  red: {
    icon: 'border-red-500/35 bg-red-500/15 text-red-300 shadow-red-950/20',
    eyebrow: 'text-red-300',
    underline: 'from-red-500 via-red-400 to-transparent'
  },
  cyan: {
    icon: 'border-cyan-400/35 bg-cyan-400/15 text-cyan-200 shadow-cyan-950/20',
    eyebrow: 'text-cyan-200',
    underline: 'from-cyan-400 via-cyan-300 to-transparent'
  },
  amber: {
    icon: 'border-amber-400/35 bg-amber-400/15 text-amber-200 shadow-amber-950/20',
    eyebrow: 'text-amber-200',
    underline: 'from-amber-400 via-amber-300 to-transparent'
  },
  violet: {
    icon: 'border-violet-400/35 bg-violet-400/15 text-violet-200 shadow-violet-950/20',
    eyebrow: 'text-violet-200',
    underline: 'from-violet-400 via-violet-300 to-transparent'
  },
  emerald: {
    icon: 'border-emerald-400/35 bg-emerald-400/15 text-emerald-200 shadow-emerald-950/20',
    eyebrow: 'text-emerald-200',
    underline: 'from-emerald-400 via-emerald-300 to-transparent'
  }
}

const SectionHeader: React.FC<{
  title: string
  eyebrow: string
  icon: React.ReactNode
  tone?: SectionHeaderTone
  action?: React.ReactNode
  onScrollToStart?: () => void
}> = ({ title, eyebrow, icon, tone = 'red', action, onScrollToStart }) => {
  const toneClasses = sectionHeaderToneClasses[tone]
  const iconTileClassName = `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-lg transition-all ${toneClasses.icon}`
  const iconTile = onScrollToStart ? (
    <button
      type="button"
      aria-label={`Back to start of ${title}`}
      title="Back to start"
      onClick={onScrollToStart}
      className={`${iconTileClassName} cursor-pointer hover:-translate-y-0.5 hover:brightness-125 active:translate-y-0 active:scale-95`}
    >
      {icon}
    </button>
  ) : (
    <div className={iconTileClassName}>
      {icon}
    </div>
  )

  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {iconTile}
        <div className="min-w-0">
          <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${toneClasses.eyebrow}`}>
            {eyebrow}
          </p>
          <h3 className="mt-0.5 truncate text-2xl font-black leading-none tracking-normal text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)]">
            {title}
          </h3>
          <div className={`mt-2 h-0.5 w-20 rounded-full bg-gradient-to-r ${toneClasses.underline}`} />
        </div>
      </div>
      {action}
    </div>
  )
}

const Home: React.FC<HomeProps> = ({ onPlay, onShowDetail, onNavigate, refreshKey }) => {
  const initialSnapshotRef = useRef<HomeSnapshot | null>(readHomeSnapshot())
  const [continueWatching, setContinueWatching] = useState<Video[]>(() => initialSnapshotRef.current?.continueWatching || [])
  const [recentMovies, setRecentMovies] = useState<Video[]>(() => initialSnapshotRef.current?.recentMovies || [])
  const [recentSeries, setRecentSeries] = useState<Video[]>(() => initialSnapshotRef.current?.recentSeries || [])
  const [trendingMovies, setTrendingMovies] = useState<Video[]>(() => initialSnapshotRef.current?.trendingMovies || [])
  const [trendingSeries, setTrendingSeries] = useState<Video[]>(() => initialSnapshotRef.current?.trendingSeries || [])
  const [trendingIndiaMovies, setTrendingIndiaMovies] = useState<Video[]>(() => initialSnapshotRef.current?.trendingIndiaMovies || [])
  const [trendingIndiaSeries, setTrendingIndiaSeries] = useState<Video[]>(() => initialSnapshotRef.current?.trendingIndiaSeries || [])
  const [featured, setFeatured] = useState<Video[]>(() => initialSnapshotRef.current?.featured || [])
  const [userName, setUserName] = useState(() => localStorage.getItem('mycinema_user_name') || 'User')
  const continueWatchingRef = useRef<HTMLDivElement>(null)
  const globalMoviesRef = useRef<HorizontalScrollRowHandle>(null)
  const globalSeriesRef = useRef<HorizontalScrollRowHandle>(null)
  const indiaMoviesRef = useRef<HorizontalScrollRowHandle>(null)
  const indiaSeriesRef = useRef<HorizontalScrollRowHandle>(null)
  const [showContinueLeft, setShowContinueLeft] = useState(false)
  const [showContinueRight, setShowContinueRight] = useState(false)
  const [isContinueHovered, setIsContinueHovered] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [suppressNextContentClick, setSuppressNextContentClick] = useState(false)
  const [searchResults, setSearchResults] = useState<Video[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [watchlistItems, setWatchlistItems] = useState<Video[]>([])
  const [categorizingItem, setCategorizingItem] = useState<Video | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [savingWatchlist, setSavingWatchlist] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)
  const searchCacheRef = useRef<Map<string, Video[]>>(new Map())
  const isSearchOpenRef = useRef(false)
  const suppressContentClickUntilRef = useRef(0)
  const didRunInitialRefreshRef = useRef(false)

  const refreshLocalHomeData = useCallback(async () => {
    try {
      const [allVideos, cw] = await Promise.all([
        window.api.getVideos(),
        window.api.getContinueWatching()
      ])

      setContinueWatching(groupContinueWatching(cw))

      const moviesOnly = allVideos.filter(v => v.type === 'movie')
      setRecentMovies(moviesOnly.slice(0, 10))

      setRecentSeries(groupSeriesCards(allVideos).slice(0, 10))
    } catch (err) {
      console.error('Home local refresh error:', err)
    }
  }, [])

  const fetchDiscoveryData = useCallback(async () => {
    const [trendingM, trendingS] = await Promise.all([
      window.api.fetchTrending('movie').catch(err => { console.error('Trending Movies Error:', err); return [] }),
      window.api.fetchTrending('series').catch(err => { console.error('Trending Series Error:', err); return [] })
    ])

    if (trendingM.length > 0) setTrendingMovies(trendingM)
    if (trendingS.length > 0) setTrendingSeries(trendingS)

    const heroItems = buildHeroTrendingItems(trendingM, trendingS)
    if (heroItems.length > 0) setFeatured(heroItems)

    const [indiaMovies, indiaSeries] = await Promise.all([
      window.api.fetchTrendingIndia('movie').catch(err => { console.error('Trending India Movies Error:', err); return [] }),
      window.api.fetchTrendingIndia('series').catch(err => { console.error('Trending India Series Error:', err); return [] })
    ])

    if (indiaMovies.length > 0) setTrendingIndiaMovies(indiaMovies)
    if (indiaSeries.length > 0) setTrendingIndiaSeries(indiaSeries)
  }, [])

  const fetchData = useCallback(async () => {
    try {
      await Promise.all([
        refreshLocalHomeData(),
        fetchDiscoveryData(),
        window.api.getWatchlist().then(setWatchlistItems).catch(console.error)
      ])
    } catch (err) {
      console.error('Home fetchData error:', err)
    }
  }, [fetchDiscoveryData, refreshLocalHomeData])

  useEffect(() => {
    fetchData()
    const cleanupLibraryUpdates = window.api.onLibraryUpdated(refreshLocalHomeData)

    const handleNameUpdate = () => {
      setUserName(localStorage.getItem('mycinema_user_name') || 'User')
    }
    window.addEventListener('mycinema_name_updated', handleNameUpdate)

    return () => {
      cleanupLibraryUpdates()
      window.removeEventListener('mycinema_name_updated', handleNameUpdate)
    }
  }, [fetchData, refreshLocalHomeData])

  useEffect(() => {
    if (!didRunInitialRefreshRef.current) {
      didRunInitialRefreshRef.current = true
      return
    }

    refreshLocalHomeData()
  }, [refreshKey, refreshLocalHomeData])

  useEffect(() => {
    isSearchOpenRef.current = isSearchOpen
  }, [isSearchOpen])

  useEffect(() => {
    writeHomeSnapshot({
      continueWatching,
      recentMovies,
      recentSeries,
      trendingMovies,
      trendingSeries,
      trendingIndiaMovies,
      trendingIndiaSeries,
      featured
    })
  }, [continueWatching, recentMovies, recentSeries, trendingMovies, trendingSeries, trendingIndiaMovies, trendingIndiaSeries, featured])

  const suppressNextHomeClick = () => {
    suppressContentClickUntilRef.current = Date.now() + 350
    setSuppressNextContentClick(true)
  }

  const shouldSuppressHomeClick = () => {
    return suppressNextContentClick || Date.now() < suppressContentClickUntilRef.current
  }

  const closeSearchFromOutside = () => {
    suppressNextHomeClick()
    searchInputRef.current?.blur()
    setIsSearchOpen(false)
  }

  useEffect(() => {
    if (!isSearchOpen) return
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [isSearchOpen, searchQuery])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!isSearchOpenRef.current) return
      if (searchBoxRef.current?.contains(event.target as Node)) return
      closeSearchFromOutside()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        searchInputRef.current?.blur()
        setIsSearchOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!suppressNextContentClick) return
    const timer = window.setTimeout(() => setSuppressNextContentClick(false), 350)
    return () => window.clearTimeout(timer)
  }, [suppressNextContentClick])

  const handleHomeClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const clickedInsideSearch = searchBoxRef.current?.contains(event.target as Node)

    if (isSearchOpenRef.current && !clickedInsideSearch) {
      event.preventDefault()
      event.stopPropagation()
      closeSearchFromOutside()
      return
    }

    if (Date.now() < suppressContentClickUntilRef.current && !clickedInsideSearch) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const handlePlayFromHome = (video: Video) => {
    if (shouldSuppressHomeClick()) return
    onPlay(video)
  }

  const handleShowDetailFromHome = (video: Video) => {
    if (shouldSuppressHomeClick()) return
    onShowDetail(video)
  }

  useEffect(() => {
    const query = searchQuery.trim()

    if (!isSearchOpen || query.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      setSearchError(null)
      return
    }

    const normalizedQuery = query.toLowerCase()
    const cached = searchCacheRef.current.get(normalizedQuery)
    if (cached) {
      setSearchResults(cached)
      setIsSearching(false)
      setSearchError(null)
      return
    }

    let cancelled = false
    setIsSearching(true)
    setSearchError(null)

    const timer = window.setTimeout(async () => {
      try {
        const rawResults = await window.api.searchTMDB(query)
        if (cancelled) return

        const mapped = rawResults
          .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
          .map(mapTmdbSearchResult)
          .filter((video: Video) => Boolean(video.title && video.tmdb_id))
          .slice(0, 8)

        searchCacheRef.current.set(normalizedQuery, mapped)
        setSearchResults(mapped)
      } catch (err) {
        console.error('Home search error:', err)
        if (!cancelled) {
          setSearchError('Search is unavailable right now.')
          setSearchResults([])
        }
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQuery, isSearchOpen])

  const warmSearchResult = (video: Video) => {
    const poster = getImageUrl(video.poster_path)
    const backdrop = getImageUrl(video.backdrop_path)
    for (const src of [poster, backdrop]) {
      if (!src) continue
      const image = new Image()
      image.src = src
    }
  }

  const openSearchResult = (video: Video) => {
    warmSearchResult(video)
    setIsSearchOpen(false)
    onShowDetail(video)
  }

  const watchlistCategories = Array.from(new Set(watchlistItems.map(item => item.category || 'Watchlist'))).sort((a, b) => {
    if (a === 'Watchlist') return -1
    if (b === 'Watchlist') return 1
    return a.localeCompare(b)
  })

  const openWatchlistCategoryPicker = (video: Video) => {
    setCategorizingItem(video)
    setNewCategoryName('')
    setIsCreatingCategory(false)
  }

  const saveToWatchlist = async (video: Video, category: string = 'Watchlist') => {
    setSavingWatchlist(true)
    try {
      if (video.isExternal || video.id < 0) {
        await window.api.addToWatchlistExternal({ ...video, category })
      } else {
        await window.api.addLocalToWatchlist(video.id, category)
      }

      const updated = await window.api.getWatchlist()
      setWatchlistItems(updated)
      setCategorizingItem(null)
      setIsSearchOpen(false)
      setSearchQuery('')
      setSearchResults([])
    } catch (err) {
      console.error('[Home] Watchlist save failed:', err)
    } finally {
      setSavingWatchlist(false)
    }
  }

  const checkContinueScroll = useCallback(() => {
    const rail = continueWatchingRef.current
    if (!rail) return
    const { scrollLeft, scrollWidth, clientWidth } = rail
    setShowContinueLeft(scrollLeft > 2)
    setShowContinueRight(scrollLeft < scrollWidth - clientWidth - 2)
  }, [])

  useEffect(() => {
    checkContinueScroll()
    const rail = continueWatchingRef.current
    if (rail) rail.addEventListener('scroll', checkContinueScroll, { passive: true })
    window.addEventListener('resize', checkContinueScroll)
    return () => {
      if (rail) rail.removeEventListener('scroll', checkContinueScroll)
      window.removeEventListener('resize', checkContinueScroll)
    }
  }, [continueWatching.length, checkContinueScroll])

  const getTimeGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const scrollContinueWatching = (direction: 'left' | 'right') => {
    const rail = continueWatchingRef.current
    if (!rail) return
    rail.scrollBy({
      left: direction === 'left' ? -rail.clientWidth * 0.85 : rail.clientWidth * 0.85,
      behavior: 'smooth'
    })
    setTimeout(checkContinueScroll, 350)
  }

  const scrollContinueWatchingToStart = () => {
    const rail = continueWatchingRef.current
    if (!rail) return
    rail.scrollTo({
      left: 0,
      behavior: 'smooth'
    })
    setTimeout(checkContinueScroll, 350)
  }

  return (
    <div onClickCapture={handleHomeClickCapture}>
      <section className="-mt-6 mb-8">
        <div className="relative">
          {/* Top Bar */}
          <div className="absolute left-0 right-0 top-0 z-20">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-8 px-8 pt-6">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tighter italic drop-shadow-[0_2px_14px_rgba(0,0,0,0.9)]">{getTimeGreeting()}, {userName}</h2>
              </div>

              <div className="relative flex items-center gap-4" ref={searchBoxRef}>
                <div
                  className={`relative transition-all duration-300 ease-out ${
                    isSearchOpen ? 'w-[420px]' : 'w-12'
                  }`}
                >
                  <div
                    className={`flex h-12 items-center overflow-hidden rounded-2xl border backdrop-blur-xl transition-all duration-300 ${
                      isSearchOpen
                        ? 'border-white/15 bg-black/45 shadow-[0_18px_55px_rgba(0,0,0,0.45)]'
                        : 'border-transparent bg-transparent'
                    }`}
                  >
                    <button
                      aria-label="Search movies and series"
                      className={`flex h-12 w-12 shrink-0 items-center justify-center text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] transition-all hover:text-primary active:scale-95 ${
                        isSearchOpen ? 'scale-95' : 'hover:scale-110'
                      }`}
                      onClick={() => setIsSearchOpen(true)}
                    >
                      <SearchIcon size={24} strokeWidth={3} />
                    </button>

                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search movies or series"
                      className={`min-w-0 flex-1 bg-transparent pr-2 text-sm font-bold text-white outline-none placeholder:text-white/28 ${
                        isSearchOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
                      }`}
                    />

                    {isSearchOpen && searchQuery && (
                      <button
                        aria-label="Clear search"
                        className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/45 transition-all hover:bg-white/10 hover:text-white"
                        onClick={() => {
                          setSearchQuery('')
                          setSearchResults([])
                          searchInputRef.current?.focus()
                        }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {isSearchOpen && searchQuery.trim().length > 0 && (
                    <div className="absolute right-0 top-14 z-40 w-[420px] overflow-hidden rounded-3xl border border-white/10 bg-[#070a0f]/95 shadow-[0_28px_90px_rgba(0,0,0,0.72)] backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="border-b border-white/6 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Search</p>
                          {isSearching && <Loader2 size={15} className="animate-spin text-red-500" />}
                        </div>
                      </div>

                      <div className="max-h-[520px] overflow-y-auto p-2.5 scrollbar-thin">
                        {searchQuery.trim().length < 2 ? (
                          <div className="flex min-h-[150px] items-center justify-center px-6 text-center">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/20">
                              Start typing to find a movie or series
                            </p>
                          </div>
                        ) : searchResults.length > 0 ? (
                          <div className="space-y-2">
                            {searchResults.map(result => (
                              <SearchResultCard
                                key={`${result.type}-${result.tmdb_id}`}
                                video={result}
                                onSelect={openSearchResult}
                                onWarm={warmSearchResult}
                                onAddToWatchlist={openWatchlistCategoryPicker}
                              />
                            ))}
                          </div>
                        ) : isSearching ? (
                          <div className="space-y-2">
                            {[1, 2, 3].map(item => (
                              <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2.5">
                                <div className="h-[92px] w-[62px] rounded-xl bg-white/5 animate-pulse" />
                                <div className="flex-1 space-y-3">
                                  <div className="h-3 w-24 rounded-full bg-white/8 animate-pulse" />
                                  <div className="h-4 w-44 rounded-full bg-white/8 animate-pulse" />
                                  <div className="h-3 w-full rounded-full bg-white/5 animate-pulse" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex min-h-[150px] items-center justify-center px-6 text-center">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/24">
                              {searchError || 'No matching titles found'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {/* <button className="relative p-3 rounded-2xl bg-black/30 hover:bg-black/45 text-white/60 hover:text-white transition-all border border-white/10 backdrop-blur-xl">
                  <Bell size={19} />
                  <div className="absolute top-3 right-3 w-2 h-2 bg-red-600 rounded-full border-2 border-[#05080d]" />
                </button> */}
              </div>
            </div>
          </div>

          <HeroCarousel
            items={featured}
            onPlay={handlePlayFromHome}
            onShowDetail={handleShowDetailFromHome}
            onAddToWatchlist={openWatchlistCategoryPicker}
          />
        </div>
      </section>

      {/* 2. Continue Watching Section */}
      <section className="mx-auto max-w-[1600px] px-8">
        <SectionHeader
          eyebrow="Resume"
          title="Continue Watching"
          icon={<Play size={18} fill="currentColor" />}
          tone="red"
          onScrollToStart={scrollContinueWatchingToStart}
          action={(
          <button
            className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:gap-2 transition-all"
            onClick={() => onNavigate('history')}
          >
            View all <ChevronRight size={14} />
          </button>
          )}
        />
        {continueWatching.length > 0 ? (
          <div
            className="relative group/continue"
            onMouseEnter={() => setIsContinueHovered(true)}
            onMouseLeave={() => setIsContinueHovered(false)}
          >
            <button
              className="scroll-nav-btn scroll-nav-btn--left"
              aria-label="Scroll continue watching left"
              style={{
                opacity: showContinueLeft && isContinueHovered ? 1 : 0,
                pointerEvents: showContinueLeft && isContinueHovered ? 'auto' : 'none',
                transition: 'opacity 0.25s ease, transform 0.15s ease',
              }}
              onClick={() => scrollContinueWatching('left')}
            >
              <span className="scroll-nav-btn__track" />
              <ChevronLeft size={28} strokeWidth={2.5} className="scroll-nav-btn__icon" />
            </button>
            <div
              ref={continueWatchingRef}
              className="continue-watch-scroll overflow-x-auto scroll-smooth"
            >
              <div className="flex gap-5 py-1">
                {continueWatching.map(video => (
                  <div key={video.id} className="w-[340px] md:w-[400px] xl:w-[440px] flex-shrink-0">
                    <ContinueWatchingCard
                      video={video}
                      onPlay={handlePlayFromHome}
                      onShowDetail={handleShowDetailFromHome}
                    />
                  </div>
                ))}
              </div>
            </div>
            <button
              className="scroll-nav-btn scroll-nav-btn--right"
              aria-label="Scroll continue watching right"
              style={{
                opacity: showContinueRight && isContinueHovered ? 1 : 0,
                pointerEvents: showContinueRight && isContinueHovered ? 'auto' : 'none',
                transition: 'opacity 0.25s ease, transform 0.15s ease',
              }}
              onClick={() => scrollContinueWatching('right')}
            >
              <span className="scroll-nav-btn__track" />
              <ChevronRight size={28} strokeWidth={2.5} className="scroll-nav-btn__icon" />
            </button>
          </div>
        ) : (
          <div className="flex min-h-[190px] items-center justify-center rounded-2xl border border-white/5 bg-white/[0.03] text-center">
            <p className="text-sm font-black uppercase tracking-widest text-white/20">No recently played content</p>
          </div>
        )}
      </section>

      {/* 3. Global Trending Movies Section */}
      <section className="mx-auto mt-7 max-w-[1600px] px-8">
        <SectionHeader
          eyebrow="Global movies"
          title="Trending Movies"
          icon={<Film size={18} />}
          tone="red"
          onScrollToStart={() => globalMoviesRef.current?.scrollToStart()}
        />
        <HorizontalScrollRow ref={globalMoviesRef} contentClassName="gap-5">
          {trendingMovies.map(video => (
            <div
              key={video.tmdb_id || video.id}
              className={POSTER_RAIL_CARD_CLASS}
            >
              <VideoCard video={video} onPlay={handlePlayFromHome} onShowDetail={handleShowDetailFromHome} />
            </div>
          ))}
          {trendingMovies.length === 0 && Array.from({ length: TRENDING_HERO_LIMIT }, (_, i) => i + 1).map(i => (
            <div
              key={i}
              className={`${POSTER_RAIL_CARD_CLASS} aspect-[2/3] rounded-2xl bg-white/5 animate-pulse`}
            />
          ))}
        </HorizontalScrollRow>
      </section>

      {/* 4. Global Trending Series Section */}
      <section className="mx-auto mt-7 max-w-[1600px] px-8">
        <SectionHeader
          eyebrow="Global series"
          title="Trending Series"
          icon={<Tv size={18} />}
          tone="cyan"
          onScrollToStart={() => globalSeriesRef.current?.scrollToStart()}
        />
        <HorizontalScrollRow ref={globalSeriesRef} contentClassName="gap-5">
          {trendingSeries.map(video => (
            <div
              key={video.tmdb_id || video.id}
              className={POSTER_RAIL_CARD_CLASS}
            >
              <VideoCard video={video} onPlay={handlePlayFromHome} onShowDetail={handleShowDetailFromHome} />
            </div>
          ))}
          {trendingSeries.length === 0 && Array.from({ length: TRENDING_HERO_LIMIT }, (_, i) => i + 1).map(i => (
            <div
              key={i}
              className={`${POSTER_RAIL_CARD_CLASS} aspect-[2/3] rounded-2xl bg-white/5 animate-pulse`}
            />
          ))}
        </HorizontalScrollRow>
      </section>

      {/* 5. India Trending Movies Section */}
      <section className="mx-auto mt-7 max-w-[1600px] px-8">
        <SectionHeader
          eyebrow="India movies"
          title="Trending Movies"
          icon={<Film size={18} />}
          tone="amber"
          onScrollToStart={() => indiaMoviesRef.current?.scrollToStart()}
        />
        <HorizontalScrollRow ref={indiaMoviesRef} contentClassName="gap-5">
          {trendingIndiaMovies.map(video => (
            <div
              key={video.tmdb_id || video.id}
              className={POSTER_RAIL_CARD_CLASS}
            >
              <VideoCard video={video} onPlay={handlePlayFromHome} onShowDetail={handleShowDetailFromHome} />
            </div>
          ))}
          {trendingIndiaMovies.length === 0 && Array.from({ length: TRENDING_HERO_LIMIT }, (_, i) => i + 1).map(i => (
            <div
              key={i}
              className={`${POSTER_RAIL_CARD_CLASS} aspect-[2/3] rounded-2xl bg-white/5 animate-pulse`}
            />
          ))}
        </HorizontalScrollRow>
      </section>

      {/* 6. India Trending Series Section */}
      <section className="mx-auto mt-7 max-w-[1600px] px-8">
        <SectionHeader
          eyebrow="India series"
          title="Trending Series"
          icon={<Tv size={18} />}
          tone="violet"
          onScrollToStart={() => indiaSeriesRef.current?.scrollToStart()}
        />
        <HorizontalScrollRow ref={indiaSeriesRef} contentClassName="gap-5">
          {trendingIndiaSeries.map(video => (
            <div
              key={video.tmdb_id || video.id}
              className={POSTER_RAIL_CARD_CLASS}
            >
              <VideoCard video={video} onPlay={handlePlayFromHome} onShowDetail={handleShowDetailFromHome} />
            </div>
          ))}
          {trendingIndiaSeries.length === 0 && Array.from({ length: TRENDING_HERO_LIMIT }, (_, i) => i + 1).map(i => (
            <div
              key={i}
              className={`${POSTER_RAIL_CARD_CLASS} aspect-[2/3] rounded-2xl bg-white/5 animate-pulse`}
            />
          ))}
        </HorizontalScrollRow>
      </section>

      {/* 7. Recently Added Movies */}
      <section className="mx-auto mt-7 max-w-[1600px] px-8">
        <SectionHeader
          eyebrow="Library movies"
          title="Recently Added"
          icon={<Film size={18} />}
          tone="emerald"
          action={(
            <button
              className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:gap-2 transition-all"
              onClick={() => onNavigate('movies')}
            >
              View all <ChevronRight size={14} />
            </button>
          )}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {recentMovies.slice(0, 6).map(video => (
            <VideoCard key={video.id} video={video} onPlay={handlePlayFromHome} onShowDetail={handleShowDetailFromHome} />
          ))}
          {recentMovies.length === 0 && [1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      </section>

      {/* 8. Recently Added Series */}
      <section className="mx-auto mt-7 max-w-[1600px] px-8">
        <SectionHeader
          eyebrow="Library series"
          title="Recently Added"
          icon={<Tv size={18} />}
          tone="cyan"
          action={(
            <button
              className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:gap-2 transition-all"
              onClick={() => onNavigate('series')}
            >
              View all <ChevronRight size={14} />
            </button>
          )}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {recentSeries.slice(0, 6).map(video => (
            <VideoCard key={video.id} video={video} onPlay={handlePlayFromHome} onShowDetail={handleShowDetailFromHome} />
          ))}
          {recentSeries.length === 0 && [1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      </section>

      {categorizingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-secondary bg-surface shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-secondary px-6 py-5">
              <div>
                <h3 className="text-base font-bold text-text">Save to...</h3>
                <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-muted">
                  {categorizingItem.title}
                </p>
              </div>
              <button
                onClick={() => setCategorizingItem(null)}
                className="rounded-xl p-2 text-muted transition-colors hover:bg-white/5 hover:text-text"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[300px] space-y-1.5 overflow-y-auto p-4">
              <button
                onClick={() => saveToWatchlist(categorizingItem, 'Watchlist')}
                disabled={savingWatchlist}
                className="group flex w-full items-center gap-3 rounded-xl p-3 text-muted transition-all hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/50 group-hover:bg-amber-500/20">
                  <Bookmark size={14} />
                </div>
                <span className="text-sm font-medium">Watchlist</span>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100">Default</span>
              </button>

              {watchlistCategories.filter(category => category !== 'Watchlist').map(category => (
                <button
                  key={category}
                  onClick={() => saveToWatchlist(categorizingItem, category)}
                  disabled={savingWatchlist}
                  className="group flex w-full items-center gap-3 rounded-xl p-3 text-muted transition-all hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/50 group-hover:bg-primary/20">
                    <Bookmark size={14} />
                  </div>
                  <span className="text-sm font-medium">{category}</span>
                  {savingWatchlist && <Loader2 size={14} className="ml-auto animate-spin" />}
                </button>
              ))}
            </div>

            <div className="border-t border-secondary bg-secondary/20 p-4">
              {!isCreatingCategory ? (
                <button
                  onClick={() => setIsCreatingCategory(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-muted/30 py-2.5 text-sm font-medium text-muted transition-all hover:border-primary/50 hover:text-text"
                >
                  <Bookmark size={14} className="opacity-50" />
                  Create New Category
                </button>
              ) : (
                <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-200">
                  <input
                    autoFocus
                    type="text"
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && newCategoryName.trim()) {
                        saveToWatchlist(categorizingItem, newCategoryName.trim())
                      }
                      if (event.key === 'Escape') setIsCreatingCategory(false)
                    }}
                    placeholder="Category name"
                    className="w-full rounded-xl border border-primary/30 bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-muted/40 focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsCreatingCategory(false)}
                      className="flex-1 py-2 text-xs font-medium text-muted transition-colors hover:text-text"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!newCategoryName.trim() || savingWatchlist}
                      onClick={() => saveToWatchlist(categorizingItem, newCategoryName.trim())}
                      className="flex-[2] rounded-lg bg-primary py-2 text-xs font-bold text-black transition-all disabled:opacity-50"
                    >
                      {savingWatchlist ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Create & Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Home
