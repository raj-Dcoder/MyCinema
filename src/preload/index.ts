import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getVideos: () => ipcRenderer.invoke('get-videos'),
  deleteVideoFile: (video: any) => ipcRenderer.invoke('delete-video-file', video),
  getVideoProgress: (videoId: number) => ipcRenderer.invoke('get-video-progress', videoId),
  updateVideoProgress: (videoId: number, time: number, completed: boolean, isClosing?: boolean) => 
    ipcRenderer.send('update-video-progress', videoId, time, completed, isClosing),
  scanFolder: (path: string) => ipcRenderer.invoke('scan-folder', path),
  getContinueWatching: () => ipcRenderer.invoke('get-continue-watching'),
  playVideo: (videoId: number) => ipcRenderer.invoke('play-video', videoId),
  getSeriesInfo: (seriesName: string) => ipcRenderer.invoke('get-series-info', seriesName),
  setPreferredVideoVersion: (videoId: number) => ipcRenderer.invoke('set-preferred-video-version', videoId),
  getSubtitlePath: (filePath: string) => ipcRenderer.invoke('get-subtitles', filePath),
  getEmbeddedSubtitles: (filePath: string) => ipcRenderer.invoke('get-embedded-subtitles', filePath),
  getEmbeddedAudio: (filePath: string) => ipcRenderer.invoke('get-embedded-audio', filePath),
  preConvertSubtitle: (filePath: string, trackIndex: number, isExternal: boolean) => ipcRenderer.invoke('pre-convert-subtitle', filePath, trackIndex, isExternal),
  onOpenExternalFile: (callback: (filePath: string) => void) => {
    const handler = (_e: any, filePath: string) => callback(filePath)
    ipcRenderer.on('open-external-file', handler)
    return () => ipcRenderer.removeListener('open-external-file', handler)
  },
  getPendingExternalFile: () => ipcRenderer.invoke('get-pending-external-file'),
  onLibraryUpdated: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('library-updated', handler)
    return () => ipcRenderer.removeListener('library-updated', handler)
  },
  removeAllLibraryUpdateListeners: () => ipcRenderer.removeAllListeners('library-updated'),
  getFolders: () => ipcRenderer.invoke('get-folders'),
  removeFolder: (folderPath: string) => ipcRenderer.invoke('remove-folder', folderPath),
  exportUserBackup: () => ipcRenderer.invoke('export-user-backup'),
  importUserBackup: () => ipcRenderer.invoke('import-user-backup'),
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
  fetchTrending: (type: 'movie' | 'series') => ipcRenderer.invoke('fetch-trending', type),
  fetchTrendingIndia: (type: 'movie' | 'series' = 'movie') => ipcRenderer.invoke('fetch-trending-india', type),
  getTmdbTitleLogo: (type: 'movie' | 'series', tmdbId: number) => ipcRenderer.invoke('get-tmdb-title-logo', type, tmdbId),
  getTmdbKeywords: (id: number, type: 'movie' | 'series') => ipcRenderer.invoke('get-tmdb-keywords', id, type),
  saveVideoKeywords: (id: number, keywords: string[]) => ipcRenderer.invoke('save-video-keywords', id, keywords),
  getTmdbReleaseInfo: (id: number, type: 'movie' | 'series') => ipcRenderer.invoke('get-tmdb-release-info', id, type),
  getTmdbTrailer: (params: { tmdbId?: number | null; title: string; type: 'movie' | 'series'; year?: number | null; seasonNumber?: number | null; preferLatestSeason?: boolean }) =>
    ipcRenderer.invoke('get-tmdb-trailer', params),
  getTmdbSeriesCatalog: (tmdbId: number) => ipcRenderer.invoke('get-tmdb-series-catalog', tmdbId),
  getIntroDbSegments: (params: { imdbId?: string | null; tmdbId?: number | null; season?: number | null; episode?: number | null; filePath?: string | null; duration?: number | null }) =>
    ipcRenderer.invoke('get-introdb-segments', params),
  getPendingSharedMediaTarget: () => ipcRenderer.invoke('get-pending-shared-media-target'),
  getSharedMediaByTmdbId: (type: 'movie' | 'series', tmdbId: number) => ipcRenderer.invoke('get-shared-media-by-tmdb-id', type, tmdbId),
  onOpenSharedMedia: (callback: (target: { type: 'movie' | 'series'; tmdbId: number; source?: any }) => void) => {
    const handler = (_event: any, target: { type: 'movie' | 'series'; tmdbId: number; source?: any }) => callback(target)
    ipcRenderer.on('open-shared-media', handler)
    return () => ipcRenderer.removeListener('open-shared-media', handler)
  },
  toggleFavorite: (id: number) => ipcRenderer.invoke('toggle-favorite', id),
  toggleWatchlist: (id: number) => ipcRenderer.invoke('toggle-watchlist', id),
  addLocalToWatchlist: (id: number, category: string) => ipcRenderer.invoke('add-local-to-watchlist', id, category),
  addToWatchlistExternal: (item: any) => ipcRenderer.invoke('add-to-watchlist-external', item),
  removeFromWatchlistExternal: (tmdbId: number) => ipcRenderer.invoke('remove-from-watchlist-external', tmdbId),
  getWatchlist: () => ipcRenderer.invoke('get-watchlist'),
  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  // Auto-update
  onUpdateAvailable: (callback: (info: { version: string }) => void) => ipcRenderer.on('update-available', (_e, info) => callback(info)),
  onUpdateProgress: (callback: (info: { percent: number }) => void) => ipcRenderer.on('update-progress', (_e, info) => callback(info)),
  onUpdateDownloaded: (callback: () => void) => ipcRenderer.on('update-downloaded', () => callback()),
  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  installUpdate: () => ipcRenderer.send('install-update'),
  // Torrent download APIs
  searchTMDB: (query: string) => ipcRenderer.invoke('search-tmdb', query),
  searchTorrentSources: (title: string, year: string, mediaType: string, tmdbId: number, requestId?: string) =>
    ipcRenderer.invoke('search-torrent-sources', title, year, mediaType, tmdbId, requestId),
  cancelTorrentSourceSearch: (requestId: string) =>
    ipcRenderer.invoke('cancel-torrent-source-search', requestId),
  onTorrentSourcesProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('torrent-sources-progress', handler)
    return () => ipcRenderer.removeListener('torrent-sources-progress', handler)
  },
  startTorrentDownload: (magnetUrl: string, title: string, tmdbId?: number, name?: string, media?: { mediaType?: 'movie' | 'series'; season?: number; episode?: number }) =>
    ipcRenderer.invoke('start-torrent-download', magnetUrl, title, tmdbId, name, media),
  cancelTorrentDownload: (id: string) => 
    ipcRenderer.invoke('cancel-torrent-download', id),
  removeDownload: (id: string, deleteFile?: boolean) => 
    ipcRenderer.invoke('remove-download', id, deleteFile),
  pauseResumeTorrent: (id: string) => 
    ipcRenderer.invoke('pause-resume-torrent', id),
  retryTorrentDownload: (id: string) =>
    ipcRenderer.invoke('retry-torrent-download', id),
  getActiveDownloads: () => 
    ipcRenderer.invoke('get-active-downloads'),
  prepareTorrentStream: (id: string) =>
    ipcRenderer.invoke('prepare-torrent-stream', id),
  onDownloadsChanged: (callback: () => void) => {
    ipcRenderer.on('downloads-changed', callback)
    return () => ipcRenderer.removeListener('downloads-changed', callback)
  },
  onTorrentProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('torrent-progress', handler)
    return () => ipcRenderer.removeListener('torrent-progress', handler)
  },
  // File utilities
  openFolder: (filePath: string) => ipcRenderer.invoke('open-folder', filePath),
  getMediaInfo: (filePath: string) => ipcRenderer.invoke('get-media-info', filePath),
  getSeekPreviewThumbnail: (filePath: string, time: number) => ipcRenderer.invoke('get-seek-preview-thumbnail', filePath, time),
  openDownloadsFolder: () => ipcRenderer.invoke('open-downloads-folder'),
  getDownloadsStorage: () => ipcRenderer.invoke('get-downloads-storage'),
  // OpenSubtitles API
  searchOnlineSubtitles: (params: { query?: string; tmdbId?: number; season?: number; episode?: number; languages?: string; mediaType?: string; videoFilePath?: string }) =>
    ipcRenderer.invoke('search-opensubtitles', params),
  downloadOnlineSubtitle: (params: { fileId: number; videoFilePath: string; fileName?: string }) =>
    ipcRenderer.invoke('download-opensubtitle', params),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  toggleFullscreen: () => ipcRenderer.invoke('window-toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window-is-fullscreen'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => {
    const handler = (_event: any, isFullscreen: boolean) => callback(isFullscreen)
    ipcRenderer.on('window-fullscreen-changed', handler)
    return () => ipcRenderer.removeListener('window-fullscreen-changed', handler)
  },
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  setLaunchFullscreen: (launchFullscreen: boolean) => ipcRenderer.invoke('set-launch-fullscreen', launchFullscreen),
  onAppSettingsChanged: (callback: (settings: { launchFullscreen: boolean }) => void) => {
    const handler = (_event: any, settings: { launchFullscreen: boolean }) => callback(settings)
    ipcRenderer.on('app-settings-changed', handler)
    return () => ipcRenderer.removeListener('app-settings-changed', handler)
  },
  log: (message: string) => ipcRenderer.send('log-to-main', message),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in d.ts)
  window.electron = electronAPI
  // @ts-ignore (define in d.ts)
  window.api = api
}
