import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Bell, BellRing, BellOff, X, RotateCcw, ExternalLink, Loader2, Sparkles, CheckCircle2 } from 'lucide-react'
import { Video } from '../types'
import { safeGetFollowedSeries, safeUnfollowSeries, safeCheckFollowedUpdates } from '../utils/streamResume'

interface FollowedSeriesModalProps {
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

export const FollowedSeriesModal: React.FC<FollowedSeriesModalProps> = ({
  isOpen,
  onClose,
  onShowDetail,
  onFollowedChange
}) => {
  const [seriesList, setSeriesList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)
  const [unfollowingId, setUnfollowingId] = useState<number | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const loadFollowedSeries = useCallback(async () => {
    try {
      setLoading(true)
      const list = await safeGetFollowedSeries()
      setSeriesList(list || [])
    } catch (err) {
      console.error('[FollowedSeriesModal] Failed to load followed series:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      void loadFollowedSeries()
    }
  }, [isOpen, loadFollowedSeries])

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
      await safeUnfollowSeries(tmdbId)
      setSeriesList(prev => prev.filter(item => Number(item.tmdb_id) !== Number(tmdbId)))
      setStatusMessage(`Unfollowed ${title}`)
      setTimeout(() => setStatusMessage(null), 3000)
      onFollowedChange?.()
    } catch (err) {
      console.error('[FollowedSeriesModal] Failed to unfollow:', err)
    } finally {
      setUnfollowingId(null)
    }
  }

  const handleCheckUpdatesNow = async () => {
    if (isCheckingUpdates) return
    setIsCheckingUpdates(true)
    setStatusMessage('Checking for new episodes on TMDB...')
    try {
      const updated = await safeCheckFollowedUpdates(true)
      if (updated) {
        setSeriesList(updated)
        const newDrops = updated.filter(item => item.has_unseen_new)
        if (newDrops.length > 0) {
          setStatusMessage(`${newDrops.length} new episode drop${newDrops.length === 1 ? '' : 's'} detected!`)
        } else {
          setStatusMessage('All series are up to date.')
        }
      } else {
        setStatusMessage('Follow check is up to date.')
      }
      onFollowedChange?.()
    } catch (err) {
      console.error('[FollowedSeriesModal] Check updates failed:', err)
      setStatusMessage('Update check failed. Check internet connection.')
    } finally {
      setIsCheckingUpdates(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  const handleOpenDetail = (f: any) => {
    const video: Video = {
      id: f.tmdb_id,
      tmdb_id: f.tmdb_id,
      type: 'series',
      title: f.title,
      series_name: f.title,
      poster_path: f.poster_path,
      backdrop_path: f.backdrop_path,
      overview: f.overview,
      season: f.last_known_season ?? undefined,
      episode: f.last_known_episode ?? undefined,
      file_path: ''
    }
    onShowDetail(video)
    onClose()
  }

  if (!isOpen) return null

  const newDropsCount = seriesList.filter(s => s.has_unseen_new).length

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
                  Followed Series
                </h2>
                {seriesList.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/10 text-white/80">
                    {seriesList.length}
                  </span>
                )}
                {newDropsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-primary text-white animate-pulse">
                    {newDropsCount} NEW
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/50 font-medium truncate">
                Subscribed shows that notify you in the Hero Carousel when new episodes drop
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              type="button"
              onClick={handleCheckUpdatesNow}
              disabled={isCheckingUpdates || loading}
              className="h-8 px-3 flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all text-xs font-semibold border border-white/5 disabled:opacity-40"
              title="Check TMDB for newly released episodes now"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isCheckingUpdates ? 'animate-spin text-primary' : ''}`} />
              <span className="hidden sm:inline">Check Updates</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all active:scale-95 border border-white/5"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Notification Strip */}
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
              <p className="text-xs font-bold uppercase tracking-widest">Loading followed shows...</p>
            </div>
          ) : seriesList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/30 mb-4 shadow-lg">
                <Bell size={28} />
              </div>
              <h3 className="text-base font-black text-white uppercase tracking-wider mb-2">
                No Followed Series Yet
              </h3>
              <p className="text-xs text-white/50 leading-relaxed font-medium mb-5">
                When you follow a series (by tapping the bell icon on any show's detail page), MyCinema tracks newly released episodes and puts a card right into your Homepage Hero Carousel as soon as a new episode arrives.
              </p>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-[11px] font-semibold text-white/60">
                <CheckCircle2 size={13} className="text-primary" />
                <span>Open any series and tap the Bell icon to follow</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {seriesList.map((series) => {
                const posterUrl = getPosterUrl(series.poster_path)
                const hasNew = Boolean(series.has_unseen_new)
                const isUnfollowingThis = unfollowingId === Number(series.tmdb_id)

                return (
                  <div
                    key={series.tmdb_id}
                    className={`flex items-center justify-between gap-4 p-3.5 rounded-xl border transition-all ${
                      hasNew
                        ? 'bg-primary/10 border-primary/30 shadow-[0_4px_20px_rgba(229,9,20,0.15)]'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div
                      className="flex items-center gap-3.5 min-w-0 cursor-pointer flex-1"
                      onClick={() => handleOpenDetail(series)}
                    >
                      {/* Poster Thumbnail */}
                      <div className="w-12 h-16 rounded-lg overflow-hidden bg-black/60 border border-white/10 shrink-0 flex items-center justify-center">
                        {posterUrl ? (
                          <img
                            src={posterUrl}
                            alt={series.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Bell size={18} className="text-white/20" />
                        )}
                      </div>

                      {/* Series Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-[14px] font-bold text-white tracking-tight truncate hover:text-primary transition-colors">
                            {series.title}
                          </h4>
                          {hasNew && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-primary text-white shadow-sm animate-pulse shrink-0">
                              New Drop: S{series.last_known_season} E{series.last_known_episode}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-[11px] text-white/50 font-medium">
                          {series.last_known_season != null && series.last_known_episode != null ? (
                            <span>Latest Tracked: S{series.last_known_season} E{series.last_known_episode}</span>
                          ) : (
                            <span>Tracking future episodes</span>
                          )}
                          <span>·</span>
                          <span>Checked: {formatLastChecked(series.last_checked)}</span>
                        </div>

                        {series.overview && (
                          <p className="mt-1 text-[11px] text-white/40 line-clamp-1 font-normal">
                            {series.overview}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(series)}
                        className="h-8 px-3 rounded-lg bg-white/10 hover:bg-primary text-white text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95"
                      >
                        <span>View</span>
                        <ExternalLink size={12} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUnfollow(Number(series.tmdb_id), series.title)}
                        disabled={isUnfollowingThis}
                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 border border-white/5 flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                        title={`Unfollow ${series.title}`}
                      >
                        {isUnfollowingThis ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <BellOff size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-white/[0.01] flex items-center justify-between text-[11px] text-white/40">
          <span>Checked up to once every 20 hours in the background.</span>
          {seriesList.length > 0 && (
            <span>Tap "Check Updates" to refresh now</span>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default FollowedSeriesModal
