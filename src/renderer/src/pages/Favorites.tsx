import React, { useState, useEffect, useRef } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import { Heart } from 'lucide-react'

interface FavoritesProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
}

const Favorites: React.FC<FavoritesProps> = ({ onPlay, onShowDetail }) => {
  const [items, setItems] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const isInitialLoad = useRef(true)

  const fetchFavorites = async () => {
    if (isInitialLoad.current) {
      setLoading(true)
    }

    try {
      const data = await window.api.getFavorites()
      setItems(data)
    } finally {
      setLoading(false)
      isInitialLoad.current = false
    }
  }

  useEffect(() => {
    fetchFavorites()
    return window.api.onLibraryUpdated(fetchFavorites)
  }, [])

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-4">
        <div className="p-4 bg-red-500/10 rounded-2xl text-red-500">
          <Heart size={32} />
        </div>
        <div>
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Favorites</h2>
          <p className="text-white/30 font-bold text-sm tracking-wide">Your most loved movies and series</p>
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
          <Heart size={80} strokeWidth={1} />
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase italic">No Favorites Yet</h3>
            <p className="text-sm font-bold uppercase tracking-widest">Mark some videos as favorite to see them here</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Favorites
