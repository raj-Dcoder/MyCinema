import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Home as HomeIcon, Film, Tv, Settings as SettingsIcon, Video as VideoIcon, Download as DownloadIcon, Menu, Bookmark, Clock, Heart, Settings, RefreshCw, Maximize2, Minimize2, Loader2, PauseCircle, AlertCircle, X, Minus, ArrowUpRight, Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { Video } from './types'
import Home from './pages/Home'
import Videos from './pages/Videos'
import Movies from './pages/Movies'
import Series from './pages/Series'
import Watchlist from './pages/Watchlist'
import Favorites from './pages/Favorites'
import History from './pages/History'
import SettingsPage from './pages/Settings'
import VideoPlayer from './components/VideoPlayer'
import DetailScreen from './components/DetailScreen'
import WhatsNewOnboarding, { LATEST_RELEASE } from './components/WhatsNewOnboarding'
import { WindowControlsGuide } from './components/FeatureGuides'
import Download from './pages/Download'
import appLogo from './assets/mycinema-logo.png'

const getWhatsNewStorageKey = (version: string) => `mycinema_whats_new_seen_${version}`
const SIDEBAR_EXPANDED_STORAGE_KEY = 'mycinema_sidebar_expanded'
const DOUBLE_TAP_WINDOW_MS = 300
type AppTab = 'home' | 'videos' | 'movies' | 'series' | 'download' | 'settings' | 'watchlist' | 'history' | 'favorites'

type ActiveDownload = {
  id: string
  title?: string
  name?: string | null
  progress?: number
  status?: 'downloading' | 'done' | 'error' | 'paused' | 'connecting' | 'pending' | string
  downloadSpeed?: string
  timeRemaining?: string
  addedAt?: string
}

