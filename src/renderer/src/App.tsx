import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { Home as HomeIcon, Film, Tv, Settings as SettingsIcon, Video as VideoIcon, Download as DownloadIcon, Menu, Bookmark, Settings, RefreshCw, Maximize2, Minimize2, Loader2, PauseCircle, AlertCircle, X, Minus, ArrowUpRight, Image as ImageIcon, ChevronLeft, ChevronRight, Layers, Compass, Megaphone } from 'lucide-react'
import { Video } from './types'
import Home from './pages/Home'
import Videos from './pages/Videos'
import Movies from './pages/Movies'
import Series from './pages/Series'
import Collections from './pages/Collections'
import Watchlist from './pages/Watchlist'


import SettingsPage from './pages/Settings'
import VideoPlayer from './components/VideoPlayer'
import DetailScreen from './components/DetailScreen'
import WhatsNewOnboarding, { LATEST_RELEASE } from './components/WhatsNewOnboarding'
import ProductTour, { TOURS, isTourSeen, markTourSeen } from './components/ProductTour'
import { WindowControlsGuide } from './components/FeatureGuides'
import Download from './pages/Download'
import FocusTube from './pages/FocusTube'
import Updates from './pages/Updates'
import appLogo from './assets/mycinema-logo.png'
import { useTheme } from './theme/ThemeContext'
import { normalizeProfileImage, resolveProfileImageUrl } from './utils/profileImage'

const getWhatsNewStorageKey = (version: string) => `mycinema_whats_new_seen_${version}`
const SIDEBAR_EXPANDED_STORAGE_KEY = 'mycinema_sidebar_expanded'
const DOUBLE_TAP_WINDOW_MS = 300
type AppTab = 'home' | 'videos' | 'movies' | 'series' | 'collections' | 'download' | 'settings' | 'watchlist' | 'focustube' | 'updates'

type ActiveDownload = {
  id: string
  title?: string
  name?: string | null
  progress?: number
  status?: 'downloading' | 'done' | 'error' | 'paused' | 'connecting' | 'pending' | string
  downloadSpeed?: string
  timeRemaining?: string
  addedAt?: string
}

