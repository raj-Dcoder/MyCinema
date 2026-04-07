import React, { useState, useEffect } from 'react'
import { Home as HomeIcon, Film, Tv, Settings as SettingsIcon, Video as VideoIcon } from 'lucide-react'
import { Video } from './types'
import Home from './pages/Home'
import Videos from './pages/Videos'
import Movies from './pages/Movies'
import Series from './pages/Series'
import Settings from './pages/Settings'
import VideoPlayer from './components/VideoPlayer'
import DetailScreen from './components/DetailScreen'

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'home' | 'videos' | 'movies' | 'series' | 'settings'>('home')
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
      <div className="w-64 bg-surface flex flex-col border-r border-secondary">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary tracking-tighter uppercase italic">MyCinema</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === item.id ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'
              }`}
            >
              {item.icon}
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Update Banner */}
        {updateState.status !== 'idle' && (
          <div className="mx-3 mb-3 rounded-xl bg-primary/10 border border-primary/30 p-3 text-sm">
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

        <div className="p-4 border-t border-secondary">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
          >
            <SettingsIcon size={20} />
            <span className="font-medium">Library</span>
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
