import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import hdHub4uLogo from '../assets/site-logos/hdhub4u.webp'
import katMovieHdLogo from '../assets/site-logos/katmoviehd.jpg'
import { cleanIpcError } from '../utils/ipcError'
import { X, Play, Info, Calendar, CalendarDays, Clock, Star, FolderOpen, Film, Music, Subtitles, HardDrive, ChevronDown, ChevronUp, Bookmark, Share2, Search, Zap, Users, Download, AlertTriangle, Clapperboard, Loader2, ExternalLink, Languages, CheckCircle2, Copy, MessageCircle, Send, Trash2, Bell, BellRing, Hourglass, Layers, Plus, Tv, AlertCircle, BookOpen, MapPin, Compass, Sparkles } from 'lucide-react'
import { Video, WatchlistIntent, TmdbFranchise, TmdbFranchisePart, TmdbProvider } from '../types'
import { useTheme } from '../theme/ThemeContext'
import { getWatchlistIntent, normalizeWatchlistIntent, WATCHLIST_INTENT_META } from '../utils/watchlistIntent'
import { ShareHintGuide, DeleteHintGuide, FollowGuide } from './FeatureGuides'
import { getTorrentSourceHealthScore, getTorrentSourceSpeedLabel, isHevcSource } from '../utils/torrentSources'
import { isOnlineProgressEnabled, isNewEpisodeNotifyEnabled, formatResumeTime, formatSeasonEpisode, getTorrentFileQueryIndex, safeGetStreamHistory, safeGetStreamProgress, safeDeleteStreamProgress, safeFollowSeries, safeUnfollowSeries, safeGetFollowedSeries, safeCheckSeriesUpdates, safeMarkFollowedSeen, safeFollowMovie, safeUnfollowMovie, safeGetFollowedMovies, safeMarkFollowedMovieSeen } from '../utils/streamResume'
import { getMediaUnitIdentity, getVersionLabel, groupMediaVersions, pickPreferredVersion } from '../utils/mediaVersions'
import { getStreamingDeepLink } from '../utils/streamingLinks'

