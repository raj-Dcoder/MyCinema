import React, { useEffect, useState } from 'react'
import { X, Play, Info, Calendar, Clock, Star, FolderOpen, Film, Music, Subtitles, HardDrive, ChevronDown, ChevronUp } from 'lucide-react'
import { Video } from '../types'

interface DetailScreenProps {
  video: Video
  onClose: () => void
  onPlay: (video: Video) => void
}

// ─── Media Info helpers ───────────────────────────────────────────────────────
const InfoSection: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div>
    <div className="flex items-center gap-2 mb-2.5">
      {icon}
      <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.18em]">{title}</h4>
    </div>
    <div className="space-y-1.5 pl-0.5">{children}</div>
  </div>
)

const InfoRow: React.FC<{ label: string; value: string | null | undefined }> = ({ label, value }) => {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-[11px] font-semibold text-white/80 text-right break-all">{value}</span>
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

const DetailScreen: React.FC<DetailScreenProps> = ({ video, onClose, onPlay }) => {
  const [episodes, setEpisodes] = useState<Video[]>([])
  const [loading, setLoading] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [mediaInfo, setMediaInfo] = useState<any>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [showAllAudio, setShowAllAudio] = useState(false)

  const handleOpenFolder = () => {
    window.api.openFolder(video.file_path)
  }

  const handleShowInfo = async () => {
    setShowInfoModal(true)
    if (!mediaInfo) {
      setInfoLoading(true)
      const info = await window.api.getMediaInfo(video.file_path)
      setMediaInfo(info)
      setInfoLoading(false)
    }
  }

  useEffect(() => {
    if (video.type === 'series' && video.series_name) {
      setLoading(true)
      window.api.getSeriesInfo(video.series_name).then(data => {
        setEpisodes(data)
        setLoading(false)
      })
    }
  }, [video])

  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      // Mouse button 3 is the standard "Back" button, 4 is "Forward"
      if (e.button === 3 || e.button === 4) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleGlobalMouseDown)
    return () => window.removeEventListener('mousedown', handleGlobalMouseDown)
  }, [onClose])


  const posterUrl = video.poster_path 
    ? (video.poster_path.startsWith('http') 
        ? video.poster_path 
        : `media://file/${encodeURIComponent(video.poster_path)}`)
    : null

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const genres = video.genres 
    ? video.genres.split(',').map(g => g.trim()).filter(g => g.length > 0) 
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-6xl max-h-[90vh] bg-surface rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col md:flex-row">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-30 p-2 bg-black/40 hover:bg-red-600 rounded-full text-white transition-all border border-white/10 glass-effect"
        >
          <X size={24} />
        </button>

        {/* Poster Section (Left on Desktop, Top on Mobile) */}
        <div className="w-full md:w-[40%] h-[300px] md:h-full relative overflow-hidden shrink-0">
          {posterUrl ? (
            <img 
              src={posterUrl} 
              alt={video.title} 
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-secondary flex items-center justify-center text-muted italic">
              No Poster Available
            </div>
          )}
          {/* Gradients to blend poster with content */}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent md:hidden" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-surface hidden md:block" />
          
          {/* Subtle overlay on poster for depth */}
          <div className="absolute inset-0 bg-black/20" />
        </div>

        {/* Content Section */}
        <div className="flex-1 p-6 md:p-12 overflow-y-auto scrollbar-hide flex flex-col relative bg-surface/95">
          <div className="space-y-8">
            {/* Title & Tagline */}
            <div className="space-y-2">
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white uppercase italic leading-[0.9] drop-shadow-lg">
                {video.type === 'series' && video.series_name ? video.series_name : video.title}
              </h2>
              {video.tagline && (
                <p className="text-primary font-black italic tracking-[0.2em] text-xs md:text-sm uppercase opacity-90 pl-1">
                  {video.tagline}
                </p>
              )}
            </div>

            {/* Meta Info Row */}
            <div className="flex flex-wrap items-center gap-5 text-[10px] font-black text-muted uppercase tracking-[0.15em]">
              {video.vote_average ? (
                <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/10 text-white">
                  <Star size={12} className="text-yellow-500 fill-yellow-500" />
                  <span>{video.vote_average.toFixed(1)}</span>
                </div>
              ) : null}
              {video.release_year ? (
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} className="opacity-50" />
                  <span>{video.release_year}</span>
                </div>
              ) : null}
              {video.duration && (
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className="opacity-50" />
                  <span>{formatDuration(video.duration)}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 border border-white/20 rounded text-[9px] font-black">4K Ultra HD</span>
                <span className="px-2 py-0.5 border border-white/20 rounded text-[9px] font-black">5.1 Audio</span>
              </div>
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-2">
              {genres.map((genre, idx) => (
                <span 
                  key={idx} 
                  className="px-4 py-1.5 bg-white/5 text-white/70 text-[9px] font-black uppercase tracking-widest rounded-full border border-white/10 hover:bg-primary/20 hover:text-primary hover:border-primary/30 transition-all cursor-default"
                >
                  {genre}
                </span>
              ))}
            </div>

            {/* Overview */}
            <div className="space-y-3">
              <p className="text-muted/90 text-sm md:text-base leading-relaxed max-w-2xl font-medium italic">
                {video.overview || 'No overview available for this title.'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-4 pt-4">
              <button 
                onClick={() => onPlay(video)}
                className="flex items-center gap-3 bg-red-600 hover:bg-red-700 text-white px-10 py-4 rounded-2xl font-black text-sm tracking-widest transition-all shadow-[0_10px_30px_rgba(220,38,38,0.4)] hover:scale-105 active:scale-95 group uppercase italic"
              >
                <Play fill="white" size={20} className="group-hover:scale-110 transition-transform" />
                Play Now
              </button>
              <button
                onClick={handleOpenFolder}
                className="flex items-center gap-3 bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-2xl font-black text-sm tracking-widest transition-all border border-white/10 hover:scale-105 active:scale-95 uppercase italic glass-effect"
                title="Open containing folder in Explorer"
              >
                <FolderOpen size={20} />
                Open Folder
              </button>
              <button
                onClick={handleShowInfo}
                className="flex items-center gap-3 bg-white/10 hover:bg-blue-500/20 text-white hover:text-blue-300 px-6 py-4 rounded-2xl font-black text-sm tracking-widest transition-all border border-white/10 hover:border-blue-500/30 hover:scale-105 active:scale-95 uppercase italic glass-effect"
                title="View media file info"
              >
                <Info size={20} />
                Info
              </button>
            </div>

            {/* Media Info Modal */}
            {showInfoModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowInfoModal(false)}>
                <div
                  className="relative w-full max-w-lg bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <Info size={16} className="text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Media Information</h3>
                        <p className="text-[10px] text-white/30 font-medium tracking-wide mt-0.5 truncate max-w-[260px]">{mediaInfo?.file?.name || video.title}</p>
                      </div>
                    </div>
                    <button onClick={() => setShowInfoModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all">
                      <X size={18} />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto scrollbar-thin">
                    {infoLoading ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        <p className="text-white/30 text-xs font-bold uppercase tracking-widest">Analyzing file...</p>
                      </div>
                    ) : mediaInfo?.error ? (
                      <p className="text-red-400 text-sm font-medium text-center py-8">{mediaInfo.error}</p>
                    ) : mediaInfo ? (
                      <>
                        {/* File */}
                        <InfoSection icon={<HardDrive size={14} className="text-blue-400" />} title="File">
                          <InfoRow label="Size" value={mediaInfo.file?.size} />
                          <InfoRow label="Format" value={mediaInfo.container?.format} />
                          <InfoRow label="Duration" value={mediaInfo.container?.duration ? formatDuration(mediaInfo.container.duration) : null} />
                          <InfoRow label="Bitrate" value={mediaInfo.container?.bitrate} />
                        </InfoSection>

                        {/* Video */}
                        {mediaInfo.video && (
                          <InfoSection icon={<Film size={14} className="text-purple-400" />} title="Video">
                            <InfoRow label="Codec" value={mediaInfo.video.codec} />
                            {mediaInfo.video.profile && <InfoRow label="Profile" value={mediaInfo.video.profile} />}
                            <InfoRow label="Resolution" value={mediaInfo.video.resolution} />
                            <InfoRow label="Frame Rate" value={mediaInfo.video.frameRate} />
                            {mediaInfo.video.bitDepth && <InfoRow label="Bit Depth" value={mediaInfo.video.bitDepth} />}
                            {mediaInfo.video.bitrate && <InfoRow label="Video Bitrate" value={mediaInfo.video.bitrate} />}
                          </InfoSection>
                        )}

                        {/* Audio */}
                        {mediaInfo.audio?.length > 0 && (
                          <InfoSection icon={<Music size={14} className="text-green-400" />} title={`Audio (${mediaInfo.audio.length} track${mediaInfo.audio.length > 1 ? 's' : ''})` }>
                            {(showAllAudio ? mediaInfo.audio : mediaInfo.audio.slice(0, 2)).map((track: any, i: number) => (
                              <div key={i} className={`${i > 0 ? 'border-t border-white/5 pt-2 mt-2' : ''}`}>
                                {mediaInfo.audio.length > 1 && <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Track {track.index}{track.language ? ` — ${track.language.toUpperCase()}` : ''}{track.title ? ` (${track.title})` : ''}</p>}
                                <InfoRow label="Codec" value={track.codec} />
                                <InfoRow label="Channels" value={track.channels} />
                                <InfoRow label="Sample Rate" value={track.sampleRate} />
                                {track.bitrate && <InfoRow label="Bitrate" value={track.bitrate} />}
                              </div>
                            ))}
                            {mediaInfo.audio.length > 2 && (
                              <button onClick={() => setShowAllAudio(p => !p)} className="mt-2 flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 font-black uppercase tracking-widest transition-colors">
                                {showAllAudio ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {showAllAudio ? 'Show less' : `+${mediaInfo.audio.length - 2} more tracks`}
                              </button>
                            )}
                          </InfoSection>
                        )}

                        {/* Subtitles */}
                        {mediaInfo.subtitles?.length > 0 && (
                          <InfoSection icon={<Subtitles size={14} className="text-yellow-400" />} title={`Subtitles (${mediaInfo.subtitles.length})`}>
                            <div className="flex flex-wrap gap-1.5">
                              {mediaInfo.subtitles.map((s: any, i: number) => (
                                <span key={i} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] font-bold text-white/60 uppercase tracking-widest">
                                  {s.language || s.codec || `Track ${s.index}`}
                                </span>
                              ))}
                            </div>
                          </InfoSection>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Episodes Section (for Series) */}
            {video.type === 'series' && (
              <div className="pt-10 space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                    Episodes
                  </h3>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-muted font-black uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                      {episodes.length} Episodes
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                  {loading ? (
                    <div className="col-span-full py-16 text-center">
                      <div className="inline-block w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                      <div className="text-muted font-black uppercase tracking-widest text-[10px]">Fetching episodes...</div>
                    </div>
                  ) : (
                    episodes.map((ep, idx) => (
                      <button
                        key={ep.id}
                        onClick={() => onPlay(ep)}
                        className={`flex items-center p-4 rounded-2xl transition-all border group text-left relative overflow-hidden ${
                          ep.id === video.id 
                            ? 'bg-red-600/10 border-red-600/40 translate-x-2' 
                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10 hover:-translate-y-1'
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mr-5 transition-all text-sm font-black italic ${
                          ep.id === video.id ? 'bg-red-600 text-white' : 'bg-black/40 text-muted group-hover:bg-red-600 group-hover:text-white'
                        }`}>
                          {(idx + 1).toString().padStart(2, '0')}
                        </div>
                        <div className="flex-1 truncate">
                          <div className="text-sm font-bold text-white truncate mb-0.5">
                            S{ep.season?.toString().padStart(2, '0')} E{ep.episode?.toString().padStart(2, '0')}
                          </div>
                          <div className="text-[9px] text-muted font-black uppercase tracking-[0.1em] truncate opacity-60">
                            {ep.title}
                          </div>
                        </div>
                        <div className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play size={16} className="text-red-600" fill="currentColor" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .glass-effect {
          backdrop-filter: blur(8px);
          background: rgba(255, 255, 255, 0.05);
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(229, 9, 20, 0.3);
          border-radius: 10px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(229, 9, 20, 0.5);
        }
      `}} />
    </div>
  )
}

export default DetailScreen
