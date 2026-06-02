import React, { useEffect, useState } from 'react'
import { FolderOpen, Trash2, Plus, HardDrive, AlertTriangle, Check, X as CloseIcon, Maximize2, Download, Upload } from 'lucide-react'

const Settings: React.FC = () => {
  const [folders, setFolders] = useState<any[]>([])
  const [scanning, setScanning] = useState<string | null>(null)
  const [userName, setUserName] = useState(() => localStorage.getItem('mycinema_user_name') || 'User')
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempName, setTempName] = useState(userName)
  const [launchFullscreen, setLaunchFullscreen] = useState(true)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)

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
    window.api.getAppSettings().then(settings => {
      setLaunchFullscreen(settings.launchFullscreen)
    }).catch(() => {})
  }, [])

  const handleLaunchFullscreenChange = async (enabled: boolean) => {
    setLaunchFullscreen(enabled)
    try {
      const settings = await window.api.setLaunchFullscreen(enabled)
      setLaunchFullscreen(settings.launchFullscreen)
    } catch (err) {
      console.error('Failed to update fullscreen launch setting:', err)
      setLaunchFullscreen(!enabled)
    }
  }

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

  const handleExportBackup = async () => {
    setBackupBusy(true)
    setBackupMessage(null)
    try {
      const result = await window.api.exportUserBackup()
      if (result.canceled) return
      if (!result.exported) {
        setBackupMessage(result.error || 'Backup export failed.')
        return
      }

      setBackupMessage(`Exported ${result.folders || 0} folders, ${(result.externalWatchlist || 0) + (result.localWatchlist || 0)} watchlist items, and ${result.favorites || 0} favorites.`)
    } finally {
      setBackupBusy(false)
    }
  }

  const handleImportBackup = async () => {
    setBackupBusy(true)
    setBackupMessage(null)
    try {
      const result = await window.api.importUserBackup()
      if (result.canceled) return
      if (!result.imported) {
        setBackupMessage(result.error || 'Backup import failed.')
        return
      }

      await fetchFolders()
      const watchlistCount = (result.externalWatchlistImported || 0) + (result.localWatchlistRestored || 0)
      const missingText = result.foldersMissing ? ` ${result.foldersMissing} folder${result.foldersMissing === 1 ? '' : 's'} not found.` : ''
      setBackupMessage(`Imported ${result.foldersAdded || 0} folders, scanned ${result.foldersScanned || 0}, restored ${watchlistCount} watchlist items and ${result.favoritesRestored || 0} favorites.${missingText}`)
    } finally {
      setBackupBusy(false)
    }
  }

  const handleClearAllData = async () => {
    // Note: The main process also shows a native dialog for safety
    await window.api.clearAllData()
  }

  const sectionTitleClass = "text-sm font-black text-white/85 uppercase tracking-tight"
  const panelClass = "bg-[#0a0f18] border border-white/5 rounded-2xl"
  const iconBoxClass = "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/40"
  const compactButtonClass = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-white/40">
          <HardDrive size={24} />
        </div>
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Settings</h2>
          <p className="text-xs font-bold tracking-wide text-white/30">Manage library, backups, and application data</p>
        </div>
      </div>

      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className={sectionTitleClass}>User Profile</h3>
          <div className={`${panelClass} flex items-center gap-5 p-5 group`}>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-2xl font-black text-white shadow-xl shadow-red-950/20 transition-transform duration-300 group-hover:scale-105">
              {userName.charAt(0).toUpperCase()}
            </div>
            
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-white/20">Display Name</p>
              {isEditingName ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                    className="w-60 rounded-xl border border-primary/30 bg-white/5 px-3 py-2 text-sm font-black text-white transition-all focus:border-primary focus:outline-none"
                  />
                  <button onClick={handleSaveName} className="rounded-lg bg-green-500/20 p-2 text-green-400 transition-all hover:bg-green-500 hover:text-white">
                    <Check size={17} />
                  </button>
                  <button onClick={() => { setIsEditingName(false); setTempName(userName); }} className="rounded-lg bg-white/5 p-2 text-white/40 transition-all hover:bg-white/10 hover:text-white">
                    <CloseIcon size={17} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 group/name">
                  <h4 className="truncate text-xl font-black tracking-tighter text-white">{userName}</h4>
                  <button 
                    onClick={() => setIsEditingName(true)}
                    className="text-[10px] font-black uppercase tracking-widest text-primary opacity-0 group-hover/name:opacity-100 transition-all hover:underline"
                  >
                    Edit Profile
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className={sectionTitleClass}>Application</h3>
          <div className={`${panelClass} flex items-center justify-between gap-4 p-4`}>
            <div className="flex items-center gap-4 min-w-0">
              <div className={iconBoxClass}>
                <Maximize2 size={17} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-white uppercase tracking-tight">Open in Fullscreen</h4>
                <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                  Launch MyCinema in the immersive F11-style fullscreen mode and show the top-edge fullscreen control.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={launchFullscreen}
              onClick={() => handleLaunchFullscreenChange(!launchFullscreen)}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full border transition-all ${
                launchFullscreen
                  ? 'border-red-500/50 bg-red-600 shadow-lg shadow-red-950/30'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-lg transition-all ${
                  launchFullscreen ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className={sectionTitleClass}>Watched Folders</h3>
            <button
              onClick={handleAddFolder}
              disabled={!!scanning}
              className={`${compactButtonClass} bg-red-600 text-white shadow-lg shadow-red-950/20 hover:bg-red-700`}
            >
              <Plus size={16} />
              <span>{scanning ? 'Scanning…' : 'Add Folder'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {folders.length === 0 && (
              <div className="flex flex-col items-center justify-center space-y-3 rounded-2xl border border-dashed border-white/7 py-12 text-white/20">
                <FolderOpen size={36} strokeWidth={1} />
                <p className="text-xs font-bold uppercase tracking-[0.18em]">No folders added yet</p>
              </div>
            )}

            {folders.map((folder: any) => (
              <div
                key={folder.id}
                className={`${panelClass} group flex items-center justify-between gap-4 p-3 transition-all hover:border-white/10`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FolderOpen size={17} />
                  </div>
                  <div className="min-w-0">
                    <p className="max-w-2xl truncate text-xs font-black text-white" title={folder.path}>
                      {folder.path}
                    </p>
                    {scanning === folder.path && (
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest animate-pulse mt-1">Currently Scanning…</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveFolder(folder.path)}
                  className="rounded-xl bg-white/5 p-2 text-white/20 opacity-70 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                  title="Remove folder"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>

                <section className="space-y-3">
          <h3 className={sectionTitleClass}>Backup & Restore</h3>
          <div className={`${panelClass} flex flex-col justify-between gap-4 p-4 md:flex-row md:items-center`}>
            <div className="flex items-center gap-4 min-w-0">
              <div className={iconBoxClass}>
                <HardDrive size={17} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-white uppercase tracking-tight">Library Backup</h4>
                {backupMessage && (
                  <p className="mt-0.5 text-[11px] font-bold leading-4 text-primary">
                    {backupMessage}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={backupBusy}
                className={`${compactButtonClass} border border-white/10 bg-white/5 text-white hover:bg-white/10`}
              >
                <Upload size={16} />
                <span>{backupBusy ? 'Working...' : 'Export'}</span>
              </button>
              <button
                type="button"
                onClick={handleImportBackup}
                disabled={backupBusy}
                className={`${compactButtonClass} bg-red-600 text-white shadow-lg shadow-red-950/20 hover:bg-red-700`}
              >
                <Download size={16} />
                <span>{backupBusy ? 'Working...' : 'Import'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="border-t border-white/5 pt-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={17} className="text-amber-500" />
            <h3 className={sectionTitleClass}>Danger Zone</h3>
          </div>
          
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-red-500/10 bg-red-500/5 p-4 md:flex-row md:items-center">
            <div className="space-y-1">
              <h4 className="text-sm font-black uppercase text-white">Clear All Application Data</h4>
              <p className="max-w-2xl text-xs font-medium leading-5 text-white/30">
                This will completely reset MyCinema, deleting your local library, watch history, watchlist, and custom settings. This action is permanent and cannot be undone.
              </p>
            </div>
            <button
              onClick={handleClearAllData}
              className={`${compactButtonClass} flex-shrink-0 border border-red-500/20 bg-red-500/10 text-red-500 shadow-xl shadow-red-600/10 hover:bg-red-600 hover:text-white`}
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
