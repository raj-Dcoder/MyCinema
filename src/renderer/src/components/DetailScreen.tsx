import React, { useEffect, useRef, useState } from 'react'
import { X, Play, Info, Calendar, Clock, Star, FolderOpen, Film, Music, Subtitles, HardDrive, ChevronDown, ChevronUp, Heart, Bookmark, Share2, Search, Zap, Users, Download, AlertTriangle, Clapperboard, Loader2, ExternalLink, Languages } from 'lucide-react'
import { Video } from '../types'

interface DetailScreenProps {
  video: Video
  onClose: () => void
  onPlay: (video: Video) => void
}

// ─── Media Info helpers ───────────────────────────────────────────────────────
const InfoSection: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div>
    <div className="flex items-center gap-2 mb-2.5">
      {icon}
      <h4 className="text-[12px] font-black text-white/40 uppercase tracking-[0.18em]">{title}</h4>
    </div>
    <div className="space-y-1.5 pl-1">{children}</div>
  </div>
)

const InfoRow: React.FC<{ label: string; value: string | null | undefined }> = ({ label, value }) => {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11px] font-bold text-white/30 uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-[12px] font-semibold text-white/80 text-right break-all">{value}</span>
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

type TrailerSeasonSelection = 'latest' | 'series' | number

const getMoctaleUrl = (video: Video) => {
  const title = video.type === 'series' && video.series_name ? video.series_name : video.title
  const slug = title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `https://www.moctale.in/content/${slug}${video.release_year ? `-${video.release_year}` : ''}`
}

