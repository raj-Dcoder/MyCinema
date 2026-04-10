import React, { useState, useEffect, useRef } from 'react'
import { Search, Download as DownloadIcon, Film, Tv, X, Loader2, HardDrive, CheckCircle2, AlertCircle, Pause, Play, FolderOpen } from 'lucide-react'
import { DownloadFeatureTour } from '../components/DownloadFeatureTour'

// ─── Types ───────────────────────────────────────────────────────────────────
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

interface TorrentSource {
  title: string
  quality: string
  size: string
  magnet: string
  seeds: number
  peers: number
  type: string
  isHindi?: boolean
  parsedSeason?: number
  parsedEpisode?: number
  isSeasonPack?: boolean
}

interface ActiveDownload {
  id: string
  title: string
  quality: string
  progress: number
  downloadSpeed: string
  timeRemaining: string
  status: 'downloading' | 'done' | 'error' | 'paused'
  size: string
  downloaded: string
  errorMessage?: string
}

const TMDB_IMG = 'https://image.tmdb.org/t/p'

const Download: React.FC = () => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TMDBResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedItem, setSelectedItem] = useState<TMDBResult | null>(null)
  const [sources, setSources] = useState<TorrentSource[]>([])
  const [loadingSources, setLoadingSources] = useState(false)
  const [downloads, setDownloads] = useState<ActiveDownload[]>([])
  const [showDownloads, setShowDownloads] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [selectedSeason, setSelectedSeason] = useState<string>('all')
  const [selectedEpisode, setSelectedEpisode] = useState<string>('all')

  // Listen for torrent progress from main process
  useEffect(() => {
    // Reconnect to existing downloads on mount
    window.api.getActiveDownloads().then((active: ActiveDownload[]) => {
      if (active && active.length > 0) {
        setDownloads(active)
        setShowDownloads(true)
      }
    }).catch((err: any) => console.error('Failed to get active downloads:', err))

    const cleanup = window.api.onTorrentProgress((data: any) => {
      setDownloads(prev => {
        const existing = prev.find(d => d.id === data.id)
        if (existing) {
          return prev.map(d => d.id === data.id ? { ...d, ...data } : d)
        }
        return [...prev, data]
      })
    })
    return cleanup
  }, [])

  // ─── Search TMDB ─────────────────────────────────────────────────────────
  const handleSearch = async () => {
    const trimmed = query.trim()
    if (!trimmed) return
    setSearching(true)
    setSelectedItem(null)
    setSources([])

    try {
      const filtered = await window.api.searchTMDB(trimmed)
      setResults((filtered || []).slice(0, 12))
    } catch (err) {
      console.error('[Download] TMDB search error:', err)
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  // ─── Fetch Torrent Sources ───────────────────────────────────────────────
  const handleSelectResult = async (item: TMDBResult) => {
    setSelectedItem(item)
    setLoadingSources(true)
    setSources([])
    setSelectedSeason('all')
    setSelectedEpisode('all')

    try {
      const title = item.title || item.name || ''
      const year = (item.release_date || item.first_air_date || '').slice(0, 4)
      const mediaType = item.media_type
      const result = await window.api.searchTorrentSources(title, year, mediaType, item.id)
      setSources(result || [])
    } catch (err) {
      console.error('[Download] Source fetch error:', err)
      setSources([])
    } finally {
      setLoadingSources(false)
    }
  }

  // ─── Start Download ──────────────────────────────────────────────────────
  const handleStartDownload = async (source: TorrentSource) => {
    const title = selectedItem?.title || selectedItem?.name || 'Unknown'
    try {
      await window.api.startTorrentDownload(source.magnet, `${title} (${source.quality})`)
      setShowDownloads(true)
    } catch (err) {
      console.error('[Download] Start download error:', err)
    }
  }

  const handlePauseResume = async (id: string) => {
    try {
      await window.api.pauseResumeTorrent(id)
    } catch (err) {
      console.error('[Download] Pause/Resume error:', err)
    }
  }

  const handleRemoveDownload = async (id: string) => {
    try {
      await window.api.removeDownload(id)
      setDownloads(prev => prev.filter(d => d.id !== id))
    } catch (err) {
      console.error('[Download] Remove error:', err)
    }
  }

  const activeCount = downloads.filter(d => d.status === 'downloading').length
  const panelOpen = selectedItem !== null

  const availableSeasons = React.useMemo(() => {
    const seasons = new Set<number>()
    sources.forEach(s => {
      if (s.parsedSeason !== undefined) seasons.add(s.parsedSeason)
    })
    return Array.from(seasons).sort((a, b) => a - b)
  }, [sources])

  const availableEpisodes = React.useMemo(() => {
    if (selectedSeason === 'all' || selectedSeason === 'packs') return []
    const eps = new Set<number>()
    sources.forEach(s => {
      if (s.parsedSeason === parseInt(selectedSeason) && s.parsedEpisode !== undefined) {
        eps.add(s.parsedEpisode)
      }
    })
    return Array.from(eps).sort((a, b) => a - b)
  }, [sources, selectedSeason])

  const filteredSources = React.useMemo(() => {
    return sources.filter(s => {
      if (selectedItem?.media_type !== 'tv') return true
      if (selectedSeason === 'packs') return s.isSeasonPack
      if (selectedSeason !== 'all') {
        if (s.parsedSeason !== parseInt(selectedSeason) || s.isSeasonPack) return false
        if (selectedEpisode !== 'all') {
          if (s.parsedEpisode !== parseInt(selectedEpisode)) return false
        }
      }
      return true
    })
  }, [sources, selectedSeason, selectedEpisode, selectedItem])

  return (
    <div className="relative">
      <DownloadFeatureTour />
      {/* Main Content Area */}
      <div className={`transition-all duration-300 ${panelOpen ? 'mr-[380px]' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">Download</h1>
            <p className="text-sm text-muted">Search and download movies & series directly.</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Open Downloads Folder */}
            <button
              onClick={() => window.api.openDownloadsFolder()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-muted hover:text-text hover:bg-white/10 transition-colors"
              title="Open downloads folder"
            >
              <FolderOpen size={16} />
              <span className="text-sm font-medium">Open Folder</span>
            </button>

            {downloads.length > 0 && (
              <button
                onClick={() => setShowDownloads(!showDownloads)}
                className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors"
              >
                <DownloadIcon size={16} />
                <span className="text-sm font-medium">
                  {activeCount > 0 ? `${activeCount} Active` : 'Downloads'}
                </span>
                {activeCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {activeCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <div className="flex items-center bg-surface/80 backdrop-blur-xl border border-secondary rounded-2xl overflow-hidden focus-within:border-primary/50 transition-colors shadow-lg shadow-black/10">
            <Search size={18} className="ml-5 text-muted flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for a movie or series..."
              className="flex-1 px-4 py-4 bg-transparent text-text text-sm outline-none placeholder:text-muted/60"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="px-6 py-4 bg-primary/10 hover:bg-primary/20 text-primary font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
            </button>
          </div>
        </div>

        {/* Active Downloads Panel */}
        {showDownloads && downloads.length > 0 && (
          <div className="bg-surface/90 backdrop-blur-xl border border-secondary rounded-2xl overflow-hidden mb-6">
            <div className="flex items-center justify-between px-5 py-3 border-b border-secondary">
              <h3 className="text-sm font-semibold text-text">Active Downloads</h3>
              <button onClick={() => setShowDownloads(false)} className="text-muted hover:text-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="divide-y divide-secondary/50">
              {downloads.map(dl => (
                <div key={dl.id} className="px-5 py-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text truncate flex-1 mr-4" title={dl.title}>{dl.title}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {dl.status === 'downloading' && (
                        <>
                          <span className="text-xs text-muted">{dl.downloadSpeed}</span>
                          <span className="text-xs text-muted">•</span>
                          <span className="text-xs text-muted">{dl.timeRemaining}</span>
                        </>
                      )}
                      {dl.status === 'done' && (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle2 size={14} /> Complete
                        </span>
                      )}
                      {dl.status === 'error' && (
                        <span className="flex items-center gap-1 text-xs text-red-400">
                          <AlertCircle size={14} /> Failed
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          dl.status === 'done' ? 'bg-green-400' :
                          dl.status === 'error' ? 'bg-red-400' :
                          'bg-primary'
                        }`}
                        style={{ width: `${dl.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted w-10 text-right">{Math.round(dl.progress)}%</span>
                    {(dl.status === 'downloading' || dl.status === 'paused') && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handlePauseResume(dl.id)}
                          className="p-1 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                          title={dl.status === 'paused' ? 'Resume' : 'Pause'}
                        >
                          {dl.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => handleRemoveDownload(dl.id)}
                      className="p-1 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      title={dl.status === 'downloading' ? 'Cancel & Remove' : 'Remove from List'}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {dl.status !== 'done' && dl.downloaded && dl.size && (
                    <p className="text-[11px] text-muted/70">{dl.downloaded} / {dl.size}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search Results Grid */}
        {results.length > 0 && (
          <div className={`grid gap-4 ${panelOpen ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'}`}>
            {results.map(item => (
              <button
                key={`${item.media_type}-${item.id}`}
                onClick={() => handleSelectResult(item)}
                className={`group relative flex flex-col rounded-xl overflow-hidden border transition-all duration-300 ${
                  selectedItem?.id === item.id
                    ? 'border-primary ring-2 ring-primary/30 scale-[1.02]'
                    : 'border-secondary/50 hover:border-primary/40 hover:scale-[1.03]'
                }`}
              >
                <div className="aspect-[2/3] bg-surface relative overflow-hidden">
                  {item.poster_path ? (
                    <img
                      src={`${TMDB_IMG}/w342${item.poster_path}`}
                      alt={item.title || item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted/30">
                      <Film size={40} />
                    </div>
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-black/60 backdrop-blur-sm text-white/90">
                    {item.media_type === 'movie' ? 'Movie' : 'Series'}
                  </div>
                  {item.vote_average > 0 && (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-primary/80 backdrop-blur-sm text-white">
                      ★ {item.vote_average.toFixed(1)}
                    </div>
                  )}
                </div>
                <div className="p-2.5 bg-surface">
                  <p className="text-xs font-medium text-text truncate">{item.title || item.name}</p>
                  <p className="text-[10px] text-muted mt-0.5">
                    {(item.release_date || item.first_air_date || '—').slice(0, 4)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!searching && results.length === 0 && !selectedItem && (
          <div className="flex flex-col items-center justify-center py-24 text-muted space-y-4">
            <div className="w-20 h-20 rounded-full bg-surface border border-secondary flex items-center justify-center">
              <Search size={32} className="opacity-30" />
            </div>
            <p className="text-sm">Search for a movie or series to get started.</p>
            <p className="text-xs text-muted/50">Powered by TMDB • Downloads via P2P • Consider using a VPN for privacy</p>
          </div>
        )}
      </div>

      {/* ─── Right Side Panel ───────────────────────────────────────────────── */}
      <div
        className={`fixed top-0 right-0 h-full w-[380px] bg-surface/95 backdrop-blur-2xl border-l border-secondary z-50 transform transition-transform duration-300 ease-out ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedItem && (
          <div className="flex flex-col h-full">
            {/* Panel Header with Backdrop */}
            <div className="relative h-44 flex-shrink-0 overflow-hidden">
              {selectedItem.backdrop_path && (
                <img
                  src={`${TMDB_IMG}/w780${selectedItem.backdrop_path}`}
                  className="absolute inset-0 w-full h-full object-cover opacity-40"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/80 to-transparent" />
              
              {/* Close Button */}
              <button
                onClick={() => { setSelectedItem(null); setSources([]) }}
                className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/60 transition-colors"
              >
                <X size={16} />
              </button>

              <div className="relative z-10 flex flex-col justify-end h-full px-5 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  {selectedItem.media_type === 'movie' ? <Film size={13} className="text-primary" /> : <Tv size={13} className="text-primary" />}
                  <span className="text-[10px] uppercase tracking-widest text-primary font-bold">
                    {selectedItem.media_type === 'movie' ? 'Movie' : 'TV Series'}
                  </span>
                  {selectedItem.vote_average > 0 && (
                    <span className="text-[10px] text-yellow-400 font-bold ml-auto">★ {selectedItem.vote_average.toFixed(1)}</span>
                  )}
                </div>
                <h2 className="text-base font-bold text-text leading-tight">{selectedItem.title || selectedItem.name}</h2>
                <p className="text-[11px] text-muted mt-1 line-clamp-2 leading-relaxed">{selectedItem.overview}</p>
              </div>
            </div>

            {/* Sources List */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col w-full">
              {loadingSources ? (
                <div className="flex items-center justify-center py-12 gap-3 text-muted">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">Finding sources...</span>
                </div>
              ) : sources.length > 0 ? (
                <div className="space-y-3 flex-1 flex flex-col w-full">
                  <div className="flex items-center justify-between px-1 shrink-0">
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      {filteredSources.length} Source{filteredSources.length !== 1 ? 's' : ''} Available
                    </h3>
                  </div>

                  {selectedItem?.media_type === 'tv' && (
                    <div className="flex items-center gap-2 pb-1 shrink-0">
                      <select 
                        value={selectedSeason} 
                        onChange={(e) => { setSelectedSeason(e.target.value); setSelectedEpisode('all'); }}
                        className="bg-surface border border-secondary text-text text-[11px] font-medium rounded px-2 py-1 outline-none hover:bg-white/[0.03] transition-colors cursor-pointer"
                      >
                        <option value="all">All Seasons</option>
                        <option value="packs">Full Season Packs (1080p+)</option>
                        {availableSeasons.map(s => <option key={`season-${s}`} value={s.toString()}>Season {s}</option>)}
                      </select>
                      
                      {selectedSeason !== 'all' && selectedSeason !== 'packs' && availableEpisodes.length > 0 && (
                        <select 
                          value={selectedEpisode} 
                          onChange={(e) => setSelectedEpisode(e.target.value)}
                          className="bg-surface border border-secondary text-text text-[11px] font-medium rounded px-2 py-1 outline-none hover:bg-white/[0.03] transition-colors cursor-pointer"
                        >
                          <option value="all">Any Episode</option>
                          {availableEpisodes.map(ep => <option key={`ep-${ep}`} value={ep.toString()}>Episode {ep}</option>)}
                        </select>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 pb-4 overflow-x-hidden">
                  {filteredSources.map((source, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-2 px-3.5 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-secondary/30 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-text truncate leading-relaxed">{source.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{source.quality}</span>
                            {source.isHindi && (
                              <span className="text-[10px] font-bold text-[#FF9933] bg-[#FF9933]/10 px-1.5 py-0.5 rounded border border-[#FF9933]/20">HINDI / DUAL</span>
                            )}
                            <span className="text-[10px] text-muted">{source.size}</span>
                            <span className="text-[10px] text-green-400/70">{source.seeds}↑</span>
                            <span className="text-[10px] text-muted/50">{source.peers}↓</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleStartDownload(source)}
                          className="flex-shrink-0 p-2 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-white transition-all duration-200"
                          title="Download"
                        >
                          <DownloadIcon size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted">
                  <HardDrive size={28} className="opacity-30" />
                  <p className="text-sm">No sources found.</p>
                  <p className="text-[11px] text-muted/50">Try a different title or check back later.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Download
