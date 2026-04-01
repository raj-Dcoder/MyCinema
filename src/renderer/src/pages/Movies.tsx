import React, { useEffect, useState } from 'react'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'

interface MoviesProps {
  onPlay: (video: Video) => void
}

const Movies: React.FC<MoviesProps> = ({ onPlay }) => {
  const [movies, setMovies] = useState<Video[]>([])

  const fetchMovies = async () => {
    const allVideos: Video[] = await window.api.getVideos()
    // Exclude short clips (< 1 hour) — those live under the Videos tab
    // Videos with 0 / null duration haven't been probed yet, keep them here for now
    setMovies(allVideos.filter(v => v.type === 'movie' && (v.duration === 0 || !v.duration || v.duration >= 3600)))
  }

  useEffect(() => {
    fetchMovies()
    
    window.api.onLibraryUpdated(fetchMovies)
    return () => window.api.removeAllLibraryUpdateListeners()
  }, [])

  return (
    <div>
      <h2 className="text-3xl font-bold mb-8">Movies</h2>
      <div className="flex flex-wrap gap-6 pb-6">
        {movies.map(video => (
          <div key={video.id} className="w-36 md:w-44 lg:w-52 flex-shrink-0">
            <VideoCard video={video} onPlay={onPlay} />
          </div>
        ))}
        {movies.length === 0 && (
          <p className="text-muted w-full py-12 text-center">No movies found.</p>
        )}
      </div>
    </div>
  )
}

export default Movies