const getDownloadTime = (download: ActiveDownload) => {
  const time = download.addedAt ? new Date(download.addedAt).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

const sortDownloadsForTray = (items: ActiveDownload[]) => (
  [...items].sort((a, b) => {
    const statusRank = (status?: string) => {
      if (status === 'downloading' || status === 'connecting') return 0
      if (status === 'paused' || status === 'pending') return 1
      if (status === 'error') return 2
      return 3
    }

    const statusDiff = statusRank(a.status) - statusRank(b.status)
    if (statusDiff !== 0) return statusDiff
    return getDownloadTime(b) - getDownloadTime(a)
  })
)

const App: React.FC = () => {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<AppTab>('home')
  // Focus Tube is opt-out. While off the tab is not rendered at all, which also
  // means its page never mounts and therefore issues no feed requests. The
  // main process has already stopped the background polling.
  const [focusTubeEnabled, setFocusTubeEnabled] = useState(true)
  // Once visited, FocusTube stays mounted (hidden) so its mini-player keeps
  // playing across tabs. Gated on first visit so app startup issues no feed
  // requests for users who never open the tab.
  const [focusTubeMounted, setFocusTubeMounted] = useState(false)
  useEffect(() => {
    if (!focusTubeEnabled) {
      setFocusTubeMounted(false)
      return
    }
    if (activeTab === 'focustube') setFocusTubeMounted(true)
  }, [activeTab, focusTubeEnabled])
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => {
    return localStorage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY) !== 'false'
  })
  const [showWhatsNew, setShowWhatsNew] = useState(() => {
    return localStorage.getItem(getWhatsNewStorageKey(LATEST_RELEASE.version)) !== 'true'
  })
  // Spotlight product tour. Starts chained after What's New closes (when the
  // release defines LATEST_RELEASE.tourId), or via ?tour=<id> preview.
  const [activeTourId, setActiveTourId] = useState<string | null>(null)

  const [playingVideo, setPlayingVideo] = useState<Video | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [sharedSource, setSharedSource] = useState<any | null>(null)
  const [homeRefreshKey, setHomeRefreshKey] = useState(0)
  const [watchlistRefreshKey, setWatchlistRefreshKey] = useState(0)
  const [userName, setUserName] = useState(() => localStorage.getItem('mycinema_user_name') || 'User')
  const [profileImage, setProfileImage] = useState<string | null>(() => localStorage.getItem('mycinema_profile_image'))
  const [profileImageFailed, setProfileImageFailed] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(true)
  const [launchFullscreen, setLaunchFullscreen] = useState(true)
  const [showWindowControls, setShowWindowControls] = useState(false)
  const [videoControlsVisible, setVideoControlsVisible] = useState(false)
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([])
  const [dismissedDownloadTrayIds, setDismissedDownloadTrayIds] = useState<Set<string>>(() => new Set())
  const [showDownloadTray, setShowDownloadTray] = useState(() => {
    try {
      return localStorage.getItem('mycinema_show_download_tray') !== 'false'
    } catch {
      return true
    }
  })
  const [webPopupOpen, setWebPopupOpen] = useState(false)
  const homeScrollRef = useRef<HTMLDivElement | null>(null)
  const activePageScrollRef = useRef<HTMLDivElement | null>(null)
  const activeTabRef = useRef<AppTab>('home')
  const tabScrollPositionsRef = useRef<Partial<Record<AppTab, number>>>({})
  const windowControlsHideTimerRef = useRef<number | null>(null)
  const windowControlsShowTimerRef = useRef<number | null>(null)
  const appFullscreenTapTimerRef = useRef<number | null>(null)
  const appFullscreenToggleInFlightRef = useRef(false)
  const activeTempStreamRef = useRef<string | null>(null)

  const getScrollElement = (tab: AppTab) => {
    return tab === 'home' ? homeScrollRef.current : activePageScrollRef.current
  }

  const navigateToTab = useCallback((tab: AppTab) => {
    setSelectedVideo(null)
    setSharedSource(null)

    if (tab === activeTabRef.current) {
      if (tab === 'home') {
        homeScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }
      if (tab === 'focustube') {
        window.dispatchEvent(new CustomEvent('focustube-tab-changed', { detail: { activeTab: 'focustube' } }))
      }
      return
    }

    const currentScroller = getScrollElement(activeTabRef.current)
    if (currentScroller) {
      tabScrollPositionsRef.current[activeTabRef.current] = currentScroller.scrollTop
    }

    setActiveTab(tab)
  }, [])

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
    const handleProfileUpdate = () => {
      setProfileImage(localStorage.getItem('mycinema_profile_image'))
    }
    window.addEventListener('mycinema_name_updated', handleNameUpdate)
    window.addEventListener('mycinema_profile_updated', handleProfileUpdate)
    return () => {
      window.removeEventListener('mycinema_name_updated', handleNameUpdate)
      window.removeEventListener('mycinema_profile_updated', handleProfileUpdate)
    }
  }, [])

  useLayoutEffect(() => {
    localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, String(isSidebarExpanded))
    document.documentElement.style.setProperty('--sidebar-width', isSidebarExpanded ? '16rem' : '5rem')
  }, [isSidebarExpanded])

  useEffect(() => {
    try { (window as any).__mycinemaActiveTab = activeTab } catch {}
    window.dispatchEvent(new CustomEvent('focustube-tab-changed', { detail: { activeTab } }))
  }, [activeTab])

  useEffect(() => {
    const handleRequestTab = (e: any) => {
      if (e.detail?.tab) {
        navigateToTab(e.detail.tab)
      }
    }
    window.addEventListener('focustube-request-tab', handleRequestTab)
    return () => window.removeEventListener('focustube-request-tab', handleRequestTab)
  }, [navigateToTab])

  useEffect(() => {
    return window.api?.onFtPipClosed?.((state) => {
      if (state?.restoreRequested) {
        navigateToTab('focustube')
      }
    })
  }, [navigateToTab])



  useEffect(() => {
    window.api.isFullscreen().then(setIsFullscreen).catch(() => {})
    return window.api.onFullscreenChanged(setIsFullscreen)
  }, [])

  useEffect(() => {
    const handlePopupOpened = () => setWebPopupOpen(true)
    const handlePopupClosed = () => setWebPopupOpen(false)
    window.addEventListener('web-popup-opened', handlePopupOpened)
    window.addEventListener('web-popup-closed', handlePopupClosed)
    return () => {
      window.removeEventListener('web-popup-opened', handlePopupOpened)
      window.removeEventListener('web-popup-closed', handlePopupClosed)
    }
  }, [])

  // If Focus Tube is switched off while its tab is open, that tab stops
  // rendering, so move somewhere real rather than leaving a blank pane.
  useEffect(() => {
    if (!focusTubeEnabled && activeTab === 'focustube') {
      setActiveTab('home')
    }
  }, [focusTubeEnabled, activeTab])

  const startTourIfPending = useCallback((tourId?: string | null) => {
    if (!tourId || !TOURS[tourId] || isTourSeen(tourId)) return
    setActiveTourId(tourId)
  }, [])

  const closeWhatsNew = useCallback(
    (startTour: boolean) => {
      localStorage.setItem(getWhatsNewStorageKey(LATEST_RELEASE.version), 'true')
      setShowWhatsNew(false)
      if (startTour) {
        // Breather: let the dialog fade and the home screen settle before
        // the dim + spotlight drops in, so it never feels like an ambush.
        window.setTimeout(() => {
          startTourIfPending(LATEST_RELEASE.tourId)
        }, 900)
      }
    },
    [startTourIfPending],
  )

  // Preview a tour without touching release state: open the app with
  // ?tour=<id> (e.g. ?tour=focus-tube), or run this in the console:
  //   localStorage.setItem('mycinema_preview_tour', 'focus-tube'); location.reload()
  // Clear it with: localStorage.removeItem('mycinema_preview_tour')
  useEffect(() => {
    try {
      const previewId =
        new URLSearchParams(window.location.search).get('tour') ||
        localStorage.getItem('mycinema_preview_tour')
      if (previewId && TOURS[previewId]) {
        setActiveTourId(previewId)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const syncStreamingMirrors = (settings: { rememberOnlineProgress?: boolean; notifyNewEpisodes?: boolean }) => {
      try {
        if (typeof settings.rememberOnlineProgress === 'boolean') {
          localStorage.setItem(
            'mycinema_remember_online_progress',
            settings.rememberOnlineProgress ? 'true' : 'false'
          )
        }
        if (typeof settings.notifyNewEpisodes === 'boolean') {
          localStorage.setItem(
            'mycinema_notify_new_episodes',
            settings.notifyNewEpisodes ? 'true' : 'false'
          )
        }
      } catch { /* ignore */ }
    }
    window.api.getAppSettings().then(settings => {
      setLaunchFullscreen(settings.launchFullscreen)
      setFocusTubeEnabled(settings.focusTubeEnabled !== false)
      if (typeof settings.showDownloadTray === 'boolean') {
        setShowDownloadTray(settings.showDownloadTray)
        try {
          localStorage.setItem('mycinema_show_download_tray', String(settings.showDownloadTray))
        } catch {}
      }

      // Sync and migrate user profile
      let finalName = settings.userName
      let finalImage = settings.profileImage

      if (!finalName || finalName === 'User') {
        const localName = localStorage.getItem('mycinema_user_name')
        if (localName && localName !== 'User') {
          finalName = localName
        }
      }

      if (!finalImage) {
        const localImage = localStorage.getItem('mycinema_profile_image')
        if (localImage) finalImage = localImage
      }
      finalImage = normalizeProfileImage(finalImage)

      if (finalName && finalName !== 'User' && finalName !== settings.userName) {
        window.api.setUserProfile({ userName: finalName, profileImage: finalImage ?? undefined }).catch(() => {})
      }

      if (finalName) {
        setUserName(finalName)
        localStorage.setItem('mycinema_user_name', finalName)
        window.dispatchEvent(new Event('mycinema_name_updated'))
      }
      if (finalImage !== undefined) {
        setProfileImage(finalImage ?? null)
        if (finalImage) localStorage.setItem('mycinema_profile_image', finalImage)
        else localStorage.removeItem('mycinema_profile_image')
        window.dispatchEvent(new Event('mycinema_profile_updated'))
      }

      // Keep the renderer's sync online-progress gates aligned with main.
      syncStreamingMirrors(settings)
    }).catch(() => {})

    return window.api.onAppSettingsChanged(settings => {
      setLaunchFullscreen(settings.launchFullscreen)
      setFocusTubeEnabled(settings.focusTubeEnabled !== false)
      if (typeof settings.showDownloadTray === 'boolean') {
        setShowDownloadTray(settings.showDownloadTray)
        try {
          localStorage.setItem('mycinema_show_download_tray', String(settings.showDownloadTray))
        } catch {}
      }
      if (typeof settings.userName === 'string') {
        setUserName(settings.userName)
        localStorage.setItem('mycinema_user_name', settings.userName)
        window.dispatchEvent(new Event('mycinema_name_updated'))
      }
      if (settings.profileImage !== undefined) {
        const normalizedImage = normalizeProfileImage(settings.profileImage)
        setProfileImage(normalizedImage ?? null)
        if (normalizedImage) localStorage.setItem('mycinema_profile_image', normalizedImage)
        else localStorage.removeItem('mycinema_profile_image')
        window.dispatchEvent(new Event('mycinema_profile_updated'))
      }
      if (!settings.launchFullscreen) {
        setShowWindowControls(false)
      }
      syncStreamingMirrors(settings)
    })
  }, [])

  useEffect(() => {
    setProfileImageFailed(false)
  }, [profileImage])

  useEffect(() => {
    const handleTrayToggle = (e: any) => {
      if (typeof e?.detail?.enabled === 'boolean') {
        setShowDownloadTray(e.detail.enabled)
      } else {
        try {
          setShowDownloadTray(localStorage.getItem('mycinema_show_download_tray') !== 'false')
        } catch {}
      }
    }
    window.addEventListener('mycinema_download_tray_changed', handleTrayToggle)
    return () => window.removeEventListener('mycinema_download_tray_changed', handleTrayToggle)
  }, [])

  useEffect(() => {
    let cancelled = false

    const refreshDownloads = () => {
      window.api.getActiveDownloads()
        .then((downloads: ActiveDownload[]) => {
          if (!cancelled && Array.isArray(downloads)) {
            setActiveDownloads(prev => {
              const prevMap = new Map(prev.map(p => [p.id, p]))
              return downloads.map(d => {
                const existing = prevMap.get(d.id)
                const rawProgress = typeof d.progress === 'number' ? d.progress : Number(d.progress || 0)
                const clamped = Math.max(0, Math.min(d.status === 'done' ? 100 : 99.9, rawProgress))
                const smoothProgress = (d.status === 'downloading' || d.status === 'connecting') && existing
                  ? Math.max(existing.progress || 0, clamped)
                  : clamped
                return { ...d, progress: smoothProgress }
              })
            })
          }
        })
        .catch(err => console.error('[DownloadsTray] Failed to load downloads:', err))
    }

    refreshDownloads()

    const cleanup = window.api.onTorrentProgress((data: ActiveDownload) => {
      if (!data?.id) return
      setActiveDownloads(prev => {
        const rawProgress = typeof data.progress === 'number' ? data.progress : Number(data.progress || 0)
        const clamped = Math.max(0, Math.min(data.status === 'done' ? 100 : 99.9, rawProgress))
        const index = prev.findIndex(download => download.id === data.id)
        if (index === -1) return [{ ...data, progress: clamped }, ...prev]
        const current = prev[index]
        const smoothProgress = (data.status === 'downloading' || data.status === 'connecting')
          ? Math.max(current.progress || 0, clamped)
          : clamped

        const currentPct = Math.round(current.progress || 0)
        const nextPct = Math.round(smoothProgress)
        if (
          currentPct === nextPct &&
          current.status === data.status &&
          current.downloadSpeed === data.downloadSpeed &&
          current.timeRemaining === data.timeRemaining
        ) {
          return prev
        }
        const next = [...prev]
        next[index] = { ...next[index], ...data, progress: smoothProgress }
        return next
      })
    })
    const cleanupDownloadsChanged = window.api.onDownloadsChanged(refreshDownloads)

    return () => {
      cancelled = true
      cleanup()
      cleanupDownloadsChanged()
    }
  }, [])

  useEffect(() => {
    return () => {
      clearWindowControlsHideTimer()
      clearWindowControlsShowTimer()
      if (appFullscreenTapTimerRef.current) {
        window.clearTimeout(appFullscreenTapTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const openSharedMedia = async (target: { type: 'movie' | 'series'; tmdbId: number; source?: any }) => {
      try {
        const video = await window.api.getSharedMediaByTmdbId(target.type, target.tmdbId)
        if (cancelled || !video) return

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

  const [sharedCollectionFocus, setSharedCollectionFocus] = useState<{ id: number; nonce: number } | null>(null)

  useEffect(() => {
    let cancelled = false

    const openSharedCollection = async (payload: any) => {
      try {
        const result = await window.api.importSharedCollection(payload)
        if (cancelled || !result?.imported) return

        setPlayingVideo(null)
        setSelectedVideo(null)
        setActiveTab('collections')
        if (typeof result.id === 'number') {
          setSharedCollectionFocus({ id: result.id, nonce: Date.now() })
        }
      } catch (err) {
        console.error('[DeepLink] Failed to open shared collection:', err)
      }
    }

    window.api.getPendingSharedCollectionTarget()
      .then(target => {
        if (target) openSharedCollection(target)
      })
      .catch(err => console.error('[DeepLink] Pending shared collection lookup failed:', err))

    const cleanup = window.api.onOpenSharedCollection(openSharedCollection)

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
            duration: 0,
            isExternal: true
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

  // ─── Download Tab Indicators ───────────────────────────────────────────────
  const dlActiveDownloads = activeDownloads.filter(
    d => d.status === 'downloading' || d.status === 'connecting'
  )
  const dlActiveCount = dlActiveDownloads.length
  const dlQueuedCount = activeDownloads.filter(d => d.status === 'queued').length
  const dlTotalActive = dlActiveCount + dlQueuedCount
  // Average progress of all actively-downloading items
  const dlAvgProgress = dlActiveCount > 0
    ? dlActiveDownloads.reduce((s, d) => s + Math.max(0, Math.min(100, Number(d.progress || 0))), 0) / dlActiveCount
    : 0
  // Top download for speed label
  const dlTopDownload = dlActiveDownloads[0]

  const navItems = [
    { id: 'home' as const,     label: 'Home',         icon: <HomeIcon size={20} /> },
    // Hidden entirely while the feature is off in Settings.
    ...(focusTubeEnabled
      ? [{ id: 'focustube' as const, label: 'Focus Tube', icon: <Compass size={20} />, badge: 'Beta' }]
      : []),
    { id: 'movies' as const,   label: 'Movies',       icon: <Film size={20} /> },
    { id: 'series' as const,   label: 'Web Series',   icon: <Tv size={20} /> },
    { id: 'videos' as const,   label: 'Videos',       icon: <VideoIcon size={20} /> },
    { id: 'collections' as const, label: 'Collections', icon: <Layers size={20} /> },
    { id: 'watchlist' as const, label: 'Watchlist',    icon: <Bookmark size={20} /> },
    { id: 'download' as const,  label: 'Downloads',    icon: <DownloadIcon size={20} /> },
  ]


  const handlePlayVideo = useCallback((video: Video) => {
    if (video.streamSourceId) {
      const previousStreamId = activeTempStreamRef.current
      // Switching to a different temp stream (e.g. next episode's magnet):
      // stop the previous one so torrents don't pile up.
      if (previousStreamId && previousStreamId !== video.streamSourceId) {
        window.api.stopTempStream(previousStreamId)
      }
      activeTempStreamRef.current = video.streamSourceId
    }
    setPlayingVideo(video)
  }, [])

  const handleStartUpdateDownload = async () => {
    setUpdateState(prev => ({ ...prev, status: 'downloading', percent: 0 }))
    try {
      await window.api.startUpdateDownload()
    } catch (err) {
      console.error('Update download failed:', err)
      setUpdateState(prev => ({ ...prev, status: 'available' }))
    }
  }

  const clearWindowControlsHideTimer = () => {
    if (windowControlsHideTimerRef.current) {
      window.clearTimeout(windowControlsHideTimerRef.current)
      windowControlsHideTimerRef.current = null
    }
  }

  const clearWindowControlsShowTimer = () => {
    if (windowControlsShowTimerRef.current) {
      window.clearTimeout(windowControlsShowTimerRef.current)
      windowControlsShowTimerRef.current = null
    }
  }

  const revealWindowControls = () => {
    clearWindowControlsShowTimer()
    clearWindowControlsHideTimer()
    setShowWindowControls(true)
  }

  // Hover-intent reveal: only pop the capsule after the cursor lingers in
  // the corner (~250ms), so brush-by mouse passes — e.g. reaching for a
  // panel close button just below — never flash it. A deliberate move to
  // the corner always lands it.
  const scheduleWindowControlsReveal = () => {
    clearWindowControlsHideTimer()
    if (windowControlsShowTimerRef.current) return
    windowControlsShowTimerRef.current = window.setTimeout(() => {
      windowControlsShowTimerRef.current = null
      setShowWindowControls(true)
    }, 250)
  }

  const hideWindowControlsSoon = () => {
    clearWindowControlsShowTimer()
    clearWindowControlsHideTimer()
    windowControlsHideTimerRef.current = window.setTimeout(() => {
      setShowWindowControls(false)
      windowControlsHideTimerRef.current = null
    }, 800)
  }

  // Briefly flash the auto-hide window capsule on launch / fullscreen change
  // so users discover it, then let it melt away until they hover top-right.
  useEffect(() => {
    if (!launchFullscreen) return
    revealWindowControls()
    const timer = window.setTimeout(() => setShowWindowControls(false), 3500)
    return () => window.clearTimeout(timer)
  }, [launchFullscreen, isFullscreen])

  const handleToggleFullscreen = async () => {
    if (appFullscreenToggleInFlightRef.current) return
    appFullscreenToggleInFlightRef.current = true
    try {
      const nextState = await window.api.toggleFullscreen()
      setIsFullscreen(nextState)
      if (!nextState) {
        setShowWindowControls(false)
      }
    } finally {
      appFullscreenToggleInFlightRef.current = false
    }
  }

  const handleAppSurfaceClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (playingVideo) return

    const target = event.target as HTMLElement
    // Controls, fields, dialogs, and the player always retain their own interaction model.
    if (target.closest('button, a, input, textarea, select, option, [contenteditable="true"], [role="button"], [role="dialog"], [data-fullscreen-gesture-ignore], [data-fullscreen-gesture-scope]')) {
      return
    }

    if (appFullscreenTapTimerRef.current) {
      window.clearTimeout(appFullscreenTapTimerRef.current)
      appFullscreenTapTimerRef.current = null
      void handleToggleFullscreen()
      return
    }

    appFullscreenTapTimerRef.current = window.setTimeout(() => {
      appFullscreenTapTimerRef.current = null
    }, DOUBLE_TAP_WINDOW_MS)
  }

  const WindowControls = () => {
    if (!launchFullscreen) return null

    const controlsVisible = showWindowControls || (!!playingVideo && videoControlsVisible)
    const isOnVideo = !!playingVideo
    const capsuleClass = `window-controls-capsule ${isOnVideo ? 'on-video' : ''} pointer-events-auto flex items-center gap-px rounded-full py-0.5 pl-1 pr-0.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
      controlsVisible ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-2 scale-95 opacity-0'
    }`
    const controlButtonClass = 'window-control-btn flex h-6 w-7 items-center justify-center rounded-full transition-all duration-150 active:scale-90 focus:outline-none'

    if (isFullscreen) {
      return (
        <div
          className="fixed right-0 top-0 z-[260] flex h-8 w-28 items-start justify-end pr-1.5 pt-1"
          onMouseEnter={scheduleWindowControlsReveal}
          onMouseLeave={hideWindowControlsSoon}
          onFocus={revealWindowControls}
          onBlur={hideWindowControlsSoon}
        >
          <div className={capsuleClass} aria-hidden={!controlsVisible}>
            <button
              type="button"
              title="Minimize"
              aria-label="Minimize"
              tabIndex={controlsVisible ? 0 : -1}
              onClick={() => window.api.minimizeWindow()}
              className={controlButtonClass}
            >
              <Minus size={12} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              title="Exit fullscreen"
              aria-label="Exit fullscreen"
              tabIndex={controlsVisible ? 0 : -1}
              onClick={handleToggleFullscreen}
              className={controlButtonClass}
            >
              <Minimize2 size={11} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              title="Close"
              aria-label="Close"
              tabIndex={controlsVisible ? 0 : -1}
              onClick={() => window.api.closeWindow()}
              className={`${controlButtonClass} window-control-close hover:bg-red-500 hover:text-white`}
            >
              <X size={12} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )
    }

    return (
      <div
        className="fixed right-0 top-0 z-[260] flex h-8 w-16 items-start justify-end pr-1.5 pt-1"
        onMouseEnter={scheduleWindowControlsReveal}
        onMouseLeave={hideWindowControlsSoon}
        onFocus={revealWindowControls}
        onBlur={hideWindowControlsSoon}
      >
        <div className={capsuleClass} aria-hidden={!controlsVisible}>
          <button
            type="button"
            title="Enter fullscreen"
            aria-label="Enter fullscreen"
            tabIndex={controlsVisible ? 0 : -1}
            onClick={handleToggleFullscreen}
            className={controlButtonClass}
          >
            <Maximize2 size={11} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    )
  }

  const visibleDownloads = sortDownloadsForTray(activeDownloads.filter(download => (
    download.status === 'downloading' ||
    download.status === 'connecting' ||
    download.status === 'paused' ||
    download.status === 'pending' ||
    download.status === 'error'
  ) && !dismissedDownloadTrayIds.has(download.id)))
  const trayDownload = visibleDownloads[0]
  const trayProgress = Math.max(0, Math.min(100, Math.round(Number(trayDownload?.progress || 0))))
  const trayTitle = trayDownload ? (trayDownload.name || trayDownload.title || 'Download') : ''
  const shouldShowDownloadTray = Boolean(showDownloadTray && trayDownload && activeTab !== 'download' && !playingVideo)

  return (
    <div
      className={`flex h-screen bg-background text-text font-sans overflow-hidden ${theme === 'light' ? 'light' : 'dark'}`}
      onClick={handleAppSurfaceClick}
    >
      <WindowControls />

      {/* Popup backdrop blur overlay — sits between WindowControls and main content */}
      <div
        className={`absolute inset-0 z-[200] transition-all duration-300 ${webPopupOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={webPopupOpen ? { backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.35)' } : { backdropFilter: 'blur(0px)', background: 'transparent' }}
      />

      {/* Sidebar */}
      <div className={`group/sidebar relative bg-white/[0.02] backdrop-blur-2xl flex flex-col border-r border-white/5 transition-[width] duration-300 ease-in-out z-[85] ${isSidebarExpanded ? 'w-64' : 'w-20'}`}>
        
        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
          className="absolute -right-3.5 top-9 z-50 flex h-7 w-7 items-center justify-center rounded-full bg-[#1a2230] border border-white/10 text-white/70 shadow-xl opacity-0 -translate-x-2 pointer-events-none group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 group-hover/sidebar:pointer-events-auto hover:text-white hover:bg-[#253040] hover:scale-110 transition-all duration-300"
          title={isSidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          {isSidebarExpanded ? <ChevronLeft size={16} strokeWidth={2.5} /> : <ChevronRight size={16} strokeWidth={2.5} />}
        </button>

        <div className="relative flex h-24 items-center px-4 w-full overflow-hidden">
          <div className="w-12 h-full flex items-center justify-center flex-shrink-0">
            <img 
              src={appLogo} 
              alt="MyCinema" 
              className="h-11 w-11 rounded-full object-cover shadow-lg shadow-blue-500/10"
            />
          </div>
          <div className={`absolute left-16 whitespace-nowrap transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}>
            <span className="text-xl font-black tracking-tight text-white">MyCinema</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 space-y-8">
          {/* Main Nav */}
          <nav className="space-y-1">
            {navItems.map(item => {
              const isDownloadTab = item.id === 'download'
              const showDlIndicator = isDownloadTab && dlTotalActive > 0
              // SVG ring constants
              const ringR = 13
              const ringC = 2 * Math.PI * ringR

              return (
                <button
                  key={item.id}
                  data-tour={item.id === 'focustube' ? 'sidebar-focustube' : undefined}
                  onClick={() => navigateToTab(item.id)}
                  className={`relative w-full flex items-center rounded-xl transition-colors duration-200 group ${
                    showDlIndicator && isSidebarExpanded ? 'h-auto py-2' : 'h-12'
                  } ${
                    activeTab === item.id ? 'bg-primary/10 text-primary' : 'text-white/40 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="w-12 h-12 flex flex-col items-center justify-center flex-shrink-0 text-current relative">
                    {/* Progress ring around icon when downloads are active */}
                    {showDlIndicator ? (
                      <span className="relative flex items-center justify-center" style={{ width: 30, height: 30 }}>
                        {/* Background track */}
                        <svg
                          width="30" height="30"
                          className="absolute inset-0 -rotate-90"
                          viewBox="0 0 30 30"
                          style={{ overflow: 'visible' }}
                        >
                          <circle cx="15" cy="15" r={ringR} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
                          <circle
                            cx="15" cy="15" r={ringR}
                            fill="none"
                            stroke={activeTab === item.id ? 'var(--color-primary, #e50914)' : 'rgba(34,211,238,0.7)'}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeDasharray={ringC}
                            strokeDashoffset={ringC * (1 - dlAvgProgress / 100)}
                            className="transition-all duration-500"
                          />
                        </svg>
                        <span className="relative z-10 flex items-center justify-center" style={{ width: 20, height: 20 }}>
                          {item.icon}
                        </span>
                        {/* Count badge */}
                        <span
                          className="absolute -top-1.5 -right-1.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-cyan-400 px-[3px] text-[8px] font-black text-black leading-none shadow-[0_0_6px_rgba(34,211,238,0.6)]"
                        >
                          {dlTotalActive}
                        </span>
                      </span>
                    ) : (
                      <>
                        <span className="flex items-center justify-center leading-none">{item.icon}</span>
                        {'badge' in item && (item as { badge?: string }).badge && !isSidebarExpanded && (
                          <span
                            title={`${item.label} is in beta`}
                            className="mt-[3px] inline-flex items-center justify-center rounded border border-amber-300/25 bg-amber-400/15 px-[3px] py-px text-[6px] font-bold uppercase leading-none tracking-[0.08em] text-amber-200/90"
                          >
                            {(item as { badge?: string }).badge}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className={`absolute left-12 right-3 transition-all duration-300 ${
                    isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <span className="whitespace-nowrap text-sm font-bold">{item.label}</span>
                      {'badge' in item && (item as { badge?: string }).badge && (
                        <span
                          title={`${item.label} is in beta — some things may still change`}
                          className="inline-flex items-center rounded border border-amber-300/20 bg-amber-400/10 px-1 py-[1px] text-[8px] font-bold uppercase leading-none tracking-[0.08em] text-amber-200/90"
                        >
                          {(item as { badge?: string }).badge}
                        </span>
                      )}
                      {/* Inline download status when sidebar is expanded */}
                      {showDlIndicator && (
                        <span className="ml-auto flex items-center gap-1 shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                          <span className="text-[10px] font-bold text-cyan-400">
                            {dlActiveCount > 0 ? `${Math.round(dlAvgProgress)}%` : `${dlQueuedCount} queued`}
                          </span>
                        </span>
                      )}
                    </div>
                    {/* Progress bar — only when downloads active */}
                    {showDlIndicator && (
                      <div className="mt-1.5 space-y-1">
                        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-cyan-400 to-primary"
                            style={{ width: `${dlAvgProgress}%` }}
                          />
                        </div>
                        {dlTopDownload?.downloadSpeed && dlTopDownload.downloadSpeed !== '0 B/s' && (
                          <p className="text-[9px] font-semibold text-white/35 leading-none">
                            {dlTopDownload.downloadSpeed}{dlActiveCount > 1 ? ` · ${dlActiveCount} active` : ''}{dlQueuedCount > 0 ? ` · ${dlQueuedCount} queued` : ''}
                          </p>
                        )}
                        {(dlTopDownload?.downloadSpeed === '0 B/s' || !dlTopDownload?.downloadSpeed) && (
                          <p className="text-[9px] font-semibold text-white/35 leading-none">
                            {dlActiveCount > 0 ? `${dlActiveCount} downloading` : ''}{dlQueuedCount > 0 ? `${dlActiveCount > 0 ? ' · ' : ''}${dlQueuedCount} queued` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </nav>

        </div>

        <div className={`overflow-hidden px-4 transition-all duration-300 ${!isSidebarExpanded && updateState.status !== 'idle' ? 'max-h-16 pb-3 opacity-100' : 'max-h-0 pb-0 opacity-0'}`}>
          <button
            className={`relative mx-auto flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
              updateState.status === 'ready'
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                : updateState.status === 'downloading'
                  ? 'border-white/10 text-primary'
                  : 'border-primary/25 bg-primary/10 text-primary hover:bg-primary/20'
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
              <span className="relative flex h-9 w-9 items-center justify-center">
                <svg viewBox="0 0 36 36" className="absolute inset-0 h-9 w-9 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 15.5}
                    strokeDashoffset={2 * Math.PI * 15.5 * (1 - (updateState.percent ?? 0) / 100)}
                    className="transition-all duration-300"
                  />
                </svg>
                <RefreshCw size={14} className="animate-spin shrink-0" />
              </span>
            ) : (
              <DownloadIcon size={15} className="shrink-0" />
            )}
            {updateState.status === 'available' && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(229,9,20,0.7)] ring-2 ring-black/60" />
            )}
            {updateState.status === 'ready' && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)] ring-2 ring-black/60" />
            )}
          </button>
        </div>

        <div className={`overflow-hidden px-4 transition-all duration-300 ${isSidebarExpanded && updateState.status !== 'idle' ? 'max-h-60 pb-3 opacity-100' : 'max-h-0 pb-0 opacity-0'}`}>
          {updateState.status === 'available' && (
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <DownloadIcon size={15} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Update Available</p>
                  {updateState.version && (
                    <p className="text-xs text-white/40">v{updateState.version} is ready to download</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleStartUpdateDownload}
                className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-white hover:bg-[#c40812] transition-colors"
              >
                Download Update
              </button>
            </div>
          )}

          {updateState.status === 'downloading' && (
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <RefreshCw size={15} className="text-primary animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Downloading</p>
                  <p className="text-xs text-white/40">{updateState.percent ?? 0}% complete</p>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${updateState.percent ?? 0}%` }}
                />
              </div>
            </div>
          )}

          {updateState.status === 'ready' && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <DownloadIcon size={15} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Update Ready</p>
                  {updateState.version && (
                    <p className="text-xs text-white/40">v{updateState.version} installed</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => window.api.installUpdate()}
                className="w-full rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-white hover:bg-emerald-400 transition-colors"
              >
                Restart & Install
              </button>
            </div>
          )}
        </div>

        {/* User Profile */}
        {/* Updates Tab - Positioned directly above Profile / Settings */}
        <div className="px-4 pb-2 mt-auto">
          <button
            onClick={() => navigateToTab('updates')}
            className={`relative w-full flex items-center h-12 rounded-xl transition-colors duration-200 group ${
              activeTab === 'updates' ? 'bg-primary/10 text-primary' : 'text-white/40 hover:bg-white/5 hover:text-white'
            }`}
            title="Updates & Changelog"
          >
            <div className="w-12 h-full flex items-center justify-center flex-shrink-0 text-current">
              <Megaphone size={19} strokeWidth={2.2} />
            </div>
            <div className={`absolute left-12 right-2 flex items-center justify-between whitespace-nowrap transition-all duration-300 ${
              isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'
            }`}>
              <span className="text-sm font-bold">Updates</span>
              <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-primary">
                v{LATEST_RELEASE.version}
              </span>
            </div>
          </button>
        </div>

        <div className="p-4 pt-0">
          <div className="relative flex items-center bg-white/5 rounded-2xl border border-white/5 h-[52px] w-full overflow-hidden transition-all duration-300">
            
            {/* Avatar (Fixed Left) */}
            <div className="absolute left-1 w-10 h-10 flex-shrink-0 flex items-center justify-center">
              <div 
                className={`relative w-full h-full rounded-xl ${profileImage && !profileImageFailed ? 'bg-transparent' : 'bg-red-600'} flex items-center justify-center text-white font-black text-lg shadow-lg italic cursor-pointer hover:scale-105 transition-transform overflow-hidden`}
                onClick={() => navigateToTab('settings')}
                title="Settings & Profile"
              >
                {profileImage && !profileImageFailed ? (
                  <img
                    src={resolveProfileImageUrl(profileImage) ?? undefined}
                    alt={userName}
                    className="w-full h-full object-cover"
                    onError={() => setProfileImageFailed(true)}
                  />
                ) : (
                  userName.charAt(0).toUpperCase()
                )}
              </div>
            </div>

            {/* Expanded Content */}
            <div className={`absolute left-14 right-2 flex items-center justify-between transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigateToTab('settings')}>
                <h4 className="text-sm font-bold text-white truncate italic">{userName}</h4>
              </div>
              <button 
                onClick={() => navigateToTab('settings')}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                title="Settings"
              >
                <SettingsIcon size={18} />
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Main Content */}
      {/* NOTE: only the active page is mounted. Home used to stay mounted with
          opacity-0 (HeroCarousel timers, decoded images, scroll listeners all
          kept running behind Collections/Movies/etc. and caused scroll jank). */}
      <main className="relative flex-1 overflow-hidden">
        {/* The non-home container stays mounted (hidden) when Home is active.
            Home used to own the other branch of this ternary, so visiting it
            unmounted everything — including FocusTube's keep-alive wrapper —
            and killed a minimized FocusTube dock. Every inner page keeps its
            exact conditional mount, so only visibility changed, not lifecycles. */}
        <div ref={activePageScrollRef} className={`absolute inset-0 overflow-y-auto scrollbar-hide ${activeTab === 'home' ? 'hidden' : ''}`}>
            <div className="px-8 pt-6 pb-14 max-w-[1600px] mx-auto">
              {activeTab === 'videos'  && <Videos onPlay={handlePlayVideo} />}
              {/* FocusTube stays mounted (hidden) when you leave its tab so its
                  mini-player dock — portalled to document.body — keeps playing
                  across the whole app. `hidden` (display:none) only hides the
                  feed; portal content is unaffected. State (feed, queue,
                  player) is preserved, so coming back resumes where you left. */}
              {focusTubeEnabled && focusTubeMounted && (
                <div className={activeTab === 'focustube' ? 'contents' : 'hidden'}>
                  <FocusTube activeTab={activeTab} />
                </div>
              )}
              {activeTab === 'movies'  && <Movies onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
              {activeTab === 'series'  && <Series onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} />}
              {activeTab === 'collections' && <Collections onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} focusCollectionId={sharedCollectionFocus?.id ?? null} focusNonce={sharedCollectionFocus?.nonce ?? 0} />}
              {activeTab === 'watchlist' && <Watchlist onPlay={handlePlayVideo} onShowDetail={setSelectedVideo} refreshKey={watchlistRefreshKey} />}
              {activeTab === 'download' && <Download onShowDetail={setSelectedVideo} />}
              {activeTab === 'updates' && <Updates />}
              {activeTab === 'settings' && <SettingsPage />}
            </div>
        </div>
        <div
          ref={homeScrollRef}
          className={`absolute inset-0 overflow-y-auto scrollbar-hide pt-6 pb-14 ${activeTab === 'home' ? '' : 'hidden'}`}
        >
          <Home
            isActive={activeTab === 'home'}
            onPlay={handlePlayVideo}
            onShowDetail={setSelectedVideo}
            onNavigate={navigateToTab}
            refreshKey={homeRefreshKey}
          />
        </div>
      </main>

      {shouldShowDownloadTray && (
        <div className="fixed bottom-5 right-5 z-[45] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#0b1018]/95 p-4 pr-11 text-left shadow-[0_18px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-all hover:-translate-y-1 hover:border-primary/35 hover:bg-[#101722]">
          <button
            type="button"
            aria-label="Close download tray"
            title="Close"
            onClick={() => {
              if (!trayDownload?.id) return
              setDismissedDownloadTrayIds(prev => {
                const next = new Set(prev)
                next.add(trayDownload.id)
                return next
              })
            }}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-white/38 transition-all hover:bg-white/10 hover:text-white active:scale-95"
          >
            <X size={15} />
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('download')}
            className="block w-full text-left"
            title="Open downloads"
          >
            <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              trayDownload?.status === 'error'
                ? 'border-red-400/25 bg-red-500/12 text-red-300'
                : trayDownload?.status === 'paused'
                  ? 'border-amber-400/25 bg-amber-400/12 text-amber-200'
                  : 'border-cyan-400/25 bg-cyan-400/12 text-cyan-200'
            }`}>
              {trayDownload?.status === 'error' ? (
                <AlertCircle size={19} />
              ) : trayDownload?.status === 'paused' ? (
                <PauseCircle size={19} />
              ) : (
                <Loader2 size={19} className="animate-spin" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-black text-white">
                  {trayTitle}
                </p>
                <span className="shrink-0 text-xs font-black text-primary">
                  {trayProgress}%
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest text-white/38">
                <span>
                  {trayDownload?.status === 'paused'
                    ? 'Paused'
                    : trayDownload?.status === 'error'
                      ? 'Download error'
                      : trayDownload?.status === 'connecting'
                        ? 'Connecting'
                        : 'Downloading'}
                </span>
                {visibleDownloads.length > 1 && (
                  <span>{visibleDownloads.length - 1} more</span>
                )}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    trayDownload?.status === 'error'
                      ? 'bg-red-400'
                      : trayDownload?.status === 'paused'
                        ? 'bg-amber-300'
                        : 'bg-gradient-to-r from-cyan-300 to-primary'
                  }`}
                  style={{ width: `${trayProgress}%` }}
                />
              </div>
            </div>
            </div>
          </button>
        </div>
      )}

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
            const id = activeTempStreamRef.current
            activeTempStreamRef.current = null
            setPlayingVideo(null)
            if (id) {
              // Give Chromium's media pipeline 3.5 seconds as a head-start to
              // release its read handles on the torrent files. The main process
              // has a robust exponential-backoff retry loop (up to 8 attempts,
              // ~30s total) so deletion succeeds even if handles are held longer.
              setTimeout(() => {
                window.api.stopTempStream(id).catch(() => {})
              }, 3500)
            }
            setHomeRefreshKey(k => k + 1)
          }} 
          onControlsVisibilityChange={setVideoControlsVisible}
          onStreamChange={(streamId) => {
            // Keep the tracked stream in sync with the one the player is really
            // using (episode / magnet switches happen inside the player, so the
            // value set in handlePlayVideo can go stale).
            activeTempStreamRef.current = streamId
          }}
        />
      )}

      {showWhatsNew && (
        <WhatsNewOnboarding
          onClose={() => closeWhatsNew(false)}
          onSkipSession={() => setShowWhatsNew(false)}
          onStartTour={() => closeWhatsNew(true)}
          onViewAllUpdates={() => {
            closeWhatsNew(false)
            navigateToTab('updates')
          }}
        />
      )}

      {activeTourId && TOURS[activeTourId] && (
        <ProductTour
          tour={TOURS[activeTourId]}
          onNavigate={(tab) => navigateToTab(tab as AppTab)}
          onDone={() => {
            markTourSeen(activeTourId)
            setActiveTourId(null)
          }}
        />
      )}

      <WindowControlsGuide launchFullscreen={launchFullscreen} playingVideo={!!playingVideo} />
    </div>
  )
}


export default App
