import React, { useEffect, useState } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import HorizontalScrollRow from '../components/HorizontalScrollRow'
import { WhatsNewTour } from '../components/WhatsNewTour'

interface HomeProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
  refreshKey?: number
}

const Home: React.FC<HomeProps> = ({ onPlay, onShowDetail, refreshKey }) => {
  const [continueWatching, setContinueWatching] = useState<Video[]>([])
  const [recentMovies, setRecentMovies] = useState<Video[]>([])
  const [recentSeries, setRecentSeries] = useState<Video[]>([])

  const fetchData = async () => {
    const allVideos: Video[] = await window.api.getVideos()
    const cw: Video[] = await window.api.getContinueWatching()
    
    // Group Continue Watching by series name to show only one card per series
    const uniqueCW: Video[] = []
    const seenSeries = new Set<string>()
    
    for (const video of cw) {
      if (video.type === 'series' && video.series_name) {
        if (!seenSeries.has(video.series_name)) {
          uniqueCW.push(video)
          seenSeries.add(video.series_name)
        }
      } else {
        uniqueCW.push(video)
      }
    }
    
    // Exclude short clips (< 1 hour) — they live in the Videos tab
    const isFullLength = (v: Video) => v.type === 'movie' && (!v.duration || v.duration >= 3600)
    setContinueWatching(uniqueCW.filter(v => v.type === 'series' || isFullLength(v)))
    setRecentMovies(allVideos.filter(isFullLength).slice(0, 10))
    
    // Also unique series for "Recently Added Web Series"
    const recentS: Video[] = []
    const seenRecentSeries = new Set<string>()
    const seriesEpisodes = allVideos.filter(v => v.type === 'series')
    
    // Count episodes for each series
    const counts: Record<string, number> = {}
    seriesEpisodes.forEach(v => {
      if (v.series_name) {
        counts[v.series_name] = (counts[v.series_name] || 0) + 1
      }
    })

    for (const video of seriesEpisodes) {
      if (video.series_name && !seenRecentSeries.has(video.series_name)) {
        recentS.push({ ...video, episode_count: counts[video.series_name] })
        seenRecentSeries.add(video.series_name)
      }
    }
    setRecentSeries(recentS.slice(0, 10))
  }

  useEffect(() => {
    fetchData()
    
    // Refresh data using IPC events
    window.api.onLibraryUpdated(fetchData)
    return () => window.api.removeAllLibraryUpdateListeners()
  }, [refreshKey])

  return (
    <div className="space-y-12">
      <WhatsNewTour />
      {continueWatching.length > 0 && (
        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-bold flex items-center group cursor-default">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 group-hover:to-white transition-all">
                Continue Watching
              </span>
            </h2>
          </div>
          <HorizontalScrollRow>
            {continueWatching.map(video => (
              <div key={video.id} className="w-[85vw] max-w-[800px] md:w-[600px] lg:w-[750px] flex-shrink-0 snap-center">
                <VideoCard video={video} onPlay={onPlay} onShowDetail={onShowDetail} isContinueWatching={true} />
              </div>
            ))}
          </HorizontalScrollRow>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-bold mb-6">Recently Added Movies</h2>
        <HorizontalScrollRow>
          {recentMovies.map(video => (
            <div key={video.id} className="w-36 md:w-44 lg:w-52 flex-shrink-0">
              <VideoCard video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
            </div>
          ))}
          {recentMovies.length === 0 && (
            <p className="text-muted w-full py-12 text-center border-2 border-dashed border-secondary rounded-xl">
              No movies found. Add a folder to start scanning.
            </p>
          )}
        </HorizontalScrollRow>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-6">Recently Added Web Series</h2>
        <HorizontalScrollRow>
          {recentSeries.map(video => (
            <div key={video.id} className="w-36 md:w-44 lg:w-52 flex-shrink-0">
              <VideoCard 
                video={video} 
                onPlay={onPlay}
                onShowDetail={onShowDetail}
              />
            </div>
          ))}
          {recentSeries.length === 0 && (
            <p className="text-muted w-full py-12 text-center border-2 border-dashed border-secondary rounded-xl">
              No Web Series found. Add a folder to start scanning.
            </p>
          )}
        </HorizontalScrollRow>
      </section>
    </div>
  )
}


export default Home
