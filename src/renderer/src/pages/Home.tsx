import React, { useState, useEffect } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import HeroCarousel from '../components/HeroCarousel'
import { Search as SearchIcon, Bell, ChevronRight, Filter } from 'lucide-react'

interface HomeProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
  refreshKey: number
}

const Home: React.FC<HomeProps> = ({ onPlay, onShowDetail, refreshKey }) => {
  const [continueWatching, setContinueWatching] = useState<Video[]>([])
  const [recentMovies, setRecentMovies] = useState<Video[]>([])
  const [recentSeries, setRecentSeries] = useState<Video[]>([])
  const [trendingMovies, setTrendingMovies] = useState<Video[]>([])
  const [trendingSeries, setTrendingSeries] = useState<Video[]>([])
  const [featured, setFeatured] = useState<Video[]>([])
  const [userName, setUserName] = useState(() => localStorage.getItem('mycinema_user_name') || 'User')

  const fetchData = async () => {
    try {
      const [allVideos, cw, trendingM, trendingS] = await Promise.all([
        window.api.getVideos(),
        window.api.getContinueWatching(),
        window.api.fetchTrending('movie').catch(err => { console.error('Trending Movies Error:', err); return [] }),
        window.api.fetchTrending('series').catch(err => { console.error('Trending Series Error:', err); return [] })
      ])
      
      setTrendingMovies(trendingM)
      setTrendingSeries(trendingS)
      setFeatured([...trendingM.slice(0, 3), ...trendingS.slice(0, 3)])
      setContinueWatching(cw)
      
      // 1. Movie vs Video logic: Movies >= 1 hour (3600s), Videos < 1 hour
      const moviesOnly = allVideos.filter(v => v.type === 'movie' && (v.duration === 0 || !v.duration || v.duration >= 3600))
      setRecentMovies(moviesOnly.slice(0, 10))

      // 2. Group Web Series: One card per series
      const groupedSeries: Video[] = []
      const seenSeries = new Set<string>()
      const seriesEpisodes = allVideos.filter(v => v.type === 'series')
      
      // Count episodes for badge/info
      const seriesCounts: Record<string, number> = {}
      seriesEpisodes.forEach(v => {
        if (v.series_name) seriesCounts[v.series_name] = (seriesCounts[v.series_name] || 0) + 1
      })

      for (const video of seriesEpisodes) {
        if (video.series_name && !seenSeries.has(video.series_name)) {
          groupedSeries.push({ 
            ...video, 
            episode_count: seriesCounts[video.series_name] 
          })
          seenSeries.add(video.series_name)
        }
      }
      setRecentSeries(groupedSeries.slice(0, 10))
      
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

  const getTimeGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="space-y-12">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-12">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter italic">{getTimeGreeting()}, {userName}</h2>
          <p className="text-white/30 font-bold text-sm tracking-wide italic">Find your next watch</p>
        </div>
        
        <div className="flex-1 max-w-2xl relative group">
          <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-white/20 group-focus-within:text-primary transition-colors">
            <SearchIcon size={20} />
          </div>
          <input 
            type="text"
            placeholder="Search movies, series..."
            className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-16 pr-6 text-sm font-bold text-white placeholder:text-white/20 focus:outline-none focus:bg-white/10 focus:border-white/10 transition-all"
          />
          <div className="absolute inset-y-0 right-4 flex items-center">
            <button className="p-2 rounded-xl hover:bg-white/5 text-white/20 hover:text-white transition-all">
              <Filter size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="relative p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all border border-white/5">
            <Bell size={20} />
            <div className="absolute top-3 right-3 w-2 h-2 bg-red-600 rounded-full border-2 border-[#05080d]" />
          </button>
        </div>
      </div>

      {/* 1. Full-Width Hero Carousel */}
      <section className="w-full">
        <HeroCarousel items={featured} onPlay={onPlay} onShowDetail={onShowDetail} />
      </section>

      {/* 2. Split Section: Recently Added (Left) & Continue Watching (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left: Recently Added Content */}
        <div className="lg:col-span-8 space-y-12">
          <section>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-white uppercase italic tracking-tight">Recently Added Movies</h3>
              <button className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:gap-2 transition-all">
                View all <ChevronRight size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {recentMovies.slice(0, 4).map(video => (
                <VideoCard key={video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
              ))}
              {recentMovies.length === 0 && [1,2,3,4].map(i => (
                <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-white uppercase italic tracking-tight">Recently Added Web Series</h3>
              <button className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:gap-2 transition-all">
                View all <ChevronRight size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {recentSeries.slice(0, 4).map(video => (
                <VideoCard key={video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
              ))}
              {recentSeries.length === 0 && [1,2,3,4].map(i => (
                <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
              ))}
            </div>
          </section>
        </div>

        {/* Right: Side Panel (Continue Watching) */}
        <div className="lg:col-span-4">
          <div className="bg-[#0a0f18] rounded-3xl p-8 border border-white/5 min-h-[500px] h-full flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-white uppercase italic tracking-tight">Continue Watching</h3>
              <button className="text-white/20 hover:text-white transition-colors">
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-4">
              {continueWatching.length > 0 ? (
                continueWatching.slice(0, 6).map(video => (
                  <VideoCard 
                    key={video.id} 
                    video={video} 
                    onPlay={onPlay} 
                    onShowDetail={onShowDetail} 
                    isContinueWatching 
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-20">
                  <div className="w-16 h-16 rounded-full border-4 border-dashed border-white flex items-center justify-center">
                    <ChevronRight size={32} className="rotate-90" />
                  </div>
                  <p className="text-sm font-bold uppercase tracking-widest">No recently played content</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Trending This Week Section (Below Split) */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">Trending This Week</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {trendingMovies.slice(0, 6).map(video => (
            <VideoCard key={video.tmdb_id || video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
          ))}
        </div>
      </section>
    </div>
  )
}

export default Home
