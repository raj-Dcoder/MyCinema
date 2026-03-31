import React, { useEffect, useState } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import SeriesModal from '../components/SeriesModal'

interface SeriesProps {
  onPlay: (video: Video) => void
}

const Series: React.FC<SeriesProps> = ({ onPlay }) => {
  const [seriesList, setSeriesList] = useState<Video[]>([])
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null)

  const fetchSeries = async () => {
    const allVideos: Video[] = await window.api.getVideos()
    const series = allVideos.filter(v => v.type === 'series')
    
    // Group by series name and pick the first episode (usually S01E01 if sorted) for each series
    const grouped: Record<string, Video[]> = series.reduce((acc, video) => {
      const name = video.series_name || 'Unknown Series'
      if (!acc[name]) acc[name] = []
      acc[name].push(video)
      return acc
    }, {} as Record<string, Video[]>)

    const uniqueSeries: Video[] = []
    Object.keys(grouped).forEach(name => {
      // Sort episodes to pick the first one as representative
      grouped[name].sort((a, b) => {
        if (a.season !== b.season) return (a.season || 0) - (b.season || 0)
        return (a.episode || 0) - (b.episode || 0)
      })
      uniqueSeries.push(grouped[name][0])
    })

    setSeriesList(uniqueSeries)
  }

  useEffect(() => {
    fetchSeries()
    
    window.api.onLibraryUpdated(fetchSeries)
    return () => window.api.removeAllLibraryUpdateListeners()
  }, [])

  return (
    <div>
      <h2 className="text-3xl font-bold mb-8">TV Shows</h2>
      <div className="flex flex-wrap gap-6 pb-6">
        {seriesList.length === 0 && (
          <p className="text-muted text-center py-12 w-full">No TV shows found.</p>
        )}
        {seriesList.map(video => (
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
      </div>

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

export default Series
