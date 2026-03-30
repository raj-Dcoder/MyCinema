import React, { useEffect, useState } from 'react'
import { X, Play } from 'lucide-react'
import { Video } from '../types'

interface SeriesModalProps {
  seriesName: string
  onClose: () => void
  onPlay: (video: Video) => void
}

const SeriesModal: React.FC<SeriesModalProps> = ({ seriesName, onClose, onPlay }) => {
  const [episodes, setEpisodes] = useState<Video[]>([])
  const [seasons, setSeasons] = useState<number[]>([])
  const [activeSeason, setActiveSeason] = useState<number>(1)

  useEffect(() => {
    const fetchEpisodes = async () => {
      const data: Video[] = await window.api.getSeriesInfo(seriesName)
      setEpisodes(data)
      
      const uniqueSeasons = Array.from(new Set(data.map(e => e.season || 1))).sort((a, b) => a - b)
      setSeasons(uniqueSeasons)
      if (uniqueSeasons.length > 0) {
        setActiveSeason(uniqueSeasons[0])
      }
    }
    fetchEpisodes()
  }, [seriesName])

  const filteredEpisodes = episodes.filter(e => (e.season || 1) === activeSeason)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8">
      <div className="bg-surface w-full max-w-5xl max-h-[90vh] rounded-xl overflow-hidden flex flex-col shadow-2xl border border-secondary">
        {/* Header */}
        <div className="p-6 border-b border-secondary flex items-center justify-between bg-surface/50">
          <div>
            <h2 className="text-3xl font-bold text-text">{seriesName}</h2>
            <p className="text-muted mt-1">{episodes.length} Episodes • {seasons.length} Seasons</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-full transition-colors text-muted hover:text-text"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Season Selector */}
          <div className="w-full md:w-48 border-b md:border-b-0 md:border-r border-secondary p-4 bg-background/30 overflow-y-auto">
            <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 px-2">Seasons</h3>
            <div className="flex md:flex-col space-x-2 md:space-x-0 md:space-y-1">
              {seasons.map(season => (
                <button
                  key={season}
                  onClick={() => setActiveSeason(season)}
                  className={`px-4 py-2 rounded-lg text-left transition-all ${
                    activeSeason === season 
                      ? 'bg-primary text-white font-semibold shadow-lg' 
                      : 'text-muted hover:bg-secondary hover:text-text'
                  }`}
                >
                  Season {season}
                </button>
              ))}
            </div>
          </div>

          {/* Episode List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <h3 className="text-xl font-bold mb-4">Episodes</h3>
            <div className="grid grid-cols-1 gap-3">
              {filteredEpisodes.map(episode => (
                <div 
                  key={episode.id}
                  onClick={() => onPlay(episode)}
                  className="group flex items-center p-3 rounded-xl bg-secondary/30 hover:bg-secondary/60 cursor-pointer transition-all border border-transparent hover:border-primary/30"
                >
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mr-4 group-hover:bg-primary transition-colors">
                    <Play size={20} fill="currentColor" className="ml-1 text-text" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-text truncate">
                        Episode {episode.episode}: {episode.title.split(' - ')[1] || episode.title}
                      </h4>
                      {episode.last_watched_time && episode.duration && (
                        <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded uppercase font-bold">
                          {Math.round((episode.last_watched_time / episode.duration) * 100)}% Watched
                        </span>
                      )}
                    </div>
                    {episode.last_watched_time && episode.duration && (
                       <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                         <div 
                           className="h-full bg-primary" 
                           style={{ width: `${(episode.last_watched_time / episode.duration) * 100}%` }}
                         />
                       </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SeriesModal
