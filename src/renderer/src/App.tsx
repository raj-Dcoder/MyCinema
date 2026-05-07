import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { Home as HomeIcon, Film, Tv, Settings as SettingsIcon, Video as VideoIcon, Download as DownloadIcon, ChevronLeft, ChevronRight, Menu, Bookmark, Clock, Heart, User, Search as SearchIcon, Bell, Settings, RefreshCw, Maximize2, Sparkles, Zap, ShieldCheck, Wrench, Check } from 'lucide-react'
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
import Download from './pages/Download'
import appLogo from './assets/mycinema-logo.png'

const LATEST_RELEASE = {
  version: '1.19.3',
  eyebrow: 'What\'s New',
  headline: 'Watch Together and Home load cleaner.',
  summary: 'This patch keeps watch parties open and reduces repeated TMDB traffic on launch.',
  steps: [
    {
      icon: Wrench,
      title: 'Watch Together',
      description: 'The watch party popup now stays open while you use it.',
      color: 'from-blue-500 to-cyan-400',
      iconColor: 'text-cyan-400',
      items: [
        'Host Party, Join, copy, and code entry no longer dismiss the popup.',
        'Player clicks and watch party controls now stay separated.'
      ]
    },
    {
      icon: Sparkles,
      title: 'Home Discovery',
      description: 'Home discovery data is reused between app launches.',
      color: 'from-emerald-400 to-teal-500',
      iconColor: 'text-emerald-400',
      items: [
        'Trending movies, trending series, and India OTT rows now use a 6-hour cache.',
        'Restarting the app no longer refetches those TMDB lists immediately.'
      ]
    },
    {
      icon: ShieldCheck,
      title: 'Security & Privacy',
      description: 'Networking stays quieter and more predictable.',
      color: 'from-amber-400 to-orange-500',
      iconColor: 'text-amber-400',
      items: [
        'Successful TMDB list responses are cached locally in the app data folder.',
        'The cache refreshes after 6 hours or if the saved data cannot be read.'
      ]
    }
  ]
}

