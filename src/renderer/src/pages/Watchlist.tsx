import React, { useMemo, useState, useEffect, useRef } from 'react'
import { Video, WatchlistIntent } from '../types'
import VideoCard from '../components/VideoCard'
import WatchlistIntentPicker from '../components/WatchlistIntentPicker'
import { compareWatchlistItems, getWatchlistIntent, normalizeWatchlistIntent } from '../utils/watchlistIntent'
import { Bookmark, BookmarkCheck, CalendarDays, Film, Hourglass, LayoutGrid, Loader2, Search, Tv, Zap } from 'lucide-react'

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

type WatchlistFilter = 'all' | WatchlistIntent

type PickerState =
  | { kind: 'search'; result: TMDBResult; existing: Video | null }
  | { kind: 'manage'; video: Video }
  | null

const TMDB_IMG = 'https://image.tmdb.org/t/p'

const FILTER_TABS: { id: WatchlistFilter; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'all', label: 'All', icon: <LayoutGrid size={13} />, hint: 'Everything, grouped by lane' },
  { id: 'asap', label: 'ASAP', icon: <Zap size={13} fill="currentColor" />, hint: 'Tonight or tomorrow' },
  { id: 'weekend', label: 'Weekend', icon: <CalendarDays size={13} />, hint: 'Friday-night fuel' },
  { id: 'someday', label: 'Someday', icon: <Hourglass size={13} />, hint: 'Rainy-day stash' }
]

const SECTION_META: Record<WatchlistIntent, { title: string; tagline: string; icon: React.ReactNode; tile: string }> = {
  asap: {
    title: 'Up next · ASAP',
    tagline: 'Tonight or tomorrow — press play here first',
    icon: <Zap size={15} fill="currentColor" />,
    tile: 'bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-[0_8px_24px_rgba(239,68,68,0.4)]'
  },
  weekend: {
    title: 'Weekend',
    tagline: 'Saved for the upcoming weekend',
    icon: <CalendarDays size={15} />,
    tile: 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)]'
  },
  someday: {
    title: 'Someday stash',
    tagline: 'No date, no pressure — older saves rest here',
    icon: <Hourglass size={15} />,
    tile: 'bg-gradient-to-br from-teal-400 to-emerald-600 text-white shadow-[0_8px_24px_rgba(20,184,166,0.35)]'
  }
}

const intentOf = (video: Video): WatchlistIntent => getWatchlistIntent(video as any) ?? 'someday'