const DetailScreen: React.FC<DetailScreenProps> = ({ video, onClose, onPlay }) => {
  const [episodes, setEpisodes] = useState<Video[]>([])
  const [loading, setLoading] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [showTrailerModal, setShowTrailerModal] = useState(false)
  const [mediaInfo, setMediaInfo] = useState<any>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [trailer, setTrailer] = useState<any>(null)
  const [trailerLoading, setTrailerLoading] = useState(false)
  const [trailerSeasonSelection, setTrailerSeasonSelection] = useState<TrailerSeasonSelection>('latest')
  const [trailerSeasons, setTrailerSeasons] = useState<number[]>([])
  const [shouldLoadTrailer, setShouldLoadTrailer] = useState(false)
  const trailerCacheRef = useRef<Map<string, any>>(new Map())
  const [showAllAudio, setShowAllAudio] = useState(false)
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [isFavorite, setIsFavorite] = useState(video.is_favorite)
  const [isWatchlist, setIsWatchlist] = useState(video.is_watchlist)

  // Torrent Search State
  const [sources, setSources] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [sourceSeasonFilter, setSourceSeasonFilter] = useState('all')
  const [hindiOnly, setHindiOnly] = useState(false)

  const handleToggleFavorite = async () => {
    const newValue = await window.api.toggleFavorite(video.id)
    setIsFavorite(!!newValue)
    video.is_favorite = !!newValue // Sync local object
  }

  const handleToggleWatchlist = async () => {
    if (video.isExternal) {
      if (isWatchlist) {
        await window.api.removeFromWatchlistExternal(video.tmdb_id!)
        setIsWatchlist(false)
      } else {
        await window.api.addToWatchlistExternal(video)
        setIsWatchlist(true)
      }
    } else {
      const newValue = await window.api.toggleWatchlist(video.id)
      setIsWatchlist(!!newValue)
      video.is_watchlist = !!newValue // Sync local object
    }
  }

  const handleSearchSources = async () => {
    setSearching(true)
    setHasSearched(true)
    setHindiOnly(false)
    setSourceSeasonFilter('all')
    try {
      const results = await window.api.searchTorrentSources(
        video.title, 
        video.release_year?.toString() || '', 
        video.type === 'series' ? 'tv' : 'movie', 
        video.tmdb_id!
      )
      setSources(results)
    } catch (err) {
      console.error('Failed to search sources:', err)
    } finally {
      setSearching(false)
    }
  }

  const handleDownloadSource = async (source: any) => {
    const torrentId = await window.api.startTorrentDownload(source.magnet, video.title, video.tmdb_id)
    if (torrentId) {
      alert('Download started! Check the Downloads tab.')
    }
  }

  const handleOpenFolder = () => {
    window.api.openFolder(video.file_path)
  }

  const handleOpenMoctale = () => {
    window.open(getMoctaleUrl(video), '_blank')
  }

  const handleShowInfo = async () => {
    setShowInfoModal(true)
    if (!mediaInfo) {
      setInfoLoading(true)
      const info = await window.api.getMediaInfo(video.file_path)
      setMediaInfo(info)
      setInfoLoading(false)
    }
  }

  const getTrailerCacheKey = (selection: TrailerSeasonSelection) => [
    video.tmdb_id || video.title,
    video.type,
    typeof selection === 'number' ? `season-${selection}` : selection
  ].join(':')

  const handleTrailerSeasonSelect = (seasonNumber: number) => {
    const key = getTrailerCacheKey(seasonNumber)
    const cachedTrailer = trailerCacheRef.current.get(key)
    setTrailerSeasonSelection(seasonNumber)

    if (cachedTrailer) {
      setTrailer(cachedTrailer)
      setTrailerLoading(false)
      return
    }

    setShouldLoadTrailer(true)
    setTrailer(null)
    setTrailerLoading(true)
  }

  useEffect(() => {
    let cancelled = false

    setTrailer(null)
    setShowTrailerModal(false)
    setTrailerSeasons([])
    setShouldLoadTrailer(false)
    trailerCacheRef.current.clear()
    setTrailerSeasonSelection(video.type === 'series' ? 'latest' : 'series')

    const trailerTimer = window.setTimeout(() => {
      if (!cancelled) setShouldLoadTrailer(true)
    }, 650)

    if (video.type === 'series' && video.series_name) {
      setLoading(true)
      window.api.getSeriesInfo(video.series_name).then(data => {
        if (cancelled) return
        setEpisodes(data)
        setLoading(false)
        
        // Auto-select the season of the current video, or the first available season
        if (data.length > 0) {
          const seasons = [...new Set(data.map(ep => ep.season || 1))].sort((a, b) => a - b)
          setSelectedSeason(video.season || seasons[0])
        }
      })
    } else {
      setEpisodes([])
      setSelectedSeason(null)
      setLoading(false)
    }

    return () => {
      cancelled = true
      window.clearTimeout(trailerTimer)
    }
  }, [video])

  useEffect(() => {
    let cancelled = false
    if (!shouldLoadTrailer) {
      setTrailerLoading(false)
      return () => {
        cancelled = true
      }
    }

    const cacheKey = getTrailerCacheKey(trailerSeasonSelection)
    const cachedTrailer = trailerCacheRef.current.get(cacheKey)

    if (cachedTrailer) {
      setTrailer(cachedTrailer)
      setTrailerLoading(false)
      return () => {
        cancelled = true
      }
    }

    setTrailerLoading(true)

    window.api.getTmdbTrailer({
      tmdbId: video.tmdb_id,
      title: video.type === 'series' && video.series_name ? video.series_name : video.title,
      type: video.type,
      year: video.release_year,
      seasonNumber: typeof trailerSeasonSelection === 'number' ? trailerSeasonSelection : null,
      preferLatestSeason: video.type === 'series' && trailerSeasonSelection === 'latest'
    }).then(result => {
      if (cancelled) return
      setTrailer(result)
      if (result) trailerCacheRef.current.set(cacheKey, result)
      if (video.type === 'series' && Array.isArray(result?.availableSeasons)) {
        setTrailerSeasons(result.availableSeasons)
      }
    }).catch(err => {
      console.error('Failed to fetch trailer:', err)
      if (!cancelled) setTrailer(null)
    }).finally(() => {
      if (!cancelled) setTrailerLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [video, trailerSeasonSelection, shouldLoadTrailer])

  // Group episodes by season
  const episodesBySeason = episodes.reduce((acc, ep) => {
    const s = ep.season || 1
    if (!acc[s]) acc[s] = []
    acc[s].push(ep)
    return acc
  }, {} as Record<number, Video[]>)

  const seasons = Object.keys(episodesBySeason)
    .map(Number)
    .sort((a, b) => a - b)

  const sourceSeasons = React.useMemo(() => {
    const values = new Set<number>()
    sources.forEach(source => {
      if (typeof source.parsedSeason === 'number') values.add(source.parsedSeason)
    })
    return Array.from(values).sort((a, b) => a - b)
  }, [sources])

  const filteredSources = React.useMemo(() => {
    const getSourceHealthScore = (source: any) => {
      const seeds = Number(source.seeds) || 0
      const peers = Number(source.peers) || 0
      const seedPeerRatio = seeds / Math.max(1, peers)
      return (seeds * 10) + seedPeerRatio - (peers * 0.05)
    }

    return sources
      .filter(source => {
        if (hindiOnly && !source.isHindi) return false

        if (video.type === 'series') {
          if (sourceSeasonFilter === 'packs') return Boolean(source.isSeasonPack)
          if (sourceSeasonFilter !== 'all') {
            return source.parsedSeason === Number(sourceSeasonFilter) && !source.isSeasonPack
          }
        }

        return true
      })
      .sort((a, b) => getSourceHealthScore(b) - getSourceHealthScore(a))
  }, [sources, hindiOnly, sourceSeasonFilter, video.type])

  const trailerSeasonOptions = video.type === 'series'
    ? [...new Set([...seasons, ...trailerSeasons])].sort((a, b) => a - b)
    : []
  const activeTrailerSeason = typeof trailerSeasonSelection === 'number'
    ? trailerSeasonSelection
    : trailer?.seasonNumber || null

  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      // Mouse button 3 is the standard "Back" button, 4 is "Forward"
      if (e.button === 3 || e.button === 4) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleGlobalMouseDown)
    return () => window.removeEventListener('mousedown', handleGlobalMouseDown)
  }, [onClose])


  const getArtworkUrl = (artworkPath?: string, remoteSize: 'w780' | 'original' = 'w780') => {
    if (!artworkPath) return null
    if (artworkPath.startsWith('http')) {
      return artworkPath
        .replace(/\/t\/p\/(w342|w500|w780|w1280|original)\//, `/t/p/${remoteSize}/`)
    }
    return `media://file/${encodeURIComponent(artworkPath)}`
  }

  const posterUrl = getArtworkUrl(video.poster_path, 'w780')
  const logoUrl = getArtworkUrl(video.logo_path, 'original')

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const genres = video.genres 
    ? video.genres.split(',').map(g => g.trim()).filter(g => g.length > 0) 
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-6xl h-[90vh] bg-surface rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col md:flex-row">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-30 p-2 bg-black/40 hover:bg-red-600 rounded-full text-white transition-all border border-white/10 glass-effect"
        >
          <X size={24} />
        </button>

        {/* Poster Section (Left on Desktop, Top on Mobile) */}
        <div className="w-full md:w-[40%] h-[300px] md:h-full relative overflow-hidden shrink-0">
          {posterUrl ? (
            <img 
              src={posterUrl} 
              alt={video.title} 
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-secondary flex items-center justify-center text-muted italic">
              No Poster Available
            </div>
          )}
          {/* Gradients to blend poster with content */}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent md:hidden" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-surface hidden md:block" />
          
          {/* Subtle overlay on poster for depth */}
          <div className="absolute inset-0 bg-black/20" />
        </div>

        {/* Content Section */}
        <div className="flex-1 p-6 md:p-12 overflow-y-auto scrollbar-hide flex flex-col relative bg-surface/95">
          <div className="space-y-8">
            {/* Title & Tagline */}
            <div className="space-y-2">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={video.type === 'series' && video.series_name ? video.series_name : video.title}
                  loading="eager"
                  decoding="async"
                  className="max-h-24 w-auto max-w-[min(100%,420px)] object-contain object-left drop-shadow-[0_10px_28px_rgba(0,0,0,0.75)]"
                />
              ) : (
                <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white uppercase italic leading-[0.9] drop-shadow-lg">
                  {video.type === 'series' && video.series_name ? video.series_name : video.title}
                </h2>
              )}
              {video.tagline && (
                <p className="text-primary font-black italic tracking-[0.2em] text-xs md:text-sm uppercase opacity-90 pl-1">
                  {video.tagline}
                </p>
              )}
            </div>

            {/* Meta Info Row */}
            <div className="flex flex-wrap items-center gap-5 text-[10px] font-black text-muted uppercase tracking-[0.15em]">
              {video.vote_average ? (
                <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/10 text-white">
                  <Star size={12} className="text-yellow-500 fill-yellow-500" />
                  <span>{video.vote_average.toFixed(1)}</span>
                </div>
              ) : null}
              {video.release_year ? (
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} className="opacity-50" />
                  <span>{video.release_year}</span>
                </div>
              ) : null}
              {video.duration && (
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className="opacity-50" />
                  <span>{formatDuration(video.duration)}</span>
                </div>
              )}
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-2">
              {genres.map((genre, idx) => (
                <span 
                  key={idx} 
                  className="px-4 py-1.5 bg-white/5 text-white/70 text-[9px] font-black uppercase tracking-widest rounded-full border border-white/10 hover:bg-primary/20 hover:text-primary hover:border-primary/30 transition-all cursor-default"
                >
                  {genre}
                </span>
              ))}
            </div>

            {/* Overview */}
            <div className="space-y-3">
              <p className="text-muted/90 text-sm md:text-base leading-relaxed max-w-2xl font-medium italic">
                {video.overview || 'No overview available for this title.'}
              </p>
            </div>

            {(trailerLoading || trailer) && (
              <div className="max-w-2xl">
                {trailerLoading ? (
                  <div className="h-28 rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden flex items-center gap-4 px-4">
                    <div className="h-20 w-32 rounded-xl bg-white/5 animate-pulse" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3 w-28 rounded-full bg-white/8 animate-pulse" />
                      <div className="h-4 w-56 max-w-full rounded-full bg-white/8 animate-pulse" />
                      <div className="h-3 w-36 rounded-full bg-white/5 animate-pulse" />
                    </div>
                    <Loader2 size={20} className="text-primary animate-spin" />
                  </div>
                ) : (
                  <button
                    onClick={() => setShowTrailerModal(true)}
                    className="group/trailer relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-left transition-all duration-300 hover:border-red-500/35 hover:bg-white/[0.07] hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(0,0,0,0.35)]"
                  >
                    <div className="flex items-stretch">
                      <div className="relative h-28 w-40 shrink-0 overflow-hidden bg-black">
                        <img
                          src={trailer.thumbnailUrl}
                          alt=""
                          className="h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover/trailer:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-black/55" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white shadow-[0_10px_30px_rgba(220,38,38,0.45)] transition-transform duration-300 group-hover/trailer:scale-110">
                            <Play size={18} fill="currentColor" />
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0 flex-1 p-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="mb-1.5 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-red-400">
                            <Clapperboard size={14} />
                            <span>{trailer.label || `${trailer.official ? 'Official' : 'YouTube'} ${trailer.type || 'Trailer'}`}</span>
                          </div>
                          <h3 className="truncate text-sm md:text-base font-black text-white tracking-tight">
                            {trailer.name || 'Watch Trailer'}
                          </h3>
                          <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-white/35">
                            {video.type === 'series' && trailer.seasonNumber ? `${video.series_name || video.title} • Season ${trailer.seasonNumber}` : video.type === 'series' && video.series_name ? video.series_name : video.title}
                          </p>
                        </div>
                        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/25 text-white/45 transition-all group-hover/trailer:text-white group-hover/trailer:border-red-500/30 group-hover/trailer:bg-red-600/15">
                          <Play size={16} fill="currentColor" />
                        </div>
                      </div>
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-4 pt-4">
              {!video.isExternal ? (
                <button 
                  onClick={() => onPlay(video)}
                  className="flex items-center gap-3 bg-red-600 hover:bg-red-700 text-white px-10 py-4 rounded-2xl font-black text-sm tracking-widest transition-all shadow-[0_10px_30px_rgba(220,38,38,0.4)] hover:scale-105 active:scale-95 group uppercase italic"
                >
                  <Play fill="white" size={20} className="group-hover:scale-110 transition-transform" />
                  Play Now
                </button>
              ) : (
                <button 
                  onClick={handleSearchSources}
                  disabled={searching}
                  className="flex items-center gap-3 bg-primary hover:bg-primary/80 text-white px-10 py-4 rounded-2xl font-black text-sm tracking-widest transition-all shadow-[0_10px_30px_rgba(229,9,20,0.4)] hover:scale-105 active:scale-95 group uppercase italic disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {searching ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Search size={20} className="group-hover:scale-110 transition-transform" />
                  )}
                  {searching ? 'Finding Best Sources...' : 'Find & Watch Now'}
                </button>
              )}
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleWatchlist}
                  className={`p-4 rounded-2xl border transition-all hover:scale-105 active:scale-95 glass-effect ${
                    isWatchlist ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                  }`}
                  title="Add to Watchlist"
                >
                  <Bookmark size={20} fill={isWatchlist ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={handleToggleFavorite}
                  className={`p-4 rounded-2xl border transition-all hover:scale-105 active:scale-95 glass-effect ${
                    isFavorite ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                  }`}
                  title="Mark as Favorite"
                >
                  <Heart size={20} fill={isFavorite ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={handleShowInfo}
                  className="p-4 bg-white/5 border border-white/10 rounded-2xl text-white/40 hover:text-white transition-all hover:scale-105 active:scale-95 glass-effect"
                  title="View Media Info"
                >
                  <Info size={20} />
                </button>
                <button
                  onClick={handleOpenMoctale}
                  className="flex items-center gap-2 px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white/45 hover:text-white hover:border-red-500/30 hover:bg-red-600/10 transition-all hover:scale-105 active:scale-95 glass-effect"
                  title="Open reviews on Moctale"
                >
                  <ExternalLink size={18} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Moctale</span>
                </button>
                {!video.isExternal && (
                  <button
                    onClick={handleOpenFolder}
                    className="p-4 bg-white/5 border border-white/10 rounded-2xl text-white/40 hover:text-white transition-all hover:scale-105 active:scale-95 glass-effect"
                    title="Open Folder"
                  >
                    <FolderOpen size={20} />
                  </button>
                )}
              </div>
            </div>

            {/* Torrent Sources Section */}
            {hasSearched && (
              <div className="pt-10 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter flex items-center gap-3">
                    Available Sources
                    <span className="text-[10px] font-black uppercase tracking-widest bg-green-500/10 text-green-400 px-2 py-0.5 rounded border border-green-500/20">Free</span>
                  </h3>
                  <div className="text-[10px] text-muted font-black uppercase tracking-widest">
                    {filteredSources.length} / {sources.length} Sources
                  </div>
                </div>

                {sources.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setHindiOnly(value => !value)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                        hindiOnly
                          ? 'border-[#FF9933]/35 bg-[#FF9933]/18 text-[#FFB76B]'
                          : 'border-white/10 bg-white/[0.04] text-white/45 hover:bg-white/[0.08] hover:text-white/70'
                      }`}
                    >
                      <Languages size={12} />
                      {hindiOnly ? 'Hindi Only' : 'All Audio'}
                    </button>

                    {video.type === 'series' && (
                      <select
                        value={sourceSeasonFilter}
                        onChange={(event) => setSourceSeasonFilter(event.target.value)}
                        className="rounded-lg border border-white/10 bg-[#10141d] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/65 outline-none transition-colors hover:bg-white/[0.08]"
                      >
                        <option className="bg-[#10141d] text-white" value="all">All Seasons</option>
                        <option className="bg-[#10141d] text-white" value="packs">Season Packs</option>
                        {sourceSeasons.map(season => (
                          <option className="bg-[#10141d] text-white" key={season} value={season.toString()}>
                            Season {season}
                          </option>
                        ))}
                      </select>
                    )}

                    <span className="text-[10px] font-black uppercase tracking-widest text-white/25">
                      Sorted by seed health
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                  {searching ? (
                    <div className="py-20 text-center space-y-4">
                      <div className="inline-block w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                      <div className="text-muted font-black uppercase tracking-widest text-xs animate-pulse">Scanning high-quality mirrors...</div>
                    </div>
                  ) : filteredSources.length > 0 ? (
                    filteredSources.map((src, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 hover:border-white/10 transition-all group"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              src.quality.includes('2160') ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                              src.quality.includes('1080') ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                              'bg-white/10 text-white/60 border border-white/10'
                            }`}>
                              {src.quality}
                            </span>
                            {src.isHindi && (
                              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-[9px] font-black uppercase">
                                Hindi
                              </span>
                            )}
                            <span className="text-[10px] text-white/30 font-bold uppercase tracking-wider">{src.size}</span>
                          </div>
                          <div className="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
                            {src.title}
                          </div>
                          <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1 text-[10px] font-black text-green-500 uppercase tracking-widest">
                              <Zap size={10} fill="currentColor" />
                              {src.seeds} Seeds
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-black text-white/30 uppercase tracking-widest">
                              <Users size={10} />
                              {src.peers} Peers
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDownloadSource(src)}
                          className="bg-white/5 hover:bg-primary text-white p-3 rounded-xl transition-all border border-white/10 hover:border-primary group-hover:scale-105 active:scale-95 flex items-center gap-2 px-5"
                        >
                          <Download size={18} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Download</span>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="py-16 text-center border-2 border-dashed border-white/5 rounded-3xl">
                      <AlertTriangle className="mx-auto text-amber-500/50 mb-3" size={32} />
                      <p className="text-muted font-black uppercase tracking-widest text-xs">
                        {sources.length > 0 ? 'No sources match these filters.' : 'No sources found for this title.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Media Info Modal */}
            {showInfoModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowInfoModal(false)}>
                <div
                  className="relative w-full max-w-lg bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                        <Info size={18} className="text-red-500" />
                      </div>
                      <div>
                        <h3 className="text-[13px] font-black text-white uppercase tracking-widest leading-none">Media Information</h3>
                        <p className="text-[11px] text-white/30 font-medium tracking-wide mt-1 truncate max-w-[260px]">{mediaInfo?.file?.name || video.title}</p>
                      </div>
                    </div>
                    <button onClick={() => setShowInfoModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all">
                      <X size={18} />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto scrollbar-thin">
                    {infoLoading ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <p className="text-white/30 text-[12px] font-bold uppercase tracking-widest">Analyzing file...</p>
                      </div>
                    ) : mediaInfo?.error ? (
                      <p className="text-red-400 text-sm font-medium text-center py-8">{mediaInfo.error}</p>
                    ) : mediaInfo ? (
                      <>
                        {/* File */}
                        <InfoSection icon={<HardDrive size={16} className="text-blue-400" />} title="File">
                          <InfoRow label="Size" value={mediaInfo.file?.size} />
                          <InfoRow label="Format" value={mediaInfo.container?.format} />
                          <InfoRow label="Duration" value={mediaInfo.container?.duration ? formatDuration(mediaInfo.container.duration) : null} />
                          <InfoRow label="Bitrate" value={mediaInfo.container?.bitrate} />
                        </InfoSection>

                        {/* Video */}
                        {mediaInfo.video && (
                          <InfoSection icon={<Film size={16} className="text-purple-400" />} title="Video">
                            <InfoRow label="Codec" value={mediaInfo.video.codec} />
                            {mediaInfo.video.profile && <InfoRow label="Profile" value={mediaInfo.video.profile} />}
                            <InfoRow label="Resolution" value={mediaInfo.video.resolution} />
                            <InfoRow label="Frame Rate" value={mediaInfo.video.frameRate} />
                            {mediaInfo.video.bitDepth && <InfoRow label="Bit Depth" value={mediaInfo.video.bitDepth} />}
                            {mediaInfo.video.bitrate && <InfoRow label="Video Bitrate" value={mediaInfo.video.bitrate} />}
                          </InfoSection>
                        )}

                        {/* Audio */}
                        {mediaInfo.audio?.length > 0 && (
                          <InfoSection icon={<Music size={16} className="text-green-400" />} title={`Audio (${mediaInfo.audio.length} track${mediaInfo.audio.length > 1 ? 's' : ''})` }>
                            {(showAllAudio ? mediaInfo.audio : mediaInfo.audio.slice(0, 2)).map((track: any, i: number) => (
                              <div key={i} className={`${i > 0 ? 'border-t border-white/5 pt-2 mt-2' : ''}`}>
                                {mediaInfo.audio.length > 1 && <p className="text-[11px] font-black text-white/30 uppercase tracking-widest mb-1.5">Track {track.index}{track.language ? ` — ${track.language.toUpperCase()}` : ''}{track.title ? ` (${track.title})` : ''}</p>}
                                <InfoRow label="Codec" value={track.codec} />
                                <InfoRow label="Channels" value={track.channels} />
                                <InfoRow label="Sample Rate" value={track.sampleRate} />
                                {track.bitrate && <InfoRow label="Bitrate" value={track.bitrate} />}
                              </div>
                            ))}
                            {mediaInfo.audio.length > 2 && (
                              <button onClick={() => setShowAllAudio(p => !p)} className="mt-2.5 flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 font-black uppercase tracking-widest transition-colors">
                                {showAllAudio ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {showAllAudio ? 'Show less' : `+${mediaInfo.audio.length - 2} more tracks`}
                              </button>
                            )}
                          </InfoSection>
                        )}

                        {/* Subtitles */}
                        {mediaInfo.subtitles?.length > 0 && (
                          <InfoSection icon={<Subtitles size={16} className="text-yellow-400" />} title={`Subtitles (${mediaInfo.subtitles.length})`}>
                            <div className="flex flex-wrap gap-2">
                              {mediaInfo.subtitles.map((s: any, i: number) => (
                                <span key={i} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-bold text-white/60 uppercase tracking-widest">
                                  {s.language || s.codec || `Track ${s.index}`}
                                </span>
                              ))}
                            </div>
                          </InfoSection>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {showTrailerModal && (
              <div
                className="fixed inset-0 z-[65] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
                onClick={() => setShowTrailerModal(false)}
              >
                <div
                  className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#080808] shadow-[0_30px_90px_rgba(0,0,0,0.75)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-4 border-b border-white/8 bg-white/[0.03] px-5 py-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600/15 text-red-500 ring-1 ring-red-500/20">
                        <Clapperboard size={20} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-black uppercase tracking-[0.16em] text-white">
                          {trailer?.label || (activeTrailerSeason ? `Season ${activeTrailerSeason} Trailer` : 'Trailer')} {trailerLoading ? 'Loading' : 'Playing'}
                        </h3>
                        <p className="truncate text-[12px] font-semibold text-white/35">{trailer?.name || 'Finding the best playable trailer...'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {video.type === 'series' && trailerSeasonOptions.length > 0 && (
                        <div className="hidden md:flex max-w-[520px] items-center gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-1 scrollbar-thin">
                          {trailerSeasonOptions.map(seasonNumber => (
                            <button
                              key={seasonNumber}
                              onClick={() => handleTrailerSeasonSelect(seasonNumber)}
                              className={`h-7 shrink-0 rounded-lg px-3 text-[9px] font-black uppercase tracking-widest transition-all ${
                                activeTrailerSeason === seasonNumber
                                  ? 'bg-red-600 text-white'
                                  : 'text-white/45 hover:bg-white/8 hover:text-white'
                              }`}
                            >
                              Season {seasonNumber}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => trailer?.watchUrl && window.open(trailer.watchUrl, '_blank')}
                        disabled={!trailer?.watchUrl}
                        className="hidden sm:flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[10px] font-black uppercase tracking-widest text-white/45 transition-all hover:text-white hover:bg-white/[0.08]"
                      >
                        <ExternalLink size={13} />
                        YouTube
                      </button>
                      <button
                        onClick={() => setShowTrailerModal(false)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/50 transition-all hover:bg-red-600 hover:text-white hover:border-red-600"
                      >
                        <X size={17} />
                      </button>
                    </div>
                  </div>

                  {video.type === 'series' && trailerSeasonOptions.length > 0 && (
                    <div className="flex md:hidden gap-1 overflow-x-auto border-b border-white/8 bg-black/30 px-4 py-3 scrollbar-thin">
                      {trailerSeasonOptions.map(seasonNumber => (
                        <button
                          key={seasonNumber}
                          onClick={() => handleTrailerSeasonSelect(seasonNumber)}
                          className={`h-8 shrink-0 rounded-lg px-3 text-[9px] font-black uppercase tracking-widest transition-all ${
                            activeTrailerSeason === seasonNumber
                              ? 'bg-red-600 text-white'
                              : 'border border-white/10 bg-white/[0.04] text-white/45'
                          }`}
                        >
                          Season {seasonNumber}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="relative aspect-video bg-black">
                    {trailer && !trailerLoading ? (
                      <iframe
                        src={trailer.embedUrl}
                        title={trailer.name || 'Trailer'}
                        className="absolute inset-0 h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    ) : trailerLoading ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/45">
                        <Loader2 size={28} className="animate-spin text-red-500" />
                        <span className="text-[10px] font-black uppercase tracking-[0.22em]">Loading Trailer</span>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white/45">
                        <Clapperboard size={30} className="text-white/25" />
                        <span className="text-[11px] font-black uppercase tracking-[0.22em]">No playable trailer found</span>
                        <p className="max-w-sm text-[12px] font-semibold text-white/30">
                          This season does not have a trusted playable trailer available right now.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Episodes Section (for Series) */}
            {video.type === 'series' && (
              <div className="pt-10 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-4 gap-4">
                  <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                    Episodes
                  </h3>
                  
                  {/* Season Selector */}
                  {seasons.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {seasons.map(s => (
                        <button
                          key={s}
                          onClick={() => setSelectedSeason(s)}
                          className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${
                            selectedSeason === s 
                              ? 'bg-red-600 border-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]' 
                              : 'bg-white/5 border-white/10 text-muted hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          Season {s}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-muted font-black uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                      {episodesBySeason[selectedSeason || 1]?.length || 0} Episodes
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                  {loading ? (
                    <div className="col-span-full py-16 text-center">
                      <div className="inline-block w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                      <div className="text-muted font-black uppercase tracking-widest text-[10px]">Fetching episodes...</div>
                    </div>
                  ) : (
                    (episodesBySeason[selectedSeason || 1] || []).map((ep, idx) => (
                      <button
                        key={ep.id}
                        onClick={() => onPlay(ep)}
                        className={`flex items-center p-4 rounded-2xl transition-all border group text-left relative overflow-hidden ${
                          ep.id === video.id 
                            ? 'bg-red-600/10 border-red-600/40 translate-x-2' 
                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10 hover:-translate-y-1'
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mr-5 transition-all text-sm font-black italic ${
                          ep.id === video.id ? 'bg-red-600 text-white' : 'bg-black/40 text-muted group-hover:bg-red-600 group-hover:text-white'
                        }`}>
                          {(idx + 1).toString().padStart(2, '0')}
                        </div>
                        <div className="flex-1 truncate">
                          <div className="text-sm font-bold text-white truncate mb-0.5">
                            S{ep.season?.toString().padStart(2, '0')} E{ep.episode?.toString().padStart(2, '0')}
                          </div>
                          <div className="text-[9px] text-muted font-black uppercase tracking-[0.1em] truncate opacity-60">
                            {ep.title}
                          </div>
                        </div>
                        <div className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play size={16} className="text-red-600" fill="currentColor" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .glass-effect {
          backdrop-filter: blur(8px);
          background: rgba(255, 255, 255, 0.05);
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(229, 9, 20, 0.3);
          border-radius: 10px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(229, 9, 20, 0.5);
        }
      `}} />
    </div>
  )
}

export default DetailScreen
