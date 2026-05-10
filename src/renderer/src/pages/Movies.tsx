import React, { useEffect, useState, useRef } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import { Film } from 'lucide-react'

interface MoviesProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
}

const Movies: React.FC<MoviesProps> = ({ onPlay, onShowDetail }) => {
  const [movies, setMovies] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const isInitialLoad = useRef(true)

  const fetchMovies = async () => {
    if (isInitialLoad.current) {
      setLoading(true)
    }

    try {
      const allVideos: Video[] = await window.api.getVideos()
      
      const ONE_HOUR = 3600
      const isMovie = (v: Video) => 
        v.type === 'movie' && (v.duration === 0 || !v.duration || v.duration >= ONE_HOUR)

      setMovies(allVideos.filter(isMovie))
    } finally {
      setLoading(false)
      isInitialLoad.current = false
    }
  }

  useEffect(() => {
    fetchMovies()
    return window.api.onLibraryUpdated(fetchMovies)
  }, [])

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-4">
        <div className="p-4 bg-primary/10 rounded-2xl text-primary">
          <Film size={32} />
        </div>
        <div>
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Movies</h2>
          <p className="text-white/30 font-bold text-sm tracking-wide">Your collection of cinema</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : movies.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {movies.map(video => (
            <VideoCard key={video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-40 text-center space-y-6 opacity-20">
          <Film size={80} strokeWidth={1} />
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase italic">No Movies Found</h3>
            <p className="text-sm font-bold uppercase tracking-widest">Add a folder containing movies to start</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Movies