// The watchlist is one inbox with three lanes: ASAP / Weekend / Someday.
// DetailScreen files every save into a lane; this tab filters and groups by it.
const Watchlist: React.FC<WatchlistProps> = ({ onPlay, onShowDetail, refreshKey = 0 }) => {
  const [items, setItems] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TMDBResult[]>([])
  const [searching, setSearching] = useState(false)
  const [activeFilter, setActiveFilter] = useState<WatchlistFilter>('all')
  const [picker, setPicker] = useState<PickerState>(null)
  const [pickerBusy, setPickerBusy] = useState<WatchlistIntent | null>(null)
  const [pickerRemoving, setPickerRemoving] = useState(false)
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

  const findExisting = (tmdbId: number) => items.find(item => item.tmdb_id === tmdbId) || null

  const toExternalVideo = (item: TMDBResult, priority: WatchlistIntent = 'someday'): Video => {
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
      category: 'Watchlist',
      priority
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

  const counts = useMemo(() => {
    const next = { all: items.length, asap: 0, weekend: 0, someday: 0 } as Record<WatchlistFilter, number>
    for (const item of items) next[intentOf(item)] += 1
    return next
  }, [items])

  const grouped = useMemo(() => {
    const groups: Record<WatchlistIntent, Video[]> = { asap: [], weekend: [], someday: [] }
    for (const item of items) groups[intentOf(item)].push(item)
    const byDate = (a: Video, b: Video) => {
      const aTime = new Date((a as any)?.added_at ?? 0).getTime()
      const bTime = new Date((b as any)?.added_at ?? 0).getTime()
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0)
    }
    groups.asap.sort(byDate)
    groups.weekend.sort(byDate)
    groups.someday.sort(byDate)
    return groups
  }, [items])

  const visibleSingle = useMemo(() => {
    if (activeFilter === 'all') return [] as Video[]
    return [...grouped[activeFilter]].sort((a, b) => {
      const aTime = new Date((a as any)?.added_at ?? 0).getTime()
      const bTime = new Date((b as any)?.added_at ?? 0).getTime()
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0)
    })
  }, [activeFilter, grouped])

  const sortedAll = useMemo(() => [...items].sort(compareWatchlistItems), [items])

  const handlePickerSelect = async (intent: WatchlistIntent) => {
    if (!picker || pickerBusy || pickerRemoving) return
    setPickerBusy(intent)
    try {
      if (picker.kind === 'search') {
        const { result, existing } = picker
        if (existing) {
          if (existing.isExternal && existing.tmdb_id) {
            await window.api.setWatchlistPriority({ tmdbId: existing.tmdb_id, isExternal: true, priority: intent })
          } else if (!existing.isExternal) {
            await window.api.setWatchlistPriority({ videoId: existing.id, isExternal: false, priority: intent })
          }
        } else {
          await window.api.addToWatchlistExternal(toExternalVideo(result, intent))
        }
      } else {
        const video = picker.video
        if (video.isExternal && video.tmdb_id) {
          await window.api.setWatchlistPriority({ tmdbId: video.tmdb_id, isExternal: true, priority: intent })
        } else if (!video.isExternal) {
          await window.api.setWatchlistPriority({ videoId: video.id, isExternal: false, priority: intent })
        }
      }
      await fetchWatchlist()
      setPicker(null)
    } catch (err) {
      console.error('[Watchlist] Save error:', err)
    } finally {
      setPickerBusy(null)
    }
  }

  const handlePickerRemove = async () => {
    if (!picker || pickerBusy || pickerRemoving) return
    setPickerRemoving(true)
    try {
      if (picker.kind === 'search') {
        if (picker.existing?.isExternal && picker.existing.tmdb_id) {
          await window.api.removeFromWatchlistExternal(picker.existing.tmdb_id)
        } else if (picker.existing && !picker.existing.isExternal) {
          await window.api.toggleWatchlist(picker.existing.id)
        }
      } else {
        const video = picker.video
        if (video.isExternal && video.tmdb_id) {
          await window.api.removeFromWatchlistExternal(video.tmdb_id)
        } else if (!video.isExternal) {
          await window.api.toggleWatchlist(video.id)
        }
      }
      await fetchWatchlist()
      setPicker(null)
    } catch (err) {
      console.error('[Watchlist] Remove error:', err)
    } finally {
      setPickerRemoving(false)
    }
  }

  const totalTitles = items.length

  const pickerTitle =
    picker?.kind === 'search'
      ? picker.result.title || picker.result.name || 'Untitled'
      : picker?.kind === 'manage'
        ? (picker.video.type === 'series' && picker.video.series_name ? picker.video.series_name : picker.video.title)
        : ''
  const pickerPoster =
    picker?.kind === 'search'
      ? (picker.result.poster_path ? `${TMDB_IMG}/w500${picker.result.poster_path}` : null)
      : picker?.kind === 'manage'
        ? (picker.video.poster_path?.startsWith('http')
            ? picker.video.poster_path
            : picker.video.poster_path
              ? `media://file/${encodeURIComponent(picker.video.poster_path)}`
              : null)
        : null
  const pickerCurrent: WatchlistIntent | null =
    picker?.kind === 'search'
      ? (picker.existing ? intentOf(picker.existing) : null)
      : picker?.kind === 'manage'
        ? intentOf(picker.video)
        : null
  const pickerHasExisting = picker?.kind === 'search' ? Boolean(picker.existing) : true

  const renderCard = (video: Video) => (
    <VideoCard
      key={`${video.isExternal ? 'external' : 'local'}-${video.tmdb_id || video.id}`}
      video={video}
      onPlay={onPlay}
      onShowDetail={onShowDetail}
    />
  )

  const renderSection = (intent: WatchlistIntent, list: Video[]) => {
    if (list.length === 0) return null
    const meta = SECTION_META[intent]
    return (
      <section key={intent} className="space-y-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.tile}`}>
            {meta.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-black tracking-tight text-white">
              {meta.title}
              <span className="ml-2 rounded-full bg-white/[0.07] px-2 py-0.5 align-middle text-[10px] font-black text-white/60">
                {list.length}
              </span>
            </h3>
            <p className="truncate text-[11px] font-medium text-white/35">{meta.tagline}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {list.map(renderCard)}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <Bookmark size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold tracking-normal text-white md:text-3xl">Your Watchlist</h2>
          <p className="text-[11px] font-medium text-white/40">
            {totalTitles} saved title{totalTitles === 1 ? '' : 's'} · {counts.asap} ASAP · {counts.weekend} Weekend · {counts.someday} Someday
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

      {/* Lane filter — premium segmented control with live counts */}
      {totalTitles > 0 && results.length === 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {FILTER_TABS.map(tab => {
            const isActive = activeFilter === tab.id
            const count = counts[tab.id]
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                title={tab.hint}
                aria-pressed={isActive}
                className={`flex h-9 items-center gap-2 rounded-full border px-3.5 text-[11px] font-black uppercase tracking-[0.1em] transition-all active:scale-95 ${
                  isActive
                    ? tab.id === 'all'
                      ? 'border-white bg-white text-black shadow-[0_8px_24px_rgba(255,255,255,0.2)]'
                      : tab.id === 'asap'
                        ? 'border-red-500 bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-[0_8px_24px_rgba(239,68,68,0.4)]'
                        : tab.id === 'weekend'
                          ? 'border-violet-400 bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)]'
                          : 'border-teal-300 bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-[0_8px_24px_rgba(20,184,166,0.35)]'
                    : 'border-white/10 bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white'
                }`}
              >
                {tab.icon}
                {tab.label}
                <span className={`rounded-full px-1.5 py-px text-[10px] font-black ${
                  isActive ? 'bg-black/20 text-white' : 'bg-white/10 text-white/45'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
          <span className="ml-1 hidden text-[10px] font-semibold text-white/25 lg:block">
            Tip — open any title and re-file its lane without removing it.
          </span>
        </div>
      )}

      {searching && (
        <div className="flex items-center gap-2 text-xs font-bold text-white/40">
          <Loader2 size={14} className="animate-spin" /> Searching…
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/60">Search Results — pick a lane to save</h3>
            <button
              onClick={clearSearch}
              className="text-xs font-bold text-muted hover:text-primary transition-colors"
            >
              Back to Watchlist
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {results.map(item => {
              const existing = findExisting(item.id)
              const alreadyAdded = Boolean(existing)
              const existingIntent = existing ? intentOf(existing) : null
              return (
                <button
                  key={`${item.media_type}-${item.id}`}
                  onClick={() => setPicker({ kind: 'search', result: item, existing })}
                  className="group text-left"
                  title={alreadyAdded ? `Saved · ${existingIntent?.toUpperCase()} — click to change lane` : 'Pick a lane to save'}
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
                        {alreadyAdded ? (
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
                      {alreadyAdded && existingIntent ? ` · Saved · ${existingIntent.toUpperCase()}` : ''}
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
        activeFilter === 'all' ? (
          <div className="space-y-8">
            {renderSection('asap', grouped.asap)}
            {renderSection('weekend', grouped.weekend)}
            {renderSection('someday', grouped.someday)}
            {sortedAll.length === 0 && null}
          </div>
        ) : visibleSingle.length > 0 ? (
          renderSection(activeFilter as WatchlistIntent, visibleSingle)
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
              activeFilter === 'asap' ? 'bg-red-500/10 text-red-400'
              : activeFilter === 'weekend' ? 'bg-violet-500/10 text-violet-300'
              : 'bg-teal-400/10 text-teal-200'
            }`}>
              {activeFilter === 'asap' ? <Zap size={28} fill="currentColor" /> : activeFilter === 'weekend' ? <CalendarDays size={28} /> : <Hourglass size={28} />}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-black text-white">
                No {activeFilter === 'asap' ? 'ASAP' : activeFilter === 'weekend' ? 'Weekend' : 'Someday'} picks yet
              </h3>
              <p className="max-w-sm text-[12px] font-medium text-white/40">
                {activeFilter === 'asap'
                  ? 'File something as ASAP and it jumps to the top of your queue.'
                  : activeFilter === 'weekend'
                    ? 'Save a cozy binge for Friday night — it will wait here.'
                    : 'Your rainy-day stash is empty. Older saves without a lane rest here.'}
              </p>
            </div>
            <button
              onClick={() => setActiveFilter('all')}
              className="rounded-xl border border-white/10 bg-white/[0.05] px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-white/70 transition-all hover:bg-white/10 hover:text-white active:scale-95"
            >
              Show everything
            </button>
          </div>
        )
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-40 text-center space-y-6 opacity-20">
          <Bookmark size={80} strokeWidth={1} />
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">Watchlist is empty</h3>
            <p className="text-sm font-medium text-white/60">Search movies or series, then file each one as ASAP, Weekend or Someday.</p>
          </div>
        </div>
      ) : (
        null
      )}

      {/* Shared lane picker — search saves and in-tab moves use the same sheet */}
      <WatchlistIntentPicker
        open={Boolean(picker)}
        currentIntent={pickerCurrent}
        title={pickerTitle}
        subtitle={
          picker?.kind === 'search'
            ? `${picker.result.media_type === 'tv' ? 'Series' : 'Movie'} · pick its lane`
            : 'Change its lane without removing it'
        }
        posterUrl={pickerPoster}
        busyIntent={pickerBusy}
        busy={Boolean(pickerBusy)}
        removing={pickerRemoving}
        onSelect={(intent: WatchlistIntent) => void handlePickerSelect(normalizeWatchlistIntent(intent))}
        onRemove={pickerHasExisting ? () => void handlePickerRemove() : undefined}
        onClose={() => { if (!pickerBusy && !pickerRemoving) setPicker(null) }}
      />
    </div>
  )
}

export default Watchlist
