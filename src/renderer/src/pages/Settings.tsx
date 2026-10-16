import React, { useEffect, useState } from 'react'
import { FolderOpen, Trash2, Plus, HardDrive, AlertTriangle, Check, X as CloseIcon, Maximize2, Download, Upload, Image as ImageIcon, Subtitles, Wifi, Bell, Compass, RotateCcw, Layers } from 'lucide-react'
import ProfilePictureModal from '../components/ProfilePictureModal'
import { SUBTITLE_STYLE_KEY, SUBTITLE_FONT_SIZE_KEY, SUBTITLE_POSITION_KEY, type SubtitleStyle } from '../components/player/SubtitleOverlay'
import { ONLINE_PROGRESS_STORAGE_KEY, setOnlineProgressEnabledLocal, NOTIFY_NEW_EPISODES_KEY, setNewEpisodeNotifyLocal } from '../utils/streamResume'
import { cleanIpcError } from '../utils/ipcError'

interface DownloadDirInfo {
  currentPath: string
  defaultPath: string
  isCustom: boolean
}

interface DownloadStorageInfo {
  path: string
  free: number
  total: number
  used: number
  percentUsed: number
  error?: string
}

const Settings: React.FC = () => {
  const [folders, setFolders] = useState<any[]>([])
  const [scanning, setScanning] = useState<string | null>(null)
  const [userName, setUserName] = useState(() => localStorage.getItem('mycinema_user_name') || 'User')
  const [profileImage, setProfileImage] = useState<string | null>(() => localStorage.getItem('mycinema_profile_image'))
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempName, setTempName] = useState(userName)
  const [launchFullscreen, setLaunchFullscreen] = useState(true)
  const [rememberOnlineProgress, setRememberOnlineProgress] = useState(() => {
    try {
      return localStorage.getItem(ONLINE_PROGRESS_STORAGE_KEY) !== 'false'
    } catch {
      return true
    }
  })
  const [notifyNewEpisodes, setNotifyNewEpisodes] = useState(() => {
    try {
      return localStorage.getItem(NOTIFY_NEW_EPISODES_KEY) !== 'false'
    } catch {
      return true
    }
  })
  // Focus Tube. Defaults to on; the main process owns the persisted value in
  // app-settings.json and mirrors it here so the toggle can never disagree.
  const [focusTubeEnabled, setFocusTubeEnabled] = useState(true)
  const [showDownloadTray, setShowDownloadTray] = useState(() => {
    try {
      return localStorage.getItem('mycinema_show_download_tray') !== 'false'
    } catch {
      return true
    }
  })
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(() => {
    return (localStorage.getItem(SUBTITLE_STYLE_KEY) as SubtitleStyle) || 'default'
  })
  const [subtitleFontSize, setSubtitleFontSize] = useState(() => {
    return parseInt(localStorage.getItem(SUBTITLE_FONT_SIZE_KEY) || '24', 10)
  })
  const [subtitlePosition, setSubtitlePosition] = useState(() => {
    return parseInt(localStorage.getItem(SUBTITLE_POSITION_KEY) || '0', 10)
  })

  // Download Directory state
  const [downloadDirInfo, setDownloadDirInfo] = useState<DownloadDirInfo | null>(null)
  const [downloadDirStorage, setDownloadDirStorage] = useState<DownloadStorageInfo | null>(null)
  const [downloadDirBusy, setDownloadDirBusy] = useState(false)
  const [downloadDirMessage, setDownloadDirMessage] = useState<{ text: string; isError?: boolean } | null>(null)

  const formatStorageBytes = (bytes?: number) => {
    if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
  }

  const fetchDownloadDir = async () => {
    try {
      const api = (window as any)?.api
      if (typeof api?.getDownloadDir === 'function') {
        const info = await api.getDownloadDir()
        setDownloadDirInfo(info)
      }
      if (typeof api?.getDownloadsStorage === 'function') {
        const storage = await api.getDownloadsStorage()
        setDownloadDirStorage(storage)
      }
    } catch (err) {
      console.error('Failed to load download directory info:', err)
    }
  }

  const handleChangeDownloadDir = async () => {
    if (downloadDirBusy) return
    setDownloadDirMessage(null)
    try {
      const selected = await window.api.selectFolder()
      if (!selected) return // canceled by user
      setDownloadDirBusy(true)
      const res = await (window as any).api.setDownloadDir(selected)
      setDownloadDirInfo(res)
      setDownloadDirMessage({ text: 'Download location updated successfully!' })
      const storage = await window.api.getDownloadsStorage().catch(() => null)
      if (storage) setDownloadDirStorage(storage)
    } catch (err: any) {
      setDownloadDirMessage({ text: cleanIpcError(err, 'Failed to update download folder'), isError: true })
    } finally {
      setDownloadDirBusy(false)
    }
  }

  const handleResetDownloadDir = async () => {
    if (downloadDirBusy) return
    setDownloadDirMessage(null)
    setDownloadDirBusy(true)
    try {
      const res = await (window as any).api.resetDownloadDir()
      setDownloadDirInfo(res)
      setDownloadDirMessage({ text: 'Reset to default download location.' })
      const storage = await window.api.getDownloadsStorage().catch(() => null)
      if (storage) setDownloadDirStorage(storage)
    } catch (err: any) {
      setDownloadDirMessage({ text: cleanIpcError(err, 'Failed to reset download folder'), isError: true })
    } finally {
      setDownloadDirBusy(false)
    }
  }

  const handleOpenDownloadDir = async () => {
    try {
      await window.api.openDownloadsFolder()
    } catch (err: any) {
      setDownloadDirMessage({ text: cleanIpcError(err, 'Could not open folder in Explorer'), isError: true })
    }
  }
  // Web download sites — manual domain override when auto-resolve fails.
  interface DownloadSiteStatus {
    id: string
    name: string
    shortLabel: string
    portalUrl: string
    accent: string
    domain: string | null
    updatedAt: string | null
    manual: boolean
    stale: boolean
  }
  const [downloadSites, setDownloadSites] = useState<DownloadSiteStatus[]>([])
  const [downloadSiteDrafts, setDownloadSiteDrafts] = useState<Record<string, string>>({})
  const [downloadSiteBusyId, setDownloadSiteBusyId] = useState<string | null>(null)
  const [downloadSiteMessage, setDownloadSiteMessage] = useState<string | null>(null)

  const fetchDownloadSites = async () => {
    try {
      const api = (window as any)?.api
      if (typeof api?.getDownloadSites !== 'function') return // stale preload
      const sites = await api.getDownloadSites()
      setDownloadSites(sites || [])
    } catch (err) {
      console.error('Failed to load download sites:', err)
    }
  }

  const handleSaveDownloadSiteDomain = async (siteId: string) => {
    const draft = (downloadSiteDrafts[siteId] || '').trim()
    if (!draft || downloadSiteBusyId) return
    setDownloadSiteBusyId(siteId)
    setDownloadSiteMessage(null)
    try {
      await (window as any).api.setDownloadSiteDomain(siteId, draft)
      setDownloadSiteMessage('Saved. Detail screen will use your link.')
      await fetchDownloadSites()
    } catch (err: any) {
      setDownloadSiteMessage(cleanIpcError(err, 'Could not save that link.'))
    } finally {
      setDownloadSiteBusyId(null)
    }
  }

  const handleRefreshDownloadSiteDomain = async (siteId: string) => {
    if (downloadSiteBusyId) return
    setDownloadSiteBusyId(siteId)
    setDownloadSiteMessage(null)
    try {
      const result = await (window as any).api.refreshDownloadSiteDomain(siteId)
      setDownloadSiteMessage(
        result?.stale
          ? `Live link verify nahi hua — ${result.domain} khola jayega (stale).`
          : `Fresh link mil gaya: ${result.domain}`
      )
      await fetchDownloadSites()
    } catch (err: any) {
      setDownloadSiteMessage(cleanIpcError(err, 'Refresh failed. Try again later.'))
    } finally {
      setDownloadSiteBusyId(null)
    }
  }

  const handleResetDownloadSiteDomain = async (siteId: string) => {
    if (downloadSiteBusyId) return
    setDownloadSiteBusyId(siteId)
    setDownloadSiteMessage(null)
    try {
      await (window as any).api.resetDownloadSiteDomain(siteId)
      setDownloadSiteDrafts(prev => ({ ...prev, [siteId]: '' }))
      setDownloadSiteMessage('Reset. App will auto-find the latest link again.')
      await fetchDownloadSites()
    } catch (err) {
      console.error('Failed to reset download site:', err)
    } finally {
      setDownloadSiteBusyId(null)
    }
  }

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

  const handleProfileImageChange = (newImage: string | null) => {
    setProfileImage(newImage)
    if (newImage) {
      localStorage.setItem('mycinema_profile_image', newImage)
    } else {
      localStorage.removeItem('mycinema_profile_image')
    }
    window.dispatchEvent(new Event('mycinema_profile_updated'))
  }

  useEffect(() => {
    const handleProfileUpdate = () => {
      setProfileImage(localStorage.getItem('mycinema_profile_image'))
    }
    window.addEventListener('mycinema_profile_updated', handleProfileUpdate)
    return () => window.removeEventListener('mycinema_profile_updated', handleProfileUpdate)
  }, [])

  useEffect(() => {
    fetchFolders()
    fetchDownloadSites()
    fetchDownloadDir()
    const api = (window as any)?.api
    const unsubDir = api?.onDownloadDirChanged?.((info: DownloadDirInfo) => {
      setDownloadDirInfo(info)
      void api?.getDownloadsStorage?.().then(setDownloadDirStorage).catch(() => {})
    })
    const unsubSettings = api?.onAppSettingsChanged?.((settings: any) => {
      if (typeof settings?.showDownloadTray === 'boolean') {
        setShowDownloadTray(settings.showDownloadTray)
        try {
          localStorage.setItem('mycinema_show_download_tray', String(settings.showDownloadTray))
        } catch {}
      }
    })

    window.api.getAppSettings().then(settings => {
      setLaunchFullscreen(settings.launchFullscreen)
      if (typeof settings.rememberOnlineProgress === 'boolean') {
        setRememberOnlineProgress(settings.rememberOnlineProgress)
        setOnlineProgressEnabledLocal(settings.rememberOnlineProgress)
      }
      if (typeof settings.notifyNewEpisodes === 'boolean') {
        setNotifyNewEpisodes(settings.notifyNewEpisodes)
        setNewEpisodeNotifyLocal(settings.notifyNewEpisodes)
      }
      if (typeof settings.focusTubeEnabled === 'boolean') {
        setFocusTubeEnabled(settings.focusTubeEnabled)
      }
      if (typeof (settings as any).showDownloadTray === 'boolean') {
        setShowDownloadTray((settings as any).showDownloadTray)
        try {
          localStorage.setItem('mycinema_show_download_tray', String((settings as any).showDownloadTray))
        } catch {}
      }
    }).catch(() => {})

    return () => {
      unsubDir?.()
      unsubSettings?.()
    }
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

  const handleNotifyNewEpisodesChange = async (enabled: boolean) => {
    setNotifyNewEpisodes(enabled)
    setNewEpisodeNotifyLocal(enabled)
    try {
      const setter = (window as any)?.api?.setNotifyNewEpisodes
      if (typeof setter !== 'function') return // stale preload: keep local-only value
      const settings = await setter.call((window as any).api, enabled)
      setNotifyNewEpisodes(settings.notifyNewEpisodes)
      setNewEpisodeNotifyLocal(settings.notifyNewEpisodes)
    } catch (err) {
      console.error('Failed to update new-episode alert setting:', err)
      setNotifyNewEpisodes(!enabled)
      setNewEpisodeNotifyLocal(!enabled)
    }
  }

  const handleRememberOnlineProgressChange = async (enabled: boolean) => {
    setRememberOnlineProgress(enabled)
    setOnlineProgressEnabledLocal(enabled)
    try {
      const setter = (window as any)?.api?.setRememberOnlineProgress
      if (typeof setter !== 'function') return // stale preload: keep local-only value
      const settings = await setter.call((window as any).api, enabled)
      setRememberOnlineProgress(settings.rememberOnlineProgress)
      setOnlineProgressEnabledLocal(settings.rememberOnlineProgress)
    } catch (err) {
      console.error('Failed to update online resume setting:', err)
      setRememberOnlineProgress(!enabled)
      setOnlineProgressEnabledLocal(!enabled)
    }
  }

  const handleFocusTubeChange = async (enabled: boolean) => {
    setFocusTubeEnabled(enabled)
    try {
      const setter = (window as any)?.api?.setFocusTubeEnabled
      if (typeof setter !== 'function') return // stale preload: keep local-only value
      const settings = await setter.call((window as any).api, enabled)
      setFocusTubeEnabled(settings.focusTubeEnabled)
    } catch (err) {
      console.error('Failed to update Focus Tube setting:', err)
      setFocusTubeEnabled(!enabled)
    }
  }

  const handleShowDownloadTrayChange = async (enabled: boolean) => {
    setShowDownloadTray(enabled)
    try {
      localStorage.setItem('mycinema_show_download_tray', String(enabled))
      window.dispatchEvent(new CustomEvent('mycinema_download_tray_changed', { detail: { enabled } }))
    } catch {}
    try {
      const setter = (window as any)?.api?.setShowDownloadTray
      if (typeof setter === 'function') {
        const settings = await setter.call((window as any).api, enabled)
        if (typeof settings?.showDownloadTray === 'boolean') {
          setShowDownloadTray(settings.showDownloadTray)
        }
      }
    } catch (err) {
      console.error('Failed to update download overlay setting:', err)
      setShowDownloadTray(!enabled)
      try {
        localStorage.setItem('mycinema_show_download_tray', String(!enabled))
        window.dispatchEvent(new CustomEvent('mycinema_download_tray_changed', { detail: { enabled: !enabled } }))
      } catch {}
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

      setBackupMessage(`Exported ${result.folders || 0} folders, ${(result.externalWatchlist || 0) + (result.localWatchlist || 0)} watchlist items, ${result.favorites || 0} favorites, ${result.streamProgress || 0} online resumes and ${result.followedSeries || 0} followed series.`)
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
      setBackupMessage(`Imported ${result.foldersAdded || 0} folders, scanned ${result.foldersScanned || 0}, restored ${watchlistCount} watchlist items, ${result.favoritesRestored || 0} favorites, ${result.streamProgressRestored || 0} online resumes and ${result.followedSeriesRestored || 0} followed series.${missingText}`)
    } finally {
      setBackupBusy(false)
    }
  }

  const handleClearAllData = async () => {
    // Note: The main process also shows a native dialog for safety
    await window.api.clearAllData()
  }

  const sectionTitleClass = "text-[10px] font-black text-primary/80 uppercase tracking-[0.2em] ml-1 mb-3 block"
  const panelClass = "bg-white/[0.02] border border-white/10 rounded-3xl shadow-xl backdrop-blur-md transition-all duration-300 hover:bg-white/[0.04] hover:border-white/20 hover:shadow-2xl"
  const iconBoxClass = "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-white/10 to-white/5 text-white/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] ring-1 ring-white/5"
  const compactButtonClass = "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 hover:-translate-y-0.5"

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="relative mb-10 overflow-hidden rounded-[2rem] bg-gradient-to-r from-red-600/10 via-[#0a0f18]/50 to-transparent p-8 border border-white/5 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-red-600/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-64 w-64 rounded-full bg-blue-600/5 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex items-center gap-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-700 text-white shadow-xl shadow-red-900/50 ring-1 ring-white/20">
            <HardDrive size={28} />
          </div>
          <div>
            <h2 className="text-4xl font-black italic tracking-tighter text-white uppercase drop-shadow-lg">Settings</h2>
            <p className="mt-1.5 text-sm font-bold uppercase tracking-widest text-white/40">Manage library, backups, and application data</p>
          </div>
        </div>
      </div>

      <div className="space-y-10">
        <section>
          <h3 className={sectionTitleClass}>User Profile</h3>
          <div className={`${panelClass} flex items-center gap-6 p-6 group`}>
            <div 
              className={`relative flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-2xl ${profileImage ? 'bg-transparent' : 'bg-red-600'} text-2xl font-black text-white shadow-xl shadow-red-950/20 transition-transform duration-300 group-hover:scale-105`}
              onClick={() => setIsProfileModalOpen(true)}
              title="Change Profile Picture"
            >
              {profileImage ? (
                <img src={profileImage} alt={userName} className="h-full w-full object-cover" />
              ) : (
                userName.charAt(0).toUpperCase()
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <ImageIcon size={20} className="text-white" />
              </div>
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

        <section>
          <h3 className={sectionTitleClass}>Application</h3>
          <div className={`${panelClass} flex items-center justify-between gap-6 p-6`}>
            <div className="flex items-center gap-4 min-w-0">
              <div className={iconBoxClass}>
                <Maximize2 size={17} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-white uppercase tracking-tight">Open in Fullscreen</h4>
                <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                  Launch MyCinema in the immersive F11-style fullscreen mode and show lightweight fullscreen controls.
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

        <section>
          <h3 className={sectionTitleClass}>Streaming</h3>
          <div className={`${panelClass} flex items-center justify-between gap-6 p-6`}>
            <div className="flex items-center gap-4 min-w-0">
              <div className={iconBoxClass}>
                <Wifi size={17} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-white uppercase tracking-tight">Remember Online Progress</h4>
                <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                  Resume streamed movies and episodes from where you left off, right from Home. Positions stay on this device only — turn off to stay fully offline.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={rememberOnlineProgress}
              onClick={() => handleRememberOnlineProgressChange(!rememberOnlineProgress)}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full border transition-all ${
                rememberOnlineProgress
                  ? 'border-red-500/50 bg-red-600 shadow-lg shadow-red-950/30'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-lg transition-all ${
                  rememberOnlineProgress ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
          <div className={`${panelClass} mt-3 flex items-center justify-between gap-6 p-6`}>
            <div className="flex items-center gap-4 min-w-0">
              <div className={iconBoxClass}>
                <Bell size={17} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-white uppercase tracking-tight">New Episode Alerts</h4>
                <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                  Flag series you follow when a new episode drops — with a badge on Home and a heads-up here. Checked at most once a day, on this device only.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyNewEpisodes}
              onClick={() => handleNotifyNewEpisodesChange(!notifyNewEpisodes)}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full border transition-all ${
                notifyNewEpisodes
                  ? 'border-red-500/50 bg-red-600 shadow-lg shadow-red-950/30'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-lg transition-all ${
                  notifyNewEpisodes ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
        </section>

        <section>
          <h3 className={sectionTitleClass}>Features</h3>
          <div data-tour="settings-focustube" className={`${panelClass} flex items-center justify-between gap-6 p-6`}>
            <div className="flex items-center gap-4 min-w-0">
              <div className={iconBoxClass}>
                <Compass size={17} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-white uppercase tracking-tight flex items-center gap-2">Focus Tube
                  <span
                    title="Focus Tube is in beta — some things may still change"
                    className="inline-flex items-center rounded border border-amber-300/20 bg-amber-400/10 px-1 py-[1px] text-[8px] font-bold uppercase leading-none tracking-[0.08em] text-amber-200/90"
                  >
                    Beta
                  </span>
                </h4>
                <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                  A YouTube tab driven by your own channels and categories instead of an algorithm. Turn it off to hide
                  the tab and stop all background refreshing. Nothing is deleted — your categories, channels and watch
                  progress are still here when you switch it back on.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={focusTubeEnabled}
              aria-label="Enable Focus Tube"
              onClick={() => handleFocusTubeChange(!focusTubeEnabled)}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full border transition-all ${
                focusTubeEnabled
                  ? 'border-red-500/50 bg-red-600 shadow-lg shadow-red-950/30'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-lg transition-all ${
                  focusTubeEnabled ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
        </section>

        <section>
          <h3 className={sectionTitleClass}>Subtitles</h3>

          <div className="space-y-3">
            <div className={`${panelClass} flex items-center justify-between gap-6 p-6`}>
              <div className="flex items-center gap-4 min-w-0">
                <div className={iconBoxClass}>
                  <Subtitles size={17} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-white uppercase tracking-tight">Subtitle Style</h4>
                  <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                    Choose how subtitles are displayed during playback.
                  </p>
                </div>
              </div>
              <select
                value={subtitleStyle}
                onChange={(e) => {
                  const val = e.target.value as SubtitleStyle
                  setSubtitleStyle(val)
                  localStorage.setItem(SUBTITLE_STYLE_KEY, val)
                }}
                className="w-44 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[11px] font-black uppercase tracking-widest text-white transition-all focus:border-primary focus:outline-none cursor-pointer"
              >
                <option value="default" className="bg-[#141414] text-white">Default (Blurred Background)</option>
                <option value="clean" className="bg-[#141414] text-white">Clean (No Background)</option>
                <option value="ott" className="bg-[#141414] text-white">OTT Style (Netflix/Prime)</option>
              </select>
            </div>

            <div className={`${panelClass} flex items-center justify-between gap-6 p-6`}>
              <div className="flex items-center gap-4 min-w-0">
                <div className={iconBoxClass}>
                  <span className="text-[13px] font-black tracking-tight text-white/70">Aa</span>
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-white uppercase tracking-tight">Font Size</h4>
                  <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                    {subtitleFontSize}px
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-48">
                <span className="text-[11px] text-white/30 font-bold">14</span>
                <input
                  type="range"
                  min="14"
                  max="48"
                  value={subtitleFontSize}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    setSubtitleFontSize(val)
                    localStorage.setItem(SUBTITLE_FONT_SIZE_KEY, val.toString())
                  }}
                  className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-primary
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-primary/40 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20"
                />
                <span className="text-[11px] text-white/30 font-bold">48</span>
              </div>
            </div>

            <div className={`${panelClass} flex items-center justify-between gap-6 p-6`}>
              <div className="flex items-center gap-4 min-w-0">
                <div className={iconBoxClass}>
                  <span className="text-[15px] leading-none font-black text-white/70">↕</span>
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-white uppercase tracking-tight">Vertical Position</h4>
                  <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                    {subtitlePosition === 0 ? 'Default' : subtitlePosition > 0 ? `+${subtitlePosition}px up` : `${subtitlePosition}px down`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-48">
                <span className="text-[11px] text-white/30 font-bold">Down</span>
                <input
                  type="range"
                  min="-40"
                  max="40"
                  value={subtitlePosition}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    setSubtitlePosition(val)
                    localStorage.setItem(SUBTITLE_POSITION_KEY, val.toString())
                  }}
                  className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-primary
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-primary/40 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20"
                />
                <span className="text-[11px] text-white/30 font-bold">Up</span>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
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

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className={sectionTitleClass}>Downloads</h3>
          </div>

          <div className="space-y-3">
          <div className={`${panelClass} p-6 space-y-5`}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4 min-w-0">
                <div className={iconBoxClass}>
                  <Download size={18} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h4 className="text-xs font-black text-white uppercase tracking-tight">Downloads Directory</h4>
                    {downloadDirInfo && (
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                        downloadDirInfo.isCustom
                          ? 'bg-amber-400/10 text-amber-300 border border-amber-400/20'
                          : 'bg-primary/10 text-primary border border-primary/20'
                      }`}>
                        {downloadDirInfo.isCustom ? 'Custom Location' : 'Default Location'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] font-medium leading-4 text-white/40 max-w-xl">
                    Unified download destination for all movies and episodes — whether downloaded via Magnets/Torrents or Direct Download websites (such as HDHub4u, KatmovieHD, etc.).
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleChangeDownloadDir}
                  disabled={downloadDirBusy}
                  className={`${compactButtonClass} bg-red-600 text-white shadow-lg shadow-red-950/20 hover:bg-red-700`}
                  title="Browse and select a folder on your computer"
                >
                  <FolderOpen size={15} />
                  <span>{downloadDirBusy ? 'Saving…' : 'Change Location'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenDownloadDir}
                  className={`${compactButtonClass} border border-white/10 bg-white/5 text-white hover:bg-white/10`}
                  title="Open this folder in File Explorer"
                >
                  <Maximize2 size={14} />
                  <span>Open Folder</span>
                </button>
                {downloadDirInfo?.isCustom && (
                  <button
                    type="button"
                    onClick={handleResetDownloadDir}
                    disabled={downloadDirBusy}
                    className={`${compactButtonClass} border border-white/10 bg-transparent text-white/50 hover:text-white hover:bg-white/5`}
                    title="Reset back to default Downloads/MyCinema"
                  >
                    <RotateCcw size={14} />
                    <span>Reset Default</span>
                  </button>
                )}
              </div>
            </div>

            {/* Folder path & drive storage display card */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <HardDrive size={16} className="text-white/40 flex-shrink-0" />
                  <p className="truncate font-mono text-[11px] font-medium text-white/90 select-all" title={downloadDirInfo?.currentPath || 'Loading path…'}>
                    {downloadDirInfo?.currentPath || 'Checking download location…'}
                  </p>
                </div>
                {downloadDirStorage && downloadDirStorage.total > 0 && (
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-white/50 flex-shrink-0">
                    <span className="text-white/80">{formatStorageBytes(downloadDirStorage.free)}</span> free of {formatStorageBytes(downloadDirStorage.total)}
                  </div>
                )}
              </div>

              {downloadDirStorage && downloadDirStorage.total > 0 && (
                <div className="space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        downloadDirStorage.percentUsed >= 90 ? 'bg-red-400' :
                        downloadDirStorage.percentUsed >= 75 ? 'bg-amber-400' :
                        'bg-primary'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, downloadDirStorage.percentUsed))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {downloadDirMessage && (
              <div className={`flex items-center gap-2 text-[11px] font-bold ${
                downloadDirMessage.isError ? 'text-red-400' : 'text-primary'
              }`}>
                {downloadDirMessage.isError ? <AlertTriangle size={14} /> : <Check size={14} />}
                <span>{downloadDirMessage.text}</span>
              </div>
            )}
          </div>

          <div className={`${panelClass} flex items-center justify-between gap-6 p-6`}>
            <div className="flex items-center gap-4 min-w-0">
              <div className={iconBoxClass}>
                <Layers size={17} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-white uppercase tracking-tight">Floating Download Progress HUD</h4>
                <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                  Show the floating mini-progress card in the bottom corner while downloads are active.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showDownloadTray}
              aria-label="Toggle floating download progress overlay"
              onClick={() => handleShowDownloadTrayChange(!showDownloadTray)}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full border transition-all ${
                showDownloadTray
                  ? 'border-red-500/50 bg-red-600 shadow-lg shadow-red-950/30'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-lg transition-all ${
                  showDownloadTray ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
          </div>
        </section>

        <section>
          <h3 className={sectionTitleClass}>Download Sites</h3>
          <div className={`${panelClass} p-6 space-y-4`}>
            <p className="max-w-2xl text-xs font-medium leading-5 text-white/30">
              Detail screen cards auto-find the latest working link. If auto-find fails, paste the current site link here manually.
            </p>
            {downloadSiteMessage && (
              <p className="text-[11px] font-bold text-primary">{downloadSiteMessage}</p>
            )}
            <div className="grid grid-cols-1 gap-3">
              {downloadSites.map(site => (
                <div key={site.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-[11px] font-black"
                      style={{ backgroundColor: `${site.accent}1a`, color: site.accent }}
                    >
                      {site.shortLabel}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-white">{site.name}</p>
                      <p className="truncate text-[11px] font-medium text-white/35" title={site.domain || site.portalUrl}>
                        {site.domain ? `${site.domain}${site.manual ? ' · manual' : site.stale ? ' · needs refresh' : ' · auto'}` : 'No link yet — opens on first use'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={downloadSiteDrafts[site.id] ?? ''}
                      onChange={e => setDownloadSiteDrafts(prev => ({ ...prev, [site.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') void handleSaveDownloadSiteDomain(site.id) }}
                      placeholder="https://current-mirror.example"
                      disabled={downloadSiteBusyId === site.id}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 text-[12px] font-semibold text-white outline-none placeholder:text-white/25 focus:border-primary/50 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveDownloadSiteDomain(site.id)}
                      disabled={!((downloadSiteDrafts[site.id] || '').trim()) || downloadSiteBusyId === site.id}
                      className={`${compactButtonClass} border border-white/10 bg-white/5 text-white hover:bg-white/10`}
                    >
                      <span>{downloadSiteBusyId === site.id ? 'Saving…' : 'Save'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRefreshDownloadSiteDomain(site.id)}
                      disabled={downloadSiteBusyId === site.id}
                      className={`${compactButtonClass} border border-white/10 bg-transparent text-white/50 hover:text-white hover:bg-white/5`}
                      title="Re-check the live link right now"
                    >
                      <span>{downloadSiteBusyId === site.id ? 'Checking…' : 'Refresh'}</span>
                    </button>
                    {(site.domain || site.manual) && (
                      <button
                        type="button"
                        onClick={() => void handleResetDownloadSiteDomain(site.id)}
                        disabled={downloadSiteBusyId === site.id}
                        className={`${compactButtonClass} border border-white/10 bg-transparent text-white/50 hover:text-white hover:bg-white/5`}
                      >
                        <span>Auto</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {downloadSites.length === 0 && (
                <p className="text-[11px] font-bold text-white/30">Loading sites…</p>
              )}
            </div>
          </div>
        </section>

        <section>
          <h3 className={sectionTitleClass}>Backup & Restore</h3>
          <div className={`${panelClass} flex flex-col justify-between gap-6 p-6 md:flex-row md:items-center`}>
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
        <section className="border-t border-white/10 pt-8 mt-8">
          <div className="mb-4 flex items-center gap-3 ml-1">
            <AlertTriangle size={20} className="text-red-500 animate-pulse" />
            <h3 className="text-[12px] font-black text-red-500 uppercase tracking-[0.25em]">Danger Zone</h3>
          </div>
          
          <div className="flex flex-col justify-between gap-6 rounded-3xl border border-red-500/20 bg-gradient-to-r from-red-500/10 to-transparent p-6 md:flex-row md:items-center">
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
      
      <ProfilePictureModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentImage={profileImage}
        onSelectImage={handleProfileImageChange}
      />
    </div>
  )
}

export default Settings
