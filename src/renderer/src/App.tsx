import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Home as HomeIcon, Film, Tv, Settings as SettingsIcon, Video as VideoIcon, Download as DownloadIcon, Menu, Bookmark, Clock, Heart, Settings, RefreshCw, Maximize2 } from 'lucide-react'
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
const isDevPreview = import.meta.env.DEV
type AppTab = 'home' | 'videos' | 'movies' | 'series' | 'download' | 'settings' | 'watchlist' | 'history' | 'favorites'

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('home')
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => {
    return localStorage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY) !== 'false'
  })

  const [showWhatsNew, setShowWhatsNew] = useState(() => isDevPreview || localStorage.getItem(getWhatsNewStorageKey(LATEST_RELEASE.version)) !== 'true')
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
  const homeScrollRef = useRef<HTMLDivElement | null>(null)
  const activePageScrollRef = useRef<HTMLDivElement | null>(null)
  const activeTabRef = useRef<AppTab>('home')
  const tabScrollPositionsRef = useRef<Partial<Record<AppTab, number>>>({})
  const windowControlsHideTimerRef = useRef<number | null>(null)

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
    if (!isDevPreview) {
      localStorage.setItem(getWhatsNewStorageKey(LATEST_RELEASE.version), 'true')
    }
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

  const revealWindowControls = () => {
    clearWindowControlsHideTimer()
    setShowWindowControls(true)
  }

  const hideWindowControlsSoon = () => {
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
          <div
            className="fixed right-0 top-0 z-[259] h-2 w-16"
            onMouseEnter={revealWindowControls}
            onMouseLeave={hideWindowControlsSoon}
          />
          <div
            className={`fixed right-1.5 top-1 z-[260] flex items-center rounded-lg border border-white/8 bg-black/45 p-1 shadow-[0_10px_32px_rgba(0,0,0,0.42)] backdrop-blur-xl transition-all duration-200 ease-out ${
              showWindowControls ? 'translate-y-0 opacity-100' : '-translate-y-9 opacity-0 pointer-events-none'
            }`}
            onMouseEnter={revealWindowControls}
            onMouseLeave={hideWindowControlsSoon}
          >
            <button
              type="button"
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              onClick={async () => {
                const nextState = await window.api.toggleFullscreen()
                setIsFullscreen(nextState)
                hideWindowControlsSoon()
              }}
              className="flex h-5 w-5 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Maximize2 size={10} />
            </button>
          </div>
        </>
      )}
    </>
  )

  return (
    <div className="flex h-screen bg-[#05080d] text-text font-sans overflow-hidden">
      <WindowControls />

      {/* Sidebar */}
      <div className={`bg-[#0a0f18] flex flex-col border-r border-white/5 transition-all duration-300 ease-in-out ${isSidebarExpanded ? 'w-64' : 'w-20'}`}>
        <div className="flex items-center justify-between p-6">
          <div className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ${isSidebarExpanded ? 'w-[160px] opacity-100' : 'w-0 opacity-0'}`}>
            <img src={appLogo} alt="MyCinema" className="h-12 w-12 rounded-full object-cover shadow-lg shadow-blue-500/10" />
            <span className="text-xl font-black text-white tracking-tight whitespace-nowrap">MyCinema</span>
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
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1">
                    Premium <span className="text-[8px]">👑</span>
                  </p>
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
