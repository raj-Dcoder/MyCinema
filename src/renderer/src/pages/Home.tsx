import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import HeroCarousel from '../components/HeroCarousel'
import { groupSeriesCards } from '../utils/seriesCards'
import { Search as SearchIcon, Bell, ChevronLeft, ChevronRight, Play } from 'lucide-react'

interface HomeProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
  onNavigate: (tab: 'movies' | 'series' | 'history') => void
  refreshKey: number
}

const getImageUrl = (path?: string | null) => {
  if (!path) return null
  return path.startsWith('http') ? path : `media://file/${encodeURIComponent(path)}`
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
  return video.type === 'movie' && (video.duration === 0 || !video.duration || video.duration >= 3600)
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
      <div className="absolute inset-0 flex flex-col justify-end p-5">
        <div className="mb-auto flex items-start justify-between gap-3">
          {episodeLabel && (
            <div className="inline-flex items-center rounded-md bg-black/55 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-lg shadow-black/30 backdrop-blur-md">
              {episodeLabel}
            </div>
          )}
          {remainingTime && <span className="rounded-md bg-white/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm">{remainingTime}</span>}
        </div>

        <div className="space-y-2">
          <h4 className="line-clamp-1 text-lg font-black italic tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            {title}
          </h4>
          {episodeLabel && video.title && video.title !== title && (
            <p className="line-clamp-1 text-[11px] font-black uppercase tracking-wider text-red-100/85">
              {video.title}
            </p>
          )}
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

const Home: React.FC<HomeProps> = ({ onPlay, onShowDetail, onNavigate, refreshKey }) => {
  const [continueWatching, setContinueWatching] = useState<Video[]>([])
  const [recentMovies, setRecentMovies] = useState<Video[]>([])
  const [recentSeries, setRecentSeries] = useState<Video[]>([])
  const [trendingMovies, setTrendingMovies] = useState<Video[]>([])
  const [trendingSeries, setTrendingSeries] = useState<Video[]>([])
  const [trendingIndia, setTrendingIndia] = useState<Video[]>([])
  const [featured, setFeatured] = useState<Video[]>([])
  const [userName, setUserName] = useState(() => localStorage.getItem('mycinema_user_name') || 'User')
  const continueWatchingRef = useRef<HTMLDivElement>(null)
  const [showContinueLeft, setShowContinueLeft] = useState(false)
  const [showContinueRight, setShowContinueRight] = useState(false)
  const [isContinueHovered, setIsContinueHovered] = useState(false)

  const fetchData = async () => {
    try {
      const [allVideos, cw, trendingM, trendingS, trendingIN] = await Promise.all([
        window.api.getVideos(),
        window.api.getContinueWatching(),
        window.api.fetchTrending('movie').catch(err => { console.error('Trending Movies Error:', err); return [] }),
        window.api.fetchTrending('series').catch(err => { console.error('Trending Series Error:', err); return [] }),
        window.api.fetchTrendingIndia().catch(err => { console.error('Trending India Error:', err); return [] })
      ])
      
      setTrendingMovies(trendingM)
      setTrendingSeries(trendingS)
      setTrendingIndia(trendingIN)
      setFeatured([...trendingM.slice(0, 3), ...trendingS.slice(0, 3)])
      setContinueWatching(groupContinueWatching(cw))
      
      // 1. Movie vs Video logic: Movies >= 1 hour (3600s), Videos < 1 hour
      const moviesOnly = allVideos.filter(v => v.type === 'movie' && (v.duration === 0 || !v.duration || v.duration >= 3600))
      setRecentMovies(moviesOnly.slice(0, 10))

      setRecentSeries(groupSeriesCards(allVideos).slice(0, 10))
      
    } catch (err) {
      console.error('Home fetchData error:', err)
    }
  }

  useEffect(() => {
    fetchData()
    window.api.onLibraryUpdated(fetchData)

    const handleNameUpdate = () => {
      setUserName(localStorage.getItem('mycinema_user_name') || 'User')
    }
    window.addEventListener('mycinema_name_updated', handleNameUpdate)

    return () => {
      window.api.removeAllLibraryUpdateListeners()
      window.removeEventListener('mycinema_name_updated', handleNameUpdate)
    }
  }, [refreshKey])

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

  return (
    <div>
      <section className="-mt-6 mb-8">
        <div className="relative">
          {/* Top Bar */}
          <div className="absolute left-0 right-0 top-0 z-20">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-8 px-8 pt-6">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tighter italic drop-shadow-[0_2px_14px_rgba(0,0,0,0.9)]">{getTimeGreeting()}, {userName}</h2>
              </div>

              <div className="flex items-center gap-4">
                <button
                  aria-label="Search movies and series"
                  className="p-2.5 text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] transition-all hover:scale-110 hover:text-primary active:scale-95"
                >
                  <SearchIcon size={24} strokeWidth={3} />
                </button>
                {/* <button className="relative p-3 rounded-2xl bg-black/30 hover:bg-black/45 text-white/60 hover:text-white transition-all border border-white/10 backdrop-blur-xl">
                  <Bell size={19} />
                  <div className="absolute top-3 right-3 w-2 h-2 bg-red-600 rounded-full border-2 border-[#05080d]" />
                </button> */}
              </div>
            </div>
          </div>

          <HeroCarousel items={featured} onPlay={onPlay} onShowDetail={onShowDetail} />
        </div>
      </section>

      {/* 2. Continue Watching Section */}
      <section className="mx-auto max-w-[1600px] px-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase italic tracking-tight">Continue Watching</h3>
          </div>
          <button
            className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:gap-2 transition-all"
            onClick={() => onNavigate('history')}
          >
            View all <ChevronRight size={14} />
          </button>
        </div>
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
                      onPlay={onPlay}
                      onShowDetail={onShowDetail}
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

      {/* 3. Trending This Week Section */}
      <section className="mx-auto mt-7 max-w-[1600px] px-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white uppercase italic tracking-tight">Trending This Week</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {trendingMovies.slice(0, 6).map(video => (
            <VideoCard key={video.tmdb_id || video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
          ))}
        </div>
      </section>

      {/* 4. India-Specific Trending Section */}
      <section className="mx-auto mt-7 max-w-[1600px] px-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-black text-white uppercase italic tracking-tight">Trending on India OTT</h3>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {trendingIndia.slice(0, 6).map(video => (
            <VideoCard key={video.tmdb_id || video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
          ))}
          {trendingIndia.length === 0 && [1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      </section>

      {/* 5. Recently Added Movies */}
      <section className="mx-auto mt-7 max-w-[1600px] px-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white uppercase italic tracking-tight">Recently Added Movies</h3>
          <button
            className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:gap-2 transition-all"
            onClick={() => onNavigate('movies')}
          >
            View all <ChevronRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {recentMovies.slice(0, 6).map(video => (
            <VideoCard key={video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
          ))}
          {recentMovies.length === 0 && [1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      </section>

      {/* 6. Recently Added Series */}
      <section className="mx-auto mt-7 max-w-[1600px] px-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white uppercase italic tracking-tight">Recently Added Series</h3>
          <button
            className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:gap-2 transition-all"
            onClick={() => onNavigate('series')}
          >
            View all <ChevronRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {recentSeries.slice(0, 6).map(video => (
            <VideoCard key={video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
          ))}
          {recentSeries.length === 0 && [1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      </section>
    </div>
  )
}

export default Home
