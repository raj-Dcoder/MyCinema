import React, { useState, useEffect } from 'react'
import { Home as HomeIcon, Film, Tv, Settings as SettingsIcon, Video as VideoIcon, Download as DownloadIcon, ChevronLeft, Menu } from 'lucide-react'
import { Video } from './types'
import Home from './pages/Home'
import Videos from './pages/Videos'
import Movies from './pages/Movies'
import Series from './pages/Series'
import Settings from './pages/Settings'
import VideoPlayer from './components/VideoPlayer'
import DetailScreen from './components/DetailScreen'
import Download from './pages/Download'

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'home' | 'videos' | 'movies' | 'series' | 'download' | 'settings'>('home')
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => {
    const saved = localStorage.getItem('sidebar_expanded')
    return saved === null ? true : saved === 'true'
  })

  useEffect(() => {
    localStorage.setItem('sidebar_expanded', isSidebarExpanded.toString())
  }, [isSidebarExpanded])

  const [playingVideo, setPlayingVideo] = useState<Video | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [homeRefreshKey, setHomeRefreshKey] = useState(0)
  const [updateState, setUpdateState] = useState<{
    status: 'idle' | 'available' | 'downloading' | 'ready'
    version?: string
    percent?: number
  }>({ status: 'idle' })

  useEffect(() => {
    window.api.onUpdateAvailable((info) => setUpdateState({ status: 'available', version: info.version }))
    window.api.onUpdateProgress((info) => setUpdateState(prev => ({ ...prev, status: 'downloading', percent: info.percent })))
    window.api.onUpdateDownloaded(() => setUpdateState(prev => ({ ...prev, status: 'ready' })))
  }, [])

  const handleSelectFolder = async () => {
    const path = await window.api.selectFolder()
    if (path) {
      await window.api.scanFolder(path)
      // Trigger refresh (simple way for now)
      window.location.reload()
    }
  }

  const navItems = [
    { id: 'home' as const,   label: 'Home',     icon: <HomeIcon size={20} /> },
    { id: 'videos' as const, label: 'Videos',   icon: <VideoIcon size={20} /> },
    { id: 'movies' as const, label: 'Movies',   icon: <Film size={20} /> },
    { id: 'series' as const, label: 'Web Series', icon: <Tv size={20} /> },
  ]

  const handlePlayVideo = (video: Video) => {
    setPlayingVideo(video)
    setSelectedVideo(null)
  }

  return (
    <div className="flex h-screen bg-background text-text">
      {/* Sidebar */}
      <div className={`bg-surface flex flex-col border-r border-secondary transition-all duration-300 ease-in-out ${isSidebarExpanded ? 'w-64' : 'w-20'}`}>
        <div className="flex items-center justify-between p-6 transition-all duration-300">
          <div className={`overflow-hidden transition-all duration-300 ${isSidebarExpanded ? 'w-[150px] opacity-100' : 'w-0 opacity-0'}`}>
            <h1 className="text-2xl font-bold text-primary tracking-tighter uppercase italic whitespace-nowrap">MyCinema</h1>
          </div>
          <button 
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className="p-2 rounded-lg hover:bg-secondary text-text transition-colors flex-shrink-0"
            title={isSidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {isSidebarExpanded ? <ChevronLeft size={20} /> : <Menu size={20} />}
          </button>
        </div>
        
        <nav className="flex-1 space-y-2 px-4 transition-all duration-300">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={!isSidebarExpanded ? item.label : undefined}
              className={`w-full flex items-center py-3 px-3 rounded-lg transition-colors ${
                activeTab === item.id ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'
              }`}
            >
              <div className={`flex-shrink-0 transition-all duration-300 ${isSidebarExpanded ? 'mr-3' : 'mr-0'}`}>
                {item.icon}
              </div>
              <div className={`overflow-hidden transition-all duration-300 whitespace-nowrap text-left ${isSidebarExpanded ? 'max-w-[150px] opacity-100' : 'max-w-0 opacity-0'}`}>
                <span className="font-medium">{item.label}</span>
              </div>
            </button>
          ))}
        </nav>

        {/* Update Banner */}
        <div className={`transition-all duration-300 overflow-hidden ${isSidebarExpanded ? 'max-h-40 opacity-100 mb-3 mx-3' : 'max-h-0 opacity-0 mb-0 mx-3'}`}>
          {updateState.status !== 'idle' && (
            <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 text-sm">
              {updateState.status === 'available' && (
                <p className="text-primary font-semibold">v{updateState.version} available — downloading...</p>
              )}
              {updateState.status === 'downloading' && (
                <>
                  <p className="text-primary font-semibold mb-1.5">Downloading update... {updateState.percent}%</p>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${updateState.percent}%` }} />
                  </div>
                </>
              )}
              {updateState.status === 'ready' && (
                <>
                  <p className="text-white font-semibold mb-2">✓ Update ready to install</p>
                  <button
                    onClick={() => window.api.installUpdate()}
                    className="w-full bg-primary hover:bg-primary/80 text-white font-bold py-1.5 rounded-lg transition-colors text-xs tracking-wide"
                  >
                    Restart &amp; Install
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-secondary space-y-2 px-4 transition-all duration-300">
          <button 
            onClick={() => setActiveTab('download')}
            title={!isSidebarExpanded ? 'Download' : undefined}
            className={`w-full flex items-center px-3 py-3 rounded-lg transition-colors ${activeTab === 'download' ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
          >
            <div className={`flex-shrink-0 transition-all duration-300 ${isSidebarExpanded ? 'mr-3' : 'mr-0'}`}>
              <DownloadIcon size={20} />
            </div>
            <div className={`overflow-hidden transition-all duration-300 whitespace-nowrap text-left ${isSidebarExpanded ? 'max-w-[150px] opacity-100' : 'max-w-0 opacity-0'}`}>
              <span className="font-medium">Download</span>
            </div>
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            title={!isSidebarExpanded ? 'Library' : undefined}
            className={`w-full flex items-center px-3 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
          >
            <div className={`flex-shrink-0 transition-all duration-300 ${isSidebarExpanded ? 'mr-3' : 'mr-0'}`}>
              <SettingsIcon size={20} />
            </div>
            <div className={`overflow-hidden transition-all duration-300 whitespace-nowrap text-left ${isSidebarExpanded ? 'max-w-[150px] opacity-100' : 'max-w-0 opacity-0'}`}>
              <span className="font-medium">Library</span>
            </div>
          </button>
        </div>

      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="p-8">
          {activeTab === 'home'    && <Home onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} refreshKey={homeRefreshKey} />}
          {activeTab === 'videos'  && <Videos onPlay={handlePlayVideo} />}
          {activeTab === 'movies'  && <Movies onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
          {activeTab === 'series'  && <Series onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
          {activeTab === 'download' && <Download />}
          {activeTab === 'settings' && <Settings />}
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
    </div>
  )
}


export default App
