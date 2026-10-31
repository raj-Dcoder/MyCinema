import React, { useEffect, useState } from 'react'
import { FolderOpen, Trash2, Plus, HardDrive, AlertTriangle, Check, X as CloseIcon, Maximize2, Download, Upload, Image as ImageIcon, Wifi, Bell, Compass, RotateCcw, Layers, Sun, Moon, Sparkles, Palette, ChevronDown, ChevronUp, Play, Star, Film, Wind, Sliders } from 'lucide-react'
import ProfilePictureModal from '../components/ProfilePictureModal'
import { normalizeProfileImage, resolveProfileImageUrl } from '../utils/profileImage'
import { useTheme, ACCENT_PALETTE, HALO_INTENSITY_PRESETS, ButtonAccentMode, PlayerAmbilightMode } from '../theme/ThemeContext'
import { ONLINE_PROGRESS_STORAGE_KEY, setOnlineProgressEnabledLocal, NOTIFY_NEW_EPISODES_KEY, setNewEpisodeNotifyLocal } from '../utils/streamResume'
import { cleanIpcError } from '../utils/ipcError'

// Darker, high-contrast versions of accents for light theme visibility
const LIGHT_MODE_ACCENT_HEX: Record<string, string> = {
  crimson: '#b91c1c',
  azure: '#0284c7',
  amethyst: '#7c3aed',
  emerald: '#047857',
  solaris: '#b45309',
  tangerine: '#c2410c',
  fuchsia: '#be185d',
  glacier: '#0e7490',
  indigo: '#4338ca',
  voltage: '#4d7c0f',
  terracotta: '#9a3412',
  platinum: '#334155',
}

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
  const {
    theme,
    setTheme,
    atmosphericStudioEnabled,
    setAtmosphericStudioEnabled,
    accent,
    setAccent,
    currentAccent,
    haloIntensity,
    setHaloIntensity,
    currentHaloPreset,
    haloDiffusion,
    setHaloDiffusion,
    haloChroma,
    setHaloChroma,
    buttonAccentMode,
    setButtonAccentMode,
    customButtonAccent,
    setCustomButtonAccent,
    activeButtonAccent,
    ftBrandLock,
    setFtBrandLock,
    playerAmbilightMode,
    setPlayerAmbilightMode,
    haloBreathing,
    setHaloBreathing,
    detailAmbientShade,
    setDetailAmbientShade,
    resetToDefaults,
  } = useTheme()
  const [folders, setFolders] = useState<any[]>([])
  const [scanning, setScanning] = useState<string | null>(null)
  const [userName, setUserName] = useState(() => localStorage.getItem('mycinema_user_name') || 'User')
  const [profileImage, setProfileImage] = useState<string | null>(() => localStorage.getItem('mycinema_profile_image'))
  const [profileImageFailed, setProfileImageFailed] = useState(false)
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
  const contrastAccentHex = theme === 'light' ? (LIGHT_MODE_ACCENT_HEX[accent] || '#b91c1c') : currentAccent.hex

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

  const handleSaveName = async () => {
    const trimmed = tempName.trim() || 'User'
    setUserName(trimmed)
    localStorage.setItem('mycinema_user_name', trimmed)
    setIsEditingName(false)
    window.dispatchEvent(new Event('mycinema_name_updated'))
    try {
      await window.api.setUserProfile({ userName: trimmed })
    } catch (err) {
      console.error('Failed to persist user name:', err)
    }
  }

  const handleProfileImageChange = async (newImage: string | null) => {
    const normalizedImage = normalizeProfileImage(newImage) ?? null
    setProfileImage(normalizedImage)
    if (normalizedImage) {
      localStorage.setItem('mycinema_profile_image', normalizedImage)
    } else {
      localStorage.removeItem('mycinema_profile_image')
    }
    window.dispatchEvent(new Event('mycinema_profile_updated'))
    try {
      const res = await window.api.setUserProfile({ profileImage: normalizedImage })
      if (res?.profileImage) {
        const savedImage = normalizeProfileImage(res.profileImage) ?? null
        setProfileImage(savedImage)
        if (savedImage) {
          localStorage.setItem('mycinema_profile_image', savedImage)
        } else {
          localStorage.removeItem('mycinema_profile_image')
        }
      }
    } catch (err) {
      console.error('Failed to persist profile image:', err)
    }
  }

  useEffect(() => {
    const handleProfileUpdate = () => {
      setProfileImage(normalizeProfileImage(localStorage.getItem('mycinema_profile_image')) ?? null)
    }
    window.addEventListener('mycinema_profile_updated', handleProfileUpdate)
    return () => window.removeEventListener('mycinema_profile_updated', handleProfileUpdate)
  }, [])

  useEffect(() => {
    setProfileImageFailed(false)
  }, [profileImage])

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
      if (typeof settings?.userName === 'string') {
        setUserName(settings.userName)
        setTempName(settings.userName)
        localStorage.setItem('mycinema_user_name', settings.userName)
      }
      if (settings?.profileImage !== undefined) {
        const normalizedImage = normalizeProfileImage(settings.profileImage) ?? null
        setProfileImage(normalizedImage)
        if (normalizedImage) localStorage.setItem('mycinema_profile_image', normalizedImage)
        else localStorage.removeItem('mycinema_profile_image')
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
      if (settings.userName) {
        setUserName(settings.userName)
        setTempName(settings.userName)
        localStorage.setItem('mycinema_user_name', settings.userName)
      }
      if (settings.profileImage !== undefined) {
        const normalizedImage = normalizeProfileImage(settings.profileImage) ?? null
        setProfileImage(normalizedImage)
        if (normalizedImage) localStorage.setItem('mycinema_profile_image', normalizedImage)
        else localStorage.removeItem('mycinema_profile_image')
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

      const ftText = (result.focusTubeCategories || result.focusTubeChannels)
        ? `, ${result.focusTubeCategories || 0} Focus Tube categories, ${result.focusTubeChannels || 0} channels`
        : ''

      setBackupMessage(`Exported ${result.folders || 0} folders, ${(result.externalWatchlist || 0) + (result.localWatchlist || 0)} watchlist items, ${result.favorites || 0} favorites, ${result.streamProgress || 0} online resumes, ${result.followedSeries || 0} followed series${ftText}.`)
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
      const ftText = (result.focusTubeCategoriesRestored || result.focusTubeChannelsRestored)
        ? `, restored ${result.focusTubeCategoriesRestored || 0} Focus Tube categories, ${result.focusTubeChannelsRestored || 0} channels`
        : ''

      setBackupMessage(`Imported ${result.foldersAdded || 0} folders, scanned ${result.foldersScanned || 0}, restored ${watchlistCount} watchlist items, ${result.favoritesRestored || 0} favorites, ${result.streamProgressRestored || 0} online resumes, ${result.followedSeriesRestored || 0} followed series${ftText}.${missingText}`)
    } finally {
      setBackupBusy(false)
    }
  }

  const handleClearAllData = async () => {
    // Note: The main process also shows a native dialog for safety
    await window.api.clearAllData()
  }

  const sectionTitleClass = theme === 'light'
    ? "settings-section-title text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] ml-1 mb-3 block"
    : "settings-section-title text-[10px] font-black text-white/80 uppercase tracking-[0.2em] ml-1 mb-3 block"
  const panelClass = "settings-panel bg-white/[0.02] border border-white/10 rounded-3xl shadow-xl backdrop-blur-md transition-all duration-300 hover:bg-white/[0.04] hover:border-white/20 hover:shadow-2xl"
  const iconBoxClass = "settings-icon-box flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-white/10 to-white/5 text-white/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] ring-1 ring-white/5"
  const compactButtonClass = "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 hover:-translate-y-0.5"

  return (
    <div className="settings-page max-w-5xl space-y-8 pb-12">
      <div
        className="settings-banner relative mb-10 overflow-hidden rounded-[2rem] p-8 border border-white/5 shadow-2xl transition-all duration-500"
        style={{
          background: !atmosphericStudioEnabled
            ? theme === 'light'
              ? 'linear-gradient(135deg, rgba(241, 245, 249, 0.8) 0%, #ffffff 100%)'
              : 'linear-gradient(to right, rgba(255, 255, 255, 0.03), rgba(10, 15, 24, 0.55), transparent)'
            : theme === 'light'
              ? `linear-gradient(135deg, rgb(${currentAccent.rgb} / 0.08) 0%, rgba(241, 245, 249, 0.9) 45%, #ffffff 100%)`
              : `linear-gradient(to right, rgb(${currentAccent.rgb} / 0.2), rgba(10, 15, 24, 0.55), transparent)`,
        }}
      >
        {atmosphericStudioEnabled && (
          <>
            <div
              className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 rounded-full blur-3xl pointer-events-none transition-all duration-500"
              style={{ backgroundColor: `rgb(${currentAccent.rgb} / ${theme === 'light' ? '0.12' : '0.3'})` }}
            />
            <div
              className="absolute bottom-0 left-0 -ml-20 -mb-20 h-64 w-64 rounded-full blur-3xl pointer-events-none transition-all duration-500"
              style={{ backgroundColor: `rgb(${currentAccent.secondaryRgb} / ${theme === 'light' ? '0.08' : '0.2'})` }}
            />
          </>
        )}
        
        <div className="relative z-10 flex items-center gap-6">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl shadow-xl ring-1 transition-all duration-500"
            style={{
              backgroundColor: !atmosphericStudioEnabled
                ? theme === 'light'
                  ? 'rgba(0, 0, 0, 0.04)'
                  : 'rgba(255, 255, 255, 0.05)'
                : theme === 'light'
                  ? `rgb(${currentAccent.rgb} / 0.12)`
                  : `rgb(${currentAccent.rgb} / 0.18)`,
              borderColor: !atmosphericStudioEnabled
                ? theme === 'light'
                  ? 'rgba(0, 0, 0, 0.08)'
                  : 'rgba(255, 255, 255, 0.1)'
                : `rgb(${currentAccent.rgb} / ${theme === 'light' ? '0.25' : '0.4'})`,
              boxShadow: !atmosphericStudioEnabled
                ? 'none'
                : `0 8px 30px rgb(${currentAccent.rgb} / ${theme === 'light' ? '0.12' : '0.35'})`,
            }}
          >
            <HardDrive
              size={28}
              style={{
                color: !atmosphericStudioEnabled
                  ? theme === 'light'
                    ? '#475569'
                    : 'rgba(255, 255, 255, 0.75)'
                  : contrastAccentHex,
              }}
            />
          </div>
          <div>
            <h2
              className="text-4xl font-black italic tracking-tighter uppercase drop-shadow-sm"
              style={{ color: theme === 'light' ? '#0f172a' : '#ffffff' }}
            >
              Settings
            </h2>
            <p className="mt-1.5 text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-white/40">
              Manage library, backups, and application data
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-10">
        <section>
          <h3 className={sectionTitleClass}>User Profile</h3>
          <div className={`${panelClass} flex items-center gap-6 p-6 group`}>
            <div 
              className={`relative flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-2xl ${profileImage && !profileImageFailed ? 'bg-transparent' : 'bg-red-600'} text-2xl font-black text-white shadow-xl shadow-red-950/20 transition-transform duration-300 group-hover:scale-105`}
              onClick={() => setIsProfileModalOpen(true)}
              title="Change Profile Picture"
            >
              {profileImage && !profileImageFailed ? (
                <img
                  src={resolveProfileImageUrl(profileImage) ?? undefined}
                  alt={userName}
                  className="h-full w-full object-cover"
                  onError={() => setProfileImageFailed(true)}
                />
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
              className={`settings-switch relative h-6 w-11 flex-shrink-0 rounded-full border transition-all ${
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
          <h3 className={sectionTitleClass}>Appearance</h3>
          <div className={`${panelClass} flex items-center justify-between gap-6 p-6`}>
            <div className="flex items-center gap-4 min-w-0">
              <div className={iconBoxClass}>
                {theme === 'light' ? (
                  <Sun size={17} />
                ) : (
                  <Moon size={17} />
                )}
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-white uppercase tracking-tight">Theme</h4>
                <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                  {theme === 'light'
                    ? 'Warm paper light theme — soft, calm and easy on the eyes.'
                    : 'Deep cinematic dark theme — the classic MyCinema look.'}
                </p>
              </div>
            </div>
            <div className="theme-seg" data-theme={theme} role="group" aria-label="Theme">
              <span className="theme-seg-thumb" data-side={theme} aria-hidden="true" />
              <button
                type="button"
                data-kind="dark"
                data-active={theme === 'dark'}
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
              >
                <Moon size={13} />
                Dark
              </button>
              <button
                type="button"
                data-kind="light"
                data-active={theme === 'light'}
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
              >
                <Sun size={13} />
                Light
              </button>
            </div>
          </div>
        </section>

        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div>
              <h3 className={sectionTitleClass}>Atmospheric Cinematic Studio</h3>
              <p className="text-[11px] font-medium text-slate-500 dark:text-white/40">
                Customizable luminescence, halo ambient backlights, and interactive UI color palettes.
              </p>
            </div>
            {/* Quick Actions (Reset) */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={resetToDefaults}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-white/70 transition-all hover:bg-white/10 hover:text-white"
                title="Reset to classic MyCinema defaults"
              >
                <RotateCcw size={12} />
                Reset Defaults
              </button>
            </div>
          </div>

          <div className={`${panelClass} p-6 sm:p-7 space-y-6`}>
            {/* Master Studio Enable / Disable Switch */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl border border-white/10 bg-white/[0.04] dark:bg-white/[0.03] backdrop-blur-md">
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all shadow-md ${
                    atmosphericStudioEnabled
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'bg-white/5 text-white/40 border border-white/10'
                  }`}
                >
                  <Sparkles size={22} style={atmosphericStudioEnabled ? { color: contrastAccentHex } : undefined} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
                      Atmospheric Studio Master Control
                    </h4>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                        atmosphericStudioEnabled
                          ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                          : 'bg-slate-500/15 border border-slate-500/30 text-slate-400'
                      }`}
                    >
                      {atmosphericStudioEnabled ? `Active (${currentAccent.name})` : 'Turned Off (Classic Mode)'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium leading-4 text-slate-500 dark:text-white/40 max-w-xl">
                    {atmosphericStudioEnabled
                      ? 'Atmospheric backlighting, responsive halo orbs, and interactive color accents are active throughout MyCinema.'
                      : 'Atmospheric Studio is turned off. MyCinema runs in authentic classic mode with zero ambient luminescence, clean dark cinema contrast, and default signature crimson buttons.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                <span className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-wider">
                  {atmosphericStudioEnabled ? 'Studio Enabled' : 'Studio Disabled'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={atmosphericStudioEnabled}
                  onClick={() => setAtmosphericStudioEnabled(!atmosphericStudioEnabled)}
                  className={`settings-switch relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    atmosphericStudioEnabled ? 'bg-primary shadow-lg shadow-primary/30' : 'bg-white/10'
                  }`}
                  title={atmosphericStudioEnabled ? 'Turn off Atmospheric Cinematic Studio' : 'Turn on Atmospheric Cinematic Studio'}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      atmosphericStudioEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* When Studio is Turned Off: Informative Classic State Card */}
            {!atmosphericStudioEnabled && (
              <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] text-center space-y-2">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-white/40 mb-1 border border-white/5">
                  <Palette size={20} />
                </div>
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white/70">
                  Classic MyCinema Experience Active
                </h5>
                <p className="text-[11px] text-slate-500 dark:text-white/40 max-w-md mx-auto leading-relaxed">
                  Atmospheric backlights and ambient color washes are completely turned off. Flip the switch above whenever you want to re-enable custom ambient themes, halo glows, and interactive accents.
                </p>
              </div>
            )}

            {/* When Studio is Enabled: Beautifully Grouped Sections */}
            {atmosphericStudioEnabled && (
              <>
                {/* ═══════════════════════════════════════════════════════════ */}
                {/* CATEGORY 1: AMBIENT LIGHTING & LUMINESCENCE (HALO GLOW)   */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <div className="space-y-5 pt-1 settings-divider">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} style={{ color: contrastAccentHex }} />
                    <h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-800 dark:text-white/80">
                      1. Ambient Lighting & Luminescence
                    </h4>
                  </div>

                  {/* 1.1 Signature Illumination Tint (12 Curated Colors) */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="ambient-label-title text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                        Signature Illumination Tint
                      </span>
                      <span className="ambient-label-sub text-[11px] font-bold text-white/40">12 Curated Cinema Shades</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                      {ACCENT_PALETTE.map((item) => {
                        const isActive = accent === item.id
                        return (
                          <button
                            key={item.id}
                            type="button"
                            data-active={isActive}
                            onClick={() => setAccent(item.id)}
                            className={`accent-tint-card group relative flex flex-col items-start rounded-2xl p-3 border transition-all text-left ${
                              isActive
                                ? 'border-white/40 bg-white/[0.08] shadow-xl'
                                : 'border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
                            }`}
                            style={
                              isActive
                                ? {
                                    boxShadow: `0 4px 20px rgb(${item.rgb} / 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.15)`,
                                    borderColor: item.hex,
                                  }
                                : undefined
                            }
                          >
                            <div className="flex items-center justify-between w-full mb-2">
                              <div
                                className="h-6 w-6 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 shadow-md"
                                style={{
                                  backgroundColor: item.hex,
                                  boxShadow: `0 0 12px rgb(${item.rgb} / 0.6)`,
                                }}
                              >
                                {isActive && <Check size={13} className="text-white stroke-[3]" />}
                              </div>
                              {isActive && (
                                <span
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ backgroundColor: item.hex }}
                                />
                              )}
                            </div>
                            <span className="tint-name text-[11px] font-black text-white truncate w-full">{item.name}</span>
                            <span className="tint-sub text-[9px] font-medium text-white/35 truncate w-full">{item.subtitle}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* 1.2 Atmospheric Halo Intensity (4 Presets) */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="ambient-label-title text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                        Atmospheric Halo Intensity
                      </span>
                      <span className="ambient-label-sub text-[11px] font-bold text-white/40">{currentHaloPreset.label}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {HALO_INTENSITY_PRESETS.map((preset) => {
                        const isActive = haloIntensity === preset.id
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            data-active={isActive}
                            onClick={() => setHaloIntensity(preset.id)}
                            className={`halo-preset-btn relative flex flex-col items-center justify-center rounded-2xl py-3 px-4 border text-center transition-all ${
                              isActive
                                ? 'text-white border-white/30 bg-white/[0.08] shadow-lg'
                                : 'text-white/50 border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:text-white'
                            }`}
                            style={
                              isActive
                                ? {
                                    borderColor: currentAccent.hex,
                                    boxShadow: `0 4px 18px rgb(${currentAccent.rgb} / 0.25)`,
                                  }
                                : undefined
                            }
                          >
                            <span className="text-xs font-black uppercase tracking-wider">{preset.label}</span>
                            <span className="preset-sub text-[9px] font-medium text-white/35 mt-0.5">{preset.sublabel}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* 1.3 Fine-Tuning Controls (Diffusion & Chroma Sliders in 2-Column Grid) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Diffusion Radius */}
                    <div className="space-y-2 p-3.5 rounded-2xl border border-white/5 bg-white/[0.02]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="ambient-label-title text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                            Diffusion Radius
                          </span>
                          <span className="ambient-label-sub text-[10px] font-medium text-white/30">(Spread)</span>
                        </div>
                        <span
                          className="rounded-lg px-2 py-0.5 text-xs font-black"
                          style={{
                            backgroundColor: theme === 'light' ? `rgb(${currentAccent.rgb} / 0.12)` : `rgb(${currentAccent.rgb} / 0.15)`,
                            color: contrastAccentHex,
                            border: `1px solid rgb(${currentAccent.rgb} / ${theme === 'light' ? '0.35' : '0.3'})`,
                          }}
                        >
                          {haloDiffusion}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={250}
                        step={5}
                        value={haloDiffusion}
                        disabled={haloIntensity === 'stealth'}
                        onChange={(e) => setHaloDiffusion(Number(e.target.value))}
                        className="atmosphere-slider"
                        style={{
                          background: `linear-gradient(to right, rgb(${currentAccent.rgb}) 0%, rgb(${currentAccent.rgb}) ${
                            ((haloDiffusion - 50) / 200) * 100
                          }%, ${theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'} ${((haloDiffusion - 50) / 200) * 100}%, ${theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'} 100%)`,
                        }}
                      />
                      <div className="ambient-label-sub flex items-center justify-between text-[9px] font-bold text-white/30 px-1">
                        <span>Focused (50%)</span>
                        <span>Theater (100%)</span>
                        <span>Bleed (250%)</span>
                      </div>
                    </div>

                    {/* Chroma Vibrancy */}
                    <div className="space-y-2 p-3.5 rounded-2xl border border-white/5 bg-white/[0.02]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="ambient-label-title text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                            Chroma Vibrancy
                          </span>
                          <span className="ambient-label-sub text-[10px] font-medium text-white/30">(Richness)</span>
                        </div>
                        <span
                          className="rounded-lg px-2 py-0.5 text-xs font-black"
                          style={{
                            backgroundColor: theme === 'light' ? `rgb(${currentAccent.rgb} / 0.12)` : `rgb(${currentAccent.rgb} / 0.15)`,
                            color: contrastAccentHex,
                            border: `1px solid rgb(${currentAccent.rgb} / ${theme === 'light' ? '0.35' : '0.3'})`,
                          }}
                        >
                          {haloChroma}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={250}
                        step={5}
                        value={haloChroma}
                        disabled={haloIntensity === 'stealth'}
                        onChange={(e) => setHaloChroma(Number(e.target.value))}
                        className="atmosphere-slider"
                        style={{
                          background: `linear-gradient(to right, rgb(${currentAccent.rgb}) 0%, rgb(${currentAccent.rgb}) ${
                            ((haloChroma - 50) / 200) * 100
                          }%, ${theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'} ${((haloChroma - 50) / 200) * 100}%, ${theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'} 100%)`,
                        }}
                      />
                      <div className="ambient-label-sub flex items-center justify-between text-[9px] font-bold text-white/30 px-1">
                        <span>Pastel (50%)</span>
                        <span>Cinema (100%)</span>
                        <span>Hyper (250%)</span>
                      </div>
                    </div>
                  </div>

                  {/* 1.4 Organic Breathing Pulse */}
                  <div className="flex items-center justify-between gap-6 p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={iconBoxClass}>
                        <Wind size={17} style={{ color: contrastAccentHex }} />
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-xs font-black text-white uppercase tracking-tight">
                          Organic Breathing Pulse
                        </h5>
                        <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                          Slow 12-second gentle living pulse for the ambient halo orbs across the application.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={haloBreathing}
                      onClick={() => setHaloBreathing(!haloBreathing)}
                      className={`settings-switch relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        haloBreathing ? 'bg-primary' : 'bg-white/10'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          haloBreathing ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* CATEGORY 2: UI CONTROLS & INTERACTIVE ACCENTS             */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <div className="space-y-4 pt-3 border-t border-white/5 settings-divider">
                  <div className="flex items-center gap-2">
                    <Sliders size={16} style={{ color: contrastAccentHex }} />
                    <h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-800 dark:text-white/80">
                      2. UI Controls & Interactive Accents
                    </h4>
                  </div>

                  {/* 2.1 UI Buttons & Controls Palette */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="ambient-label-title text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                        Buttons & Controls Palette
                      </span>
                      <span
                        className="rounded-lg px-2.5 py-0.5 text-xs font-black uppercase tracking-wider"
                        style={{
                          backgroundColor: theme === 'light' ? `rgb(${activeButtonAccent.rgb} / 0.12)` : `rgb(${activeButtonAccent.rgb} / 0.15)`,
                          color: contrastAccentHex,
                          border: `1px solid rgb(${activeButtonAccent.rgb} / ${theme === 'light' ? '0.35' : '0.3'})`,
                        }}
                      >
                        {buttonAccentMode === 'signature'
                          ? 'Signature Crimson Red'
                          : buttonAccentMode === 'custom'
                            ? `Custom (${activeButtonAccent.name})`
                            : `Adaptive (${currentAccent.name})`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* Option A: Adaptive Ambient */}
                      <button
                        type="button"
                        onClick={() => setButtonAccentMode('adaptive')}
                        className={`halo-preset-btn relative flex flex-col items-start rounded-2xl p-3.5 border text-left transition-all ${
                          buttonAccentMode === 'adaptive'
                            ? 'border-white/40 bg-white/[0.08] shadow-lg'
                            : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                        style={
                          buttonAccentMode === 'adaptive'
                            ? {
                                borderColor: currentAccent.hex,
                                boxShadow: `0 4px 18px rgb(${currentAccent.rgb} / 0.25)`,
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center justify-between w-full mb-1.5">
                          <span className="text-xs font-black uppercase tracking-wider text-white">Adaptive Ambient</span>
                          <span
                            className="h-3 w-3 rounded-full shadow-sm"
                            style={{ backgroundColor: currentAccent.hex }}
                          />
                        </div>
                        <span className="preset-sub text-[10px] font-medium text-white/40">
                          Buttons automatically match your ambient lighting tint.
                        </span>
                      </button>

                      {/* Option B: Classic Cinema Crimson */}
                      <button
                        type="button"
                        onClick={() => setButtonAccentMode('signature')}
                        className={`halo-preset-btn relative flex flex-col items-start rounded-2xl p-3.5 border text-left transition-all ${
                          buttonAccentMode === 'signature'
                            ? 'border-white/40 bg-white/[0.08] shadow-lg'
                            : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                        style={
                          buttonAccentMode === 'signature'
                            ? {
                                borderColor: '#e50914',
                                boxShadow: '0 4px 18px rgba(229, 9, 20, 0.3)',
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center justify-between w-full mb-1.5">
                          <span className="text-xs font-black uppercase tracking-wider text-white">Classic Crimson</span>
                          <span className="h-3 w-3 rounded-full bg-[#e50914] shadow-sm shadow-red-500/50" />
                        </div>
                        <span className="preset-sub text-[10px] font-medium text-white/40">
                          Lock all buttons to signature Netflix red while ambient glows freely.
                        </span>
                      </button>

                      {/* Option C: Independent Custom Accent */}
                      <button
                        type="button"
                        onClick={() => setButtonAccentMode('custom')}
                        className={`halo-preset-btn relative flex flex-col items-start rounded-2xl p-3.5 border text-left transition-all ${
                          buttonAccentMode === 'custom'
                            ? 'border-white/40 bg-white/[0.08] shadow-lg'
                            : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                        style={
                          buttonAccentMode === 'custom'
                            ? {
                                borderColor: activeButtonAccent.hex,
                                boxShadow: `0 4px 18px rgb(${activeButtonAccent.rgb} / 0.25)`,
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center justify-between w-full mb-1.5">
                          <span className="text-xs font-black uppercase tracking-wider text-white">Independent Custom</span>
                          <span
                            className="h-3 w-3 rounded-full shadow-sm"
                            style={{ backgroundColor: activeButtonAccent.hex }}
                          />
                        </div>
                        <span className="preset-sub text-[10px] font-medium text-white/40">
                          Select an independent color for buttons and controls.
                        </span>
                      </button>
                    </div>

                    {/* Mini Color Picker when buttonAccentMode === 'custom' */}
                    {buttonAccentMode === 'custom' && (
                      <div className="p-3.5 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md space-y-2 animate-in fade-in zoom-in-95 duration-200">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/50 block">
                          Choose Button Accent Color:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {ACCENT_PALETTE.map((item) => {
                            const isSelected = customButtonAccent === item.id
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setCustomButtonAccent(item.id)}
                                title={`${item.name} (${item.subtitle})`}
                                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 border text-left transition-all ${
                                  isSelected
                                    ? 'border-white bg-white/15 text-white shadow-md'
                                    : 'border-white/5 bg-white/[0.03] text-white/50 hover:bg-white/[0.08] hover:text-white'
                                }`}
                              >
                                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: item.hex }} />
                                <span className="text-[10px] font-bold">{item.name}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2.2 Focus Tube Brand Lock */}
                  <div className="flex items-center justify-between gap-6 p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600/15 border border-red-500/30 text-red-500 shadow-md">
                        <Play size={16} fill="currentColor" />
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-xs font-black text-white uppercase tracking-tight flex items-center gap-2">
                          Focus Tube Brand Lock
                          <span className="inline-flex items-center rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.2 text-[9px] font-black uppercase tracking-wider text-red-400">
                            YouTube Red
                          </span>
                        </h5>
                        <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                          Locks Focus Tube feeds, subscription pills, and player overlays to authentic YouTube Red and neutral styling.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={ftBrandLock}
                      onClick={() => setFtBrandLock(!ftBrandLock)}
                      className={`settings-switch relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        ftBrandLock ? 'bg-primary' : 'bg-white/10'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          ftBrandLock ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* CATEGORY 3: SCREEN-SPECIFIC IMMERSION                      */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <div className="space-y-4 pt-3 border-t border-white/5 settings-divider">
                  <div className="flex items-center gap-2">
                    <Film size={16} style={{ color: contrastAccentHex }} />
                    <h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-800 dark:text-white/80">
                      3. Screen-Specific Immersion
                    </h4>
                  </div>

                  {/* 3.1 Movie Details Ambient Shades */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="ambient-label-title text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                          Movie Details Ambient Shades
                        </span>
                        <span className="ambient-label-sub text-[10px] font-medium text-white/30">
                          (Detail Screen Backdrop Scrim)
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={detailAmbientShade}
                        onClick={() => setDetailAmbientShade(!detailAmbientShade)}
                        className={`settings-switch relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          detailAmbientShade ? 'bg-primary' : 'bg-white/10'
                        }`}
                        title="Toggle between theme ambient shade and classic black shades for Movie Details"
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            detailAmbientShade ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Option 1: Theme Ambient */}
                      <button
                        type="button"
                        onClick={() => setDetailAmbientShade(true)}
                        className={`halo-preset-btn relative flex flex-col items-start rounded-2xl p-3.5 border text-left transition-all ${
                          detailAmbientShade
                            ? 'border-white/40 bg-white/[0.08] shadow-lg'
                            : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                        style={
                          detailAmbientShade
                            ? {
                                borderColor: currentAccent.hex,
                                boxShadow: `0 4px 18px rgb(${currentAccent.rgb} / 0.25)`,
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className="text-xs font-black uppercase tracking-wider text-white">Theme Ambient (Default)</span>
                          {detailAmbientShade && (
                            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: contrastAccentHex }}>Active</span>
                          )}
                        </div>
                        <span className="preset-sub text-[10px] font-medium text-white/40">
                          Movie details backdrop adapts to your chosen ambient color and theme with a gentle atmospheric veil.
                        </span>
                      </button>

                      {/* Option 2: Classic Black */}
                      <button
                        type="button"
                        onClick={() => setDetailAmbientShade(false)}
                        className={`halo-preset-btn relative flex flex-col items-start rounded-2xl p-3.5 border text-left transition-all ${
                          !detailAmbientShade
                            ? 'border-white/40 bg-white/[0.08] shadow-lg'
                            : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                        style={
                          !detailAmbientShade
                            ? {
                                borderColor: currentAccent.hex,
                                boxShadow: `0 4px 18px rgb(${currentAccent.rgb} / 0.25)`,
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className="text-xs font-black uppercase tracking-wider text-white">Classic Black</span>
                          {!detailAmbientShade && (
                            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: contrastAccentHex }}>Active</span>
                          )}
                        </div>
                        <span className="preset-sub text-[10px] font-medium text-white/40">
                          Always displays movie details with traditional cinema blackout shades (#080d16) and pure dark scrims.
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* 3.2 Video Player Ambilight */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="ambient-label-title text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                          Video Player Ambilight
                        </span>
                        <span className="ambient-label-sub text-[10px] font-medium text-white/30">
                          (In-Player Lighting)
                        </span>
                      </div>
                      <span
                        className="rounded-lg px-2.5 py-0.5 text-xs font-black uppercase tracking-wider"
                        style={{
                          backgroundColor: theme === 'light' ? `rgb(${currentAccent.rgb} / 0.12)` : `rgb(${currentAccent.rgb} / 0.15)`,
                          color: contrastAccentHex,
                          border: `1px solid rgb(${currentAccent.rgb} / ${theme === 'light' ? '0.35' : '0.3'})`,
                        }}
                      >
                        {playerAmbilightMode === 'pause_aura'
                          ? 'Pause Aura (Auto)'
                          : playerAmbilightMode === 'soft_halo'
                            ? 'Soft Theater Halo'
                            : 'Pure Blackout'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* Pause Aura */}
                      <button
                        type="button"
                        onClick={() => setPlayerAmbilightMode('pause_aura')}
                        className={`halo-preset-btn relative flex flex-col items-start rounded-2xl p-3.5 border text-left transition-all ${
                          playerAmbilightMode === 'pause_aura'
                            ? 'border-white/40 bg-white/[0.08] shadow-lg'
                            : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                        style={
                          playerAmbilightMode === 'pause_aura'
                            ? {
                                borderColor: currentAccent.hex,
                                boxShadow: `0 4px 18px rgb(${currentAccent.rgb} / 0.25)`,
                              }
                            : undefined
                        }
                      >
                        <span className="text-xs font-black uppercase tracking-wider text-white mb-1">Pause Aura</span>
                        <span className="preset-sub text-[10px] font-medium text-white/40">
                          Pure black during playback; gentle ambient glow smoothly fades in when paused.
                        </span>
                      </button>

                      {/* Soft Theater Halo */}
                      <button
                        type="button"
                        onClick={() => setPlayerAmbilightMode('soft_halo')}
                        className={`halo-preset-btn relative flex flex-col items-start rounded-2xl p-3.5 border text-left transition-all ${
                          playerAmbilightMode === 'soft_halo'
                            ? 'border-white/40 bg-white/[0.08] shadow-lg'
                            : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                        style={
                          playerAmbilightMode === 'soft_halo'
                            ? {
                                borderColor: currentAccent.hex,
                                boxShadow: `0 4px 18px rgb(${currentAccent.rgb} / 0.25)`,
                              }
                            : undefined
                        }
                      >
                        <span className="text-xs font-black uppercase tracking-wider text-white mb-1">Soft Theater Halo</span>
                        <span className="preset-sub text-[10px] font-medium text-white/40">
                          Continuous subtle diffused ambient glow radiating softly around video frame.
                        </span>
                      </button>

                      {/* Pure Blackout */}
                      <button
                        type="button"
                        onClick={() => setPlayerAmbilightMode('blackout')}
                        className={`halo-preset-btn relative flex flex-col items-start rounded-2xl p-3.5 border text-left transition-all ${
                          playerAmbilightMode === 'blackout'
                            ? 'border-white/40 bg-white/[0.08] shadow-lg'
                            : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                        style={
                          playerAmbilightMode === 'blackout'
                            ? {
                                borderColor: currentAccent.hex,
                                boxShadow: `0 4px 18px rgb(${currentAccent.rgb} / 0.25)`,
                              }
                            : undefined
                        }
                      >
                        <span className="text-xs font-black uppercase tracking-wider text-white mb-1">Pure Blackout</span>
                        <span className="preset-sub text-[10px] font-medium text-white/40">
                          Zero backlight during playback for traditional dark-room cinema immersion.
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <section>
          <h3 className={sectionTitleClass}>Streaming</h3>
          <div className={panelClass}>
            <div className="flex items-center justify-between gap-6 p-6">
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
                className={`settings-switch relative h-6 w-11 flex-shrink-0 rounded-full border transition-all ${
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
            <div className="border-t border-white/5 settings-divider" />
            <div className="flex items-center justify-between gap-6 p-6">
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
                className={`settings-switch relative h-6 w-11 flex-shrink-0 rounded-full border transition-all ${
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
          </div>
        </section>

        <section>
          <h3 className={sectionTitleClass}>Features</h3>
          <div data-tour="settings-focustube" className={panelClass}>
            <div className="flex items-center justify-between gap-6 p-6">
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
                className={`settings-switch relative h-6 w-11 flex-shrink-0 rounded-full border transition-all ${
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

          <div className={`${panelClass} overflow-hidden`}>
            {folders.length === 0 ? (
              <div className="settings-empty-card flex flex-col items-center justify-center space-y-3 py-12 text-white/20">
                <FolderOpen size={36} strokeWidth={1} />
                <p className="text-xs font-bold uppercase tracking-[0.18em]">No folders added yet</p>
              </div>
            ) : (
              <div className="settings-divide divide-y divide-white/5">
                {folders.map((folder: any) => (
                  <div
                    key={folder.id}
                    className="group flex items-center justify-between gap-4 p-4 transition-all hover:bg-white/[0.02]"
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
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className={sectionTitleClass}>Downloads</h3>
          </div>

          <div className={panelClass}>
            <div className="p-6 space-y-5">
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
              <div className="settings-drive-card rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
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

            <div className="border-t border-white/5 settings-divider" />

            <div className="flex items-center justify-between gap-6 p-6">
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
                className={`settings-switch relative h-6 w-11 flex-shrink-0 rounded-full border transition-all ${
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
                <div key={site.id} className="settings-site-card flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center">
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
                      className="settings-site-input h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 text-[12px] font-semibold text-white outline-none placeholder:text-white/25 focus:border-primary/50 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveDownloadSiteDomain(site.id)}
                      disabled={!((downloadSiteDrafts[site.id] || '').trim()) || downloadSiteBusyId === site.id}
                      className={`settings-site-btn ${compactButtonClass} border border-white/10 bg-white/5 text-white hover:bg-white/10`}
                    >
                      <span>{downloadSiteBusyId === site.id ? 'Saving…' : 'Save'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRefreshDownloadSiteDomain(site.id)}
                      disabled={downloadSiteBusyId === site.id}
                      className={`settings-site-btn ${compactButtonClass} border border-white/10 bg-transparent text-white/50 hover:text-white hover:bg-white/5`}
                      title="Re-check the live link right now"
                    >
                      <span>{downloadSiteBusyId === site.id ? 'Checking…' : 'Refresh'}</span>
                    </button>
                    {(site.domain || site.manual) && (
                      <button
                        type="button"
                        onClick={() => void handleResetDownloadSiteDomain(site.id)}
                        disabled={downloadSiteBusyId === site.id}
                        className={`settings-site-btn ${compactButtonClass} border border-white/10 bg-transparent text-white/50 hover:text-white hover:bg-white/5`}
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
                <h4 className="text-xs font-black text-white uppercase tracking-tight">Library & Focus Tube Backup</h4>
                <p className="mt-0.5 text-[11px] font-medium leading-4 text-white/35">
                  Export or restore watched folders, watchlist, favorites, online resumes, followed series, and Focus Tube channels & categories.
                </p>
                {backupMessage && (
                  <p className="mt-1 text-[11px] font-bold leading-4 text-primary">
                    {backupMessage}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row flex-shrink-0">
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
          
          <div className="settings-danger-card flex flex-col justify-between gap-6 rounded-3xl border border-red-500/20 bg-gradient-to-r from-red-500/10 to-transparent p-6 md:flex-row md:items-center">
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

export default React.memo(Settings)