interface DetailScreenProps {
  video: Video
  initialSharedSource?: any | null
  onClose: () => void
  onPlay: (video: Video) => void
  onWatchlistChange?: () => void
  onShowDetail?: (video: Video) => void
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

type SeriesCatalogEpisode = {
  seasonNumber: number
  episodeNumber: number
  name: string
  overview: string | null
  airDate: string | null
  stillPath: string | null
  released: boolean
}

type EpisodeDisplayRow = {
  season: number
  episode: number
  title: string
  localVideo?: Video
  versionCount: number
  released: boolean
  airDate: string | null
  stillPath?: string | null
}

type ActiveDownload = {
  id: string
  title?: string
  name?: string | null
  progress?: number
  status?: 'downloading' | 'paused' | 'completed' | 'error' | string
  downloadSpeed?: string
  timeRemaining?: string
  tmdbId?: number
  magnet?: string
  mediaType?: 'movie' | 'series'
  season?: number
  episode?: number
}

const getTorrentStreamErrorMessage = (error?: string | null) => {
  if (!error) return 'Stream is not ready yet.'
  if (error.includes('No handler registered') || error.includes('prepare-torrent-stream') || error.includes('start-temp-stream')) {
    return 'Torrent playback needs the updated app process. Restart MyCinema and try again.'
  }
  return error
}



const getVibeColor = (vibe: string) => {
  switch (vibe) {
    case 'Space Survival': return 'from-indigo-600 to-purple-600 text-white border-indigo-400/30 shadow-indigo-900/50'
    case 'Hard Sci-Fi': return 'from-cyan-600 to-blue-600 text-white border-cyan-400/30 shadow-cyan-900/50'
    case 'High Drama': return 'from-rose-600 to-red-600 text-white border-rose-400/30 shadow-rose-900/50'
    case 'Teen Chaos': return 'from-pink-500 to-rose-500 text-white border-pink-400/30 shadow-pink-900/50'
    case 'Romance Heat': return 'from-red-500 to-pink-600 text-white border-red-400/30 shadow-red-900/50'
    case 'Friend Group Energy': return 'from-amber-500 to-orange-500 text-white border-amber-400/30 shadow-amber-900/50'
    case 'Dark & Messy': return 'from-stone-800 to-neutral-900 text-neutral-300 border-stone-600/50 shadow-stone-900/50'
    case 'Mind Trip': return 'from-fuchsia-600 to-purple-700 text-white border-fuchsia-400/30 shadow-fuchsia-900/50'
    case 'Mystery Pull': return 'from-violet-700 to-indigo-800 text-indigo-100 border-violet-500/30 shadow-violet-900/50'
    case 'Crime Spiral': return 'from-slate-700 to-slate-900 text-slate-200 border-slate-500/50 shadow-slate-900/50'
    case 'Bingeable': return 'from-emerald-500 to-teal-600 text-white border-emerald-400/30 shadow-emerald-900/50'
    case 'Comfort Watch': return 'from-yellow-400 to-amber-500 text-amber-950 border-yellow-300/50 shadow-yellow-900/50'
    case 'Action Rush': return 'from-orange-600 to-red-600 text-white border-orange-400/30 shadow-orange-900/50'
    case 'Supernatural': return 'from-purple-800 to-slate-900 text-purple-200 border-purple-500/40 shadow-purple-900/50'
    default:
      const colors = [
        'from-blue-500 to-indigo-600 text-white border-blue-400/30 shadow-blue-900/50',
        'from-emerald-500 to-green-600 text-white border-emerald-400/30 shadow-emerald-900/50',
        'from-rose-500 to-red-600 text-white border-rose-400/30 shadow-rose-900/50',
        'from-violet-500 to-purple-600 text-white border-violet-400/30 shadow-violet-900/50',
        'from-amber-500 to-orange-600 text-white border-amber-400/30 shadow-amber-900/50',
        'from-cyan-500 to-blue-600 text-white border-cyan-400/30 shadow-cyan-900/50',
      ]
      const hash = vibe.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      return colors[hash % colors.length]
  }
}

const getVibeIcon = (vibe: string) => {
  const lower = vibe.toLowerCase()
  if (lower.includes('novel') || lower.includes('book') || lower.includes('adaptation')) {
    return <BookOpen size={11} className="text-white/45 shrink-0" />
  }
  if (lower.includes(',') || lower.includes('city') || lower.includes('island') || lower.includes('york') || lower.includes('angeles') || lower.includes('chicago') || lower.includes('london') || lower.includes('paris') || lower.includes('tokyo') || lower.includes('portland')) {
    return <MapPin size={11} className="text-white/45 shrink-0" />
  }
  if (lower.includes('survival') || lower.includes('mission') || lower.includes('quest') || lower.includes('adventure') || lower.includes('journey')) {
    return <Compass size={11} className="text-white/45 shrink-0" />
  }
  if (lower.includes('magic') || lower.includes('space') || lower.includes('supernatural') || lower.includes('sci-fi') || lower.includes('alien')) {
    return <Sparkles size={11} className="text-white/45 shrink-0" />
  }
  return null
}

const formatVibeLabel = (vibe: string) => {
  const lowerWords = new Set(['on', 'or', 'and', 'the', 'in', 'of', 'at', 'by', 'for', 'with', 'a', 'an'])
  return vibe
    .split(' ')
    .map((word, idx) => {
      const lower = word.toLowerCase()
      if (idx > 0 && lowerWords.has(lower)) {
        return lower
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

const getAdaptiveVibeClass = (vibe: string, isLight: boolean) => {
  const lower = vibe.toLowerCase()

  // 1. Amber / Terracotta (Book, Novel, Drama, Adaptation, Romance, History, Comfort)
  if (lower.includes('novel') || lower.includes('book') || lower.includes('drama') || lower.includes('adaptation') || lower.includes('romance') || lower.includes('history') || lower.includes('comfort')) {
    return isLight
      ? 'bg-amber-50/95 border-amber-300 text-amber-950 shadow-sm hover:bg-amber-100'
      : 'bg-amber-950/40 border-amber-500/40 text-amber-200 backdrop-blur-md hover:bg-amber-900/50 hover:border-amber-400/60'
  }

  // 2. Sky Blue / Slate (Locations, Cities, Mystery, Crime, Detective, Law, Investigation)
  if (lower.includes(',') || lower.includes('city') || lower.includes('york') || lower.includes('portland') || lower.includes('angeles') || lower.includes('chicago') || lower.includes('london') || lower.includes('paris') || lower.includes('mystery') || lower.includes('crime') || lower.includes('detective')) {
    return isLight
      ? 'bg-sky-50/95 border-sky-300 text-sky-950 shadow-sm hover:bg-sky-100'
      : 'bg-sky-950/40 border-sky-500/40 text-sky-200 backdrop-blur-md hover:bg-sky-900/50 hover:border-sky-400/60'
  }

  // 3. Teal / Cyan / Emerald (Rescue, Mission, Survival, Action, Chase, Heist, Thrill, Rush, Quest)
  if (lower.includes('rescue') || lower.includes('mission') || lower.includes('survival') || lower.includes('action') || lower.includes('chase') || lower.includes('heist') || lower.includes('thrill') || lower.includes('rush') || lower.includes('quest')) {
    return isLight
      ? 'bg-teal-50/95 border-teal-300 text-teal-950 shadow-sm hover:bg-teal-100'
      : 'bg-teal-950/40 border-teal-500/40 text-teal-200 backdrop-blur-md hover:bg-teal-900/50 hover:border-teal-400/60'
  }

  // 4. Purple / Fuchsia / Violet (Forest, Nature, Space, Sci-Fi, Supernatural, Magic, Fantasy, Mind Trip)
  if (lower.includes('forest') || lower.includes('nature') || lower.includes('space') || lower.includes('sci-fi') || lower.includes('supernatural') || lower.includes('magic') || lower.includes('fantasy') || lower.includes('mind') || lower.includes('trip') || lower.includes('alien') || lower.includes('chaos')) {
    return isLight
      ? 'bg-purple-50/95 border-purple-300 text-purple-950 shadow-sm hover:bg-purple-100'
      : 'bg-purple-950/40 border-purple-500/40 text-purple-200 backdrop-blur-md hover:bg-purple-900/50 hover:border-purple-400/60'
  }

  // Fallback cycling through the 4 harmonic palettes based on vibe string hash:
  const hash = vibe.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const palettes = [
    isLight
      ? 'bg-amber-50/95 border-amber-300 text-amber-950 shadow-sm hover:bg-amber-100'
      : 'bg-amber-950/40 border-amber-500/40 text-amber-200 backdrop-blur-md hover:bg-amber-900/50 hover:border-amber-400/60',
    isLight
      ? 'bg-sky-50/95 border-sky-300 text-sky-950 shadow-sm hover:bg-sky-100'
      : 'bg-sky-950/40 border-sky-500/40 text-sky-200 backdrop-blur-md hover:bg-sky-900/50 hover:border-sky-400/60',
    isLight
      ? 'bg-teal-50/95 border-teal-300 text-teal-950 shadow-sm hover:bg-teal-100'
      : 'bg-teal-950/40 border-teal-500/40 text-teal-200 backdrop-blur-md hover:bg-teal-900/50 hover:border-teal-400/60',
    isLight
      ? 'bg-purple-50/95 border-purple-300 text-purple-950 shadow-sm hover:bg-purple-100'
      : 'bg-purple-950/40 border-purple-500/40 text-purple-200 backdrop-blur-md hover:bg-purple-900/50 hover:border-purple-400/60'
  ]
  return palettes[hash % palettes.length]
}

const hasSourceEpisodeMarker = (source: any) => (
  typeof source.parsedEpisode === 'number' ||
  /\bs\d{1,2}[\s._-]*e(?:p)?[\s._-]*\d{1,3}\b/i.test(source.title || '') ||
  /\b\d{1,2}x\d{1,3}\b/i.test(source.title || '') ||
  /\b(?:episode|ep)[\s._-]*\d{1,3}\b/i.test(source.title || '')
)

const isSourceSeasonPack = (source: any) => Boolean(source.isSeasonPack) && !hasSourceEpisodeMarker(source)

const normalizeSourceQualityKey = (source: any): '2160p' | '1080p' | '720p' | '480p' => {
  const text = `${source?.quality || ''} ${source?.title || ''}`.toLowerCase()
  if (/\b(2160p|4k|uhd)\b/.test(text)) return '2160p'
  if (/\b1080p?\b/.test(text)) return '1080p'
  if (/\b720p?\b/.test(text)) return '720p'
  return '480p'
}

const getMoctaleUrl = (video: Video) => {
  const title = video.type === 'series' && video.series_name ? video.series_name : video.title
  const slug = title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `https://www.moctale.in/content/${slug}${video.release_year ? `-${video.release_year}` : ''}`
}

const normalizeMatchText = (value?: string | null) => (
  (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
)

const getMagnetInfoHash = (magnet?: string | null) => {
  if (!magnet) return null
  const match = magnet.match(/btih:([a-zA-Z0-9]+)/i)
  return match ? match[1].toLowerCase() : null
}

const MYCINEMA_SHARE_BASE_URL = (
  import.meta.env.VITE_MYCINEMA_SHARE_BASE_URL ||
  'https://mycinema-share.rajveersinghranaofficial.workers.dev'
).replace(/\/+$/, '')

const seriesSeasonCountCache = new Map<number, number>()

const DetailScreen: React.FC<DetailScreenProps> = ({ video, initialSharedSource, onClose, onPlay, onWatchlistChange, onShowDetail }) => {
  const { theme, detailAmbientShade, atmosphericStudioEnabled } = useTheme()
  const isLight = theme === 'light'
  const isAmbientShadeActive = atmosphericStudioEnabled && detailAmbientShade
  const [episodes, setEpisodes] = useState<Video[]>([])
  const [localVersions, setLocalVersions] = useState<Video[]>([])
  const [seriesCatalog, setSeriesCatalog] = useState<SeriesCatalogEpisode[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogLoaded, setCatalogLoaded] = useState(false)
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
  const [isEpisodesExpanded, setIsEpisodesExpanded] = useState(false)
  const [franchise, setFranchise] = useState<TmdbFranchise | null>(null)
  const [franchiseLoading, setFranchiseLoading] = useState(false)
  const [localLibraryVideos, setLocalLibraryVideos] = useState<Video[]>([])
  // Local rows come from SQLite where booleans are 0/1 numbers — coerce to a
  // real boolean, otherwise `{isWatchlist && ...}` renders a stray "0".
  const [isWatchlist, setIsWatchlist] = useState(Boolean(video.is_watchlist))
  const [watchlistBusy, setWatchlistBusy] = useState(false)
  const [watchlistIntent, setWatchlistIntent] = useState<WatchlistIntent | null>(() => getWatchlistIntent(video as any))
  const [showIntentPicker, setShowIntentPicker] = useState(false)
  const [intentBusy, setIntentBusy] = useState<WatchlistIntent | null>(null)
  const [intentRemoving, setIntentRemoving] = useState(false)
  // Collections quick-file: anchored menu above its own button.
  interface CollectionEntry {
    id: number
    name: string
    memberCount: number
    cover: string | null
    matches: { isExternal: boolean; externalId: number | null }[]
  }
  const [collections, setCollections] = useState<CollectionEntry[]>([])
  const [showCollectionMenu, setShowCollectionMenu] = useState(false)
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [collectionBusyId, setCollectionBusyId] = useState<number | null>(null)
  const [creatingCollection, setCreatingCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [collectionToast, setCollectionToast] = useState<string | null>(null)
  const collectionReqRef = useRef(0)
  const collectionToastTimer = useRef<number | null>(null)
  const mainScrollRef = useRef<HTMLDivElement>(null)

  // Keep the bookmark + intent pill in sync when a different title opens.
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    setIsWatchlist(Boolean(video.is_watchlist))
    setWatchlistIntent(getWatchlistIntent(video as any))
    setShowIntentPicker(false)
    setIntentBusy(null)
    setIntentRemoving(false)
    setIsEpisodesExpanded(false)
    setShowCollectionMenu(false)
    setCollections([])
    setCreatingCollection(false)
    setNewCollectionName('')
    setCollectionToast(null)
    setCatalogLoaded(false)
    collectionReqRef.current += 1
    if (collectionToastTimer.current) {
      window.clearTimeout(collectionToastTimer.current)
      collectionToastTimer.current = null
    }
  }, [video.id, video.tmdb_id, video.is_watchlist])

  useEffect(() => {
    let cancelled = false
    setFranchise(null)

    if (video.type === 'movie' && video.tmdb_id) {
      setFranchiseLoading(true)
      window.api.getTmdbFranchise(video.tmdb_id)
        .then((data: any) => {
          if (!cancelled) {
            setFranchise(data)
            setFranchiseLoading(false)
          }
        })
        .catch((err: any) => {
          console.error('[DetailScreen] Failed to fetch franchise:', err)
          if (!cancelled) {
            setFranchise(null)
            setFranchiseLoading(false)
          }
        })
    } else {
      setFranchiseLoading(false)
    }

    return () => {
      cancelled = true
    }
  }, [video.id, video.tmdb_id, video.type])

  useEffect(() => {
    let cancelled = false
    window.api.getVideos()
      .then((all: any) => {
        if (!cancelled && Array.isArray(all)) {
          setLocalLibraryVideos(all)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  // Titles opened from Hero/Trending carry no flags — verify against the DB so
  // the bookmark reflects what's actually saved (and picks up its lane).
  useEffect(() => {
    let cancelled = false
    const local = getWatchlistIntent(video as any)
    if ((video.is_watchlist || isWatchlist) && local) {
      setWatchlistIntent(local)
      return
    }
    const canLookup = Boolean(video.tmdb_id) || (!video.isExternal && video.id > 0)
    if (!canLookup) return
    window.api.getWatchlist().then(rows => {
      if (cancelled) return
      const match = (rows || []).find((row: any) => {
        if (video.tmdb_id && Number(row.tmdb_id) === Number(video.tmdb_id) && (row.type === video.type || !row.type)) return true
        if (!video.isExternal && !video.tmdb_id && Number(row.id) === Number(video.id)) return true
        return false
      }) as any
      if (cancelled) return
      if (match) {
        const lane = normalizeWatchlistIntent(match.priority ?? match.watchlist_priority)
        setIsWatchlist(true)
        setWatchlistIntent(lane)
        video.is_watchlist = true
        ;(video as any).priority = lane
        ;(video as any).watchlist_priority = lane
      } else {
        setIsWatchlist(false)
        setWatchlistIntent(null)
        video.is_watchlist = false
      }
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, video.tmdb_id, video.isExternal, video.type])
  // Preload collection membership on open so the button badge is correct
  // immediately — not just after the menu has been opened once.
  useEffect(() => {
    void loadCollectionEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, video.tmdb_id, video.isExternal, video.type])
  // #3: manual follow for new-episode alerts (auto-follow also fires on watch).
  const [isFollowing, setIsFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  // #3: just-dropped episode for the strip above the episode list.
  const [newDrop, setNewDrop] = useState<{ season: number; episode: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    setNewDrop(null)
    if (video.type !== 'series' || !video.tmdb_id) return
    if (!isOnlineProgressEnabled() || !isNewEpisodeNotifyEnabled()) return
    // Explicit per-series refresh — the user opened this show right now, so
    // bypass the daily throttle and tell them about today's drop.
    safeCheckSeriesUpdates(video.tmdb_id).then(res => {
      if (cancelled || !res?.checked || !res?.hasNew) return
      if (res.season == null || res.episode == null) return
      setNewDrop({ season: res.season, episode: res.episode })
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.tmdb_id, video.type])
  useEffect(() => {
    let cancelled = false
    setIsFollowing(false)
    if (!video.tmdb_id) return

    if (video.type === 'series') {
      safeGetFollowedSeries().then(list => {
        if (cancelled) return
        setIsFollowing((list || []).some(f => Number(f.tmdb_id) === video.tmdb_id))
      }).catch(() => {})
    } else if (video.type === 'movie') {
      safeGetFollowedMovies().then(list => {
        if (cancelled) return
        const match = (list || []).find(f => Number(f.tmdb_id) === video.tmdb_id)
        if (match) {
          // If the movie has dropped on OTT and the user opens/views it:
          // automatically remove from following as requested
          if (match.is_released_ott && video.tmdb_id) {
            void safeUnfollowMovie(video.tmdb_id)
            void safeMarkFollowedMovieSeen(video.tmdb_id)
            setIsFollowing(false)
          } else {
            setIsFollowing(true)
          }
        }
      }).catch(() => {})
    }

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.tmdb_id, video.type])
  const handleToggleFollow = async () => {
    if (!video.tmdb_id || followBusy) return
    setFollowBusy(true)
    try {
      if (video.type === 'series') {
        if (isFollowing) {
          await safeUnfollowSeries(video.tmdb_id)
          setIsFollowing(false)
          setNewDrop(null)
        } else {
          const res = await safeFollowSeries({
            tmdb_id: video.tmdb_id,
            title: displayTitle,
            poster_path: video.poster_path ?? null,
            backdrop_path: video.backdrop_path ?? null,
            overview: video.overview ?? null,
            season: video.season ?? null,
            episode: video.episode ?? null
          })
          if (res?.followed) {
            setIsFollowing(true)
            // A fresh drop may already be out (followed mid-season) — surface
            // the strip without waiting for any scheduled check.
            safeCheckSeriesUpdates(video.tmdb_id).then(check => {
              if (check?.hasNew && check.season != null && check.episode != null) {
                setNewDrop({ season: check.season, episode: check.episode })
              }
            }).catch(() => {})
          }
        }
      } else if (video.type === 'movie') {
        if (isFollowing) {
          await safeUnfollowMovie(video.tmdb_id)
          setIsFollowing(false)
        } else {
          const res = await safeFollowMovie({
            tmdb_id: video.tmdb_id,
            title: displayTitle,
            poster_path: video.poster_path ?? null,
            backdrop_path: video.backdrop_path ?? null,
            overview: video.overview ?? null,
            release_date: video.release_date ?? null
          })
          if (res?.followed) {
            setIsFollowing(true)
          }
        }
      }
    } finally {
      setFollowBusy(false)
    }
  }
  const [shareCopied, setShareCopied] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)
  const [resolvedLogoPath, setResolvedLogoPath] = useState<string | null>(null)
  const [logoLoadFailed, setLogoLoadFailed] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [releaseInfo, setReleaseInfo] = useState<import('../types').TmdbReleaseInfo | null>(null)
  const [releaseInfoLoading, setReleaseInfoLoading] = useState(false)
  const isMovieOnOtt = video.type === 'movie' && Boolean(
    video.is_released_ott ||
    (releaseInfo?.providers && releaseInfo.providers.length > 0) ||
    (releaseInfo?.digitalReleaseDate && new Date(releaseInfo.digitalReleaseDate).getTime() <= Date.now()) ||
    (releaseInfo?.type === 'digital' && releaseInfo?.releaseDate && new Date(releaseInfo.releaseDate).getTime() <= Date.now())
  )

  useEffect(() => {
    if (isMovieOnOtt && video.tmdb_id && isFollowing) {
      void safeUnfollowMovie(video.tmdb_id)
      void safeMarkFollowedMovieSeen(video.tmdb_id)
      setIsFollowing(false)
    }
  }, [isMovieOnOtt, video.tmdb_id, isFollowing])

  const effectiveReleaseDate = useMemo(() => {
    const candidateDates = [
      video.release_date,
      (video as any).first_air_date,
      releaseInfo?.releaseDate,
      (releaseInfo as any)?.theatricalReleaseDate,
      releaseInfo?.digitalReleaseDate
    ].filter((d): d is string => Boolean(d && typeof d === 'string'))

    const fullDateCandidate = candidateDates.find(d => /^\d{4}-\d{2}-\d{2}/.test(d.trim()))
    return fullDateCandidate || candidateDates[0] || null
  }, [video.release_date, (video as any).first_air_date, releaseInfo])

  const isContentUpcoming = useMemo(() => {
    const parsedTime = effectiveReleaseDate ? new Date(effectiveReleaseDate).getTime() : NaN
    if (!isNaN(parsedTime) && parsedTime > Date.now()) return true
    const currentYear = new Date().getFullYear()
    const yearNum = typeof video.release_year === 'number'
      ? video.release_year
      : parseInt(String(video.release_year || effectiveReleaseDate?.slice(0, 4) || ''), 10)
    if (yearNum && yearNum > currentYear) return true
    return false
  }, [effectiveReleaseDate, video.release_year])

  const formattedUpcomingReleaseDate = useMemo(() => {
    if (!isContentUpcoming || !effectiveReleaseDate) return null
    const match = String(effectiveReleaseDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      }
    }
    return null
  }, [isContentUpcoming, effectiveReleaseDate])
  const [keywordsLoading, setKeywordsLoading] = useState(false)
  const overviewRef = useRef<HTMLParagraphElement>(null)
  const officialSourcesRef = useRef<HTMLDivElement>(null)
  const [expandedOverview, setExpandedOverview] = useState(false)
  const [tmdbKeywords, setTmdbKeywords] = useState<string[]>([])
  const [isWebPopupOpen, setIsWebPopupOpen] = useState(false)
  // Web download sites (portal-resolved mirrors). Only resolves + opens a
  // searched page in the in-app popup — same mechanism as Moctale.
  const [resolvingSiteId, setResolvingSiteId] = useState<string | null>(null)
  const [downloadSiteError, setDownloadSiteError] = useState<string | null>(null)
  const [downloadSiteNotice, setDownloadSiteNotice] = useState<string | null>(null)
  // Online resume (#1): source-agnostic position for the primary identity.
  // #2: per-episode online map for the series episode list.
  const [streamResume, setStreamResume] = useState<{ position: number; duration: number } | null>(null)
  const [onlineEpisodeMap, setOnlineEpisodeMap] = useState<Map<string, { position: number; duration: number; completed: boolean }>>(new Map())
  useEffect(() => {
    let cancelled = false
    setOnlineEpisodeMap(new Map())
    if (video.type !== 'series' || !video.tmdb_id || !isOnlineProgressEnabled()) return
    safeGetStreamHistory(100).then(rows => {
      if (cancelled) return
      const map = new Map<string, { position: number; duration: number; completed: boolean }>()
      for (const row of rows || []) {
        if (Number(row.tmdb_id) !== video.tmdb_id || row.media_type !== 'series') continue
        map.set(`${Number(row.season || 0)}:${Number(row.episode || 0)}`, {
          position: Number(row.position) || 0,
          duration: Number(row.duration) || 0,
          completed: Boolean(row.completed)
        })
      }
      setOnlineEpisodeMap(map)
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.tmdb_id, video.type])
  const primaryStreamIdentity = video.tmdb_id && (video.type === 'movie' || video.type === 'series') && (video.type === 'movie' || video.season != null || video.episode != null)
    ? {
        tmdb_id: video.tmdb_id,
        media_type: video.type,
        season: video.type === 'series' ? (video.season ?? null) : null,
        episode: video.type === 'series' ? (video.episode ?? null) : null
      }
    : null
  useEffect(() => {
    let cancelled = false
    setStreamResume(null)
    if (!primaryStreamIdentity || !isOnlineProgressEnabled()) return
    safeGetStreamProgress(
      primaryStreamIdentity.tmdb_id,
      primaryStreamIdentity.media_type,
      primaryStreamIdentity.season,
      primaryStreamIdentity.episode
    ).then(row => {
      if (cancelled || !row || row.completed || (Number(row.position) || 0) < 10) return
      setStreamResume({ position: Number(row.position) || 0, duration: Number(row.duration) || 0 })
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.tmdb_id, video.type, video.season, video.episode])


  // Torrent Search State
  const [sources, setSources] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [sourceSeasonFilter, setSourceSeasonFilter] = useState('all')
  const [sourcePackSeasonFilter, setSourcePackSeasonFilter] = useState('all')
  const [sourceEpisodeFilter, setSourceEpisodeFilter] = useState('all')
  const [sourceLanguageFilter, setSourceLanguageFilter] = useState<'all' | 'hindi'>('all')
  const [sourceQualityFilter, setSourceQualityFilter] = useState<'all' | '2160p' | '1080p' | '720p' | '480p'>('all')
  const [showDownloadOptions, setShowDownloadOptions] = useState(false)
  const [startingSourceMagnet, setStartingSourceMagnet] = useState<string | null>(null)
  const [startedSourceMagnet, setStartedSourceMagnet] = useState<string | null>(null)
  const [startingStreamMagnet, setStartingStreamMagnet] = useState<string | null>(null)
  const [torrentStreamError, setTorrentStreamError] = useState<string | null>(null)
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([])
  const [sourceSearchStatus, setSourceSearchStatus] = useState({ found: 0, completed: 0, total: 0, cached: false, done: false })
  const sourceSearchRequestRef = useRef<string | null>(null)
  const cancelActiveSourceSearch = (markDone = true) => {
    const requestId = sourceSearchRequestRef.current
    if (requestId) {
      void window.api.cancelTorrentSourceSearch(requestId).catch(() => {})
      sourceSearchRequestRef.current = null
    }
    setSearching(false)
    if (markDone) {
      setSourceSearchStatus(prev => ({ ...prev, done: true }))
    }
  }
  const isTmdbBacked = video.type === 'movie' || video.type === 'series'
  const isLocalMedia = !video.isExternal && Boolean(video.file_path)
  const displayTitle = video.type === 'series' && video.series_name ? video.series_name : video.title
  const normalizedDisplayTitle = normalizeMatchText(displayTitle)
  const matchingDownload = activeDownloads.find(download => {
    if (video.tmdb_id && download.tmdbId === video.tmdb_id) {
      if (video.type !== 'series' || download.mediaType !== 'series') return true
      if (download.season == null || download.episode == null) return true
      return Number(download.season) === Number(video.season || 1) && Number(download.episode) === Number(video.episode || 0)
    }
    const downloadTitle = normalizeMatchText([download.title, download.name].filter(Boolean).join(' '))
    return Boolean(normalizedDisplayTitle && downloadTitle && (
      downloadTitle.includes(normalizedDisplayTitle) || normalizedDisplayTitle.includes(downloadTitle)
    ))
  })
  const downloadProgress = Math.max(0, Math.min(100, Number(matchingDownload?.progress || 0)))
  const roundedDownloadProgress = Math.round(downloadProgress)
  const isDownloadComplete = matchingDownload?.status === 'completed' || matchingDownload?.status === 'done' || downloadProgress >= 100
  const isDownloadActive = Boolean(matchingDownload && !isDownloadComplete)


  const applyWatchlistState = (intent: WatchlistIntent | null, saved: boolean) => {
    setIsWatchlist(saved)
    setWatchlistIntent(intent)
    video.is_watchlist = saved;
    (video as any).priority = intent
    ;(video as any).watchlist_priority = intent
    video.category = saved ? 'Watchlist' : video.category
    onWatchlistChange?.()
  }

  const handleAddToWatchlist = async (intent: WatchlistIntent = 'someday') => {
    setWatchlistBusy(true)
    try {
      if (video.isExternal || video.id < 0) {
        // Streamed/online cards carry synthetic negative ids with no library
        // row — file them by TMDB identity, like Home's quick-save does.
        if (!video.tmdb_id) {
          console.warn('[DetailScreen] Cannot save to watchlist: no TMDB identity.')
          return
        }
        await window.api.addToWatchlistExternal({ ...video, title: displayTitle, category: 'Watchlist', is_watchlist: true, priority: intent })
      } else {
        await window.api.addLocalToWatchlist(video.id, 'Watchlist', intent)
      }

      applyWatchlistState(intent, true)
    } catch (err) {
      console.error('[DetailScreen] Watchlist add error:', err)
    } finally {
      setWatchlistBusy(false)
    }
  }

  // The bookmark never toggles blindly — it opens a small lane menu above the
  // button so a tap files the title as ASAP / Weekend / Someday.
  const handleWatchlistButtonClick = () => {
    if (watchlistBusy || intentBusy || intentRemoving) return
    setShowCollectionMenu(false)
    setShowIntentPicker(v => !v)
  }

  const closeIntentMenu = () => {
    if (watchlistBusy || intentBusy || intentRemoving) return
    setShowIntentPicker(false)
  }

  // Keyboard: Esc dismisses, 1/2/3 files into a lane.
  useEffect(() => {
    if (!showIntentPicker) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeIntentMenu()
        return
      }
      if (watchlistBusy || intentBusy || intentRemoving) return
      if (e.key === '1') void handleIntentSelect('asap')
      else if (e.key === '2') void handleIntentSelect('weekend')
      else if (e.key === '3') void handleIntentSelect('someday')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showIntentPicker, watchlistBusy, intentBusy, intentRemoving, isWatchlist, video.id, video.tmdb_id])

  // Keyboard: Esc dismisses the collections menu.
  useEffect(() => {
    if (!showCollectionMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeCollectionMenu()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCollectionMenu, collectionBusyId, createBusy])

  // Keyboard: Esc collapses the episodes accordion if expanded.
  useEffect(() => {
    if (!isEpisodesExpanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setIsEpisodesExpanded(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isEpisodesExpanded])

  const handleIntentSelect = async (intent: WatchlistIntent) => {
    if (intentBusy || intentRemoving) return
    setIntentBusy(intent)
    try {
      if (isWatchlist) {
        if (video.isExternal || video.id < 0) {
          if (!video.tmdb_id) {
            console.warn('[DetailScreen] Cannot move watchlist lane: no TMDB identity.')
            return
          }
          await window.api.setWatchlistPriority({ tmdbId: video.tmdb_id, isExternal: true, priority: intent })
        } else {
          await window.api.setWatchlistPriority({ videoId: video.id, isExternal: false, priority: intent })
        }
        applyWatchlistState(intent, true)
      } else {
        await handleAddToWatchlist(intent)
      }
      setShowIntentPicker(false)
    } catch (err) {
      console.error('[DetailScreen] Watchlist intent error:', err)
    } finally {
      setIntentBusy(null)
    }
  }

  const handleIntentRemove = async () => {
    if (intentBusy || intentRemoving) return
    setIntentRemoving(true)
    try {
      if (video.isExternal || video.id < 0) {
        if (video.tmdb_id) await window.api.removeFromWatchlistExternal(video.tmdb_id)
      } else {
        await window.api.toggleWatchlist(video.id)
      }
      applyWatchlistState(null, false)
      setShowIntentPicker(false)
    } catch (err) {
      console.error('[DetailScreen] Watchlist remove error:', err)
    } finally {
      setIntentRemoving(false)
    }
  }

  // ─── Collections quick-file ─────────────────────────────────────────────
  // Same identity rule as the watchlist: real library rows pin by id,
  // streamed/online cards (synthetic negative ids) file by TMDB identity.
  const isCollectionExternal = video.isExternal || video.id < 0

  const resolveCollectionCover = (path?: string | null) => {
    if (!path) return null
    if (path.startsWith('http') || path.startsWith('media://')) return path
    return `media://file/${encodeURIComponent(path)}`
  }

  const flashCollectionToast = (message: string) => {
    setCollectionToast(message)
    if (collectionToastTimer.current) window.clearTimeout(collectionToastTimer.current)
    collectionToastTimer.current = window.setTimeout(() => {
      setCollectionToast(null)
      collectionToastTimer.current = null
    }, 1800)
  }

  const findCollectionMatches = (members: any[]) => {
    const matches: { isExternal: boolean; externalId: number | null }[] = []
    for (const row of members || []) {
      const rowIsExternal = Boolean(row?.isExternal)
      if (!isCollectionExternal && !rowIsExternal && Number(row?.id) === Number(video.id)) {
        matches.push({ isExternal: false, externalId: null })
        continue
      }
      if (video.tmdb_id && Number(row?.tmdb_id) === Number(video.tmdb_id) && (row?.type === video.type || !row?.type)) {
        matches.push({
          isExternal: rowIsExternal,
          externalId: rowIsExternal && row?.collection_external_id != null ? Number(row.collection_external_id) : null
        })
      }
    }
    return matches
  }

  const loadCollectionEntries = async () => {
    const requestId = collectionReqRef.current
    setCollectionsLoading(true)
    try {
      const cols = await window.api.getCollections()
      const entries = await Promise.all((cols || []).map(async (c: any) => {
        let members: any[] = []
        try {
          members = await window.api.getCollectionMembers(Number(c.id))
        } catch {
          members = []
        }
        const previews = Array.isArray((c as any)?.preview) ? (c as any).preview : []
        return {
          id: Number(c.id),
          name: String(c.name || 'Untitled'),
          memberCount: Number((c as any)?.memberCount ?? members.length ?? 0),
          cover: resolveCollectionCover(previews.find((p: any) => Boolean(p)) || null),
          matches: findCollectionMatches(members)
        } as CollectionEntry
      }))
      if (collectionReqRef.current !== requestId) return
      setCollections(entries)
    } catch (err) {
      console.error('[DetailScreen] Collections load error:', err)
    } finally {
      if (collectionReqRef.current === requestId) setCollectionsLoading(false)
    }
  }

  const handleCollectionButtonClick = () => {
    if (collectionBusyId != null || createBusy) return
    if (showCollectionMenu) {
      setShowCollectionMenu(false)
      return
    }
    setShowIntentPicker(false)
    setShowCollectionMenu(true)
    if (collections.length === 0) void loadCollectionEntries()
  }

  const closeCollectionMenu = () => {
    if (collectionBusyId != null || createBusy) return
    setShowCollectionMenu(false)
  }

  const buildCollectionExternalItem = () => ({
    tmdb_id: video.tmdb_id,
    title: displayTitle,
    type: video.type,
    poster_path: video.poster_path,
    backdrop_path: (video as any)?.backdrop_path,
    overview: video.overview,
    vote_average: video.vote_average,
    release_year: video.release_year
  })

  const handleToggleCollection = async (entry: CollectionEntry) => {
    if (collectionBusyId != null || createBusy) return
    setCollectionBusyId(entry.id)
    try {
      if (entry.matches.length > 0) {
        for (const m of entry.matches) {
          if (m.isExternal && m.externalId != null) {
            await window.api.removeCollectionExternal(m.externalId)
          } else if (!m.isExternal) {
            await window.api.unpinCollectionVideo(entry.id, video.id)
          }
        }
        flashCollectionToast(`Removed from ${entry.name}`)
      } else if (isCollectionExternal) {
        if (!video.tmdb_id) {
          console.warn('[DetailScreen] Cannot file into collection: no TMDB identity.')
          return
        }
        await window.api.addCollectionExternal(entry.id, buildCollectionExternalItem())
        flashCollectionToast(`Saved to ${entry.name}`)
      } else {
        await window.api.pinCollectionVideo(entry.id, video.id)
        flashCollectionToast(`Saved to ${entry.name}`)
      }
      await loadCollectionEntries()
    } catch (err) {
      console.error('[DetailScreen] Collection toggle error:', err)
    } finally {
      setCollectionBusyId(null)
    }
  }

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim()
    if (!name || createBusy) return
    setCreateBusy(true)
    try {
      const created = await window.api.createCollection({ name })
      setNewCollectionName('')
      setCreatingCollection(false)
      if (created?.id) {
        if (isCollectionExternal) {
          if (video.tmdb_id) {
            await window.api.addCollectionExternal(Number(created.id), buildCollectionExternalItem())
            flashCollectionToast(`Saved to ${name}`)
          }
        } else {
          await window.api.pinCollectionVideo(Number(created.id), video.id)
          flashCollectionToast(`Saved to ${name}`)
        }
      }
      await loadCollectionEntries()
    } catch (err) {
      console.error('[DetailScreen] Collection create error:', err)
    } finally {
      setCreateBusy(false)
    }
  }

  const filedCollectionCount = collections.filter(c => c.matches.length > 0).length

  const handleSearchSources = async (forceRefresh: boolean = false): Promise<any[]> => {
    if (!isTmdbBacked || !video.tmdb_id || (searching && !forceRefresh)) return []
    const hasOnlySharedSource = Boolean(initialSharedSource?.magnet) && sources.length === 1 && sources[0]?.magnet === initialSharedSource.magnet
    if (!forceRefresh && hasSearched && sources.length > 0 && !hasOnlySharedSource) return sources

    if (sourceSearchRequestRef.current) {
      cancelActiveSourceSearch(false)
    }
    setSearching(true)
    setHasSearched(true)
    setSourceSearchStatus(prev => ({ ...prev, completed: 0, total: 0, cached: false, done: false }))
    const requestId = `${video.tmdb_id}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    sourceSearchRequestRef.current = requestId
    try {
      const results = await window.api.searchTorrentSources(
        displayTitle,
        video.release_year?.toString() || '', 
        video.type === 'series' ? 'tv' : 'movie', 
        video.tmdb_id!,
        requestId
      )
      if (sourceSearchRequestRef.current === requestId) {
        setSources(prev => {
          if (!initialSharedSource?.magnet) return results
          const sharedSource = prev.find(source => source.magnet === initialSharedSource.magnet) || {
            ...initialSharedSource,
            seeds: initialSharedSource.seeds || 0,
            peers: initialSharedSource.peers || 0,
            type: 'shared'
          }
          const matchedSource = results.find(source => source.magnet === initialSharedSource.magnet)
          const mergedSharedSource = matchedSource ? { ...sharedSource, ...matchedSource } : sharedSource
          const others = results.filter(source => source.magnet !== initialSharedSource.magnet)
          return [mergedSharedSource, ...others]
        })
        setSourceSearchStatus(prev => ({ ...prev, found: results.length + (initialSharedSource?.magnet ? 1 : 0), done: true }))
      }
      return results || []
    } catch (err) {
      console.error('Failed to search sources:', err)
      if (sourceSearchRequestRef.current === requestId) {
        setSourceSearchStatus(prev => ({ ...prev, done: true }))
      }
      return []
    } finally {
      if (sourceSearchRequestRef.current === requestId) {
        setSearching(false)
        sourceSearchRequestRef.current = null
      }
    }
  }

  const handleOpenDownloadOptions = async () => {
    setTorrentStreamError(null)
    setDownloadSiteError(null)
    setDownloadSiteNotice(null)
    if (!initialSharedSource?.magnet) {
      setSourceLanguageFilter('all')
      setSourceQualityFilter('all')
      setSourceSeasonFilter('all')
      setSourcePackSeasonFilter('all')
      setSourceEpisodeFilter('all')
    }
    setShowDownloadOptions(true)
    await handleSearchSources(false)
  }

  const handleOpenEpisodeSources = async (season: number, episode: number) => {
    setSourceSeasonFilter(String(season))
    setSourcePackSeasonFilter('all')
    setSourceEpisodeFilter(String(episode))
    setShowDownloadOptions(true)
    await handleSearchSources(false)
  }

  const handleCloseDownloadOptions = () => {
    setShowDownloadOptions(false)
    setTorrentStreamError(null)
    cancelActiveSourceSearch(true)
  }

  useEffect(() => {
    const cleanup = window.api.onTorrentSourcesProgress((data: any) => {
      if (!data || data.requestId !== sourceSearchRequestRef.current) return
      if (Array.isArray(data.sources)) {
        setSources(prev => {
          if (!initialSharedSource?.magnet) return data.sources
          const sharedSource = prev.find(source => source.magnet === initialSharedSource.magnet) || {
            ...initialSharedSource,
            seeds: initialSharedSource.seeds || 0,
            peers: initialSharedSource.peers || 0,
            type: 'shared'
          }
          const matchedSource = data.sources.find((source: any) => source.magnet === initialSharedSource.magnet)
          const mergedSharedSource = matchedSource ? { ...sharedSource, ...matchedSource } : sharedSource
          const others = data.sources.filter((source: any) => source.magnet !== initialSharedSource.magnet)
          return [mergedSharedSource, ...others]
        })
      }
      setSourceSearchStatus({
        found: Array.isArray(data.sources) ? data.sources.length : 0,
        completed: data.completedProviders || 0,
        total: data.totalProviders || 0,
        cached: Boolean(data.cached),
        done: Boolean(data.done)
      })
      if (data.done) {
        setSearching(false)
        sourceSearchRequestRef.current = null
      }
    })
    return cleanup
  }, [])

  useEffect(() => {
    let cancelled = false

    window.api.getActiveDownloads()
      .then((downloads: ActiveDownload[]) => {
        if (!cancelled) setActiveDownloads(downloads || [])
      })
      .catch(err => console.error('[DetailScreen] Failed to load active downloads:', err))

    const cleanup = window.api.onTorrentProgress((data: ActiveDownload) => {
      if (!data?.id) return
      setActiveDownloads(prev => {
        const index = prev.findIndex(download => download.id === data.id)
        if (index === -1) {
          const isRelevant = Boolean(
            (video.tmdb_id && data.tmdbId === video.tmdb_id) ||
            (data.title && normalizedDisplayTitle && normalizeMatchText(data.title).includes(normalizedDisplayTitle))
          )
          if (!isRelevant) return prev
          const rawProgress = typeof data.progress === 'number' ? data.progress : Number(data.progress || 0)
          const clamped = Math.max(0, Math.min(data.status === 'done' ? 100 : 99.9, rawProgress))
          return [{ ...data, progress: clamped }, ...prev]
        }
        const current = prev[index]
        const rawProgress = typeof data.progress === 'number' ? data.progress : Number(data.progress || 0)
        const clamped = Math.max(0, Math.min(data.status === 'done' ? 100 : 99.9, rawProgress))
        const smoothProgress = (data.status === 'downloading' || data.status === 'connecting')
          ? Math.max(current.progress || 0, clamped)
          : clamped

        const currentPct = Math.round(current.progress || 0)
        const nextPct = Math.round(smoothProgress)
        if (
          currentPct === nextPct &&
          current.status === data.status &&
          current.downloadSpeed === data.downloadSpeed &&
          current.timeRemaining === data.timeRemaining
        ) {
          return prev
        }
        const next = [...prev]
        next[index] = { ...next[index], ...data, progress: smoothProgress }
        return next
      })
    })

    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    setResolvedLogoPath(null)
    setLogoLoadFailed(false)

    if (!isTmdbBacked || !video.tmdb_id) {
      setReleaseInfo(null)
      setReleaseInfoLoading(false)
      setTmdbKeywords([])
      setKeywordsLoading(false)
      return () => {
        cancelled = true
      }
    }

    setReleaseInfo(null)
    setReleaseInfoLoading(true)

    if (!video.logo_path) {
      window.api.getTmdbTitleLogo(video.type === 'series' ? 'series' : 'movie', video.tmdb_id)
        .then(logoPath => {
          if (!cancelled) setResolvedLogoPath(logoPath || null)
        })
        .catch(err => {
          console.error('[DetailScreen] Failed to fetch title logo:', err)
          if (!cancelled) setResolvedLogoPath(null)
        })
    }

    window.api.getTmdbReleaseInfo(video.tmdb_id, video.type === 'series' ? 'series' : 'movie')
      .then(info => {
        if (!cancelled) {
          setReleaseInfo(info)
          setReleaseInfoLoading(false)
        }
      })
      .catch(err => {
        console.error('[DetailScreen] Failed to fetch release info:', err)
        if (!cancelled) {
          setReleaseInfo(null)
          setReleaseInfoLoading(false)
        }
      })

    let existingKeywords = video.keywords as any
    if (typeof existingKeywords === 'string') {
      try {
        existingKeywords = JSON.parse(existingKeywords)
      } catch (e) {
        existingKeywords = undefined
      }
      video.keywords = existingKeywords
    }

    if (Array.isArray(existingKeywords)) {
      setTmdbKeywords(existingKeywords)
      setKeywordsLoading(false)
    } else {
      setTmdbKeywords([])
      setKeywordsLoading(true)
      window.api.getTmdbKeywords(video.tmdb_id, video.type === 'series' ? 'series' : 'movie')
        .then(keywords => {
          if (!cancelled) {
            setTmdbKeywords(keywords || [])
            setKeywordsLoading(false)
            video.keywords = keywords || []
            if (!video.isExternal && video.id) {
              window.api.saveVideoKeywords(video.id, keywords || [])
            }
          }
        })
        .catch(err => {
          console.error('[DetailScreen] Failed to fetch tmdb keywords:', err)
          if (!cancelled) {
            setTmdbKeywords([])
            setKeywordsLoading(false)
          }
        })
    }

    return () => {
      cancelled = true
    }
  }, [isTmdbBacked, video.tmdb_id, video.logo_path, video.type])

  useEffect(() => {
    const el = overviewRef.current

    if (!el) return

    setIsOverflowing(el.scrollHeight > el.clientHeight)
  }, [video.overview])

  const handleDownloadSource = async (source: any) => {
    setStartingSourceMagnet(source.magnet)
    try {
      const torrentId = await window.api.startTorrentDownload(
        source.magnet,
        displayTitle,
        video.tmdb_id,
        source.title,
        {
          mediaType: video.type === 'series' ? 'series' : 'movie',
          season: source.parsedSeason ?? video.season,
          episode: source.parsedEpisode ?? video.episode
        }
      )
      if (torrentId) {
        setStartedSourceMagnet(source.magnet)
        window.api.getActiveDownloads()
          .then((downloads: ActiveDownload[]) => setActiveDownloads(downloads || []))
          .catch(err => console.error('[DetailScreen] Failed to refresh downloads:', err))
      }
    } catch (err) {
      console.error('Failed to start download:', err)
    } finally {
      setStartingSourceMagnet(null)
    }
  }

  const handlePlaySource = async (source: any) => {
    // NOTE: startTempStream reuses an active persistent download by infoHash
    // on the backend, so there is no separate play-while-downloading path.
    setTorrentStreamError(null)
    setStartingStreamMagnet(source.magnet)
    try {
      // Season packs: hint which episode to start from so the whole season
      // plays through in order (E01 → E02 → …) on the same torrent.
      const episodeHint = (source.isSeasonPack || !source.parsedEpisode)
        ? { season: source.parsedSeason ?? video.season, episode: source.parsedEpisode ?? video.episode }
        : undefined
      const result = await window.api.startTempStream(source.magnet, displayTitle, episodeHint)
      if (!result?.url) {
        setTorrentStreamError(getTorrentStreamErrorMessage(result?.error))
        return
      }

      // Attach any saved online position so the player resumes instantly
      // (it also falls back to a DB lookup on start if this is skipped).
      let resumeFrom = 0
      let resumeFileIndex: number | null = getTorrentFileQueryIndex(result.url)
      try {
        if (video.tmdb_id && isOnlineProgressEnabled()) {
          const row = await safeGetStreamProgress(
            video.tmdb_id,
            video.type,
            video.type === 'series' ? (result.parsedSeason ?? source.parsedSeason ?? video.season ?? null) : null,
            video.type === 'series' ? (result.parsedEpisode ?? source.parsedEpisode ?? video.episode ?? null) : null
          )
          if (row && !row.completed && (Number(row.position) || 0) >= 10) {
            resumeFrom = Number(row.position) || 0
            // Same torrent as the saved row: pin the exact file, not just S/E.
            if (row.source_magnet && getMagnetInfoHash(row.source_magnet) === getMagnetInfoHash(source.magnet) &&
              Number.isFinite(Number(row.file_index))) {
              resumeFileIndex = Number(row.file_index)
            }
          }
        }
      } catch { /* resume is best-effort */ }

      onPlay({
        ...video,
        id: -Math.abs(Date.now()),
        title: displayTitle,
        season: result.parsedSeason ?? source.parsedSeason ?? video.season,
        episode: result.parsedEpisode ?? source.parsedEpisode ?? video.episode,
        file_path: result.url,
        duration: 0,
        isExternal: false,
        logo_path: video.logo_path || resolvedLogoPath || undefined,
        streamSourceId: result.streamId,
        sourceMagnet: source.magnet,
        fileIndex: resumeFileIndex ?? undefined,
        fetchedSources: sources.length > 0 ? sources : undefined,
        resumeFrom,
        sourceRefreshed: false
      })
    } catch (err: any) {
      setTorrentStreamError(getTorrentStreamErrorMessage(err?.message))
    } finally {
      setStartingStreamMagnet(null)
    }
  }

  const handleOpenFolder = () => {
    window.api.openFolder(video.file_path)
  }

  const handleDeleteFile = async () => {
    if (window.confirm('Are you sure you want to completely delete this from disk? This cannot be undone.')) {
      try {
        const deleted = await window.api.deleteVideoFile(video)
        if (deleted) {
          onClose()
        } else {
          alert('Failed to delete some files. They might be in use or no longer exist.')
        }
      } catch (err) {
        console.error('Delete error:', err)
        alert('Failed to delete file.')
      }
    }
  }

  const handleSetPreferredVersion = async (version: Video) => {
    const changed = await window.api.setPreferredVideoVersion(version.id)
    if (!changed) return
    setLocalVersions(current => current.map(item => ({
      ...item,
      is_preferred: item.id === version.id
    })))
  }

  const handleOpenMoctale = () => {
    const title = video.type === 'series' && video.series_name ? video.series_name : video.title
    window.dispatchEvent(new CustomEvent('web-popup-opened'))
    setIsWebPopupOpen(true)
    const clearBlurOnFocus = () => {
      window.dispatchEvent(new CustomEvent('web-popup-closed'))
      setIsWebPopupOpen(false)
      window.removeEventListener('focus', clearBlurOnFocus)
    }
    window.addEventListener('focus', clearBlurOnFocus)
    window.api.openWebPopup(getMoctaleUrl(video), `${title} — Moctale`)
  }

  const handleOpenDownloadSite = async (siteId: 'hdmovies' | 'catmovies', siteName: string) => {
    if (resolvingSiteId) return
    const searchTitle = video.type === 'series' && video.series_name ? video.series_name : video.title
    setResolvingSiteId(siteId)
    setDownloadSiteError(null)
    setDownloadSiteNotice(null)
    try {
      const resolved = await window.api.resolveDownloadSiteUrl(siteId, searchTitle, null)
      // JS-only sites ignore URL params — the popup types this into the
      // page's own search box after load (harmless where ?s= already worked).
      const autoSearch = searchTitle.trim()
      if (resolved?.stale) {
        setDownloadSiteNotice('Latest link verify nahi hua — backup link khola hai. Agar galat page khule to Settings → Download Sites → Refresh dabao.')
      }
      window.dispatchEvent(new CustomEvent('web-popup-opened'))
      setIsWebPopupOpen(true)
      const clearBlurOnFocus = () => {
        window.dispatchEvent(new CustomEvent('web-popup-closed'))
        setIsWebPopupOpen(false)
        window.removeEventListener('focus', clearBlurOnFocus)
      }
      window.addEventListener('focus', clearBlurOnFocus)
      await window.api.openWebPopup(resolved.searchUrl, `${searchTitle} — ${siteName}`, autoSearch)
    } catch (err: any) {
      console.error('[DetailScreen] Download site resolve failed:', err)
      setDownloadSiteError(cleanIpcError(err, 'Could not find a working link right now. Try again later.'))
    } finally {
      setResolvingSiteId(null)
    }
  }

  const handleOpenGoogleSearch = () => {
    const searchTitle = video.type === 'series' && video.series_name ? video.series_name : video.title
    const query = encodeURIComponent(`${searchTitle} ${video.release_year || ''}`.trim())
    window.dispatchEvent(new CustomEvent('web-popup-opened'))
    setIsWebPopupOpen(true)
    const clearBlurOnFocus = () => {
      window.dispatchEvent(new CustomEvent('web-popup-closed'))
      setIsWebPopupOpen(false)
      window.removeEventListener('focus', clearBlurOnFocus)
    }
    window.addEventListener('focus', clearBlurOnFocus)
    window.api.openWebPopup(`https://www.google.com/search?q=${query}`, `${searchTitle} — Search`)
  }

  const handleOpenLetterboxd = () => {
    const searchTitle = video.type === 'series' && video.series_name ? video.series_name : video.title
    // Direct film page when we can: Letterboxd resolves /tmdb/<id> and
    // /imdb/<id> straight to the film (no search-click needed).
    // TV entries can't use the tmdb shortcut, so series fall back to search.
    let url: string
    if (video.type === 'movie' && video.tmdb_id) {
      url = `https://letterboxd.com/tmdb/${video.tmdb_id}/`
    } else if (video.imdb_id) {
      url = `https://letterboxd.com/imdb/${video.imdb_id}/`
    } else {
      const query = encodeURIComponent(`${searchTitle} ${video.release_year || ''}`.trim())
      // films-only tab — skips members/lists noise from generic /search/
      url = `https://letterboxd.com/search/films/${query}/`
    }
    window.dispatchEvent(new CustomEvent('web-popup-opened'))
    setIsWebPopupOpen(true)
    const clearBlurOnFocus = () => {
      window.dispatchEvent(new CustomEvent('web-popup-closed'))
      setIsWebPopupOpen(false)
      window.removeEventListener('focus', clearBlurOnFocus)
    }
    window.addEventListener('focus', clearBlurOnFocus)
    window.api.openWebPopup(url, `${searchTitle} — Letterboxd`)
  }

  const handleOpenStreamingProvider = async (provider: TmdbProvider) => {
    const url = getStreamingDeepLink(provider, displayTitle, releaseInfo?.justWatchLink)
    try {
      const opened = await window.api.openExternalUrl?.(url)
      if (!opened) {
        window.dispatchEvent(new CustomEvent('web-popup-opened'))
        setIsWebPopupOpen(true)
        const clearBlurOnFocus = () => {
          window.dispatchEvent(new CustomEvent('web-popup-closed'))
          setIsWebPopupOpen(false)
          window.removeEventListener('focus', clearBlurOnFocus)
        }
        window.addEventListener('focus', clearBlurOnFocus)
        await window.api.openWebPopup(url, `${displayTitle} — ${provider.provider_name}`)
      }
    } catch {
      window.dispatchEvent(new CustomEvent('web-popup-opened'))
      setIsWebPopupOpen(true)
      const clearBlurOnFocus = () => {
        window.dispatchEvent(new CustomEvent('web-popup-closed'))
        setIsWebPopupOpen(false)
        window.removeEventListener('focus', clearBlurOnFocus)
      }
      window.addEventListener('focus', clearBlurOnFocus)
      await window.api.openWebPopup(url, `${displayTitle} — ${provider.provider_name}`)
    }
  }

  const handleOpenJustWatch = async () => {
    if (!releaseInfo?.justWatchLink) return
    const url = releaseInfo.justWatchLink
    try {
      const opened = await window.api.openExternalUrl?.(url)
      if (!opened) {
        window.dispatchEvent(new CustomEvent('web-popup-opened'))
        setIsWebPopupOpen(true)
        const clearBlurOnFocus = () => {
          window.dispatchEvent(new CustomEvent('web-popup-closed'))
          setIsWebPopupOpen(false)
          window.removeEventListener('focus', clearBlurOnFocus)
        }
        window.addEventListener('focus', clearBlurOnFocus)
        await window.api.openWebPopup(url, `${displayTitle} — JustWatch`)
      }
    } catch {
      await window.api.openWebPopup(url, `${displayTitle} — JustWatch`)
    }
  }

  const getSharePayload = () => {
    if (!video.tmdb_id || (video.type !== 'movie' && video.type !== 'series')) return null

    const mediaTitle = video.type === 'series' && video.series_name ? video.series_name : video.title
    const appUrl = `mycinema://${video.type}/${video.tmdb_id}`
    const shareUrl = MYCINEMA_SHARE_BASE_URL
      ? `${MYCINEMA_SHARE_BASE_URL}/${video.type}/${video.tmdb_id}`
      : appUrl
    const shareTitle = `I found this on MyCinema: ${mediaTitle}${video.release_year ? ` (${video.release_year})` : ''}`
    const shareText = `${shareTitle}\n${shareUrl}`

    return { mediaTitle, shareUrl, shareTitle, shareText }
  }

  const showShareFeedback = (message: string) => {
    setShareFeedback(message)
    setShareCopied(true)
    window.setTimeout(() => {
      setShareFeedback(null)
      setShareCopied(false)
    }, 1800)
  }

  const copyShareText = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text)
    showShareFeedback(message)
  }

  const openShareUrl = (url: string) => {
    window.open(url, '_blank')
  }

  const handleShare = () => {
    if (!getSharePayload()) return
    setShowShareModal(true)
  }

  const handleNativeShare = async () => {
    const payload = getSharePayload()
    if (!payload) return

    try {
      if (navigator.share) {
        try {
          await navigator.share({
            title: payload.mediaTitle,
            text: payload.shareTitle,
            url: payload.shareUrl
          })
          setShowShareModal(false)
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return
          await copyShareText(payload.shareText, 'Copied message')
        }
      } else {
        await copyShareText(payload.shareText, 'Copied message')
      }
    } catch (err) {
      console.error('[Share] Failed to share media link:', err)
    }
  }

  const handleShowInfo = async () => {
    if (!isLocalMedia) return
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

  const handleOpenTrailer = () => {
    setShouldLoadTrailer(true)
    setShowTrailerModal(true)
  }

  useEffect(() => {
    let cancelled = false

    setTrailer(null)
    setShowTrailerModal(false)
    setTrailerSeasons([])
    setShouldLoadTrailer(false)
    trailerCacheRef.current.clear()
    setTrailerSeasonSelection(video.type === 'series' ? 'latest' : 'series')
    setSources([])
    setSearching(false)
    setHasSearched(false)
    setSourceSeasonFilter('all')
    setSourcePackSeasonFilter('all')
    setSourceEpisodeFilter('all')
    setSourceLanguageFilter('all')
    setSourceQualityFilter('all')
    setShowDownloadOptions(false)
    setStartingSourceMagnet(null)
    setStartedSourceMagnet(null)
    setTorrentStreamError(null)

    if (initialSharedSource?.magnet) {
      setSources([{ ...initialSharedSource, seeds: initialSharedSource.seeds || 0, peers: initialSharedSource.peers || 0, type: 'shared' }])
      setShowDownloadOptions(true)
      setHasSearched(true)
      setSourceSearchStatus({ found: 1, completed: 0, total: 0, cached: false, done: true })
      window.setTimeout(() => {
        if (!cancelled) handleSearchSources(false)
      }, 350)
    }

    const trailerTimer = isTmdbBacked
      ? window.setTimeout(() => {
          if (!cancelled) setShouldLoadTrailer(true)
        }, 650)
      : 0

    if (isLocalMedia && video.type === 'series' && video.series_name) {
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

    if (isLocalMedia && (video.type === 'movie' || video.type === 'series')) {
      window.api.getVideos().then((allVideos: Video[]) => {
        if (cancelled) return
        const identity = getMediaUnitIdentity(video)
        setLocalVersions(allVideos.filter(candidate => getMediaUnitIdentity(candidate) === identity))
      }).catch(err => console.error('[DetailScreen] Failed to load local versions:', err))
    } else {
      setLocalVersions([])
    }

    if (video.type === 'series' && video.tmdb_id) {
      setCatalogLoading(true)
      setCatalogLoaded(false)
      window.api.getTmdbSeriesCatalog(video.tmdb_id).then(catalog => {
        if (!cancelled) {
          setSeriesCatalog(catalog || [])
          if (catalog && catalog.length > 0) {
            const seasonNums = new Set(catalog.map((e: any) => e.seasonNumber || 1))
            if (seasonNums.size > 0) {
              seriesSeasonCountCache.set(video.tmdb_id!, seasonNums.size)
            }
          }
        }
      }).catch(err => {
        console.error('[DetailScreen] Failed to load episode catalog:', err)
        if (!cancelled) setSeriesCatalog([])
      }).finally(() => {
        if (!cancelled) {
          setCatalogLoading(false)
          setCatalogLoaded(true)
        }
      })
    } else {
      setSeriesCatalog([])
      setCatalogLoading(false)
      setCatalogLoaded(true)
    }

    return () => {
      cancelled = true
      cancelActiveSourceSearch(true)
      if (trailerTimer) window.clearTimeout(trailerTimer)
    }
  }, [video, initialSharedSource, isLocalMedia])

  useEffect(() => {
    let cancelled = false
    if (!isTmdbBacked || !shouldLoadTrailer) {
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
      type: video.type === 'series' ? 'series' : 'movie',
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
  }, [video, trailerSeasonSelection, shouldLoadTrailer, isTmdbBacked])

  // A physical file is a version, not another episode. Collapse alternate
  // encodes before rendering counts and playback order.
  const episodeGroups = groupMediaVersions(episodes)
  const localEpisodeGroups = new Map(episodeGroups.map(group => {
    const representative = group.representative
    return [`${Number(representative.season || 1)}:${Number(representative.episode || 0)}`, group] as const
  }))
  const catalogEpisodeKeys = new Set(seriesCatalog.map(episode => `${episode.seasonNumber}:${episode.episodeNumber}`))
  const episodeRows: EpisodeDisplayRow[] = seriesCatalog.map(catalogEpisode => {
    const localGroup = localEpisodeGroups.get(`${catalogEpisode.seasonNumber}:${catalogEpisode.episodeNumber}`)
    return {
      season: catalogEpisode.seasonNumber,
      episode: catalogEpisode.episodeNumber,
      title: catalogEpisode.name,
      localVideo: localGroup?.representative,
      versionCount: localGroup?.versions.length || 0,
      released: catalogEpisode.released,
      airDate: catalogEpisode.airDate,
      stillPath: catalogEpisode.stillPath
    }
  })
  for (const group of episodeGroups) {
    const representative = group.representative
    const season = Number(representative.season || 1)
    const episode = Number(representative.episode || 0)
    if (catalogEpisodeKeys.has(`${season}:${episode}`)) continue
    episodeRows.push({
      season,
      episode,
      title: representative.title,
      localVideo: representative,
      versionCount: group.versions.length,
      released: true,
      airDate: null,
      stillPath: null
    })
  }
  episodeRows.sort((a, b) => a.season - b.season || a.episode - b.episode)

  const episodesBySeason = episodeRows.reduce((acc, episode) => {
    if (!acc[episode.season]) acc[episode.season] = []
    acc[episode.season].push(episode)
    return acc
  }, {} as Record<number, EpisodeDisplayRow[]>)

  const seasons = Object.keys(episodesBySeason)
    .map(Number)
    .sort((a, b) => a - b)
  const seasonKey = seasons.join(',')

  useEffect(() => {
    if (video.type === 'series' && video.tmdb_id) {
      if (seasons.length > 0) {
        seriesSeasonCountCache.set(video.tmdb_id, seasons.length)
      } else if (trailerSeasons.length > 0 && !seriesSeasonCountCache.has(video.tmdb_id)) {
        seriesSeasonCountCache.set(video.tmdb_id, trailerSeasons.length)
      }
    }
  }, [video.type, video.tmdb_id, seasons.length, trailerSeasons.length])

  const activeSeasonNumber = selectedSeason || seasons[0] || 1
  const currentSeasonEpisodes = episodesBySeason[activeSeasonNumber] || []
  const releasedEpisodesCount = currentSeasonEpisodes.filter(e => e.released || e.localVideo).length
  const upcomingEpisodesCount = currentSeasonEpisodes.filter(e => !e.released && !e.localVideo).length
  const libraryEpisodesCount = currentSeasonEpisodes.filter(e => Boolean(e.localVideo)).length

  // Determine the smartest Up Next or Resume target for the series
  const upNextEpisode = React.useMemo(() => {
    if (video.type !== 'series' || episodeRows.length === 0) return null

    // 1. In-progress episode (Resume)
    const inProgress = episodeRows.find(ep => {
      if (ep.localVideo && (ep.localVideo.last_watched_time || 0) > 10 && !ep.localVideo.completed) {
        return true
      }
      const online = onlineEpisodeMap.get(`${ep.season}:${ep.episode}`)
      if (online && online.position >= 10 && !online.completed) {
        return true
      }
      return false
    })
    if (inProgress) return { ep: inProgress, type: 'resume' as const }

    // 2. Next episode after last completed
    let lastCompletedIdx = -1
    episodeRows.forEach((ep, idx) => {
      const isCompleted = ep.localVideo?.completed || onlineEpisodeMap.get(`${ep.season}:${ep.episode}`)?.completed
      if (isCompleted) lastCompletedIdx = idx
    })
    if (lastCompletedIdx >= 0 && lastCompletedIdx < episodeRows.length - 1) {
      const candidate = episodeRows[lastCompletedIdx + 1]
      if (candidate.released || candidate.localVideo) {
        return { ep: candidate, type: 'next' as const }
      }
    }

    // 3. First released episode (Start)
    const firstReleased = episodeRows.find(ep => ep.released || ep.localVideo)
    if (firstReleased) {
      return { ep: firstReleased, type: 'start' as const }
    }

    return null
  }, [video.type, episodeRows, onlineEpisodeMap])

  useEffect(() => {
    if (video.type !== 'series' || seasons.length === 0) return
    setSelectedSeason(current => (
      current && seasons.includes(current) ? current : (video.season && seasons.includes(video.season) ? video.season : seasons[0])
    ))
  }, [video.id, video.season, video.type, seasonKey])

  const sourceSeasons = React.useMemo(() => {
    const values = new Set<number>()
    sources.forEach(source => {
      if (!isSourceSeasonPack(source) && typeof source.parsedSeason === 'number') values.add(source.parsedSeason)
    })
    return Array.from(values).sort((a, b) => a - b)
  }, [sources])

  const sourcePackSeasons = React.useMemo(() => {
    const values = new Set<number>()
    sources.forEach(source => {
      if (isSourceSeasonPack(source) && typeof source.parsedSeason === 'number') values.add(source.parsedSeason)
    })
    return Array.from(values).sort((a, b) => a - b)
  }, [sources])

  const sourceEpisodes = React.useMemo(() => {
    if (sourceSeasonFilter === 'all' || sourceSeasonFilter === 'packs') return []
    const values = new Set<number>()
    sources.forEach(source => {
      if (
        source.parsedSeason === Number(sourceSeasonFilter) &&
        !isSourceSeasonPack(source) &&
        typeof source.parsedEpisode === 'number'
      ) {
        values.add(source.parsedEpisode)
      }
    })
    return Array.from(values).sort((a, b) => a - b)
  }, [sources, sourceSeasonFilter])

  const sourceQualityCounts = React.useMemo(() => {
    const counts: Record<'2160p' | '1080p' | '720p' | '480p', number> = { '2160p': 0, '1080p': 0, '720p': 0, '480p': 0 }
    sources.forEach(source => {
      counts[normalizeSourceQualityKey(source)] += 1
    })
    return counts
  }, [sources])

  const sourceHindiCount = React.useMemo(() => sources.filter(s => s.isHindi).length, [sources])

  const hasActiveSourceFilters = sourceLanguageFilter !== 'all' || sourceQualityFilter !== 'all' || sourceSeasonFilter !== 'all' || sourcePackSeasonFilter !== 'all' || sourceEpisodeFilter !== 'all'

  const clearSourceFilters = () => {
    setSourceLanguageFilter('all')
    setSourceQualityFilter('all')
    setSourceSeasonFilter('all')
    setSourcePackSeasonFilter('all')
    setSourceEpisodeFilter('all')
  }

  const filteredSources = React.useMemo(() => {
    return sources
      .filter(source => {
        if (sourceLanguageFilter === 'hindi' && !source.isHindi) return false
        if (sourceQualityFilter !== 'all' && normalizeSourceQualityKey(source) !== sourceQualityFilter) return false

        if (video.type === 'series') {
          if (sourceSeasonFilter === 'packs') {
            if (!isSourceSeasonPack(source)) return false
            if (sourcePackSeasonFilter !== 'all') return source.parsedSeason === Number(sourcePackSeasonFilter)
            return true
          }
          if (sourceSeasonFilter !== 'all') {
            if (source.parsedSeason !== Number(sourceSeasonFilter) || isSourceSeasonPack(source)) return false
            if (sourceEpisodeFilter !== 'all') return source.parsedEpisode === Number(sourceEpisodeFilter)
          }
        }

        return true
      })
      .sort((a, b) => getTorrentSourceHealthScore(b) - getTorrentSourceHealthScore(a))
  }, [sources, sourceLanguageFilter, sourceQualityFilter, sourceSeasonFilter, sourcePackSeasonFilter, sourceEpisodeFilter, video.type])

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
        if (!isWebPopupOpen) {
          onClose()
        }
      }
    }
    window.addEventListener('mousedown', handleGlobalMouseDown)
    return () => window.removeEventListener('mousedown', handleGlobalMouseDown)
  }, [onClose, isWebPopupOpen])


  const getArtworkUrl = (artworkPath?: string, remoteSize: 'w342' | 'w780' | 'w1280' | 'original' = 'w780') => {
    if (!artworkPath) return null
    if (artworkPath.startsWith('http')) {
      return artworkPath
        .replace(/\/t\/p\/(w342|w500|w780|w1280|original)\//, `/t/p/${remoteSize}/`)
    }
    return `media://file/${encodeURIComponent(artworkPath)}`
  }

  const posterUrl = getArtworkUrl(video.poster_path, 'w780')
  const backdropUrl = getArtworkUrl(video.backdrop_path, 'w1280')
  const logoPath = video.logo_path || resolvedLogoPath
  const logoUrl = !logoLoadFailed ? getArtworkUrl(logoPath || undefined, 'original') : null

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const formatEpisodeTitle = (title?: string) => {
    if (!title) return ''
    const trimmed = title.trim()
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
      return trimmed
        .toLowerCase()
        .replace(/(?:^|\s|-|\/)\S/g, char => char.toUpperCase())
    }
    return trimmed
  }

  const formatEpisodeAirDate = (dateStr?: string | null) => {
    if (!dateStr) return null
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const visibleVibes = tmdbKeywords
    .filter(k => Boolean(k && k.trim()))
    .map(formatVibeLabel)
    .slice(0, 5)
  const sharePayload = getSharePayload()
  const sourceActionLabel = video.type === 'series'
    ? 'Episodes & Sources'
    : isLocalMedia
      ? 'Versions & Sources'
      : 'Choose Source'

  const seriesAccordionRef = useRef<HTMLDivElement>(null)
  const pillLeftContentRef = useRef<HTMLDivElement>(null)
  const pillRightContentRef = useRef<HTMLDivElement>(null)
  const newDropRef = useRef<HTMLDivElement>(null)
  const [collapsedPillWidth, setCollapsedPillWidth] = useState<number | null>(null)

  // Measure the collapsed pill's natural unconstrained width (strictly from the header row, never the catalog below)
  useEffect(() => {
    if (!isEpisodesExpanded) {
      const leftW = pillLeftContentRef.current ? pillLeftContentRef.current.scrollWidth : 0
      const rightW = pillRightContentRef.current ? pillRightContentRef.current.scrollWidth : 0
      const bannerW = newDrop && newDropRef.current ? newDropRef.current.scrollWidth : 0

      // Natural width = left items + right items + gap (12px) + horizontal padding (28px) + border (2px)
      const headerContentWidth = leftW > 0 && rightW > 0 ? (leftW + rightW + 42) : 0
      const naturalWidth = Math.max(headerContentWidth, bannerW > 0 ? (bannerW + 32) : 0)

      if (naturalWidth > 0) {
        setCollapsedPillWidth(Math.ceil(naturalWidth))
      }
    }
  }, [
    isEpisodesExpanded,
    newDrop,
    activeSeasonNumber,
    currentSeasonEpisodes.length,
    releasedEpisodesCount,
    upcomingEpisodesCount,
    libraryEpisodesCount
  ])

  const scrollAnimRef = useRef<number | null>(null)

  // Clean up any ongoing scroll animation on unmount
  useEffect(() => {
    return () => {
      if (scrollAnimRef.current) {
        cancelAnimationFrame(scrollAnimRef.current)
      }
    }
  }, [])

  // Simultaneous width/height expansion + smooth progressive auto-scroll
  // Uses continuous rAF loop to dynamically track expanding scrollHeight from frame 1
  const handleToggleEpisodes = React.useCallback(() => {
    setIsEpisodesExpanded(prev => {
      const willExpand = !prev

      // Always cancel any in-flight scroll animation first
      if (scrollAnimRef.current) {
        cancelAnimationFrame(scrollAnimRef.current)
        scrollAnimRef.current = null
      }

      if (willExpand) {
        // Run on next frame so DOM expansion has initialized
        requestAnimationFrame(() => {
          const scrollContainer = mainScrollRef.current
          const accordionEl = seriesAccordionRef.current
          if (!scrollContainer || !accordionEl) return

          const containerRect = scrollContainer.getBoundingClientRect()
          const accordionRect = accordionEl.getBoundingClientRect()

          const startScroll = scrollContainer.scrollTop
          const accordionOffsetTop = accordionRect.top - containerRect.top + startScroll
          // Desired viewing position: accordion header comfortably 75px below top
          const targetScroll = Math.max(0, accordionOffsetTop - 75)

          // Only scroll if there's meaningful distance
          if (Math.abs(startScroll - targetScroll) <= 12) return

          const duration = 400
          const startTime = performance.now()

          // Yield immediately if user manually touches scroll wheel
          const onUserWheel = () => {
            if (scrollAnimRef.current) {
              cancelAnimationFrame(scrollAnimRef.current)
              scrollAnimRef.current = null
            }
          }
          scrollContainer.addEventListener('wheel', onUserWheel, { once: true, passive: true })

          const animateScroll = (currentTime: number) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(1, elapsed / duration)
            // Ease-out cubic curve (exact match to CSS cubic-bezier(0.16,1,0.3,1))
            const ease = 1 - Math.pow(1 - progress, 3)

            scrollContainer.scrollTop = startScroll + (targetScroll - startScroll) * ease

            if (progress < 1) {
              scrollAnimRef.current = requestAnimationFrame(animateScroll)
            } else {
              scrollAnimRef.current = null
              scrollContainer.removeEventListener('wheel', onUserWheel)
            }
          }

          scrollAnimRef.current = requestAnimationFrame(animateScroll)
        })
      }
      return willExpand
    })
  }, [])

  return (
    <div
      style={{ left: 'var(--sidebar-width, 5rem)' }}
      data-detail-shade={isAmbientShadeActive ? 'ambient' : 'black'}
      className={`fixed right-0 top-0 bottom-0 z-50 animate-in fade-in duration-300 transition-[left] duration-300 ease-in-out detail-screen-root ${
        isAmbientShadeActive ? 'detail-ambient-active' : 'detail-ambient-disabled'
      }`}
    >
      <div className="relative w-full h-full bg-[#080d16] overflow-hidden flex flex-col detail-screen-canvas">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 left-6 md:top-8 md:left-8 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/80 transition-all hover:scale-105 hover:bg-white hover:text-black backdrop-blur-md detail-close-btn"
        >
          <X size={22} strokeWidth={2.5} />
        </button>

        {/* Full Screen Background */}
        <div className="absolute inset-0 z-0 bg-[#080d16] pointer-events-none detail-screen-bg">
          {backdropUrl ? (
            <img 
              src={backdropUrl} 
              alt={video.title} 
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover object-center opacity-85 md:opacity-95 scale-110 md:scale-[1.12] translate-x-[2%] md:translate-x-[3%] detail-screen-backdrop"
            />
          ) : posterUrl ? (
            <img 
              src={posterUrl} 
              alt={video.title} 
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover object-top opacity-30 blur-3xl scale-110 detail-screen-backdrop"
            />
          ) : null}
          
          {/* Focused Content Scrim (Feather-soft left & bottom radial veil — Top & Right 100% open) */}
          <div className="absolute inset-y-0 left-0 w-full md:w-[75%] lg:w-[68%] pointer-events-none detail-overlay-left" />
          <div className="absolute inset-x-0 bottom-0 h-[38vh] pointer-events-none detail-overlay-bottom" />
        </div>

        {/* Content Section */}
        <div ref={mainScrollRef} className="flex-1 overflow-y-auto scrollbar-thin relative z-10 w-full animate-in slide-in-from-bottom-[100px] fade-in duration-700 [animation-timing-function:cubic-bezier(0.16,1,0.3,1)]">
          <div className="min-h-full flex flex-col">
            {/* Spacer to push content down (reduced to move content higher) */}
            <div className="h-[13vh] shrink-0 pointer-events-none" />
            
            {/* Content wrapper */}
            <div className="relative flex-1 w-full">
              <div className="relative z-10 w-full max-w-4xl space-y-7 p-6 pb-24 md:p-14 lg:pl-16">
            {/* Title & Tagline */}
            <div className="space-y-3 pr-10">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={displayTitle}
                  loading="eager"
                  decoding="async"
                  className="max-h-24 md:max-h-32 w-auto max-w-[min(100%,440px)] object-contain object-left hero-split-logo"
                  onError={() => setLogoLoadFailed(true)}
                />
              ) : (
                <h2 className="text-4xl md:text-6xl font-black tracking-[-0.05em] text-white leading-[0.94] drop-shadow-lg detail-title-text">
                  {displayTitle}
                </h2>
              )}
              {video.tagline && (
                <p className="text-primary font-black italic tracking-[0.18em] text-xs md:text-sm uppercase opacity-95 pl-0.5">
                  {video.tagline}
                </p>
              )}
            </div>

            {/* Meta Info Row */}
            <div className={`flex flex-wrap items-center gap-2.5 text-xs font-medium ${isLight ? 'text-slate-800' : 'text-white/80'}`}>
              {/* Smart Rating or Contextual Status Badge */}
              {(() => {
                const hasValidRating = typeof video.vote_average === 'number' && video.vote_average > 0

                // 1. Valid TMDB Rating
                if (hasValidRating) {
                  return (
                    <div className="inline-flex items-stretch rounded-lg overflow-hidden border border-amber-500/40 shadow-sm shrink-0">
                      <div className="bg-amber-500 text-black font-black text-xs flex items-center gap-1 px-2.5 py-1">
                        <Star size={11} className="fill-black text-black" />
                        <span>{video.vote_average!.toFixed(1)}</span>
                      </div>
                      <div className="bg-black/80 px-2.5 py-1 text-[11px] font-bold text-amber-100 tracking-wider flex items-center border-l border-amber-500/30">
                        TMDB
                      </div>
                    </div>
                  )
                }

                // 2. Upcoming / Unreleased content
                if (isContentUpcoming) {
                  return (
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tracking-wide shrink-0 ${
                      isLight
                        ? 'border border-amber-300 bg-amber-50 text-amber-900 shadow-sm'
                        : 'border border-amber-500/30 bg-amber-500/15 text-amber-300 shadow-sm'
                    }`}>
                      <Calendar size={11} className={isLight ? 'text-amber-700' : 'text-amber-400'} />
                      <span>Upcoming</span>
                    </div>
                  )
                }

                // 3. New Release with no votes yet (released within last 60 days)
                const parsedReleaseTime = effectiveReleaseDate ? new Date(effectiveReleaseDate).getTime() : NaN
                const isRecentRelease = (() => {
                  if (isNaN(parsedReleaseTime)) return false
                  const daysSince = (Date.now() - parsedReleaseTime) / (1000 * 60 * 60 * 24)
                  return daysSince >= 0 && daysSince <= 60
                })()

                if (isRecentRelease) {
                  return (
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tracking-wide shrink-0 ${
                      isLight
                        ? 'border border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm'
                        : 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 shadow-sm'
                    }`}>
                      <Sparkles size={11} className={isLight ? 'text-emerald-700' : 'text-emerald-400'} />
                      <span>New Release</span>
                    </div>
                  )
                }

                // 4. TMDB-backed catalog title with 0 votes / unrated
                const contentCert = (video as any).certification || (video as any).content_rating || ''
                const alreadyShowsUnratedCert = /^(NR|Not Rated|Unrated)$/i.test(String(contentCert).trim())

                if (video.tmdb_id && !alreadyShowsUnratedCert) {
                  return (
                    <div className={`inline-flex items-stretch rounded-lg overflow-hidden border shadow-sm shrink-0 ${
                      isLight
                        ? 'border-slate-300 bg-slate-100 text-slate-700'
                        : 'border-white/15 bg-white/5 text-white/70'
                    }`}>
                      <div className={`text-xs font-bold flex items-center gap-1 px-2.5 py-1 ${
                        isLight ? 'bg-slate-200/80 text-slate-700' : 'bg-white/10 text-white/80'
                      }`}>
                        <span>Unrated</span>
                      </div>
                      <div className={`px-2 py-1 text-[11px] font-semibold tracking-wider flex items-center border-l ${
                        isLight ? 'border-slate-300 bg-slate-100 text-slate-500' : 'border-white/10 bg-black/40 text-white/40'
                      }`}>
                        TMDB
                      </div>
                    </div>
                  )
                }

                // 5. Local personal media or when unrated cert already displayed -> clean omission
                return null
              })()}

              {/* Inline Metadata with Dot Separators (Image 3) */}
              {(() => {
                const detectedQuality = (() => {
                  const name = `${video.file_path || ''} ${video.title || ''}`
                  if (/\b(2160p|4k|uhd)\b/i.test(name)) return '4K UHD'
                  if (/\b1080p?\b/i.test(name)) return '1080p'
                  if (/\b720p?\b/i.test(name)) return '720p'
                  return null
                })()

                const contentRating = (video as any).certification || (video as any).content_rating || null

                const elements: React.ReactNode[] = []

                const displayYearOrDate = (isContentUpcoming && formattedUpcomingReleaseDate)
                  ? formattedUpcomingReleaseDate
                  : (video.release_year || (effectiveReleaseDate ? effectiveReleaseDate.slice(0, 4) : null))

                if (displayYearOrDate) {
                  elements.push(
                    <span key="year" className={`font-bold text-xs tracking-wide ${isLight ? 'text-slate-950' : 'text-white drop-shadow-sm'}`}>
                      {displayYearOrDate}
                    </span>
                  )
                }

                if (contentRating) {
                  elements.push(
                    <span key="cert" className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                      isLight
                        ? 'border border-slate-300 bg-slate-900/5 text-slate-800'
                        : 'border border-white/20 bg-white/10 text-white/90 drop-shadow-sm'
                    }`}>
                      {contentRating}
                    </span>
                  )
                }

                {/* Duration for Movies, Season count for Series */}
                if (video.type === 'series') {
                  const cachedCount = video.tmdb_id ? seriesSeasonCountCache.get(video.tmdb_id) : undefined
                  const seasonCount = seasons.length > 0
                    ? seasons.length
                    : (cachedCount || (trailerSeasons.length > 0 ? trailerSeasons.length : undefined))

                  if (seasonCount && seasonCount > 0) {
                    elements.push(
                      <span key="series-info" className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-white/85 drop-shadow-sm'}`}>
                        {seasonCount} {seasonCount === 1 ? 'Season' : 'Seasons'}
                      </span>
                    )
                  } else if (catalogLoading || loading || (!catalogLoaded && Boolean(video.tmdb_id))) {
                    elements.push(
                      <span
                        key="series-loading"
                        className={`inline-block h-3.5 w-16 rounded animate-pulse align-middle ${isLight ? 'bg-slate-200' : 'bg-white/10'}`}
                      />
                    )
                  } else if (video.season && video.season > 1) {
                    elements.push(
                      <span key="series-info" className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-white/85 drop-shadow-sm'}`}>
                        Season {video.season}
                      </span>
                    )
                  } else if (video.episode_count) {
                    elements.push(
                      <span key="series-info" className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-white/85 drop-shadow-sm'}`}>
                        {video.episode_count} Episodes
                      </span>
                    )
                  } else {
                    elements.push(
                      <span key="series-info" className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-white/85 drop-shadow-sm'}`}>
                        TV Series
                      </span>
                    )
                  }
                } else if (video.duration) {
                  const dur = formatDuration(video.duration)
                  if (dur) {
                    elements.push(
                      <span key="duration" className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-white/85 drop-shadow-sm'}`}>
                        {dur}
                      </span>
                    )
                  }
                }

                if (detectedQuality) {
                  elements.push(
                    <span key="quality" className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                      isLight
                        ? 'border border-slate-300 bg-slate-900/5 text-slate-800'
                        : 'border border-white/20 bg-white/10 text-white/90 drop-shadow-sm'
                    }`}>
                      {detectedQuality}
                    </span>
                  )
                }

                if (video.genres) {
                  const genreList = video.genres.split(',').map(g => g.trim()).filter(Boolean).slice(0, 2)
                  if (genreList.length > 0) {
                    elements.push(
                      <span key="genres" className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-white/75 drop-shadow-sm'}`}>
                        {genreList.join(' / ')}
                      </span>
                    )
                  }
                }

                return elements.map((item, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && (
                      <span className={`select-none font-bold text-xs ${isLight ? 'text-slate-400' : 'text-white/30'}`}>·</span>
                    )}
                    {item}
                  </React.Fragment>
                ))
              })()}
            </div>

            {/* Vibe Tags (Image 2: Translucent Tinted Capsules with Title Case) */}
            {(keywordsLoading || visibleVibes.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 min-h-[30px] max-w-2xl pt-0.5" aria-hidden={keywordsLoading}>
              {keywordsLoading ? (
                <>
                  <span className={`h-7 w-24 rounded-full border animate-pulse backdrop-blur-md ${isLight ? 'border-slate-200 bg-slate-200/70' : 'border-white/10 bg-white/[0.06]'}`} />
                  <span className={`h-7 w-20 rounded-full border animate-pulse backdrop-blur-md ${isLight ? 'border-slate-200 bg-slate-200/70' : 'border-white/10 bg-white/[0.06]'}`} />
                  <span className={`h-7 w-28 rounded-full border animate-pulse backdrop-blur-md hidden sm:block ${isLight ? 'border-slate-200 bg-slate-200/70' : 'border-white/10 bg-white/[0.06]'}`} />
                </>
              ) : (
                visibleVibes.map((vibe, idx) => (
                  <span
                    key={idx}
                    className={`px-3.5 py-1 text-xs font-semibold rounded-full border transition-all cursor-default detail-vibe-pill ${getAdaptiveVibeClass(vibe, isLight)}`}
                  >
                    {vibe}
                  </span>
                ))
              )}
            </div>
            )}

            {/* Overview */}
            <div className="relative w-full max-w-[485px] detail-overview-container">
              <p
                ref={overviewRef}
                className={`detail-overview-text text-white/75 text-sm md:text-[15px] leading-7 font-medium transition-all duration-300 ${
                  expandedOverview ? '' : 'line-clamp-3'
                }`}
              >
                {video.overview || 'No overview available for this title.'}
              </p>

              {video.overview && video.overview.length > 250 && (
                <button
                  onClick={() => setExpandedOverview(!expandedOverview)}
                  className="mt-2 text-xs font-black uppercase tracking-widest text-red-400 hover:text-red-300"
                >
                  {expandedOverview ? 'Read Less' : 'Read More'}
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-stretch gap-3 pt-2">
              {isLocalMedia && (
                <button 
                  onClick={() => onPlay(pickPreferredVersion(localVersions, video) || video)}
                  className="flex min-h-16 items-center justify-center gap-3 bg-red-600 hover:bg-red-500 text-white px-8 rounded-xl font-black text-xs tracking-[0.12em] transition-all shadow-[0_12px_30px_rgba(220,38,38,0.35)] hover:-translate-y-0.5 active:scale-95 group uppercase"
                >
                  <Play fill="white" size={20} className="group-hover:scale-110 transition-transform" />
                  {video.type === 'series' && (video.last_watched_time || 0) > 0 ? 'Continue' : 'Play Now'}
                </button>
              )}

              {isDownloadActive && (
                <div className="flex min-h-16 items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.055] px-7 text-xs font-black uppercase tracking-[0.12em] text-white/70">
                  <Download size={19} className="shrink-0 opacity-70" />
                  {matchingDownload?.status === 'paused'
                    ? `Paused • ${roundedDownloadProgress}% — resume from Downloads`
                    : `Downloading • ${roundedDownloadProgress}%${matchingDownload?.downloadSpeed ? ` / ${matchingDownload.downloadSpeed}` : ''}`}
                </div>
              )}

              {isTmdbBacked && video.tmdb_id && (
                <button
                  onClick={handleOpenDownloadOptions}
                  disabled={searching && sources.length === 0}
                  className={`detail-sources-btn flex min-h-16 items-center justify-center gap-3 rounded-xl px-7 text-xs font-black uppercase tracking-[0.12em] transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-wait disabled:opacity-55 ${
                    isLocalMedia || isDownloadActive
                      ? 'border border-white/10 bg-white/[0.055] text-white/70 hover:bg-white/[0.09] hover:text-white'
                      : 'bg-primary text-white shadow-[0_10px_30px_rgba(229,9,20,0.34)] hover:bg-primary/80'
                  }`}
                >
                  {searching && sources.length === 0 ? <Loader2 size={19} className="animate-spin" /> : <Download size={19} />}
                  {sourceActionLabel}
                </button>
              )}

              {streamResume && !isLocalMedia && (
                <div className="flex basis-full flex-wrap items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-400/[0.07] px-4 py-3">
                  <Play size={14} className="shrink-0 text-sky-300" fill="currentColor" />
                  <p className="text-[11px] font-bold text-sky-100/90">
                    Online resume available — continue from {formatResumeTime(streamResume.position)}
                    {streamResume.duration > 0 ? ` of ${formatResumeTime(streamResume.duration)}` : ''}
                  </p>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={handleOpenDownloadOptions}
                      className="rounded-lg bg-sky-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-sky-400 active:scale-95"
                    >
                      Resume
                    </button>
                    <button
                      onClick={async () => {
                        if (!primaryStreamIdentity) return
                        await safeDeleteStreamProgress(
                          primaryStreamIdentity.tmdb_id,
                          primaryStreamIdentity.media_type,
                          primaryStreamIdentity.season,
                          primaryStreamIdentity.episode
                        )
                        setStreamResume(null)
                      }}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/60 transition-all hover:bg-white/10 hover:text-white active:scale-95"
                    >
                      Restart
                    </button>
                  </div>
                </div>
              )}
              
              <div className="flex flex-col gap-4 basis-full pt-1">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">My Library</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleWatchlistButtonClick}
                          disabled={watchlistBusy}
                          className={`relative p-3.5 rounded-xl border transition-all hover:-translate-y-0.5 active:scale-95 glass-effect detail-watchlist-btn ${
                            isWatchlist
                              ? watchlistIntent === 'asap'
                                ? 'bg-red-500/20 border-red-500 text-red-400 shadow-[0_8px_24px_rgba(239,68,68,0.25)]'
                                : watchlistIntent === 'weekend'
                                  ? 'bg-violet-500/20 border-violet-400 text-violet-300 shadow-[0_8px_24px_rgba(139,92,246,0.25)]'
                                  : 'bg-teal-400/15 border-teal-300/60 text-teal-200 shadow-[0_8px_24px_rgba(45,212,191,0.2)]'
                              : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                          } disabled:opacity-50 disabled:cursor-wait`}
                          title={isWatchlist ? `In Watchlist · ${watchlistIntent ? WATCHLIST_INTENT_META[watchlistIntent].label : ''} — click to change` : 'Save to Watchlist — pick ASAP, Weekend or Someday'}
                        >
                          {watchlistBusy ? <Loader2 size={20} className="animate-spin" /> : <Bookmark size={20} fill={isWatchlist ? "currentColor" : "none"} />}
                          {isWatchlist && watchlistIntent && (
                            <span className={`absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-[#080d16] detail-watchlist-badge ${
                              watchlistIntent === 'asap' ? 'bg-gradient-to-br from-red-500 to-orange-500 text-white'
                              : watchlistIntent === 'weekend' ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white'
                              : 'bg-gradient-to-br from-teal-400 to-emerald-600 text-white'
                            }`}>
                              {watchlistIntent === 'asap' ? <Zap size={12} fill="currentColor" />
                                : watchlistIntent === 'weekend' ? <CalendarDays size={12} />
                                : <Hourglass size={12} />}
                            </span>
                          )}
                        </button>
                        {isWatchlist && watchlistIntent && (
                          <button
                            onClick={handleWatchlistButtonClick}
                            className={`flex h-12 items-center gap-2 rounded-xl border px-3.5 text-[10px] font-black uppercase tracking-[0.14em] transition-all hover:-translate-y-0.5 active:scale-95 glass-effect detail-watchlist-pill ${
                              watchlistIntent === 'asap' ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/15'
                              : watchlistIntent === 'weekend' ? 'border-violet-400/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15'
                              : 'border-teal-300/30 bg-teal-400/10 text-teal-200 hover:bg-teal-400/15'
                            }`}
                            title="Change when you'll watch this"
                          >
                            {watchlistIntent === 'asap' ? <Zap size={13} fill="currentColor" />
                              : watchlistIntent === 'weekend' ? <CalendarDays size={13} />
                              : <Hourglass size={13} />}
                            {WATCHLIST_INTENT_META[watchlistIntent].label}
                          </button>
                        )}
                      </div>
                      {showIntentPicker && (
                        <>
                          <button
                            aria-label="Close watchlist menu"
                            onClick={closeIntentMenu}
                            className="fixed inset-0 z-20 cursor-default bg-transparent"
                          />
                          <div
                            role="menu"
                            aria-label="Choose watchlist lane"
                            className="absolute bottom-full left-0 z-30 mb-2.5 w-[248px] rounded-xl border border-white/10 bg-[#121826] p-1 shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
                          >
                            {([
                              { id: 'asap' as WatchlistIntent, label: 'ASAP', sub: 'Watch as soon as possible', icon: <Zap size={14} fill="currentColor" />, tile: 'bg-red-500/15 text-red-400' },
                              { id: 'weekend' as WatchlistIntent, label: 'Weekend', sub: 'Upcoming weekends', icon: <CalendarDays size={14} />, tile: 'bg-violet-500/15 text-violet-300' },
                              { id: 'someday' as WatchlistIntent, label: 'Someday', sub: 'When nothing else to watch', icon: <Hourglass size={14} />, tile: 'bg-teal-400/10 text-teal-200' }
                            ]).map(lane => {
                              const isCurrent = isWatchlist && watchlistIntent === lane.id
                              const isLoading = intentBusy === lane.id
                              return (
                                <button
                                  key={lane.id}
                                  role="menuitem"
                                  onClick={() => void handleIntentSelect(lane.id)}
                                  disabled={watchlistBusy || Boolean(intentBusy) || intentRemoving}
                                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06] disabled:cursor-wait disabled:opacity-60 ${isCurrent ? 'bg-white/[0.05]' : ''}`}
                                >
                                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${lane.tile}`}>
                                    {isLoading ? <Loader2 size={14} className="animate-spin" /> : lane.icon}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[12px] font-bold leading-tight text-white">{lane.label}</span>
                                    <span className="block truncate text-[10px] font-medium leading-tight text-white/40">{lane.sub}</span>
                                  </span>
                                  {isCurrent && <CheckCircle2 size={14} className="shrink-0 text-white/60" />}
                                </button>
                              )
                            })}
                            {isWatchlist && (
                              <>
                                <div className="mx-2 my-1 border-t border-white/[0.07]" />
                                <button
                                  role="menuitem"
                                  onClick={() => void handleIntentRemove()}
                                  disabled={watchlistBusy || Boolean(intentBusy) || intentRemoving}
                                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-white/45 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-wait disabled:opacity-60"
                                >
                                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                                    {intentRemoving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[12px] font-bold leading-tight">Remove</span>
                                    <span className="block truncate text-[10px] font-medium leading-tight opacity-60">Take it off the list</span>
                                  </span>
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="relative">
                      <button
                        onClick={handleCollectionButtonClick}
                        className={`relative p-3.5 rounded-xl border transition-all hover:-translate-y-0.5 active:scale-95 glass-effect ${
                          filedCollectionCount > 0
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                        }`}
                        title={filedCollectionCount > 0 ? `In ${filedCollectionCount} collection${filedCollectionCount === 1 ? '' : 's'} — click to manage` : 'Add to a collection'}
                      >
                        <Layers size={20} />
                        {filedCollectionCount > 0 && (
                          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-white ring-2 ring-[#080d16] detail-collection-badge">
                            {filedCollectionCount}
                          </span>
                        )}
                      </button>
                      {showCollectionMenu && (
                        <>
                          <button
                            aria-label="Close collections menu"
                            onClick={closeCollectionMenu}
                            className="fixed inset-0 z-20 cursor-default bg-transparent"
                          />
                          <div
                            role="menu"
                            aria-label="Add to collection"
                            className="absolute bottom-full left-0 z-30 mb-2.5 w-[280px] rounded-xl border border-white/10 bg-[#121826] p-1 shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
                          >
                            <p className="px-2.5 pb-1 pt-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/35">
                              Add to collection
                            </p>
                            {collectionToast && (
                              <p className="px-2.5 pb-1 text-center text-[10px] font-bold text-emerald-300">
                                {collectionToast}
                              </p>
                            )}
                            {collectionsLoading ? (
                              <div className="space-y-1 p-1">
                                {[1, 2, 3].map(i => (
                                  <div key={i} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                                    <div className="h-8 w-6 shrink-0 animate-pulse rounded bg-white/10" />
                                    <div className="flex-1 space-y-1.5">
                                      <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
                                      <div className="h-2 w-1/3 animate-pulse rounded bg-white/10" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : collections.length === 0 ? (
                              <p className="px-2.5 pb-2 pt-1 text-[11px] font-medium leading-snug text-white/40">
                                No collections yet — create your first below.
                              </p>
                            ) : (
                              <div className="max-h-[228px] overflow-y-auto scrollbar-thin">
                                {collections.map(entry => {
                                  const isMember = entry.matches.length > 0
                                  const isLoading = collectionBusyId === entry.id
                                  return (
                                    <button
                                      key={entry.id}
                                      role="menuitem"
                                      onClick={() => void handleToggleCollection(entry)}
                                      disabled={collectionBusyId != null || createBusy}
                                      title={isMember ? `In ${entry.name} — click to remove` : `Add to ${entry.name}`}
                                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06] disabled:cursor-wait disabled:opacity-60 ${isMember ? 'bg-white/[0.05]' : ''}`}
                                    >
                                      {entry.cover ? (
                                        <img
                                          src={entry.cover}
                                          alt=""
                                          loading="lazy"
                                          className="h-8 w-6 shrink-0 rounded object-cover ring-1 ring-white/10"
                                        />
                                      ) : (
                                        <span className="flex h-8 w-6 shrink-0 items-center justify-center rounded bg-white/[0.06] text-white/35">
                                          <Layers size={13} />
                                        </span>
                                      )}
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[12px] font-bold leading-tight text-white">{entry.name}</span>
                                        <span className="block text-[10px] font-medium leading-tight text-white/40">
                                          {entry.memberCount} title{entry.memberCount === 1 ? '' : 's'}
                                        </span>
                                      </span>
                                      {isLoading
                                        ? <Loader2 size={14} className="shrink-0 animate-spin text-white/60" />
                                        : isMember
                                          ? <CheckCircle2 size={14} className="shrink-0 text-emerald-300" />
                                          : null}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                            <div className="mx-2 my-1 border-t border-white/[0.07]" />
                            {creatingCollection ? (
                              <div className="flex items-center gap-2 p-1">
                                <input
                                  autoFocus
                                  value={newCollectionName}
                                  onChange={e => setNewCollectionName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') void handleCreateCollection()
                                    else if (e.key === 'Escape') {
                                      e.stopPropagation()
                                      setCreatingCollection(false)
                                      setNewCollectionName('')
                                    }
                                  }}
                                  placeholder="Collection name…"
                                  maxLength={60}
                                  disabled={createBusy}
                                  className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 text-[12px] font-semibold text-white outline-none placeholder:text-white/25 focus:border-primary/50 disabled:opacity-60"
                                />
                                <button
                                  onClick={() => void handleCreateCollection()}
                                  disabled={!newCollectionName.trim() || createBusy}
                                  title="Create and add this title"
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {createBusy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={3} />}
                                </button>
                              </div>
                            ) : (
                              <button
                                role="menuitem"
                                onClick={() => setCreatingCollection(true)}
                                disabled={collectionBusyId != null || createBusy}
                                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-60"
                              >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                                  <Plus size={14} strokeWidth={2.5} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[12px] font-bold leading-tight">New collection…</span>
                                  <span className="block truncate text-[10px] font-medium leading-tight opacity-60">Create and add this title</span>
                                </span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    {video.tmdb_id && (video.type === 'series' || (video.type === 'movie' && !isMovieOnOtt && !releaseInfoLoading)) && (
                      <div className="relative">
                        <button
                          onClick={handleToggleFollow}
                          disabled={followBusy}
                          className={`p-3.5 rounded-xl border transition-all hover:-translate-y-0.5 active:scale-95 glass-effect detail-follow-btn ${
                            isFollowing ? 'bg-sky-500/20 border-sky-400 text-sky-300' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                          } disabled:opacity-50 disabled:cursor-wait`}
                          title={
                            video.type === 'movie'
                              ? isFollowing ? 'Following — click to unfollow OTT alerts' : 'Follow for OTT release alert'
                              : isFollowing ? 'Following — click to unfollow new-episode alerts' : 'Follow for new-episode alerts'
                          }
                        >
                          {followBusy ? <Loader2 size={20} className="animate-spin" /> : isFollowing ? <BellRing size={20} /> : <Bell size={20} />}
                        </button>
                        <FollowGuide />
                      </div>
                    )}
                    {isLocalMedia && (
                      <button
                        onClick={handleShowInfo}
                        className="flex h-12 w-12 items-center justify-center bg-white/5 border border-white/10 rounded-xl text-white/40 hover:text-white transition-all hover:-translate-y-0.5 active:scale-95 glass-effect"
                        title="View Media Info"
                      >
                        <Info size={20} />
                      </button>
                    )}
                    {video.tmdb_id && (video.type === 'movie' || video.type === 'series') && (
                      <div className="relative">
                        <button
                          onClick={handleShare}
                          className="flex h-12 items-center gap-2 px-4 bg-white/5 border border-white/10 rounded-xl text-white/45 hover:text-white hover:border-cyan-400/30 hover:bg-cyan-400/10 transition-all hover:-translate-y-0.5 active:scale-95 glass-effect group"
                          title="Share this title"
                        >
                          {shareCopied ? <CheckCircle2 size={18} /> : <Share2 size={18} />}
                        </button>
                        <ShareHintGuide />
                      </div>
                    )}
                    {!video.isExternal && (
                      <>
                        <button
                          onClick={handleOpenFolder}
                          className="flex h-12 w-12 items-center justify-center bg-white/5 border border-white/10 rounded-xl text-white/40 hover:text-white transition-all hover:-translate-y-0.5 active:scale-95 glass-effect"
                          title="Open Folder"
                        >
                          <FolderOpen size={20} />
                        </button>
                        <div className="relative">
                          <button
                            onClick={handleDeleteFile}
                            className="flex h-12 w-12 items-center justify-center bg-white/5 border border-white/10 rounded-xl text-white/40 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all hover:-translate-y-0.5 active:scale-95 glass-effect"
                            title="Delete completely from disk"
                          >
                            <Trash2 size={20} />
                          </button>
                          <DeleteHintGuide />
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Research & Reviews</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {isTmdbBacked && (
                      <button
                        onClick={handleOpenTrailer}
                        className="flex h-12 items-center justify-center gap-2 px-4 bg-white/5 border border-white/10 rounded-xl text-white/45 hover:text-white hover:border-red-500/30 hover:bg-red-600/10 transition-all hover:-translate-y-0.5 active:scale-95 glass-effect"
                        title={trailer ? 'Watch trailer' : 'Find trailer'}
                      >
                        <Clapperboard size={19} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Trailer</span>
                      </button>
                    )}
                    {isTmdbBacked && (
                      <button
                        onClick={handleOpenMoctale}
                        className="flex h-12 items-center gap-2 px-4 bg-white/5 border border-white/10 rounded-xl text-white/45 hover:text-white hover:border-red-500/30 hover:bg-red-600/10 transition-all hover:-translate-y-0.5 active:scale-95 glass-effect"
                        title="Open reviews on Moctale"
                      >
                        <ExternalLink size={18} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Moctale</span>
                      </button>
                    )}
                    <button
                      onClick={handleOpenGoogleSearch}
                      className="flex h-12 w-12 items-center justify-center bg-white/5 border border-white/10 rounded-xl text-white/45 hover:text-white hover:border-blue-500/30 hover:bg-blue-600/10 transition-all hover:-translate-y-0.5 active:scale-95 glass-effect group"
                      title="Search on Google"
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" className="opacity-80 group-hover:opacity-100 transition-opacity">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    </button>
                    {isTmdbBacked && (
                      <button
                        onClick={handleOpenLetterboxd}
                        className="flex h-12 items-center gap-2 px-4 bg-white/5 border border-white/10 rounded-xl text-white/45 hover:text-white hover:border-green-500/30 hover:bg-green-600/10 transition-all hover:-translate-y-0.5 active:scale-95 glass-effect"
                        title="Open reviews on Letterboxd"
                      >
                        <Star size={18} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Letterboxd</span>
                      </button>
                    )}
                  </div>
                </div>
                {/* Official Streaming Sources (Option A) */}
                {isTmdbBacked && (releaseInfoLoading || (releaseInfo?.providers && releaseInfo.providers.length > 0) || releaseInfo?.justWatchLink) && (
                  <div ref={officialSourcesRef}>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                        Official Streaming Sources
                      </p>
                      {releaseInfo?.region && (
                        <span className="rounded-md bg-white/[0.06] border border-white/10 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white/50 uppercase">
                          {releaseInfo.region}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {releaseInfoLoading ? (
                        <>
                          <div className="h-12 w-36 rounded-xl bg-white/5 animate-pulse border border-white/10" />
                          <div className="h-12 w-32 rounded-xl bg-white/5 animate-pulse border border-white/10" />
                        </>
                      ) : releaseInfo?.providers && releaseInfo.providers.length > 0 ? (
                        <>
                          {releaseInfo.providers.map(p => (
                            <button
                              key={p.provider_name}
                              onClick={() => void handleOpenStreamingProvider(p)}
                              className="group flex h-12 max-w-[195px] shrink-0 items-center gap-2.5 px-3.5 bg-white/5 border border-white/10 rounded-xl hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all hover:-translate-y-0.5 active:scale-95 glass-effect text-white/80 hover:text-white shadow-sm"
                              title={`Watch on ${p.provider_name}`}
                            >
                              {p.logo_path ? (
                                <img
                                  src={p.logo_path}
                                  alt={p.provider_name}
                                  className="h-6 w-6 shrink-0 rounded-lg object-cover shadow-sm group-hover:scale-105 transition-transform"
                                />
                              ) : (
                                <Tv size={18} className="shrink-0 text-emerald-400" />
                              )}
                              <span className="truncate max-w-[120px] text-[11px] font-bold tracking-tight text-white/90 group-hover:text-white">
                                {p.provider_name}
                              </span>
                              <ExternalLink size={13} className="shrink-0 text-white/30 group-hover:text-emerald-300 transition-colors ml-auto" />
                            </button>
                          ))}
                          {releaseInfo.justWatchLink && (
                            <button
                              onClick={handleOpenJustWatch}
                              className="flex h-12 shrink-0 items-center gap-1.5 px-3.5 bg-white/[0.03] border border-white/10 rounded-xl text-white/40 hover:text-white hover:border-white/20 hover:bg-white/[0.06] transition-all hover:-translate-y-0.5 active:scale-95 glass-effect text-[10px] font-bold uppercase tracking-wider"
                              title="View full streaming guide on JustWatch"
                            >
                              <span className="text-amber-400 font-black">JW</span>
                              <span>JustWatch</span>
                              <ExternalLink size={12} className="opacity-60 shrink-0" />
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 text-white/50 text-[11px] font-medium py-1">
                          <AlertCircle size={14} className="text-white/30 shrink-0" />
                          <span>Not currently streaming on subscription platforms in {releaseInfo?.region || 'your region'}.</span>
                          <button
                            onClick={() => window.api.openExternalUrl?.(`https://www.netflix.com/search?q=${encodeURIComponent(displayTitle)}`)}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-600/20 hover:text-red-300 border border-white/10 text-[10px] font-bold tracking-wide transition-colors flex items-center gap-1"
                            title="Check directly on Netflix"
                          >
                            <span>Check Netflix</span>
                            <ExternalLink size={10} className="opacity-60" />
                          </button>
                          <button
                            onClick={() => window.api.openExternalUrl?.(`https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(displayTitle)}`)}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-sky-600/20 hover:text-sky-300 border border-white/10 text-[10px] font-bold tracking-wide transition-colors flex items-center gap-1"
                            title="Check directly on Prime Video"
                          >
                            <span>Check Prime</span>
                            <ExternalLink size={10} className="opacity-60" />
                          </button>
                          {releaseInfo?.justWatchLink && (
                            <button
                              onClick={handleOpenJustWatch}
                              className="text-primary hover:underline text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ml-1"
                            >
                              JustWatch <ExternalLink size={11} className="shrink-0" />
                            </button>
                          )}
                          {isFollowing && (
                            <button
                              onClick={() => {
                                if (video.tmdb_id) {
                                  void safeUnfollowMovie(video.tmdb_id)
                                  void safeMarkFollowedMovieSeen(video.tmdb_id)
                                  setIsFollowing(false)
                                }
                              }}
                              className="text-amber-400/80 hover:text-amber-300 text-[10px] font-bold underline ml-1 cursor-pointer"
                              title="Dismiss OTT tracking for this movie"
                            >
                              Already on OTT? Dismiss alert
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Download Websites</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => void handleOpenDownloadSite('hdmovies', 'HDHub4u')}
                      disabled={resolvingSiteId !== null}
                      className="flex h-12 items-center justify-center px-4 bg-white/5 border border-white/10 rounded-xl hover:border-rose-500/30 hover:bg-rose-600/10 transition-all hover:-translate-y-0.5 active:scale-95 glass-effect disabled:opacity-60 disabled:cursor-wait"
                      title="Search this title on HDHub4u (latest working link)"
                    >
                      {resolvingSiteId === 'hdmovies'
                        ? <Loader2 size={18} className="animate-spin text-white/45" />
                        : <img src={hdHub4uLogo} alt="HDHub4u" className="h-7 w-auto max-w-[130px] object-contain" />}
                    </button>
                    <button
                      onClick={() => void handleOpenDownloadSite('catmovies', 'KatMovieHD')}
                      disabled={resolvingSiteId !== null}
                      className="flex h-12 items-center justify-center px-4 bg-white/5 border border-white/10 rounded-xl hover:border-cyan-500/30 hover:bg-cyan-600/10 transition-all hover:-translate-y-0.5 active:scale-95 glass-effect disabled:opacity-60 disabled:cursor-wait"
                      title="Search this title on KatMovieHD (latest working link)"
                    >
                      {resolvingSiteId === 'catmovies'
                        ? <Loader2 size={18} className="animate-spin text-white/45" />
                        : <img src={katMovieHdLogo} alt="KatMovieHD" className="h-7 w-auto max-w-[130px] object-contain" />}
                    </button>
                  </div>
                  {(downloadSiteError || downloadSiteNotice) && (
                    <div className="mt-2">
                      {downloadSiteError && (
                        <p className="text-[11px] font-semibold text-red-400">{downloadSiteError}</p>
                      )}
                      {downloadSiteNotice && (
                        <p className="text-[11px] font-semibold text-amber-400">{downloadSiteNotice}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Share Modal */}
            {showShareModal && sharePayload && createPortal(
              <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setShowShareModal(false)}>
                <div
                  className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0f141d]/70 backdrop-blur-2xl shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
                        <Share2 size={18} />
                      </div>
                      <div>
                        <h3 className="text-[13px] font-black text-white uppercase tracking-widest leading-none">Share Title</h3>
                        <p className="mt-1 max-w-[260px] truncate text-[11px] font-medium text-white/35">{sharePayload.mediaTitle}</p>
                      </div>
                    </div>
                    <button onClick={() => setShowShareModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                      <p className="line-clamp-2 text-sm font-semibold text-white/80">{sharePayload.shareTitle}</p>
                      <p className="mt-2 break-all text-xs font-medium text-cyan-200/75">{sharePayload.shareUrl}</p>
                    </div>

                    {shareFeedback && (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-black uppercase tracking-widest text-emerald-300">
                        <CheckCircle2 size={15} />
                        {shareFeedback}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => openShareUrl(`https://wa.me/?text=${encodeURIComponent(sharePayload.shareText)}`)}
                        className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-white/75 transition-all hover:border-emerald-400/35 hover:bg-emerald-400/10 hover:text-white"
                      >
                        <MessageCircle size={22} className="text-emerald-300" />
                        <span className="text-[11px] font-black uppercase tracking-widest">WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openShareUrl(`https://t.me/share/url?url=${encodeURIComponent(sharePayload.shareUrl)}&text=${encodeURIComponent(sharePayload.shareTitle)}`)}
                        className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-white/75 transition-all hover:border-sky-400/35 hover:bg-sky-400/10 hover:text-white"
                      >
                        <Send size={22} className="text-sky-300" />
                        <span className="text-[11px] font-black uppercase tracking-widest">Telegram</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => copyShareText(sharePayload.shareUrl, 'Copied link')}
                        className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-white/75 transition-all hover:border-cyan-400/35 hover:bg-cyan-400/10 hover:text-white"
                      >
                        <Copy size={22} className="text-cyan-300" />
                        <span className="text-[11px] font-black uppercase tracking-widest">Copy Link</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => copyShareText(sharePayload.shareText, 'Copied message')}
                        className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-white/75 transition-all hover:border-violet-400/35 hover:bg-violet-400/10 hover:text-white"
                      >
                        <Share2 size={22} className="text-violet-300" />
                        <span className="text-[11px] font-black uppercase tracking-widest">Copy Text</span>
                      </button>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleNativeShare}
                        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-red-500"
                      >
                        <Share2 size={16} />
                        More Options
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          copyShareText(sharePayload.shareUrl, 'Copied link')
                          openShareUrl('https://www.instagram.com/direct/inbox/')
                        }}
                        className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-black uppercase tracking-widest text-white/70 transition-all hover:bg-white/[0.08] hover:text-white"
                      >
                        Instagram
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {/* Media Info Modal */}
            {showInfoModal && createPortal(
              <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setShowInfoModal(false)}>
                <div
                  className="relative w-full max-w-lg bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                        <Info size={18} />
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
              </div>,
              document.body
            )}

            {showTrailerModal && createPortal(
              <div
                className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
                onClick={() => setShowTrailerModal(false)}
              >
                <div
                  className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f0f]/70 backdrop-blur-3xl shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-4 border-b border-white/5 bg-white/[0.02] px-6 py-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                        <Clapperboard size={18} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-[13px] font-black uppercase tracking-widest text-white leading-none">
                          {trailer?.label || (activeTrailerSeason ? `Season ${activeTrailerSeason} Trailer` : 'Trailer')} {trailerLoading ? 'Loading' : 'Playing'}
                        </h3>
                        <p className="truncate text-[11px] font-medium text-white/35 mt-1">{trailer?.name || 'Finding the best playable trailer...'}</p>
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
                                  ? 'bg-red-500 text-white'
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
                        className="hidden sm:flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-black uppercase tracking-widest text-white/45 transition-all hover:text-white hover:bg-white/[0.08]"
                      >
                        <ExternalLink size={13} />
                        YouTube
                      </button>
                      <button onClick={() => setShowTrailerModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all ml-1">
                        <X size={18} />
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
                        key={trailer.embedUrl}
                        src={trailer.embedUrl}
                        title={trailer.name || 'Trailer'}
                        className="absolute inset-0 h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="no-referrer-when-downgrade"
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
              </div>,
              document.body
            )}

            {/* Franchise Timeline Rail (Prequels & Sequels - Option B) */}
            {video.type === 'movie' && (franchiseLoading || (franchise && franchise.parts && franchise.parts.length > 1)) && (
              <div className="border-t border-white/[0.08] pt-8 space-y-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-lg font-bold tracking-tight text-white">
                      {franchise?.collectionName || 'Franchise Timeline'}
                    </h3>
                    {franchise?.parts && (
                      <span className="text-[10px] font-semibold tracking-wide text-white/40 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10">
                        {franchise.parts.length} Films · Release Order
                      </span>
                    )}
                  </div>
                </div>

                {franchiseLoading ? (
                  <div className="flex items-center gap-3 py-6">
                    <Loader2 size={18} className="animate-spin text-primary" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Loading timeline...</span>
                  </div>
                ) : franchise && franchise.parts ? (
                  <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scrollbar-thin">
                    {franchise.parts.map((part, idx) => {
                      const isCurrent = part.id === video.tmdb_id
                      const currentRelDate = video.release_date || (video.release_year ? `${video.release_year}-01-01` : '')
                      const partRelDate = part.releaseDate || (part.releaseYear ? `${part.releaseYear}-01-01` : '')
                      
                      let partType: 'current' | 'prequel' | 'sequel' | 'upcoming' = 'sequel'
                      if (isCurrent) {
                        partType = 'current'
                      } else if (partRelDate && currentRelDate && partRelDate < currentRelDate) {
                        partType = 'prequel'
                      } else if (partRelDate && currentRelDate && partRelDate > currentRelDate) {
                        partType = 'sequel'
                      } else if (!partRelDate) {
                        partType = 'upcoming'
                      }

                      const localMatch = localLibraryVideos.find(v => v.tmdb_id === part.id || (v.title && part.title && v.title.toLowerCase() === part.title.toLowerCase()))

                      return (
                        <div
                          key={part.id}
                          onClick={() => {
                            if (isCurrent) return
                            const targetVideo: Video = localMatch ? { ...localMatch } : {
                              id: 0,
                              title: part.title,
                              file_path: '',
                              type: 'movie',
                              tmdb_id: part.id,
                              poster_path: part.posterPath || undefined,
                              backdrop_path: part.backdropPath || undefined,
                              overview: part.overview || undefined,
                              release_date: part.releaseDate || undefined,
                              release_year: part.releaseYear,
                              vote_average: part.voteAverage,
                              isExternal: true
                            }
                            if (onShowDetail) {
                              onShowDetail(targetVideo)
                            }
                          }}
                          className={`group relative flex-shrink-0 w-36 sm:w-40 transition-all duration-300 ${
                            isCurrent ? 'cursor-default' : 'cursor-pointer select-none active:scale-95'
                          }`}
                        >
                          {/* Poster Container — Minimal, rounded, no bulky outer card box */}
                          <div className={`relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-white/5 transition-all duration-300 ${
                            isCurrent
                              ? 'ring-2 ring-primary ring-offset-2 ring-offset-black shadow-[0_0_20px_rgba(229,9,20,0.35)] -translate-y-1'
                              : 'hover:-translate-y-1.5 hover:shadow-xl ring-1 ring-white/10 hover:ring-white/25'
                          }`}>
                            {part.posterPath ? (
                              <img
                                src={part.posterPath}
                                alt={part.title}
                                loading="lazy"
                                decoding="async"
                                className={`h-full w-full object-cover transition-transform duration-500 ${
                                  isCurrent ? 'scale-100' : 'group-hover:scale-105'
                                }`}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-white/20">
                                <Film size={26} />
                              </div>
                            )}

                            {/* Clean, frosted micro-badge top-left */}
                            <div className="absolute top-2 left-2 z-10">
                              {partType === 'current' ? (
                                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-primary text-white shadow">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                  Now
                                </span>
                              ) : partType === 'prequel' ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-black/65 text-purple-300 backdrop-blur-md border border-purple-500/30 shadow-sm">
                                  Prequel
                                </span>
                              ) : partType === 'sequel' ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-black/65 text-emerald-300 backdrop-blur-md border border-emerald-500/30 shadow-sm">
                                  Sequel
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-black/65 text-amber-300 backdrop-blur-md border border-amber-500/30 shadow-sm">
                                  Upcoming
                                </span>
                              )}
                            </div>

                            {/* Order Index Badge top-right */}
                            <div className="absolute top-2 right-2 z-10">
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold tabular-nums bg-black/60 text-white/70 backdrop-blur-md border border-white/10">
                                #{idx + 1}
                              </span>
                            </div>

                            {/* Downloaded badge bottom-left */}
                            {localMatch && (
                              <div className="absolute bottom-2 left-2 z-10">
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider bg-emerald-500 text-white shadow">
                                  <HardDrive size={9} />
                                  Saved
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Title & Metadata below poster */}
                          <div className="mt-2 space-y-0.5">
                            <h4 className={`text-xs font-semibold line-clamp-1 leading-snug transition-colors ${
                              isCurrent ? 'text-primary' : 'text-white/90 group-hover:text-primary'
                            }`}>
                              {part.title}
                            </h4>
                            <div className="flex items-center justify-between text-[11px] font-medium text-white/40">
                              <span>{part.releaseYear || 'TBA'}</span>
                              {part.voteAverage ? (
                                <span className="flex items-center gap-1 text-amber-400">
                                  <Star size={10} fill="currentColor" />
                                  <span className="tabular-nums font-bold text-[10px]">{part.voteAverage}</span>
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )}

            {/* Series Episodes Accordion (Option B: Compact Expandable In-Place) */}
            {video.type === 'series' && (loading || catalogLoading || episodeRows.length > 0) && (
              <div
                ref={seriesAccordionRef}
                style={{
                  maxWidth: isEpisodesExpanded
                    ? '42rem'
                    : collapsedPillWidth ? `${collapsedPillWidth}px` : 'max-content'
                }}
                className={`cinema-series-card relative ${isEpisodesExpanded ? 'w-full' : 'w-fit'} rounded-2xl border overflow-hidden ${
                isLight
                  ? 'border-slate-200/90 bg-white/95 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-slate-300'
                  : 'border-white/10 bg-[#0c1017]/90 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.4)] hover:border-white/20'
              }`}>
                {/* Just dropped notification banner */}
                {newDrop && (
                  <div ref={newDropRef} className={`border-b px-3.5 py-1.5 flex flex-wrap items-center gap-2.5 ${
                    isLight ? 'border-sky-200/80 bg-sky-50/80 text-sky-900' : 'border-sky-400/20 bg-sky-500/10 backdrop-blur-md text-white'
                  }`}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-500/20 text-sky-400">
                      <BellRing size={11} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[7.5px] font-black uppercase tracking-[0.2em] text-sky-500">Just dropped</p>
                      <p className="truncate text-[11px] font-semibold">
                        {formatSeasonEpisode(newDrop.season, newDrop.episode)} is out — click to watch
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (video.tmdb_id) void safeMarkFollowedSeen(video.tmdb_id)
                        setNewDrop(null)
                        void handleOpenEpisodeSources(newDrop.season, newDrop.episode)
                      }}
                      className="shrink-0 rounded-lg bg-sky-500 px-2 py-0.5 text-[8.5px] font-black uppercase tracking-widest text-white transition-all hover:bg-sky-400 active:scale-95 shadow-sm shadow-sky-500/25"
                    >
                      Watch
                    </button>
                  </div>
                )}

                {/* Unified Interactive Accordion Header Bar (Entire Row is Clickable) */}
                <button
                  type="button"
                  onClick={handleToggleEpisodes}
                  className={`group w-full px-3 py-1.5 sm:px-3.5 sm:py-2 flex items-center ${
                    isEpisodesExpanded ? 'justify-between' : 'justify-start gap-2.5 sm:gap-3'
                  } text-left transition-colors duration-200 select-none cursor-pointer whitespace-nowrap ${
                    isLight
                      ? 'hover:bg-slate-50/90 active:bg-slate-100/80'
                      : 'hover:bg-white/[0.04] active:bg-white/[0.08]'
                  }`}
                >
                  {/* Left: Glanceable Compact Overview */}
                  <div ref={pillLeftContentRef} className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 ${
                      isLight ? 'bg-primary/10 text-primary' : 'bg-primary/15 text-primary'
                    }`}>
                      <Clapperboard size={12} />
                    </span>

                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <h4 className={`text-xs sm:text-[13px] font-bold tracking-tight transition-colors duration-200 ${
                        isLight ? 'text-slate-900 group-hover:text-primary' : 'text-white group-hover:text-primary'
                      }`}>
                        {seasons.length > 1 ? `Season ${activeSeasonNumber}` : 'Season 1'}
                      </h4>
                      <span className={`text-[10.5px] font-semibold ${isLight ? 'text-slate-400' : 'text-white/40'}`}>
                        ({currentSeasonEpisodes.length} eps)
                      </span>
                    </div>

                    {/* Micro release pills */}
                    <div className="flex items-center gap-1.5 text-[9.5px] font-semibold">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                        isLight
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {releasedEpisodesCount} Released
                      </span>

                      {upcomingEpisodesCount > 0 && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                          isLight
                            ? 'bg-amber-50 text-amber-700 border border-amber-200/70'
                            : 'bg-amber-400/10 text-amber-300 border border-amber-400/20'
                        }`}>
                          <Calendar size={8.5} />
                          {upcomingEpisodesCount} Upcoming
                        </span>
                      )}

                      {libraryEpisodesCount > 0 && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                          isLight
                            ? 'bg-sky-50 text-sky-700 border border-sky-200/70'
                            : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                        }`}>
                          <HardDrive size={8.5} />
                          {libraryEpisodesCount} Saved
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Toggle label & chevron */}
                  <div
                    ref={pillRightContentRef}
                    className={`flex items-center gap-1.5 shrink-0 ${
                      isEpisodesExpanded
                        ? 'pl-1'
                        : isLight
                          ? 'pl-2 border-l border-slate-200/90 ml-0.5'
                          : 'pl-2 border-l border-white/10 ml-0.5'
                    }`}
                  >
                    <span className={`text-[10.5px] font-semibold transition-colors duration-200 ${
                      isEpisodesExpanded
                        ? 'text-primary'
                        : isLight ? 'text-slate-500 group-hover:text-slate-800' : 'text-white/50 group-hover:text-white'
                    }`}>
                      {isEpisodesExpanded ? 'Close' : 'Episodes'}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        isEpisodesExpanded
                          ? 'rotate-180 text-primary'
                          : isLight
                            ? 'text-slate-400 group-hover:text-slate-700'
                            : 'text-white/40 group-hover:text-white'
                      }`}
                    />
                  </div>
                </button>

                {/* Collapsible Accordion Content (Option B: Industry-Grade Smooth CSS Grid Expansion) */}
                <div className={`cinema-accordion-wrapper ${isEpisodesExpanded ? 'is-expanded' : ''}`}>
                  <div className="cinema-accordion-inner">
                    <div className={`cinema-accordion-content border-t ${
                      isLight ? 'border-slate-200/80 bg-slate-50/60' : 'border-white/[0.08] bg-black/35'
                    } p-2.5 sm:p-3 space-y-2.5 w-full min-w-[min(100%,38rem)]`}>
                      {/* Season Segmented Switcher (if multi-season) */}
                      {seasons.length > 1 && (
                        <div className={`flex items-center gap-1 overflow-x-auto p-1 rounded-xl border scrollbar-none ${
                          isLight ? 'bg-slate-200/50 border-slate-200' : 'bg-black/50 border-white/10'
                        }`}>
                          {seasons.map(s => {
                            const isSel = (selectedSeason || seasons[0] || 1) === s
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setSelectedSeason(s)}
                                className={`h-6 sm:h-6.5 px-2.5 sm:px-3 rounded-lg text-[10.5px] font-bold transition-all duration-200 ease-out whitespace-nowrap ${
                                  isSel
                                    ? 'bg-primary text-white shadow-sm shadow-primary/25'
                                    : isLight
                                      ? 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                                      : 'text-white/60 hover:text-white hover:bg-white/5'
                                }`}
                              >
                                Season {s}
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* Compact Episodes 2-Column Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
                        {loading || catalogLoading ? (
                          <div className="col-span-full py-10 text-center">
                            <div className="inline-block w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-2" />
                            <div className={`font-bold uppercase tracking-widest text-[9px] ${isLight ? 'text-slate-400' : 'text-white/40'}`}>
                              Fetching episodes...
                            </div>
                          </div>
                        ) : currentSeasonEpisodes.length === 0 ? (
                          <div className={`col-span-full py-8 text-center ${isLight ? 'text-slate-400' : 'text-white/40'}`}>
                            <Film size={20} className="mx-auto mb-1.5 opacity-40" />
                            <p className="text-[11px] font-semibold">No episodes found for this season</p>
                          </div>
                        ) : (
                          currentSeasonEpisodes.map((ep, idx) => {
                            const isCurrentEpisode = Boolean(ep.localVideo && getMediaUnitIdentity(ep.localVideo) === getMediaUnitIdentity(video))
                            const epDownload = activeDownloads.find(d => 
                              (d.mediaType === 'series' || (video.type === 'series' && d.mediaType !== 'movie')) && 
                              d.tmdbId === video.tmdb_id && 
                              Number(d.season) === ep.season && 
                              Number(d.episode) === ep.episode &&
                              d.status !== 'completed' && d.status !== 'done' && d.status !== 'error'
                            )
                            const isDownloading = Boolean(epDownload)
                            const epDownloadProgress = epDownload ? Math.max(0, Math.min(100, Number(epDownload.progress || 0))) : 0

                            const isUpcoming = !ep.released && !ep.localVideo && !isDownloading
                            const isMissing = ep.released && !ep.localVideo && !isDownloading
                            const onlineState = (!ep.localVideo && !isDownloading)
                              ? onlineEpisodeMap.get(`${ep.season}:${ep.episode}`)
                              : undefined

                            const watchProgress = ep.localVideo?.duration && ep.localVideo.last_watched_time
                              ? Math.min(100, Math.round((ep.localVideo.last_watched_time / ep.localVideo.duration) * 100))
                              : onlineState?.duration && onlineState.position
                                ? Math.min(100, Math.round((onlineState.position / onlineState.duration) * 100))
                                : (onlineState?.completed || ep.localVideo?.completed)
                                  ? 100
                                  : 0

                            const formattedTitle = formatEpisodeTitle(ep.title) || `Episode ${ep.episode}`
                            const formattedDate = formatEpisodeAirDate(ep.airDate)

                            return (
                              <button
                                key={`${ep.season}:${ep.episode}`}
                                onClick={() => {
                                  if (ep.localVideo) onPlay(ep.localVideo)
                                  else if (isMissing || isDownloading) void handleOpenEpisodeSources(ep.season, ep.episode)
                                }}
                                disabled={isUpcoming}
                                className={`group relative flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
                                  isCurrentEpisode
                                    ? isLight
                                      ? 'bg-red-500/[0.06] border-primary/50 ring-1 ring-primary/20 shadow-[0_2px_10px_rgba(229,9,20,0.08)]'
                                      : 'bg-primary/10 border-primary/50 ring-1 ring-primary/30 shadow-[0_4px_20px_rgba(229,9,20,0.18)]'
                                    : isUpcoming
                                      ? isLight
                                        ? 'cursor-default bg-slate-100/50 border-slate-200/50 opacity-55'
                                        : 'cursor-default bg-black/25 border-white/5 opacity-55'
                                      : isLight
                                        ? 'bg-white hover:bg-white border-slate-200/80 hover:border-slate-300 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]'
                                        : 'bg-black/40 hover:bg-black/60 border-white/10 hover:border-white/25 shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.99]'
                                }`}
                              >
                                {/* Downloading background fill */}
                                {isDownloading && (
                                  <div 
                                    className="absolute inset-y-0 left-0 bg-sky-500/10 z-0 transition-all duration-300 pointer-events-none"
                                    style={{ width: `${epDownloadProgress}%` }}
                                  />
                                )}

                                {/* Compact 16:9 Thumbnail */}
                                <div className={`relative aspect-video w-20 sm:w-22 shrink-0 rounded-lg overflow-hidden shadow-sm ring-1 z-10 ${
                                  isLight ? 'bg-slate-100 ring-slate-200/70' : 'bg-black/70 ring-white/10'
                                }`}>
                                  {ep.stillPath ? (
                                    <img
                                      src={getArtworkUrl(ep.stillPath, 'w342') || undefined}
                                      alt=""
                                      loading="lazy"
                                      className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                                    />
                                  ) : (
                                    <div className={`h-full w-full flex items-center justify-center text-[10px] font-bold ${
                                      isLight ? 'text-slate-400 bg-slate-100' : 'text-white/30 bg-white/[0.03]'
                                    }`}>
                                      {String(ep.episode).padStart(2, '0')}
                                    </div>
                                  )}

                                  {/* Top-left micro EP badge */}
                                  <span className="absolute top-1 left-1 px-1 py-0.2 rounded bg-black/80 backdrop-blur-sm text-[8px] font-black uppercase tracking-wider text-white ring-1 ring-white/15">
                                    EP {ep.episode}
                                  </span>

                                  {/* Hover Play Button Overlay */}
                                  {!isUpcoming && (
                                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-out">
                                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white shadow-md transform scale-75 group-hover:scale-100 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
                                        <Play size={9} fill="currentColor" className="ml-0.5" />
                                      </div>
                                    </div>
                                  )}

                                  {/* Progress Bar */}
                                  {watchProgress > 0 && !isDownloading && (
                                    <div className="absolute bottom-0 inset-x-0 h-1 bg-black/40 z-20">
                                      <div className="h-full bg-primary transition-all duration-300" style={{ width: `${watchProgress}%` }} />
                                    </div>
                                  )}
                                  {isDownloading && (
                                    <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60 z-20">
                                      <div className="h-full bg-sky-500 animate-pulse" style={{ width: `${epDownloadProgress}%` }} />
                                    </div>
                                  )}
                                </div>

                                {/* Episode Metadata & Info */}
                                <div className="flex-1 min-w-0 z-10 space-y-0.5">
                                  <h4 className={`text-[11.5px] font-bold line-clamp-1 leading-snug transition-colors duration-200 ${
                                    isCurrentEpisode
                                      ? 'text-primary'
                                      : isLight
                                        ? 'text-slate-900 group-hover:text-primary'
                                        : 'text-white/95 group-hover:text-primary'
                                  }`}>
                                    {formattedTitle}
                                  </h4>

                                  <div className={`flex items-center gap-1.5 text-[10px] font-medium leading-none ${
                                    isLight ? 'text-slate-500' : 'text-white/50'
                                  }`}>
                                    <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-white/70'}`}>
                                      S{ep.season} · E{ep.episode}
                                    </span>
                                    {formattedDate && <span>• {formattedDate}</span>}
                                    {ep.versionCount > 1 && (
                                      <span className={`text-[8px] px-1 py-0.2 rounded font-semibold ${
                                        isLight ? 'bg-slate-100 text-slate-600' : 'bg-white/10 text-white/70'
                                      }`}>
                                        {ep.versionCount} versions
                                      </span>
                                    )}
                                  </div>

                                  {/* Status Micro-Pill */}
                                  <div className="pt-0.5">
                                    {isCurrentEpisode ? (
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8.5px] font-bold tracking-wide ${
                                        isLight
                                          ? 'bg-red-50 text-red-600 border border-red-200/80'
                                          : 'bg-primary/20 text-red-400 border border-primary/30'
                                      }`}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                        Playing Now
                                      </span>
                                    ) : ep.localVideo ? (
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8.5px] font-bold tracking-wide ${
                                        isLight
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                      }`}>
                                        <HardDrive size={8.5} />
                                        In Library
                                      </span>
                                    ) : isDownloading ? (
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8.5px] font-bold tracking-wide ${
                                        isLight
                                          ? 'bg-sky-50 text-sky-700 border border-sky-200/70'
                                          : 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
                                      }`}>
                                        <Download size={8.5} className="animate-bounce" />
                                        Saving {Math.round(epDownloadProgress)}%
                                      </span>
                                    ) : (onlineState?.completed || (ep.localVideo as any)?.completed) ? (
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8.5px] font-bold tracking-wide ${
                                        isLight
                                          ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                          : 'bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/20'
                                      }`}>
                                        <CheckCircle2 size={8.5} />
                                        Watched
                                      </span>
                                    ) : (onlineState && onlineState.position >= 10) ? (
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8.5px] font-bold tracking-wide ${
                                        isLight
                                          ? 'bg-sky-50 text-sky-700 border border-sky-200/70'
                                          : 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
                                      }`}>
                                        <Play size={7.5} fill="currentColor" />
                                        Resume {formatResumeTime(onlineState.position)}
                                      </span>
                                    ) : isMissing ? (
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8.5px] font-medium tracking-wide transition-colors duration-200 ${
                                        isLight
                                          ? 'bg-slate-100/80 text-slate-600 border border-slate-200/80 group-hover:text-primary group-hover:border-primary/30'
                                          : 'bg-white/5 text-white/60 border border-white/10 group-hover:text-primary group-hover:border-primary/40'
                                      }`}>
                                        <Zap size={8.5} />
                                        Stream Available
                                      </span>
                                    ) : (
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8.5px] font-medium tracking-wide ${
                                        isLight
                                          ? 'bg-slate-100/60 text-slate-400 border border-slate-200/50'
                                          : 'bg-white/5 text-white/40 border border-white/5'
                                      }`}>
                                        <Calendar size={8.5} />
                                        {formattedDate ? `Airs ${formattedDate}` : 'Upcoming'}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Hover action icon */}
                                <div className={`ml-auto pl-1 shrink-0 transition-opacity duration-200 ease-out z-10 ${
                                  isUpcoming ? 'opacity-30' : 'opacity-0 group-hover:opacity-100'
                                }`}>
                                  {ep.localVideo ? (
                                    <Play size={13} className="text-primary" fill="currentColor" />
                                  ) : isMissing || isDownloading ? (
                                    <Download size={13} className={isLight ? 'text-slate-400 group-hover:text-primary' : 'text-white/60 group-hover:text-primary'} />
                                  ) : (
                                    <Calendar size={13} className={isLight ? 'text-slate-300' : 'text-white/30'} />
                                  )}
                                </div>
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
      </div>

      {showDownloadOptions && createPortal(
        <>
          <div
            className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={handleCloseDownloadOptions}
          />
          <aside className="fixed inset-y-0 right-0 z-[1010] flex w-full max-w-[580px] flex-col border-l border-white/10 bg-[#0C1017] shadow-[-32px_0_80px_rgba(0,0,0,0.65)] animate-in slide-in-from-right duration-300 detail-source-drawer">
            <div className="relative border-b border-white/10 bg-[#0C1017] detail-source-header">
              {/* scan progress */}
              <div className="absolute inset-x-0 top-0 h-[2px] bg-white/5">
                {searching && sourceSearchStatus.total > 0 ? (
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(100, (sourceSearchStatus.completed / Math.max(1, sourceSearchStatus.total)) * 100)}%` }}
                  />
                ) : searching ? (
                  <div className="h-full w-1/3 animate-pulse bg-primary/70" />
                ) : null}
              </div>
              <div className="flex items-start gap-4 px-5 pt-5 pb-4">
                {posterUrl ? (
                  <img
                    src={posterUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-[68px] w-[48px] shrink-0 rounded-lg object-cover ring-1 ring-white/15"
                  />
                ) : (
                  <div className="flex h-[68px] w-[48px] shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                    <Film size={18} className="text-white/30" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <Download size={12} />
                    </span>
                    {sourceActionLabel}
                    {sourceSearchStatus.cached && (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold tracking-widest text-white/40">
                        Cached
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 truncate text-[17px] font-extrabold tracking-tight text-white">
                    {video.type === 'series' && video.series_name ? video.series_name : video.title}
                  </h3>
                  <p className="mt-1 text-[11px] font-medium text-white/40">
                    {video.release_year ? `${video.release_year} · ` : ''}{filteredSources.length} of {sources.length} sources
                    {searching && sourceSearchStatus.total > 0
                      ? ` · scanning ${sourceSearchStatus.completed}/${sourceSearchStatus.total}`
                      : searching ? ' · scanning…' : ''}
                  </p>
                  <div className="mt-2.5 flex items-center gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-300 ring-1 ring-emerald-500/20">
                      <Play size={11} fill="currentColor" />
                      Stream — instant
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 font-semibold text-white/60 ring-1 ring-white/10">
                      <Download size={11} />
                      Save — download
                    </span>
                    {(() => {
                      const hindiCount = sources.filter(s => s.isHindi).length
                      return hindiCount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FF9933]/10 px-2.5 py-1 font-bold text-[#FFB76B] ring-1 ring-[#FF9933]/25">
                          {hindiCount} Hindi
                        </span>
                      ) : null
                    })()}
                  </div>
                </div>
                <button
                  onClick={handleCloseDownloadOptions}
                  className="shrink-0 rounded-full bg-white/5 p-2.5 text-white/60 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white"
                  title="Close sources"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2 border-t border-white/[0.07] bg-white/[0.015] px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5 scrollbar-hide">
                    {/* Language: fixed two-option segmented control — labels never change, only the active state does */}
                    <div className="flex h-7 shrink-0 items-center gap-0.5 rounded-full bg-white/5 p-0.5 ring-1 ring-white/10" role="group" aria-label="Language filter">
                      <button
                        onClick={() => setSourceLanguageFilter('all')}
                        title={`Show all languages (${sources.length})`}
                        className={`flex h-6 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold tracking-wide transition-all ${
                          sourceLanguageFilter === 'all'
                            ? 'bg-white text-black'
                            : 'text-white/55 hover:text-white'
                        }`}
                      >
                        All
                        <span className={`rounded-full px-1.5 py-px text-[9px] font-black ${sourceLanguageFilter === 'all' ? 'bg-black/10 text-black/70' : 'bg-white/10 text-white/45'}`}>
                          {sources.length}
                        </span>
                      </button>
                      <button
                        onClick={() => setSourceLanguageFilter('hindi')}
                        title="Show Hindi / dual-audio only"
                        className={`flex h-6 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold tracking-wide transition-all ${
                          sourceLanguageFilter === 'hindi'
                            ? 'bg-[#FF9933] text-black'
                            : 'text-white/55 hover:text-white'
                        }`}
                      >
                        <Languages size={12} />
                        Hindi
                        <span className={`rounded-full px-1.5 py-px text-[9px] font-black ${sourceLanguageFilter === 'hindi' ? 'bg-black/10 text-black/70' : 'bg-[#FF9933]/15 text-[#FFB76B]'}`}>
                          {sourceHindiCount}
                        </span>
                      </button>
                    </div>
                  </div>

                  {hasActiveSourceFilters && (
                    <button
                      onClick={clearSourceFilters}
                      className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold tracking-wide text-white/45 transition-colors hover:bg-white/5 hover:text-white"
                      title="Clear all filters"
                    >
                      <X size={12} />
                      Clear
                    </button>
                  )}
                  <button
                    onClick={() => handleSearchSources(true)}
                    disabled={searching || !video.tmdb_id}
                    className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-3 text-[10px] font-bold tracking-wide text-white/60 ring-1 ring-white/10 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50"
                    title="Refresh sources"
                  >
                    {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                    Refresh
                  </button>
                </div>

                {/* Resolution: desired quality filter with live counts */}
                <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-hide">
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Quality</span>
                  {(['all', '2160p', '1080p', '720p'] as const).map(quality => {
                    const isActive = sourceQualityFilter === quality
                    const count = quality === 'all' ? sources.length : sourceQualityCounts[quality]
                    const label = quality === 'all' ? 'All' : quality === '2160p' ? '4K' : quality
                    return (
                      <button
                        key={quality}
                        onClick={() => setSourceQualityFilter(quality)}
                        title={quality === 'all' ? `All qualities (${sources.length})` : `${quality === '2160p' ? '2160p / 4K' : quality} (${count})`}
                        className={`flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold tracking-wide ring-1 transition-all ${
                          isActive
                            ? 'bg-white text-black ring-white'
                            : count === 0 && sources.length > 0
                              ? 'bg-transparent text-white/25 ring-white/[0.07]'
                              : 'bg-white/5 text-white/55 ring-white/10 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {label}
                        <span className={`rounded-full px-1 py-px text-[9px] font-black ${isActive ? 'bg-black/10 text-black/70' : 'bg-white/10 text-white/40'}`}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {video.type === 'series' && (
                  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-hide">
                    <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Season</span>
                    {(() => {
                      const packCount = sources.filter(s => isSourceSeasonPack(s)).length
                      const seasonOptions: { value: string; label: string; count: number }[] = [
                        { value: 'all', label: 'All', count: sources.length },
                        { value: 'packs', label: 'Packs', count: packCount },
                        ...sourceSeasons.map(season => ({
                          value: season.toString(),
                          label: `S${season}`,
                          count: sources.filter(s => !isSourceSeasonPack(s) && s.parsedSeason === season).length
                        }))
                      ]
                      return seasonOptions.map(option => {
                        const isActive = sourceSeasonFilter === option.value
                        return (
                          <button
                            key={option.value}
                            onClick={() => {
                              setSourceSeasonFilter(option.value)
                              setSourcePackSeasonFilter('all')
                              setSourceEpisodeFilter('all')
                            }}
                            title={option.value === 'all' ? `All seasons (${option.count})` : option.value === 'packs' ? `Season packs (${option.count})` : `Season ${option.value} (${option.count})`}
                            className={`flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold tracking-wide ring-1 transition-all ${
                              isActive
                                ? 'bg-white text-black ring-white'
                                : option.count === 0 && sources.length > 0
                                  ? 'bg-transparent text-white/25 ring-white/[0.07]'
                                  : 'bg-white/5 text-white/55 ring-white/10 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {option.label}
                            <span className={`rounded-full px-1 py-px text-[9px] font-black ${isActive ? 'bg-black/10 text-black/70' : 'bg-white/10 text-white/40'}`}>
                              {option.count}
                            </span>
                          </button>
                        )
                      })
                    })()}
                  </div>
                )}

                {video.type === 'series' && sourceSeasonFilter === 'packs' && sourcePackSeasons.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-hide">
                    <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Pack</span>
                    {['all', ...sourcePackSeasons.map(String)].map(value => {
                      const isActive = sourcePackSeasonFilter === value
                      const count = value === 'all'
                        ? sources.filter(s => isSourceSeasonPack(s)).length
                        : sources.filter(s => isSourceSeasonPack(s) && s.parsedSeason === Number(value)).length
                      return (
                        <button
                          key={value}
                          onClick={() => setSourcePackSeasonFilter(value)}
                          title={value === 'all' ? `Any pack (${count})` : `Season ${value} pack (${count})`}
                          className={`flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold tracking-wide ring-1 transition-all ${
                            isActive
                              ? 'bg-white text-black ring-white'
                              : 'bg-white/5 text-white/55 ring-white/10 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {value === 'all' ? 'Any' : `S${value}`}
                          <span className={`rounded-full px-1 py-px text-[9px] font-black ${isActive ? 'bg-black/10 text-black/70' : 'bg-white/10 text-white/40'}`}>
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {video.type === 'series' && sourceSeasonFilter !== 'all' && sourceSeasonFilter !== 'packs' && sourceEpisodes.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-hide">
                    <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Episode</span>
                    {['all', ...sourceEpisodes.map(String)].map(value => {
                      const isActive = sourceEpisodeFilter === value
                      const count = value === 'all'
                        ? sources.filter(s => !isSourceSeasonPack(s) && s.parsedSeason === Number(sourceSeasonFilter)).length
                        : sources.filter(s => !isSourceSeasonPack(s) && s.parsedSeason === Number(sourceSeasonFilter) && s.parsedEpisode === Number(value)).length
                      return (
                        <button
                          key={value}
                          onClick={() => setSourceEpisodeFilter(value)}
                          title={value === 'all' ? `All episodes (${count})` : `Episode ${value} (${count})`}
                          className={`flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold tracking-wide ring-1 transition-all ${
                            isActive
                              ? 'bg-white text-black ring-white'
                              : 'bg-white/5 text-white/55 ring-white/10 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {value === 'all' ? 'All' : `E${value}`}
                          <span className={`rounded-full px-1 py-px text-[9px] font-black ${isActive ? 'bg-black/10 text-black/70' : 'bg-white/10 text-white/40'}`}>
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#080B10] px-4 py-4 scrollbar-thin detail-source-body">
              {torrentStreamError && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-[10px] font-bold leading-relaxed text-red-300">
                  <AlertTriangle size={14} className="mt-px shrink-0" />
                  <span>{torrentStreamError}</span>
                </div>
              )}
              {localVersions.length > 0 && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-emerald-400/[0.05] ring-1 ring-emerald-400/15">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/25">
                      <HardDrive size={15} />
                    </span>
                    <div className="flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-200">On this device</p>
                      <p className="text-[11px] font-medium text-white/45">
                        {localVersions.length} {localVersions.length === 1 ? 'file' : 'files'} ready to play
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2 px-3 pb-3">
                    {localVersions.map(version => (
                      <div key={version.id} className="flex items-center gap-3 rounded-xl bg-black/30 px-3 py-2.5 ring-1 ring-white/[0.06]">
                        <button
                          onClick={() => onPlay(version)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
                          title="Play this version"
                        >
                          <Play size={14} fill="currentColor" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-white">{getVersionLabel(version)}</p>
                          <p className="truncate text-[10px] font-medium text-white/35" title={version.file_path}>
                            {version.file_path.split(/[\\/]/).pop()}
                          </p>
                        </div>
                        {version.is_preferred || (localVersions.length === 1 && version.id === localVersions[0].id) ? (
                          <span className="shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-emerald-200 ring-1 ring-emerald-400/25">
                            Default
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSetPreferredVersion(version)}
                            className="shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-white/40 ring-1 ring-white/10 transition-colors hover:text-emerald-200 hover:ring-emerald-400/30"
                          >
                            Set default
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(searching || !sourceSearchStatus.done) && filteredSources.length === 0 ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3.5 ring-1 ring-white/[0.07]">
                    <div className="h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-white/10 border-t-primary" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-white">
                        {sourceSearchStatus.total > 0
                          ? `Checking ${sourceSearchStatus.completed} of ${sourceSearchStatus.total} providers`
                          : 'Finding the best sources'}
                      </p>
                      <p className="text-[11px] text-white/40">High-seed results appear first — you can start before it finishes.</p>
                    </div>
                  </div>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.06]">
                      <div className="flex items-center gap-2.5">
                        <div className="h-11 w-[54px] shrink-0 rounded-lg bg-white/[0.06]" />
                        <div className="flex-1 space-y-1.5 py-0.5">
                          <div className="h-3 w-11/12 rounded bg-white/[0.07]" />
                          <div className="flex gap-1.5">
                            <div className="h-4 w-12 rounded-full bg-white/[0.06]" />
                            <div className="h-4 w-14 rounded-full bg-white/[0.06]" />
                            <div className="h-4 w-10 rounded-full bg-white/[0.06]" />
                          </div>
                        </div>
                        <div className="h-8 w-[76px] shrink-0 rounded-lg bg-white/[0.06]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredSources.length > 0 ? (
                <div className="space-y-2">
                  {filteredSources.map((src, idx) => {
                    const speedLabel = getTorrentSourceSpeedLabel(src)
                    const isHevc = isHevcSource(src)
                    const isStarting = startingSourceMagnet === src.magnet
                    const isBusyStream = startingStreamMagnet === src.magnet
                    const isStarted = startedSourceMagnet === src.magnet || activeDownloads.some(download => (
                      download.status !== 'error' && (
                        download.magnet === src.magnet ||
                        getMagnetInfoHash(download.magnet) === getMagnetInfoHash(src.magnet)
                      )
                    ))
                    const isSharedSource = initialSharedSource?.magnet && src.magnet === initialSharedSource.magnet
                    const sharedSourceHasLiveStats = isSharedSource && ((Number(src.seeds) || 0) > 0 || (Number(src.peers) || 0) > 0)
                    const quality = String(src.quality || 'HD').toUpperCase()
                    const qualityStyle = quality.includes('2160') || quality.includes('4K') || quality.includes('UHD')
                      ? 'bg-amber-400/12 text-amber-300 ring-amber-400/30'
                      : quality.includes('1080')
                        ? 'bg-sky-400/12 text-sky-300 ring-sky-400/30'
                        : quality.includes('720')
                          ? 'bg-emerald-400/12 text-emerald-300 ring-emerald-400/30'
                          : 'bg-white/[0.05] text-white/70 ring-white/15'
                    const seedCount = Number(src.seeds) || 0
                    const seedDot = seedCount >= 100 ? 'bg-emerald-400' : seedCount >= 25 ? 'bg-green-400' : seedCount >= 5 ? 'bg-amber-400' : 'bg-red-400'
                    const speedStyle = speedLabel === 'FAST' ? 'text-emerald-300' : speedLabel === 'GOOD' ? 'text-green-300' : speedLabel === 'OK' ? 'text-amber-300' : 'text-red-300'
                    const episodeBadge = video.type === 'series' && (typeof src.parsedSeason === 'number' || typeof src.parsedEpisode === 'number')
                      ? src.isSeasonPack
                        ? `S${src.parsedSeason} Pack`
                        : `S${src.parsedSeason ?? '?'} E${src.parsedEpisode ?? '?'}`
                      : null

                    return (
                      <div
                        key={`${src.magnet || src.title}-${idx}`}
                        className={`rounded-xl px-3 py-2.5 ring-1 transition-colors ${
                          isSharedSource
                            ? 'bg-cyan-400/[0.06] ring-cyan-400/30'
                            : idx === 0
                              ? 'bg-[#131A26] ring-white/15'
                              : 'bg-[#111823] ring-white/[0.07] hover:bg-[#141C2A] hover:ring-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-11 w-[54px] shrink-0 flex-col items-center justify-center gap-px rounded-lg ring-1 ${qualityStyle}`}>
                            <span className="text-[12px] font-black leading-none">{quality}</span>
                            {src.size && <span className="max-w-[48px] truncate text-[8px] font-bold opacity-70" title={src.size}>{src.size}</span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {idx === 0 && !isSharedSource && (
                                <Star size={11} className="shrink-0 text-amber-300" fill="currentColor" />
                              )}
                              {isSharedSource && (
                                <Share2 size={11} className="shrink-0 text-cyan-300" />
                              )}
                              <p className="truncate text-[12px] font-semibold text-white/90" title={src.title}>
                                {src.title}
                              </p>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-medium text-white/45">
                              <span className="inline-flex items-center gap-1">
                                <span className={`h-1.5 w-1.5 rounded-full ${seedDot}`} />
                                {src.seeds}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Users size={10} />
                                {src.peers}
                              </span>
                              <span className={`font-black tracking-wide ${speedStyle}`}>
                                {speedLabel}
                              </span>
                              {episodeBadge && (
                                <span className="font-bold text-white/50">{episodeBadge}</span>
                              )}
                              {isHevc && (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded-full bg-violet-400/15 px-1.5 py-px text-[9px] font-bold text-violet-200 ring-1 ring-violet-400/30"
                                  title="HEVC / H.265 — recommended for smooth streaming"
                                >
                                  <Zap size={8} fill="currentColor" />
                                  HEVC
                                </span>
                              )}
                              {src.isHindi && (
                                <span className="rounded-full bg-[#FF9933]/12 px-1.5 py-px text-[9px] font-bold text-[#FFB76B] ring-1 ring-[#FF9933]/30">
                                  Hindi
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              onClick={() => handlePlaySource(src)}
                              disabled={isBusyStream}
                              className="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-[12px] font-bold text-white transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-60"
                              title={isSharedSource ? (sharedSourceHasLiveStats ? 'Stream shared source' : 'Stream shared source') : 'Stream now without saving'}
                            >
                              {isBusyStream ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Play size={13} fill="currentColor" />
                              )}
                              {isBusyStream ? '…' : 'Stream'}
                            </button>
                            <button
                              onClick={() => handleDownloadSource(src)}
                              disabled={isStarting || isStarted}
                              className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 transition-all active:scale-[0.98] disabled:opacity-60 ${
                                isStarted
                                  ? 'bg-green-500/10 text-green-300 ring-green-500/25'
                                  : 'bg-white/5 text-white/70 ring-white/10 hover:bg-white/10 hover:text-white'
                              }`}
                              title={isStarted ? 'Download started' : 'Save to device'}
                            >
                              {isStarting ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : isStarted ? (
                                <CheckCircle2 size={13} />
                              ) : (
                                <Download size={13} />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex min-h-[340px] flex-col items-center justify-center gap-3 rounded-2xl bg-white/[0.02] px-8 text-center ring-1 ring-dashed ring-white/10">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/25">
                    <AlertTriangle size={20} />
                  </span>
                  <p className="text-[13px] font-bold text-white">
                    {sources.length > 0 ? 'No sources match these filters.' : 'No sources found for this title.'}
                  </p>
                  <p className="max-w-[280px] text-[11px] leading-relaxed text-white/40">
                    {sources.length > 0
                      ? 'Try clearing the quality, language, season or episode filters to see more results.'
                      : 'Try refreshing, or check back later — new providers are checked each time.'}
                  </p>
                  {sources.length > 0 ? (
                    <button
                      onClick={clearSourceFilters}
                      className="mt-1 h-9 rounded-full bg-white/5 px-4 text-[11px] font-bold text-white/70 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      Clear filters
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSearchSources(true)}
                      className="mt-1 flex h-9 items-center gap-2 rounded-full bg-white/5 px-4 text-[11px] font-bold text-white/70 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Search size={12} />
                      Try again
                    </button>
                  )}
                </div>
              )}
            </div>
          </aside>
        </>,
        document.body
      )}

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

export default React.memo(DetailScreen)
