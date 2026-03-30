import React, { useState, useEffect } from 'react'
import { Home as HomeIcon, Film, Tv, Settings, FolderOpen, Play } from 'lucide-react'
import { Video } from './types'
import Home from './pages/Home'
import Movies from './pages/Movies'
import Series from './pages/Series'
import VideoPlayer from './components/VideoPlayer'

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'home' | 'movies' | 'series'>('home')
  const [playingVideo, setPlayingVideo] = useState<Video | null>(null)

  const handleSelectFolder = async () => {
    const path = await window.api.selectFolder()
    if (path) {
      await window.api.scanFolder(path)
      // Trigger refresh (simple way for now)
      window.location.reload()
    }
  }

  return (
    <div className="flex h-screen bg-background text-text">
      {/* Sidebar */}
      <div className="w-64 bg-surface flex flex-col border-r border-secondary">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary tracking-tighter uppercase italic">MyCinema</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <button 
            onClick={() => setActiveTab('home')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'home' ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
          >
            <HomeIcon size={20} />
            <span className="font-medium">Home</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('movies')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'movies' ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
          >
            <Film size={20} />
            <span className="font-medium">Movies</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('series')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'series' ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
          >
            <Tv size={20} />
            <span className="font-medium">TV Shows</span>
          </button>
        </nav>

        <div className="p-4 border-t border-secondary">
          <button 
            onClick={handleSelectFolder}
            className="w-full flex items-center justify-center space-x-2 bg-secondary hover:bg-muted py-2 rounded-lg transition-colors"
          >
            <FolderOpen size={18} />
            <span>Add Folder</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="p-8">
          {activeTab === 'home' && <Home onPlay={setPlayingVideo} />}
          {activeTab === 'movies' && <Movies onPlay={setPlayingVideo} />}
          {activeTab === 'series' && <Series onPlay={setPlayingVideo} />}
        </div>
      </main>

      {/* Video Player Overlay */}
      {playingVideo && (
        <VideoPlayer 
          video={playingVideo} 
          onClose={() => {
            setPlayingVideo(null)
          }} 
        />
      )}
    </div>
  )
}

export default App