const getWhatsNewStorageKey = (version: string) => `mycinema_whats_new_seen_${version}`
const isDevPreview = import.meta.env.DEV

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'home' | 'videos' | 'movies' | 'series' | 'download' | 'settings' | 'watchlist' | 'history' | 'favorites'>('home')
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true)

  const [showWhatsNew, setShowWhatsNew] = useState(() => isDevPreview || localStorage.getItem(getWhatsNewStorageKey(LATEST_RELEASE.version)) !== 'true')
  const [whatsNewStep, setWhatsNewStep] = useState(0)

  const [playingVideo, setPlayingVideo] = useState<Video | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [homeRefreshKey, setHomeRefreshKey] = useState(0)
  const [userName, setUserName] = useState(() => localStorage.getItem('mycinema_user_name') || 'User')
  const [isFullscreen, setIsFullscreen] = useState(true)
  const [launchFullscreen, setLaunchFullscreen] = useState(true)
  const [showWindowControls, setShowWindowControls] = useState(false)
  const windowControlsHideTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const handleNameUpdate = () => {
      setUserName(localStorage.getItem('mycinema_user_name') || 'User')
    }
    window.addEventListener('mycinema_name_updated', handleNameUpdate)
    return () => window.removeEventListener('mycinema_name_updated', handleNameUpdate)
  }, [])

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
            type: 'movie',
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
    if (whatsNewStep < LATEST_RELEASE.steps.length - 1) {
      setWhatsNewStep(step => step + 1)
      return
    }

    closeWhatsNew()
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
                onClick={() => setActiveTab(item.id)}
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
                  onClick={() => setActiveTab(item.id)}
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
              onClick={() => !isSidebarExpanded && setActiveTab('settings')}
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
                  onClick={() => setActiveTab('settings')}
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
      <main className="flex-1 overflow-y-auto scrollbar-hide relative">
        <div className={activeTab === 'home' ? 'pt-6 pb-14' : 'px-8 pt-6 pb-14 max-w-[1600px] mx-auto'}>
          {activeTab === 'home'    && <Home onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} onNavigate={setActiveTab} refreshKey={homeRefreshKey} />}
          {activeTab === 'videos'  && <Videos onPlay={handlePlayVideo} />}
          {activeTab === 'movies'  && <Movies onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
          {activeTab === 'series'  && <Series onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
          {activeTab === 'watchlist' && <Watchlist onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
          {activeTab === 'history' && <History onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
          {activeTab === 'favorites' && <Favorites onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
          {activeTab === 'download' && <Download onShowDetail={setSelectedVideo} />}
          {activeTab === 'settings' && <SettingsPage />}
        </div>
      </main>

      {/* Detail Screen Overlay */}
      {selectedVideo && (
        <DetailScreen 
          video={selectedVideo} 
          onClose={() => setSelectedVideo(null)} 
          onPlay={handlePlayVideo}
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

      {/* What's New Modal */}
      <AnimatePresence>
        {showWhatsNew && (() => {
          const step = LATEST_RELEASE.steps[whatsNewStep]
          const StepIcon = step.icon
          const isLastStep = whatsNewStep === LATEST_RELEASE.steps.length - 1

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
            >
              <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={closeWhatsNew} />

              <motion.div
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 10, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#090d14] shadow-2xl"
              >
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={whatsNewStep}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 0.08, scale: 1.25 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1 }}
                      className={clsx(
                        'absolute right-0 top-0 h-80 w-80 -translate-y-1/2 translate-x-1/3 rounded-full bg-gradient-to-br blur-[100px]',
                        step.color
                      )}
                    />
                  </AnimatePresence>
                </div>

                <div className="relative p-6 sm:p-8">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                        {LATEST_RELEASE.eyebrow} / v{LATEST_RELEASE.version}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold tracking-tight text-white">{LATEST_RELEASE.headline}</h2>
                    </div>
                    <button
                      onClick={closeWhatsNew}
                      className="rounded-lg px-2 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      Skip
                    </button>
                  </div>

                  <div className="mb-6 flex gap-1.5">
                    {LATEST_RELEASE.steps.map((_, idx) => (
                      <div key={idx} className="h-1 w-10 overflow-hidden rounded-full bg-white/10">
                        {idx <= whatsNewStep && (
                          <motion.div
                            layoutId="whatsNewProgressIndicator"
                            className={clsx('h-full bg-gradient-to-r', step.color)}
                            initial={{ width: idx < whatsNewStep ? '100%' : '0%' }}
                            animate={{ width: '100%' }}
                            transition={{ duration: 0.4 }}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="min-h-[215px]">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={whatsNewStep}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col items-start gap-4"
                      >
                        <div className={clsx('rounded-xl border border-white/10 bg-white/[0.04] p-3', step.iconColor)}>
                          <StepIcon size={26} strokeWidth={1.6} />
                        </div>
                        <div>
                          <h3 className="mb-2 text-2xl font-semibold tracking-tight text-white">{step.title}</h3>
                          <p className="max-w-lg text-sm leading-6 text-zinc-400">{step.description}</p>
                        </div>
                        <div className="w-full space-y-2 border-t border-white/10 pt-3">
                          {step.items.map(item => (
                            <div key={item} className="flex gap-3">
                              <span className={clsx('mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current', step.iconColor)} />
                              <p className="text-[13px] leading-5 text-white/68">{item}</p>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  <div className="mt-7 flex items-center justify-between">
                    <div className="text-xs text-zinc-500">
                      Step {whatsNewStep + 1} of {LATEST_RELEASE.steps.length}
                    </div>
                    <button
                      onClick={handleWhatsNewNext}
                      className={clsx(
                        'group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-5 py-2.5 text-sm transition-all duration-300',
                        isLastStep
                          ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:bg-zinc-200'
                          : 'border border-white/10 bg-white/10 text-white hover:border-white/30 hover:bg-white/20'
                      )}
                    >
                      <span className="font-medium">{isLastStep ? 'Get Started' : 'Next'}</span>
                      {isLastStep ? (
                        <Check size={18} className="transition-transform group-hover:scale-110" />
                      ) : (
                        <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}


export default App
