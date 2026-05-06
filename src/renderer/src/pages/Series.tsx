import React, { useEffect, useState, useRef } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import { groupSeriesCards } from '../utils/seriesCards'
import { Tv } from 'lucide-react'

interface SeriesProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
}

const Series: React.FC<SeriesProps> = ({ onPlay, onShowDetail }) => {
  const [series, setSeries] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const isInitialLoad = useRef(true)

  const fetchSeries = async () => {
    // Only show skeletons on the absolute first load to prevent "flickering"
    if (isInitialLoad.current) {
      setLoading(true)
    }

    try {
      const allVideos: Video[] = await window.api.getVideos()
      
      setSeries(groupSeriesCards(allVideos))
    } finally {
      setLoading(false)
      isInitialLoad.current = false
    }
  }

  useEffect(() => {
    fetchSeries()
    window.api.onLibraryUpdated(fetchSeries)
    return () => window.api.removeAllLibraryUpdateListeners()
  }, [])

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-4">
        <div className="p-4 bg-primary/10 rounded-2xl text-primary">
          <Tv size={32} />
        </div>
        <div>
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Web Series</h2>
          <p className="text-white/30 font-bold text-sm tracking-wide">Binge-worthy shows from your library</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : series.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {series.map(video => (
            <VideoCard key={video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-40 text-center space-y-6 opacity-20">
          <Tv size={80} strokeWidth={1} />
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase italic">No Series Found</h3>
            <p className="text-sm font-bold uppercase tracking-widest">Add a folder containing web series to start</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Series