const getDownloadTime = (download: ActiveDownload) => {
  const time = download.addedAt ? new Date(download.addedAt).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

const sortDownloadsForTray = (items: ActiveDownload[]) => (
  [...items].sort((a, b) => {
    const statusRank = (status?: string) => {
      if (status === 'downloading' || status === 'connecting') return 0
      if (status === 'paused' || status === 'pending') return 1
      if (status === 'error') return 2
      return 3
    }

    const statusDiff = statusRank(a.status) - statusRank(b.status)
    if (statusDiff !== 0) return statusDiff
    return getDownloadTime(b) - getDownloadTime(a)
  })
)

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('home')
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => {
    return localStorage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY) !== 'false'
  })
  const [showWhatsNew, setShowWhatsNew] = useState(() => {
    return localStorage.getItem(getWhatsNewStorageKey(LATEST_RELEASE.version)) !== 'true'
  })

  const [playingVideo, setPlayingVideo] = useState<Video | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [sharedSource, setSharedSource] = useState<any | null>(null)
  const [homeRefreshKey, setHomeRefreshKey] = useState(0)
  const [watchlistRefreshKey, setWatchlistRefreshKey] = useState(0)
  const [userName, setUserName] = useState(() => localStorage.getItem('mycinema_user_name') || 'User')
  const [profileImage, setProfileImage] = useState<string | null>(() => localStorage.getItem('mycinema_profile_image'))
  const [isFullscreen, setIsFullscreen] = useState(true)
  const [launchFullscreen, setLaunchFullscreen] = useState(true)
  const [showWindowControls, setShowWindowControls] = useState(false)
  const [videoControlsVisible, setVideoControlsVisible] = useState(false)
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([])
  const [dismissedDownloadTrayIds, setDismissedDownloadTrayIds] = useState<Set<string>>(() => new Set())
  const [webPopupOpen, setWebPopupOpen] = useState(false)
  const homeScrollRef = useRef<HTMLDivElement | null>(null)
  const activePageScrollRef = useRef<HTMLDivElement | null>(null)
  const activeTabRef = useRef<AppTab>('home')
  const tabScrollPositionsRef = useRef<Partial<Record<AppTab, number>>>({})
  const windowControlsHideTimerRef = useRef<number | null>(null)
  const appFullscreenTapTimerRef = useRef<number | null>(null)
  const appFullscreenToggleInFlightRef = useRef(false)

  const getScrollElement = (tab: AppTab) => {
    return tab === 'home' ? homeScrollRef.current : activePageScrollRef.current
  }

  const navigateToTab = (tab: AppTab) => {
    const currentScroller = getScrollElement(activeTabRef.current)
    if (currentScroller) {
      tabScrollPositionsRef.current[activeTabRef.current] = currentScroller.scrollTop
    }

    setActiveTab(tab)
  }

  useLayoutEffect(() => {
    activeTabRef.current = activeTab

    const scrollTop = tabScrollPositionsRef.current[activeTab] ?? 0
    const scroller = getScrollElement(activeTab)
    scroller?.scrollTo({ top: scrollTop, behavior: 'auto' })
    const frame = window.requestAnimationFrame(() => {
      getScrollElement(activeTab)?.scrollTo({ top: scrollTop, behavior: 'auto' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeTab])

  useEffect(() => {
    const handleNameUpdate = () => {
      setUserName(localStorage.getItem('mycinema_user_name') || 'User')
    }
    const handleProfileUpdate = () => {
      setProfileImage(localStorage.getItem('mycinema_profile_image'))
    }
    window.addEventListener('mycinema_name_updated', handleNameUpdate)
    window.addEventListener('mycinema_profile_updated', handleProfileUpdate)
    return () => {
      window.removeEventListener('mycinema_name_updated', handleNameUpdate)
      window.removeEventListener('mycinema_profile_updated', handleProfileUpdate)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, String(isSidebarExpanded))
  }, [isSidebarExpanded])



  useEffect(() => {
    window.api.isFullscreen().then(setIsFullscreen).catch(() => {})
    return window.api.onFullscreenChanged(setIsFullscreen)
  }, [])

  useEffect(() => {
    const handlePopupOpened = () => setWebPopupOpen(true)
    const handlePopupClosed = () => setWebPopupOpen(false)
    window.addEventListener('web-popup-opened', handlePopupOpened)
    window.addEventListener('web-popup-closed', handlePopupClosed)
    return () => {
      window.removeEventListener('web-popup-opened', handlePopupOpened)
      window.removeEventListener('web-popup-closed', handlePopupClosed)
    }
  }, [])

  useEffect(() => {
    window.api.getAppSettings().then(settings => {
      setLaunchFullscreen(settings.launchFullscreen)
    }).catch(() => {})

    return window.api.onAppSettingsChanged(settings => {
      setLaunchFullscreen(settings.launchFullscreen)
      if (!settings.launchFullscreen) {
        setShowWindowControls(false)
      }
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    const refreshDownloads = () => {
      window.api.getActiveDownloads()
        .then((downloads: ActiveDownload[]) => {
          if (!cancelled) setActiveDownloads(downloads || [])
        })
        .catch(err => console.error('[DownloadsTray] Failed to load downloads:', err))
    }

    refreshDownloads()

    const cleanup = window.api.onTorrentProgress((data: ActiveDownload) => {
      if (!data?.id) return
      setActiveDownloads(prev => {
        const index = prev.findIndex(download => download.id === data.id)
        if (index === -1) return [data, ...prev]
        const next = [...prev]
        next[index] = { ...next[index], ...data }
        return next
      })
    })
    const cleanupDownloadsChanged = window.api.onDownloadsChanged(refreshDownloads)

    return () => {
      cancelled = true
      cleanup()
      cleanupDownloadsChanged()
    }
  }, [])

  useEffect(() => {
    return () => {
      clearWindowControlsHideTimer()
      if (appFullscreenTapTimerRef.current) {
        window.clearTimeout(appFullscreenTapTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const openSharedMedia = async (target: { type: 'movie' | 'series'; tmdbId: number; source?: any }) => {
      try {
        const video = await window.api.getSharedMediaByTmdbId(target.type, target.tmdbId)
        if (cancelled || !video) return

        setPlayingVideo(null)
        setSharedSource(target.source || null)
        setSelectedVideo(video)
        setActiveTab(target.type === 'series' ? 'series' : 'movies')
      } catch (err) {
        console.error('[DeepLink] Failed to open shared media:', err)
      }
    }

    window.api.getPendingSharedMediaTarget()
      .then(target => {
        if (target) openSharedMedia(target)
      })
      .catch(err => console.error('[DeepLink] Pending shared media lookup failed:', err))

    const cleanup = window.api.onOpenSharedMedia(openSharedMedia)

    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  const [updateState, setUpdateState] = useState<{
    status: 'idle' | 'available' | 'downloading' | 'ready'
    version?: string
    percent?: number
  }>({ status: 'idle' })

  useEffect(() => {
    window.api.onUpdateAvailable((info) => setUpdateState({ status: 'available', version: info.version }))
    window.api.onUpdateProgress((info) => setUpdateState(prev => ({ ...prev, status: 'downloading', percent: info.percent })))
    window.api.onUpdateDownloaded(() => setUpdateState(prev => ({ ...prev, status: 'ready' })))

    const playExternalFile = (filePath: string) => {
      window.api.getVideos().then((videos: any) => {
        const existing = videos.find((v: any) => v.file_path === filePath)
        if (existing) {
          setPlayingVideo(existing)
        } else {
          const fakeVideo: Video = {
            id: -1,
            title: filePath.split(/[\\/]/).pop() || 'Unknown Video',
            file_path: filePath,
            type: 'video',
            duration: 0
          }
          setPlayingVideo(fakeVideo)
        }
      })
    }

    window.api.getPendingExternalFile().then((filePath) => {
      if (filePath) playExternalFile(filePath)
    })

    const cleanupOpenExternal = window.api.onOpenExternalFile((filePath: string) => {
      playExternalFile(filePath)
    })

    return () => {
      cleanupOpenExternal()
    }
  }, [])

  const navItems = [
    { id: 'home' as const,     label: 'Home',         icon: <HomeIcon size={20} /> },
    { id: 'movies' as const,   label: 'Movies',       icon: <Film size={20} /> },
    { id: 'series' as const,   label: 'Web Series',   icon: <Tv size={20} /> },
    { id: 'videos' as const,   label: 'Videos',       icon: <VideoIcon size={20} /> },
    { id: 'watchlist' as const, label: 'Watchlist',    icon: <Bookmark size={20} /> },
    { id: 'download' as const,  label: 'Downloads',    icon: <DownloadIcon size={20} /> },
  ]

  const libraryItems = [
    { id: 'history' as const,   label: 'History',      icon: <Clock size={20} /> },
    { id: 'favorites' as const, label: 'Favorites',    icon: <Heart size={20} /> },
  ]

  const handlePlayVideo = (video: Video) => {
    setPlayingVideo(video)
  }

  const handleStartUpdateDownload = async () => {
    setUpdateState(prev => ({ ...prev, status: 'downloading', percent: 0 }))
    try {
      await window.api.startUpdateDownload()
    } catch (err) {
      console.error('Update download failed:', err)
      setUpdateState(prev => ({ ...prev, status: 'available' }))
    }
  }

  const clearWindowControlsHideTimer = () => {
    if (windowControlsHideTimerRef.current) {
      window.clearTimeout(windowControlsHideTimerRef.current)
      windowControlsHideTimerRef.current = null
    }
  }

  const revealWindowControls = () => {
    clearWindowControlsHideTimer()
    setShowWindowControls(true)
  }

  const hideWindowControlsSoon = () => {
    clearWindowControlsHideTimer()
    windowControlsHideTimerRef.current = window.setTimeout(() => {
      setShowWindowControls(false)
      windowControlsHideTimerRef.current = null
    }, 700)
  }

  const handleToggleFullscreen = async () => {
    if (appFullscreenToggleInFlightRef.current) return
    appFullscreenToggleInFlightRef.current = true
    try {
      const nextState = await window.api.toggleFullscreen()
      setIsFullscreen(nextState)
      if (!nextState) {
        setShowWindowControls(false)
      }
    } finally {
      appFullscreenToggleInFlightRef.current = false
    }
  }

  const handleAppSurfaceClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (playingVideo) return

    const target = event.target as HTMLElement
    // Controls, fields, dialogs, and the player always retain their own interaction model.
    if (target.closest('button, a, input, textarea, select, option, [contenteditable="true"], [role="button"], [role="dialog"], [data-fullscreen-gesture-ignore], [data-fullscreen-gesture-scope]')) {
      return
    }

    if (appFullscreenTapTimerRef.current) {
      window.clearTimeout(appFullscreenTapTimerRef.current)
      appFullscreenTapTimerRef.current = null
      void handleToggleFullscreen()
      return
    }

    appFullscreenTapTimerRef.current = window.setTimeout(() => {
      appFullscreenTapTimerRef.current = null
    }, DOUBLE_TAP_WINDOW_MS)
  }

  const WindowControls = () => {
    if (!launchFullscreen) return null

    const controlsVisible = showWindowControls || (!!playingVideo && videoControlsVisible)
    const controlButtonClass = 'flex h-6 w-7 items-center justify-center text-white/60 transition-[color,opacity,transform] duration-150 hover:text-white/95 active:scale-90 focus:outline-none focus:text-white focus:ring-1 focus:ring-white/35'

    if (isFullscreen) {
      return (
        <div
          className="fixed right-2 top-0 z-[260] flex h-6 w-24 items-center justify-end"
          onMouseEnter={revealWindowControls}
          onMouseLeave={hideWindowControlsSoon}
          onFocus={revealWindowControls}
          onBlur={hideWindowControlsSoon}
        >
          <div
            className={`flex items-center gap-1 transition-opacity duration-200 ${
              controlsVisible ? 'opacity-100' : 'opacity-55'
            }`}
          >
            <button
              type="button"
              title="Minimize"
              aria-label="Minimize"
              onClick={() => window.api.minimizeWindow()}
              className={controlButtonClass}
            >
              <Minus size={17} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              title="Exit fullscreen"
              aria-label="Exit fullscreen"
              onClick={handleToggleFullscreen}
              className={controlButtonClass}
            >
              <Minimize2 size={15} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              title="Close"
              aria-label="Close"
              onClick={() => window.api.closeWindow()}
              className={`${controlButtonClass} hover:text-red-300 focus:ring-red-300/50 focus:text-red-200`}
            >
              <X size={17} strokeWidth={2.3} />
            </button>
          </div>
        </div>
      )
    }

    return (
      <div
        className="fixed right-3 top-0 z-[260] flex h-6 w-28 items-center justify-end gap-1"
        onMouseEnter={revealWindowControls}
        onMouseLeave={hideWindowControlsSoon}
        onFocus={revealWindowControls}
        onBlur={hideWindowControlsSoon}
      >
        <span
          className={`pointer-events-none text-[9px] font-bold uppercase tracking-[0.14em] text-white/50 transition-opacity duration-150 ${
            controlsVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          Fullscreen
        </span>
        <button
          type="button"
          title="Enter fullscreen"
          aria-label="Enter fullscreen"
          onClick={handleToggleFullscreen}
          className={`flex h-6 w-7 items-center justify-center text-white/60 transition-[color,opacity,transform] duration-150 hover:text-white/95 active:scale-90 focus:outline-none focus:text-white focus:ring-1 focus:ring-white/35 ${
            controlsVisible ? 'opacity-100' : 'opacity-55'
          }`}
        >
          <Maximize2 size={15} strokeWidth={2.2} />
        </button>
      </div>
    )
  }

  const visibleDownloads = sortDownloadsForTray(activeDownloads.filter(download => (
    download.status === 'downloading' ||
    download.status === 'connecting' ||
    download.status === 'paused' ||
    download.status === 'pending' ||
    download.status === 'error'
  ) && !dismissedDownloadTrayIds.has(download.id)))
  const trayDownload = visibleDownloads[0]
  const trayProgress = Math.max(0, Math.min(100, Math.round(Number(trayDownload?.progress || 0))))
  const trayTitle = trayDownload ? (trayDownload.name || trayDownload.title || 'Download') : ''
  const shouldShowDownloadTray = Boolean(trayDownload && activeTab !== 'download' && !playingVideo)

  return (
    <div
      className="flex h-screen bg-[#05080d] text-text font-sans overflow-hidden"
      onClick={handleAppSurfaceClick}
    >
      <WindowControls />

      {/* Popup backdrop blur overlay — sits between WindowControls and main content */}
      <div
        className={`absolute inset-0 z-[200] transition-all duration-300 ${webPopupOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={webPopupOpen ? { backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.35)' } : { backdropFilter: 'blur(0px)', background: 'transparent' }}
      />

      {/* Sidebar */}
      <div className={`group/sidebar relative bg-white/[0.02] backdrop-blur-2xl flex flex-col border-r border-white/5 transition-[width] duration-300 ease-in-out z-40 ${isSidebarExpanded ? 'w-64' : 'w-20'}`}>
        
        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
          className="absolute -right-3.5 top-9 z-50 flex h-7 w-7 items-center justify-center rounded-full bg-[#1a2230] border border-white/10 text-white/70 shadow-xl opacity-0 -translate-x-2 pointer-events-none group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 group-hover/sidebar:pointer-events-auto hover:text-white hover:bg-[#253040] hover:scale-110 transition-all duration-300"
          title={isSidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          {isSidebarExpanded ? <ChevronLeft size={16} strokeWidth={2.5} /> : <ChevronRight size={16} strokeWidth={2.5} />}
        </button>

        <div className="relative flex h-24 items-center px-4 w-full overflow-hidden">
          <div className="w-12 h-full flex items-center justify-center flex-shrink-0">
            <img 
              src={appLogo} 
              alt="MyCinema" 
              className="h-11 w-11 rounded-full object-cover shadow-lg shadow-blue-500/10"
            />
          </div>
          <div className={`absolute left-16 whitespace-nowrap transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}>
            <span className="text-xl font-black tracking-tight text-white">MyCinema</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 space-y-8">
          {/* Main Nav */}
          <nav className="space-y-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => navigateToTab(item.id)}
                className={`relative w-full flex items-center h-12 rounded-xl transition-colors duration-200 group ${
                  activeTab === item.id ? 'bg-primary/10 text-primary' : 'text-white/40 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="w-12 h-full flex items-center justify-center flex-shrink-0 text-current">
                  {item.icon}
                </div>
                <div className={`absolute left-12 whitespace-nowrap text-sm font-bold transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}>
                  {item.label}
                </div>
              </button>
            ))}
          </nav>

          {/* Library Section */}
          <div className="space-y-1">
            <div className="h-6 relative overflow-hidden">
              <h3 className={`absolute left-3 top-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/20 whitespace-nowrap transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}>
                Library
              </h3>
            </div>
            <nav className="space-y-1">
              {libraryItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => navigateToTab(item.id)}
                  className={`relative w-full flex items-center h-12 rounded-xl transition-colors duration-200 group ${
                    activeTab === item.id ? 'bg-primary/10 text-primary' : 'text-white/40 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="w-12 h-full flex items-center justify-center flex-shrink-0 text-current">
                    {item.icon}
                  </div>
                  <div className={`absolute left-12 whitespace-nowrap text-sm font-bold transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}>
                    {item.label}
                  </div>
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className={`overflow-hidden px-4 transition-all duration-300 ${!isSidebarExpanded && updateState.status !== 'idle' ? 'max-h-16 pb-3 opacity-100' : 'max-h-0 pb-0 opacity-0'}`}>
          <button
            className={`relative mx-auto flex items-center gap-1.5 h-9 rounded-lg border px-3 transition-all ${
              updateState.status === 'ready'
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                : updateState.status === 'downloading'
                  ? 'border-primary/25 bg-primary/10 text-primary hover:bg-primary/20'
                  : 'border-primary/25 bg-primary/10 text-primary hover:bg-primary/20'
            }`}
            title={
              updateState.status === 'ready'
                ? 'Update ready to install'
                : updateState.status === 'downloading'
                  ? `Downloading update ${updateState.percent ?? 0}%`
                  : `New update available${updateState.version ? `: v${updateState.version}` : ''}`
            }
            onClick={() => {
              if (updateState.status === 'available') handleStartUpdateDownload()
              if (updateState.status === 'ready') window.api.installUpdate()
            }}
          >
            {updateState.status === 'downloading' ? (
              <RefreshCw size={14} className="animate-spin shrink-0" />
            ) : updateState.status === 'ready' ? (
              <DownloadIcon size={14} className="shrink-0" />
            ) : (
              <DownloadIcon size={14} className="shrink-0" />
            )}
            <span className="text-xs font-semibold">
              {updateState.status === 'available' && 'Update'}
              {updateState.status === 'downloading' && `${updateState.percent ?? 0}%`}
              {updateState.status === 'ready' && 'Install'}
            </span>
            {updateState.status === 'available' && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(229,9,20,0.7)]" />
            )}
            {updateState.status === 'ready' && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
            )}
          </button>
        </div>

        <div className={`overflow-hidden px-4 transition-all duration-300 ${isSidebarExpanded && updateState.status !== 'idle' ? 'max-h-60 pb-3 opacity-100' : 'max-h-0 pb-0 opacity-0'}`}>
          {updateState.status === 'available' && (
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <DownloadIcon size={15} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Update Available</p>
                  {updateState.version && (
                    <p className="text-xs text-white/40">v{updateState.version} is ready to download</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleStartUpdateDownload}
                className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-white hover:bg-[#c40812] transition-colors"
              >
                Download Update
              </button>
            </div>
          )}

          {updateState.status === 'downloading' && (
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <RefreshCw size={15} className="text-primary animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Downloading</p>
                  <p className="text-xs text-white/40">{updateState.percent ?? 0}% complete</p>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${updateState.percent ?? 0}%` }}
                />
              </div>
            </div>
          )}

          {updateState.status === 'ready' && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <DownloadIcon size={15} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Update Ready</p>
                  {updateState.version && (
                    <p className="text-xs text-white/40">v{updateState.version} installed</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => window.api.installUpdate()}
                className="w-full rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-white hover:bg-emerald-400 transition-colors"
              >
                Restart & Install
              </button>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="p-4 mt-auto">
          <div className="relative flex items-center bg-white/5 rounded-2xl border border-white/5 h-[52px] w-full overflow-hidden transition-all duration-300">
            
            {/* Avatar (Fixed Left) */}
            <div className="absolute left-1 w-10 h-10 flex-shrink-0 flex items-center justify-center">
              <div 
                className={`relative w-full h-full rounded-xl ${profileImage ? 'bg-transparent' : 'bg-red-600'} flex items-center justify-center text-white font-black text-lg shadow-lg italic cursor-pointer hover:scale-105 transition-transform overflow-hidden`}
                onClick={() => navigateToTab('settings')}
                title="Settings & Profile"
              >
                {profileImage ? (
                  <img src={profileImage} alt={userName} className="w-full h-full object-cover" />
                ) : (
                  userName.charAt(0).toUpperCase()
                )}
              </div>
            </div>

            {/* Expanded Content */}
            <div className={`absolute left-14 right-2 flex items-center justify-between transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigateToTab('settings')}>
                <h4 className="text-sm font-bold text-white truncate italic">{userName}</h4>
              </div>
              <button 
                onClick={() => navigateToTab('settings')}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                title="Settings"
              >
                <SettingsIcon size={18} />
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative flex-1 overflow-hidden">
        <div
          ref={homeScrollRef}
          className={activeTab === 'home' ? 'absolute inset-0 overflow-y-auto scrollbar-hide pt-6 pb-14 opacity-100 transition-opacity duration-300' : 'pointer-events-none absolute inset-0 overflow-y-auto scrollbar-hide pt-6 pb-14 opacity-0 transition-opacity duration-300'}
          aria-hidden={activeTab !== 'home'}
        >
          <Home onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} onNavigate={navigateToTab} refreshKey={homeRefreshKey} />
        </div>

        {activeTab !== 'home' && (
          <div ref={activePageScrollRef} className="absolute inset-0 overflow-y-auto scrollbar-hide animate-in fade-in duration-300">
            <div className="px-8 pt-6 pb-14 max-w-[1600px] mx-auto">
              {activeTab === 'videos'  && <Videos onPlay={handlePlayVideo} />}
              {activeTab === 'movies'  && <Movies onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
              {activeTab === 'series'  && <Series onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
              {activeTab === 'watchlist' && <Watchlist onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} refreshKey={watchlistRefreshKey} />}
              {activeTab === 'history' && <History onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
              {activeTab === 'favorites' && <Favorites onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
              {activeTab === 'download' && <Download onShowDetail={setSelectedVideo} />}
              {activeTab === 'settings' && <SettingsPage />}
            </div>
          </div>
        )}
      </main>

      {shouldShowDownloadTray && (
        <div className="fixed bottom-5 right-5 z-[45] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#0b1018]/95 p-4 pr-11 text-left shadow-[0_18px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-all hover:-translate-y-1 hover:border-primary/35 hover:bg-[#101722]">
          <button
            type="button"
            aria-label="Close download tray"
            title="Close"
            onClick={() => {
              if (!trayDownload?.id) return
              setDismissedDownloadTrayIds(prev => {
                const next = new Set(prev)
                next.add(trayDownload.id)
                return next
              })
            }}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-white/38 transition-all hover:bg-white/10 hover:text-white active:scale-95"
          >
            <X size={15} />
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('download')}
            className="block w-full text-left"
            title="Open downloads"
          >
            <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              trayDownload?.status === 'error'
                ? 'border-red-400/25 bg-red-500/12 text-red-300'
                : trayDownload?.status === 'paused'
                  ? 'border-amber-400/25 bg-amber-400/12 text-amber-200'
                  : 'border-cyan-400/25 bg-cyan-400/12 text-cyan-200'
            }`}>
              {trayDownload?.status === 'error' ? (
                <AlertCircle size={19} />
              ) : trayDownload?.status === 'paused' ? (
                <PauseCircle size={19} />
              ) : (
                <Loader2 size={19} className="animate-spin" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-black text-white">
                  {trayTitle}
                </p>
                <span className="shrink-0 text-xs font-black text-primary">
                  {trayProgress}%
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest text-white/38">
                <span>
                  {trayDownload?.status === 'paused'
                    ? 'Paused'
                    : trayDownload?.status === 'error'
                      ? 'Download error'
                      : trayDownload?.status === 'connecting'
                        ? 'Connecting'
                        : 'Downloading'}
                </span>
                {visibleDownloads.length > 1 && (
                  <span>{visibleDownloads.length - 1} more</span>
                )}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    trayDownload?.status === 'error'
                      ? 'bg-red-400'
                      : trayDownload?.status === 'paused'
                        ? 'bg-amber-300'
                        : 'bg-gradient-to-r from-cyan-300 to-primary'
                  }`}
                  style={{ width: `${trayProgress}%` }}
                />
              </div>
            </div>
            </div>
          </button>
        </div>
      )}

      {/* Detail Screen Overlay */}
      {selectedVideo && (
        <DetailScreen 
          video={selectedVideo} 
          initialSharedSource={sharedSource}
          onClose={() => {
            setSelectedVideo(null)
            setSharedSource(null)
          }} 
          onPlay={handlePlayVideo}
          onWatchlistChange={() => setWatchlistRefreshKey(k => k + 1)}
        />
      )}

      {/* Video Player Overlay */}
      {playingVideo && (
        <VideoPlayer 
          video={playingVideo} 
          onClose={() => {
            setPlayingVideo(null)
            setHomeRefreshKey(k => k + 1)
          }} 
          onControlsVisibilityChange={setVideoControlsVisible}
        />
      )}

      {/* Full-screen What's New onboarding */}
      {showWhatsNew && (
        <WhatsNewOnboarding
          currentStep={0}
          onNext={() => {}}
          onPrevious={() => {}}
          onStepChange={() => {}}
          onClose={() => {
            localStorage.setItem(getWhatsNewStorageKey(LATEST_RELEASE.version), 'true')
            setShowWhatsNew(false)
          }}
        />
      )}

      <WindowControlsGuide launchFullscreen={launchFullscreen} playingVideo={!!playingVideo} />
    </div>
  )
}


export default App
