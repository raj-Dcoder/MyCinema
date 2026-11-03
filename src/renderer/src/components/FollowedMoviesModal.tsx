import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Bell, BellRing, BellOff, X, RotateCcw, Loader2, Sparkles, CheckCircle2, Film } from 'lucide-react'
import { Video } from '../types'
import { safeGetFollowedMovies, safeUnfollowMovie, safeCheckFollowedMovieUpdates, safeMarkFollowedMovieSeen } from '../utils/streamResume'

interface FollowedMoviesModalProps {
  isOpen: boolean
  onClose: () => void
  onShowDetail: (video: Video) => void
  onFollowedChange?: () => void
}

const getPosterUrl = (path?: string | null) => {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `https://image.tmdb.org/t/p/w185${path}`
}

const formatLastChecked = (dateStr?: string | null) => {
  if (!dateStr) return 'Not checked yet'
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime()
    if (diffMs < 60 * 1000) return 'Just now'
    const diffMins = Math.floor(diffMs / (60 * 1000))
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMs / (3600 * 1000))
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffMs / (24 * 3600 * 1000))
    return `${diffDays}d ago`
  } catch {
    return 'Recently'
  }
}

export const FollowedMoviesModal: React.FC<FollowedMoviesModalProps> = ({
  isOpen,
  onClose,
  onShowDetail,
  onFollowedChange
}) => {
  const [moviesList, setMoviesList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)
  const [unfollowingId, setUnfollowingId] = useState<number | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const loadFollowedMovies = useCallback(async () => {
    try {
      setLoading(true)
      const list = await safeGetFollowedMovies()
      setMoviesList(list || [])
    } catch (err) {
      console.error('[FollowedMoviesModal] Failed to load followed movies:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      void loadFollowedMovies()
    }
  }, [isOpen, loadFollowedMovies])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleUnfollow = async (tmdbId: number, title: string) => {
    if (unfollowingId) return
    setUnfollowingId(tmdbId)
    try {
      await safeUnfollowMovie(tmdbId)
      setMoviesList(prev => prev.filter(item => Number(item.tmdb_id) !== Number(tmdbId)))
      setStatusMessage(`Unfollowed ${title}`)
      setTimeout(() => setStatusMessage(null), 3000)
      onFollowedChange?.()
    } catch (err) {
      console.error('[FollowedMoviesModal] Failed to unfollow:', err)
    } finally {
      setUnfollowingId(null)
    }
  }

  const handleCheckUpdatesNow = async () => {
    if (isCheckingUpdates) return
    setIsCheckingUpdates(true)
    setStatusMessage('Checking TMDB for OTT release updates...')
    try {
      const updated = await safeCheckFollowedMovieUpdates(true)
      if (updated) {
        setMoviesList(updated)
        const newDrops = updated.filter(item => item.has_unseen_drop || item.is_released_ott)
        if (newDrops.length > 0) {
          setStatusMessage(`${newDrops.length} movie${newDrops.length === 1 ? '' : 's'} available on OTT!`)
        } else {
          setStatusMessage('All followed movies are up to date.')
        }
      } else {
        setStatusMessage('Follow check is up to date.')
      }
      onFollowedChange?.()
    } catch (err) {
      console.error('[FollowedMoviesModal] Check updates failed:', err)
      setStatusMessage('Update check failed. Check internet connection.')
    } finally {
      setIsCheckingUpdates(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  const handleOpenDetail = (f: any) => {
    // If the movie has already dropped on OTT and the user opens/views it:
    // remove from following list as instructed
    if (f.is_released_ott) {
      void safeUnfollowMovie(f.tmdb_id)
      void safeMarkFollowedMovieSeen(f.tmdb_id)
      setMoviesList(prev => prev.filter(item => Number(item.tmdb_id) !== Number(f.tmdb_id)))
      onFollowedChange?.()
    }

    const video: Video = {
      id: f.tmdb_id,
      tmdb_id: f.tmdb_id,
      type: 'movie',
      title: f.title,
      poster_path: f.poster_path,
      backdrop_path: f.backdrop_path,
      overview: f.overview,
      release_date: f.theatrical_date || undefined,
      file_path: ''
    }
    onShowDetail(video)
    onClose()
  }

  if (!isOpen) return null

  const newDropsCount = moviesList.filter(s => s.has_unseen_drop || s.is_released_ott).length

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="followed-series-modal keep-dark dark bg-[#121218]/95 border border-white/15 rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.8)] backdrop-blur-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col text-white animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <BellRing className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight truncate">
                  Followed Movies
                </h2>
                {moviesList.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/10 text-white/80">
                    {moviesList.length}
                  </span>
                )}
                {newDropsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-primary/20 border border-primary/40 text-primary animate-pulse">
                    {newDropsCount} on OTT
                  </span>
                )}
              </div>
              <p className="text-xs text-white/40 font-medium truncate mt-0.5">
                Tracks upcoming & theatrical movies for their official OTT release
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCheckUpdatesNow}
              disabled={isCheckingUpdates || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-wait"
              title="Check TMDB for OTT release updates now"
            >
              <RotateCcw size={13} className={isCheckingUpdates ? 'animate-spin text-primary' : ''} />
              <span>{isCheckingUpdates ? 'Checking…' : 'Check Now'}</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div className="px-6 py-2 bg-sky-500/10 border-b border-sky-500/20 text-sky-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150">
            <Sparkles size={13} className="shrink-0" />
            <span className="truncate">{statusMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/40 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs font-bold uppercase tracking-widest">Loading followed movies...</p>
            </div>
          ) : moviesList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/30 mb-4 shadow-lg">
                <Film size={28} />
              </div>
              <h3 className="text-base font-black text-white uppercase tracking-wider mb-2">
                No Followed Movies Yet
              </h3>
              <p className="text-xs text-white/50 leading-relaxed font-medium mb-5">
                When a movie is in theaters and you want to wait for its official high-quality OTT release, tap the Bell icon on its Detail page. MyCinema will notify you and surface it right into your Homepage Hero Carousel as soon as it drops on OTT.
              </p>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-[11px] font-semibold text-white/60">
                <CheckCircle2 size={13} className="text-primary" />
                <span>Open any movie and tap the Bell icon to follow</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {moviesList.map((movie) => {
                const posterUrl = getPosterUrl(movie.poster_path)
                const isReleased = Boolean(movie.is_released_ott)
                const isUnfollowingThis = unfollowingId === Number(movie.tmdb_id)

                return (
                  <div
                    key={movie.tmdb_id}
                    className={`flex items-center justify-between gap-4 p-3.5 rounded-xl border transition-all ${
                      isReleased
                        ? 'bg-sky-500/10 border-sky-400/30 shadow-[0_4px_20px_rgba(56,189,248,0.15)]'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div
                      className="flex items-center gap-3.5 min-w-0 cursor-pointer flex-1"
                      onClick={() => handleOpenDetail(movie)}
                    >
                      {/* Poster Thumbnail */}
                      <div className="w-12 h-16 rounded-lg overflow-hidden bg-black/60 border border-white/10 shrink-0 flex items-center justify-center">
                        {posterUrl ? (
                          <img
                            src={posterUrl}
                            alt={movie.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Film size={18} className="text-white/20" />
                        )}
                      </div>

                      {/* Movie Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-[14px] font-bold text-white tracking-tight truncate hover:text-sky-400 transition-colors">
                            {movie.title}
                          </h4>
                          {isReleased ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-sm shrink-0">
                              {movie.ott_platform ? `Now on ${movie.ott_platform}` : 'Available on OTT'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-300 shrink-0">
                              In Theaters
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-[11px] text-white/50 font-medium">
                          {movie.theatrical_date && (
                            <span>Theatrical: {movie.theatrical_date.substring(0, 10)}</span>
                          )}
                          {movie.theatrical_date && <span>·</span>}
                          <span>Checked: {formatLastChecked(movie.last_checked)}</span>
                        </div>

                        {movie.overview && (
                          <p className="mt-1 text-[11px] text-white/40 line-clamp-1 font-normal">
                            {movie.overview}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleOpenDetail(movie)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          isReleased
                            ? 'bg-sky-500 hover:bg-sky-400 text-black shadow-md shadow-sky-950/40'
                            : 'bg-white/10 hover:bg-white/20 text-white'
                        }`}
                      >
                        {isReleased ? 'Watch' : 'View'}
                      </button>

                      <button
                        onClick={() => handleUnfollow(movie.tmdb_id, movie.title)}
                        disabled={isUnfollowingThis}
                        className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                        title="Unfollow movie"
                        aria-label="Unfollow"
                      >
                        {isUnfollowingThis ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <BellOff size={15} />
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-white/40">
          <span>{moviesList.length} movies tracked</span>
          <span>Auto-checks for OTT releases in background</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default FollowedMoviesModal
