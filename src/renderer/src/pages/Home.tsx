import React, { useEffect, useState } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import SeriesModal from '../components/SeriesModal'

interface HomeProps {
  onPlay: (video: Video) => void
}

const Home: React.FC<HomeProps> = ({ onPlay }) => {
  const [continueWatching, setContinueWatching] = useState<Video[]>([])
  const [recentMovies, setRecentMovies] = useState<Video[]>([])
  const [recentSeries, setRecentSeries] = useState<Video[]>([])
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null)

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
    
    setContinueWatching(uniqueCW)
    setRecentMovies(allVideos.filter(v => v.type === 'movie').slice(0, 10))
    
    // Also unique series for "Recently Added TV Shows"
    const recentS: Video[] = []
    const seenRecentSeries = new Set<string>()
    for (const video of allVideos.filter(v => v.type === 'series')) {
      if (video.series_name && !seenRecentSeries.has(video.series_name)) {
        recentS.push(video)
        seenRecentSeries.add(video.series_name)
      }
    }
    setRecentSeries(recentS.slice(0, 10))
  }

  useEffect(() => {
    fetchData()
    
    // Refresh data every 10 seconds to keep progress updated
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-12">
      {continueWatching.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-6 flex items-center">
            Continue Watching
            <span className="ml-2 w-2 h-2 rounded-full bg-primary" />
          </h2>
          <div className="flex overflow-x-auto gap-4 pb-6 scrollbar-hide">
            {continueWatching.map(video => (
              <div key={video.id} className="w-36 md:w-44 lg:w-52 flex-shrink-0">
                <VideoCard video={video} onPlay={onPlay} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-bold mb-6">Recently Added Movies</h2>
        <div className="flex overflow-x-auto gap-4 pb-6 scrollbar-hide">
          {recentMovies.map(video => (
            <div key={video.id} className="w-36 md:w-44 lg:w-52 flex-shrink-0">
              <VideoCard video={video} onPlay={onPlay} />
            </div>
          ))}
          {recentMovies.length === 0 && (
            <p className="text-muted w-full py-12 text-center border-2 border-dashed border-secondary rounded-xl">
              No movies found. Add a folder to start scanning.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-6">Recently Added TV Shows</h2>
        <div className="flex overflow-x-auto gap-4 pb-6 scrollbar-hide">
          {recentSeries.map(video => (
            <div key={video.id} className="w-36 md:w-44 lg:w-52 flex-shrink-0">
              <VideoCard 
                video={video} 
                onPlay={(v) => {
                  if (v.series_name) setSelectedSeries(v.series_name)
                  else onPlay(v)
                }} 
              />
            </div>
          ))}
          {recentSeries.length === 0 && (
            <p className="text-muted w-full py-12 text-center border-2 border-dashed border-secondary rounded-xl">
              No TV shows found. Add a folder to start scanning.
            </p>
          )}
        </div>
      </section>

      {selectedSeries && (
        <SeriesModal 
          seriesName={selectedSeries} 
          onClose={() => setSelectedSeries(null)} 
          onPlay={(v) => {
            setSelectedSeries(null)
            onPlay(v)
          }}
        />
      )}
    </div>
  )
}

export default Home
