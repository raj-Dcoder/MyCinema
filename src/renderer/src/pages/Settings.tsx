import React, { useEffect, useState } from 'react'
import { FolderOpen, Trash2, Plus, HardDrive, AlertTriangle, User, Check, X as CloseIcon } from 'lucide-react'

const Settings: React.FC = () => {
  const [folders, setFolders] = useState<any[]>([])
  const [scanning, setScanning] = useState<string | null>(null)
  const [userName, setUserName] = useState(() => localStorage.getItem('mycinema_user_name') || 'User')
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempName, setTempName] = useState(userName)

  const fetchFolders = async () => {
    const f = await window.api.getFolders()
    setFolders(f)
  }

  const handleSaveName = () => {
    const trimmed = tempName.trim() || 'User'
    setUserName(trimmed)
    localStorage.setItem('mycinema_user_name', trimmed)
    setIsEditingName(false)
    // Dispatch custom event to notify other components (like Sidebar/Home)
    window.dispatchEvent(new Event('mycinema_name_updated'))
  }

  useEffect(() => {
    fetchFolders()
  }, [])

  const handleAddFolder = async () => {
    const path = await window.api.selectFolder()
    if (!path) return
    setScanning(path)
    await window.api.scanFolder(path)
    await fetchFolders()
    setScanning(null)
  }

  const handleRemoveFolder = async (folderPath: string) => {
    const confirmed = window.confirm(`Remove "${folderPath}" and all its videos from the library?`)
    if (!confirmed) return
    await window.api.removeFolder(folderPath)
    await fetchFolders()
  }

  const handleClearAllData = async () => {
    // Note: The main process also shows a native dialog for safety
    await window.api.clearAllData()
  }

  return (
    <div className="space-y-12 max-w-4xl">
      <div className="flex items-center gap-4">
        <div className="p-4 bg-white/5 rounded-2xl text-white/40">
          <HardDrive size={32} />
        </div>
        <div>
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Settings</h2>
          <p className="text-white/30 font-bold text-sm tracking-wide">Manage your library and application data</p>
        </div>
      </div>

      <div className="space-y-8">
        <section className="space-y-6">
          <h3 className="text-xl font-black text-white uppercase italic tracking-tight">User Profile</h3>
          <div className="bg-[#0a0f18] border border-white/5 rounded-3xl p-8 flex items-center gap-8 group">
            <div className="w-20 h-20 rounded-2xl bg-red-600 flex items-center justify-center text-white font-black text-4xl shadow-2xl group-hover:scale-105 transition-transform duration-500 italic">
              {userName.charAt(0).toUpperCase()}
            </div>
            
            <div className="flex-1 space-y-2">
              <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Display Name</p>
              {isEditingName ? (
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    autoFocus
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                    className="bg-white/5 border border-primary/30 rounded-xl px-4 py-2 text-xl font-black text-white focus:outline-none focus:border-primary transition-all w-64 italic"
                  />
                  <button onClick={handleSaveName} className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500 hover:text-white transition-all">
                    <Check size={20} />
                  </button>
                  <button onClick={() => { setIsEditingName(false); setTempName(userName); }} className="p-2 bg-white/5 text-white/40 rounded-lg hover:bg-white/10 hover:text-white transition-all">
                    <CloseIcon size={20} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-4 group/name">
                  <h4 className="text-3xl font-black text-white italic tracking-tighter">{userName}</h4>
                  <button 
                    onClick={() => setIsEditingName(true)}
                    className="text-[10px] font-black uppercase tracking-widest text-primary opacity-0 group-hover/name:opacity-100 transition-all hover:underline"
                  >
                    Edit Profile
                  </button>
                </div>
              )}
              <p className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
                Premium Member <span className="text-[8px]">👑</span>
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-white uppercase italic tracking-tight">Watched Folders</h3>
            <button
              onClick={handleAddFolder}
              disabled={!!scanning}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed italic"
            >
              <Plus size={16} />
              <span>{scanning ? 'Scanning…' : 'Add Folder'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {folders.length === 0 && (
              <div className="py-20 border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center space-y-4 text-white/20">
                <FolderOpen size={48} strokeWidth={1} />
                <p className="text-sm font-bold uppercase tracking-[0.2em]">No folders added yet</p>
              </div>
            )}

            {folders.map((folder: any) => (
              <div
                key={folder.id}
                className="flex items-center justify-between p-6 bg-[#0a0f18] border border-white/5 rounded-3xl group hover:border-white/10 transition-all"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-3 bg-primary/10 rounded-xl text-primary">
                    <FolderOpen size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate max-w-xl italic" title={folder.path}>
                      {folder.path}
                    </p>
                    {scanning === folder.path && (
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest animate-pulse mt-1">Currently Scanning…</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveFolder(folder.path)}
                  className="p-3 rounded-xl bg-white/5 text-white/20 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                  title="Remove folder"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Danger Zone */}
        <section className="pt-12 border-t border-white/5">
          <div className="flex items-center gap-3 mb-8">
            <AlertTriangle size={20} className="text-amber-500" />
            <h3 className="text-xl font-black text-white uppercase italic tracking-tight">Danger Zone</h3>
          </div>
          
          <div className="bg-red-500/5 border border-red-500/10 rounded-3xl p-8 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-2">
              <h4 className="text-lg font-black text-white uppercase italic">Clear All Application Data</h4>
              <p className="text-sm text-white/30 font-medium leading-relaxed max-w-lg">
                This will completely reset MyCinema, deleting your local library, watch history, watchlist, and custom settings. This action is permanent and cannot be undone.
              </p>
            </div>
            <button
              onClick={handleClearAllData}
              className="flex-shrink-0 px-8 py-4 bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 rounded-2xl font-black text-xs uppercase tracking-widest transition-all hover:scale-105 active:scale-95 italic shadow-xl shadow-red-600/10"
            >
              Clear All Data
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

export default Settings
