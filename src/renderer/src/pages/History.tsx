import React, { useState, useEffect, useRef } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import { Clock } from 'lucide-react'

interface HistoryProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
}

const History: React.FC<HistoryProps> = ({ onPlay, onShowDetail }) => {
  const [items, setItems] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const isInitialLoad = useRef(true)

  const fetchHistory = async () => {
    if (isInitialLoad.current) {
      setLoading(true)
    }

    try {
      const data: Video[] = await window.api.getVideos()
      const sortedHistory = data
        .filter(video => Boolean(video.completed) || (video.last_watched_time || 0) > 0)
        .sort((a, b) => {
          const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0
          const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0
          return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0)
        })

      const seenSeries = new Set<string>()
      const deduplicated = sortedHistory.filter(video => {
        if (video.type === 'series') {
          const seriesKey = video.tmdb_id ? `tmdb:${video.tmdb_id}` : `name:${video.series_name || video.title}`
          if (seenSeries.has(seriesKey)) {
            return false
          }
          seenSeries.add(seriesKey)
        }
        return true
      })

      setItems(deduplicated)
    } finally {
      setLoading(false)
      isInitialLoad.current = false
    }
  }

  useEffect(() => {
    fetchHistory()
    return window.api.onLibraryUpdated(fetchHistory)
  }, [])

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-4">
        <div className="p-4 bg-blue-500/10 rounded-2xl text-blue-500">
          <Clock size={32} />
        </div>
        <div>
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">History</h2>
          <p className="text-white/30 font-bold text-sm tracking-wide">Everything you have started or finished watching</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {items.map(video => (
            <VideoCard key={video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-40 text-center space-y-6 opacity-20">
          <Clock size={80} strokeWidth={1} />
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase italic">History is clear</h3>
            <p className="text-sm font-bold uppercase tracking-widest">Start or finish something to build your history</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default History
