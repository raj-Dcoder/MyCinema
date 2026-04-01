import React, { useEffect, useState } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import SeriesModal from '../components/SeriesModal'
import HorizontalScrollRow from '../components/HorizontalScrollRow'

interface HomeProps {
  onPlay: (video: Video) => void
  refreshKey?: number
}

const Home: React.FC<HomeProps> = ({ onPlay, refreshKey }) => {
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
    
    // Exclude short clips (< 1 hour) — they live in the Videos tab
    const isFullLength = (v: Video) => v.type === 'movie' && (!v.duration || v.duration >= 3600)
    setContinueWatching(uniqueCW.filter(v => v.type === 'series' || isFullLength(v)))
    setRecentMovies(allVideos.filter(isFullLength).slice(0, 10))
    
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
    
    // Refresh data using IPC events
    window.api.onLibraryUpdated(fetchData)
    return () => window.api.removeAllLibraryUpdateListeners()
  }, [refreshKey])

  return (
    <div className="space-y-12">
      {continueWatching.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-6 flex items-center">
            Continue Watching
            <span className="ml-2 w-2 h-2 rounded-full bg-primary" />
          </h2>
          <HorizontalScrollRow>
            {continueWatching.map(video => (
              <div key={video.id} className="w-36 md:w-44 lg:w-52 flex-shrink-0">
                <VideoCard video={video} onPlay={onPlay} />
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
              <VideoCard video={video} onPlay={onPlay} />
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
        <h2 className="text-2xl font-bold mb-6">Recently Added TV Shows</h2>
        <HorizontalScrollRow>
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
        </HorizontalScrollRow>
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
