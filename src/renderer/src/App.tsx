import React, { useState, useEffect } from 'react'
import { Home as HomeIcon, Film, Tv, Settings as SettingsIcon, Video as VideoIcon, Download as DownloadIcon, ChevronLeft, Menu, Bookmark, Clock, Heart, User, Search as SearchIcon, Bell, Settings, RefreshCw } from 'lucide-react'
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

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'home' | 'videos' | 'movies' | 'series' | 'download' | 'settings' | 'watchlist' | 'history' | 'favorites'>('home')
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true)

  const [showWhatsNew, setShowWhatsNew] = useState(() => localStorage.getItem('v1.15.4_whatsnew') !== 'true')

  const [playingVideo, setPlayingVideo] = useState<Video | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [homeRefreshKey, setHomeRefreshKey] = useState(0)
  const [userName, setUserName] = useState(() => localStorage.getItem('mycinema_user_name') || 'User')

  useEffect(() => {
    const handleNameUpdate = () => {
      setUserName(localStorage.getItem('mycinema_user_name') || 'User')
    }
    window.addEventListener('mycinema_name_updated', handleNameUpdate)
    return () => window.removeEventListener('mycinema_name_updated', handleNameUpdate)
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

  return (
    <div className="flex h-screen bg-[#05080d] text-text font-sans overflow-hidden">
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
      {showWhatsNew && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-xl bg-surface border border-secondary rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="relative h-40 bg-primary/20 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent" />
              <div className="relative z-10 text-center mt-4">
                <span className="px-3 py-1 bg-red-600 text-white text-[10px] font-black tracking-[0.2em] uppercase rounded-full mb-3 inline-block animate-pulse">Update Complete</span>
                <h2 className="text-3xl font-black text-white italic tracking-tighter">MyCinema v1.15.4</h2>
              </div>
            </div>
            
            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto scrollbar-hide">
              <div className="space-y-2 group">
                <h3 className="text-base font-black text-primary flex items-center gap-2 italic">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  Separate AI Boost Controls 🎬
                </h3>
                <p className="text-sm text-white/60 leading-relaxed pl-4 font-bold">
                  AI Boost now gives you independent toggles for sharpness and vibrance, so each video can use only the enhancement it needs.
                </p>
              </div>

              <div className="space-y-2 group">
                <h3 className="text-base font-black text-amber-400 flex items-center gap-2 italic">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Smarter Playback Controls 🛠️
                </h3>
                <p className="text-sm text-white/60 leading-relaxed pl-4 font-bold">
                  Opening the AI Boost menu no longer accidentally pauses a playing video or starts a paused one.
                </p>
              </div>

              <div className="space-y-2 group">
                <h3 className="text-base font-black text-emerald-400 flex items-center gap-2 italic">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Better Enhancement Memory 📂
                </h3>
                <p className="text-sm text-white/60 leading-relaxed pl-4 font-bold">
                  The old combined AI Enhance preference is migrated cleanly, then sharpness and vibrance remember their own choices.
                </p>
              </div>

              <div className="space-y-2 group">
                <h3 className="text-base font-black text-purple-400 flex items-center gap-2 italic">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  Renderer Maintenance 🛠️
                </h3>
                <p className="text-sm text-white/60 leading-relaxed pl-4 font-bold">
                  The quality renderer now passes separate shader controls for detail and color processing while keeping the existing look.
                </p>
              </div>
            </div>
            
            <div className="p-6 bg-white/5 border-t border-white/5 flex justify-between items-center">
              <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Check RELEASE_NOTES.md for full diff</p>
              <button
                onClick={() => {
                  localStorage.setItem('v1.15.4_whatsnew', 'true')
                  setShowWhatsNew(false)
                }}
                className="px-8 py-3 bg-red-600 text-white font-black rounded-xl hover:bg-red-700 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-600/20 italic"
              >
                Let's Go!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


export default App
