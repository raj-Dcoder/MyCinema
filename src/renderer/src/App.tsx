import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Home as HomeIcon, Film, Tv, Settings as SettingsIcon, Video as VideoIcon, Download as DownloadIcon, Menu, Bookmark, Clock, Heart, Settings, RefreshCw, Maximize2, Minimize2, Loader2, PauseCircle, AlertCircle, X } from 'lucide-react'
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
import Download from './pages/Download'
import appLogo from './assets/mycinema-logo.png'

const getWhatsNewStorageKey = (version: string) => `mycinema_whats_new_seen_${version}`
const SIDEBAR_EXPANDED_STORAGE_KEY = 'mycinema_sidebar_expanded'
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

  const [showWhatsNew, setShowWhatsNew] = useState(() => localStorage.getItem(getWhatsNewStorageKey(LATEST_RELEASE.version)) !== 'true')
  const [whatsNewStep, setWhatsNewStep] = useState(0)

  const [playingVideo, setPlayingVideo] = useState<Video | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [sharedSource, setSharedSource] = useState<any | null>(null)
  const [homeRefreshKey, setHomeRefreshKey] = useState(0)
  const [watchlistRefreshKey, setWatchlistRefreshKey] = useState(0)
  const [userName, setUserName] = useState(() => localStorage.getItem('mycinema_user_name') || 'User')
  const [isFullscreen, setIsFullscreen] = useState(true)
  const [launchFullscreen, setLaunchFullscreen] = useState(true)
  const [showWindowControls, setShowWindowControls] = useState(false)
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([])
  const [dismissedDownloadTrayIds, setDismissedDownloadTrayIds] = useState<Set<string>>(() => new Set())
  const homeScrollRef = useRef<HTMLDivElement | null>(null)
  const activePageScrollRef = useRef<HTMLDivElement | null>(null)
  const activeTabRef = useRef<AppTab>('home')
  const tabScrollPositionsRef = useRef<Partial<Record<AppTab, number>>>({})
  const windowControlsHideTimerRef = useRef<number | null>(null)
  const windowControlsRevealTimerRef = useRef<number | null>(null)
  const windowControlsRevealLockedRef = useRef(false)
  const windowControlsRevealUnlockTimerRef = useRef<number | null>(null)

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
    window.addEventListener('mycinema_name_updated', handleNameUpdate)
    return () => window.removeEventListener('mycinema_name_updated', handleNameUpdate)
  }, [])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, String(isSidebarExpanded))
  }, [isSidebarExpanded])

  useEffect(() => {
    window.api.isFullscreen().then(setIsFullscreen).catch(() => {})
    return window.api.onFullscreenChanged(setIsFullscreen)
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
      clearWindowControlsRevealTimer()
      clearWindowControlsRevealUnlockTimer()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const openSharedMedia = async (target: { type: 'movie' | 'series'; tmdbId: number; source?: any }) => {
      try {
        const video = await window.api.getSharedMediaByTmdbId(target.type, target.tmdbId)
        if (cancelled || !video) return

        setShowWhatsNew(false)
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
    setSelectedVideo(null)
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

  const closeWhatsNew = () => {
    localStorage.setItem(getWhatsNewStorageKey(LATEST_RELEASE.version), 'true')
    setShowWhatsNew(false)
    setWhatsNewStep(0)
  }

  const handleWhatsNewNext = () => {
    if (whatsNewStep < LATEST_RELEASE.slides.length - 1) {
      setWhatsNewStep(step => step + 1)
      return
    }

    closeWhatsNew()
  }

  const handleWhatsNewPrevious = () => {
    setWhatsNewStep(step => Math.max(0, step - 1))
  }

  const handleWhatsNewStepChange = (step: number) => {
    setWhatsNewStep(Math.min(Math.max(step, 0), LATEST_RELEASE.slides.length - 1))
  }

  const clearWindowControlsHideTimer = () => {
    if (windowControlsHideTimerRef.current) {
      window.clearTimeout(windowControlsHideTimerRef.current)
      windowControlsHideTimerRef.current = null
    }
  }

  const clearWindowControlsRevealTimer = () => {
    if (windowControlsRevealTimerRef.current) {
      window.clearTimeout(windowControlsRevealTimerRef.current)
      windowControlsRevealTimerRef.current = null
    }
  }

  const clearWindowControlsRevealUnlockTimer = () => {
    if (windowControlsRevealUnlockTimerRef.current) {
      window.clearTimeout(windowControlsRevealUnlockTimerRef.current)
      windowControlsRevealUnlockTimerRef.current = null
    }
  }

  const unlockWindowControlsReveal = () => {
    windowControlsRevealLockedRef.current = false
    clearWindowControlsRevealUnlockTimer()
  }

  const lockWindowControlsRevealBriefly = () => {
    windowControlsRevealLockedRef.current = true
    clearWindowControlsRevealTimer()
    clearWindowControlsRevealUnlockTimer()
    windowControlsRevealUnlockTimerRef.current = window.setTimeout(() => {
      windowControlsRevealLockedRef.current = false
      windowControlsRevealUnlockTimerRef.current = null
    }, 350)
  }

  const hideWindowControlsNow = () => {
    clearWindowControlsRevealTimer()
    clearWindowControlsHideTimer()
    setShowWindowControls(false)
  }

  const revealWindowControls = () => {
    if (windowControlsRevealLockedRef.current) return
    clearWindowControlsRevealTimer()
    clearWindowControlsHideTimer()
    setShowWindowControls(true)
  }

  const revealWindowControlsAfterDwell = () => {
    if (windowControlsRevealLockedRef.current || showWindowControls) return
    clearWindowControlsRevealTimer()
    windowControlsRevealTimerRef.current = window.setTimeout(() => {
      windowControlsRevealTimerRef.current = null
      revealWindowControls()
    }, 260)
  }

  const hideWindowControlsSoon = () => {
    clearWindowControlsRevealTimer()
    clearWindowControlsHideTimer()
    windowControlsHideTimerRef.current = window.setTimeout(() => {
      setShowWindowControls(false)
      windowControlsHideTimerRef.current = null
    }, 500)
  }

  const WindowControls = () => (
    <>
      {launchFullscreen && (
        <>
          <style>{`
            @keyframes fullscreenControlPop {
              0% { opacity: 0; transform: translate(-50%, -34px) scale(0.96); }
              68% { opacity: 1; transform: translate(-50%, 3px) scale(1.02); }
              100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
            }
          `}</style>
          <div
            className="fixed left-1/2 top-0 z-[259] h-2 w-[min(28rem,100vw)] -translate-x-1/2"
            onMouseEnter={revealWindowControlsAfterDwell}
            onMouseLeave={() => {
              clearWindowControlsRevealTimer()
              unlockWindowControlsReveal()
              hideWindowControlsSoon()
            }}
          />
          <div
            className={`fixed left-1/2 top-4 z-[260] -translate-x-1/2 rounded-lg border border-white/10 bg-black/70 p-1.5 shadow-[0_16px_42px_rgba(0,0,0,0.46)] backdrop-blur-xl transition-[opacity,transform] duration-300 ease-out ${
              showWindowControls ? 'translate-y-0 scale-100 opacity-100 animate-[fullscreenControlPop_220ms_ease-out_both]' : '-translate-y-10 scale-95 opacity-0 pointer-events-none'
            }`}
            onMouseEnter={revealWindowControls}
            onMouseLeave={() => {
              unlockWindowControlsReveal()
              hideWindowControlsSoon()
            }}
            onFocus={revealWindowControls}
            onBlur={hideWindowControlsSoon}
          >
            <button
              type="button"
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              onClick={async (event) => {
                lockWindowControlsRevealBriefly()
                hideWindowControlsNow()
                event.currentTarget.blur()
                const nextState = await window.api.toggleFullscreen()
                setIsFullscreen(nextState)
              }}
              className="flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-white/75 transition-all duration-150 hover:scale-[1.02] hover:bg-white/10 hover:text-white active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/60"
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              <span>{isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</span>
            </button>
          </div>
        </>
      )}
    </>
  )

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
    <div className="flex h-screen bg-[#05080d] text-text font-sans overflow-hidden">
      <WindowControls />

      {/* Sidebar */}
      <div className={`bg-[#0a0f18] flex flex-col border-r border-white/5 transition-all duration-300 ease-in-out ${isSidebarExpanded ? 'w-64' : 'w-20'}`}>
        <div className="flex items-center justify-between gap-3 px-4 py-6">
          <div className={`flex min-w-0 flex-1 items-center gap-3 overflow-hidden transition-all duration-300 ${isSidebarExpanded ? 'max-w-[190px] opacity-100' : 'max-w-0 opacity-0'}`}>
            <img src={appLogo} alt="MyCinema" className="h-11 w-11 flex-shrink-0 rounded-full object-cover shadow-lg shadow-blue-500/10" />
            <span className="min-w-0 whitespace-nowrap text-xl font-black tracking-tight text-white">MyCinema</span>
          </div>
          <button 
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors flex-shrink-0"
          >
            <Menu size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 space-y-8">
          {/* Main Nav */}
          <nav className="space-y-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => navigateToTab(item.id)}
                className={`w-full flex items-center py-3 px-4 rounded-xl transition-all duration-200 group ${
                  activeTab === item.id ? 'bg-primary/10 text-primary' : 'text-white/40 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex-shrink-0">{item.icon}</div>
                <div className={`ml-4 overflow-hidden transition-all duration-300 whitespace-nowrap text-sm font-bold ${isSidebarExpanded ? 'max-w-[150px] opacity-100' : 'max-w-0 opacity-0'}`}>
                  {item.label}
                </div>
              </button>
            ))}
          </nav>

          {/* Library Section */}
          <div className="space-y-3">
            <h3 className={`px-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/20 transition-opacity duration-300 ${isSidebarExpanded ? 'opacity-100' : 'opacity-0'}`}>
              Library
            </h3>
            <nav className="space-y-1">
              {libraryItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => navigateToTab(item.id)}
                  className={`w-full flex items-center py-3 px-4 rounded-xl transition-all duration-200 group ${
                    activeTab === item.id ? 'bg-primary/10 text-primary' : 'text-white/40 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex-shrink-0">{item.icon}</div>
                  <div className={`ml-4 overflow-hidden transition-all duration-300 whitespace-nowrap text-sm font-bold ${isSidebarExpanded ? 'max-w-[150px] opacity-100' : 'max-w-0 opacity-0'}`}>
                    {item.label}
                  </div>
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className={`overflow-hidden px-4 transition-all duration-300 ${!isSidebarExpanded && updateState.status !== 'idle' ? 'max-h-20 pb-4 opacity-100' : 'max-h-0 pb-0 opacity-0'}`}>
          <button
            className={`relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border transition-all ${
              updateState.status === 'ready'
                ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-200 shadow-lg shadow-emerald-950/30'
                : updateState.status === 'downloading'
                  ? 'border-cyan-300/35 bg-cyan-400/15 text-cyan-200 shadow-lg shadow-cyan-950/30'
                  : 'border-cyan-300/25 bg-cyan-400/10 text-cyan-200 shadow-lg shadow-cyan-950/20 hover:bg-cyan-400/20'
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
              <>
                <RefreshCw size={20} className="animate-spin" />
                <span className="absolute -bottom-1 rounded-md bg-cyan-300 px-1.5 py-0.5 text-[8px] font-black text-slate-950">
                  {updateState.percent ?? 0}%
                </span>
              </>
            ) : (
              <DownloadIcon size={21} />
            )}
            {updateState.status === 'available' && (
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.85)]" />
            )}
            {updateState.status === 'ready' && (
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.85)]" />
            )}
          </button>
        </div>

        <div className={`overflow-hidden px-4 transition-all duration-300 ${isSidebarExpanded && updateState.status !== 'idle' ? 'max-h-56 pb-4 opacity-100' : 'max-h-0 pb-0 opacity-0'}`}>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
            {updateState.status === 'available' && (
              <div className="space-y-3">
                <p className="text-sm font-bold text-white">
                  New update available{updateState.version ? `: v${updateState.version}` : ''}
                </p>
                <p className="text-xs font-medium text-white/60">
                  Download it when you're ready.
                </p>
                <button
                  onClick={handleStartUpdateDownload}
                  className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition-colors hover:bg-cyan-300"
                >
                  Download Update
                </button>
              </div>
            )}

            {updateState.status === 'downloading' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-white">Downloading update</p>
                  <span className="text-xs font-black text-cyan-300">{updateState.percent ?? 0}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                    style={{ width: `${updateState.percent ?? 0}%` }}
                  />
                </div>
              </div>
            )}

            {updateState.status === 'ready' && (
              <div className="space-y-3">
                <p className="text-sm font-bold text-white">
                  Update ready{updateState.version ? `: v${updateState.version}` : ''}
                </p>
                <button
                  onClick={() => window.api.installUpdate()}
                  className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition-colors hover:bg-cyan-300"
                >
                  Restart and Install
                </button>
              </div>
            )}
          </div>
        </div>

        {/* User Profile */}
        <div className="p-4 mt-auto">
          <div className={`flex items-center gap-4 p-3 bg-white/5 rounded-2xl border border-white/5 transition-all duration-300 ${isSidebarExpanded ? 'w-full' : 'w-12 justify-center'}`}>
            <div 
              className={`w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white font-black text-lg shadow-lg italic flex-shrink-0 cursor-pointer hover:scale-105 transition-transform`}
              onClick={() => !isSidebarExpanded && navigateToTab('settings')}
              title={!isSidebarExpanded ? `Settings (${userName})` : undefined}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
            
            {isSidebarExpanded && (
              <>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-white truncate italic">{userName}</h4>
                </div>
                <button 
                  onClick={() => navigateToTab('settings')}
                  className="p-2 text-white/40 hover:text-white transition-colors"
                >
                  <SettingsIcon size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative flex-1 overflow-hidden">
        <div
          ref={homeScrollRef}
          className={activeTab === 'home' ? 'absolute inset-0 overflow-y-auto scrollbar-hide pt-6 pb-14 opacity-100' : 'pointer-events-none absolute inset-0 overflow-y-auto scrollbar-hide pt-6 pb-14 opacity-0'}
          aria-hidden={activeTab !== 'home'}
        >
          <Home onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} onNavigate={navigateToTab} refreshKey={homeRefreshKey} />
        </div>

        {activeTab !== 'home' && (
          <div ref={activePageScrollRef} className="absolute inset-0 overflow-y-auto scrollbar-hide">
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
        />
      )}

      {/* What's New Onboarding */}
      <AnimatePresence>
        {showWhatsNew && (
          <WhatsNewOnboarding
            currentStep={whatsNewStep}
            onNext={handleWhatsNewNext}
            onPrevious={handleWhatsNewPrevious}
            onStepChange={handleWhatsNewStepChange}
            onClose={closeWhatsNew}
          />
        )}
      </AnimatePresence>
    </div>
  )
}


export default App
