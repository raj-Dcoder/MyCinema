/// <reference types="vite/client" />

import { electronAPI } from '@electron-toolkit/preload'

interface Api {
  selectFolder: () => Promise<string | null>
  getVideos: () => Promise<any[]>
  getVideoProgress: (videoId: number) => Promise<any>
  updateVideoProgress: (videoId: number, time: number, completed: boolean, isClosing?: boolean) => void
  scanFolder: (path: string) => Promise<void>
  getContinueWatching: () => Promise<any[]>
  playVideo: (videoId: number) => Promise<void>
  getSeriesInfo: (seriesName: string) => Promise<any[]>
  getSubtitlePath: (filePath: string) => Promise<string | null>
  getEmbeddedSubtitles: (filePath: string) => Promise<any[]>
  getEmbeddedAudio: (filePath: string) => Promise<any[]>
  preConvertSubtitle: (filePath: string, trackIndex: number, isExternal: boolean) => Promise<string | null>
  onOpenExternalFile: (callback: (filePath: string) => void) => () => void
  getPendingExternalFile: () => Promise<string | null>
  onLibraryUpdated: (callback: () => void) => void
  removeAllLibraryUpdateListeners: () => void
  getFolders: () => Promise<any[]>
  removeFolder: (folderPath: string) => Promise<boolean>
  exportUserBackup: () => Promise<{
    exported: boolean
    canceled?: boolean
    filePath?: string
    folders?: number
    externalWatchlist?: number
    localWatchlist?: number
    favorites?: number
    error?: string
  }>
  importUserBackup: () => Promise<{
    imported: boolean
    canceled?: boolean
    filePath?: string
    foldersAdded?: number
    foldersScanned?: number
    foldersMissing?: number
    externalWatchlistImported?: number
    localWatchlistRestored?: number
    favoritesRestored?: number
    error?: string
  }>
  clearAllData: () => Promise<boolean>
  fetchTrending: (type: 'movie' | 'series') => Promise<any[]>
  fetchTrendingIndia: () => Promise<any[]>
  getTmdbTrailer: (params: { tmdbId?: number | null; title: string; type: 'movie' | 'series'; year?: number | null; seasonNumber?: number | null; preferLatestSeason?: boolean }) => Promise<any | null>
  toggleFavorite: (id: number) => Promise<number | null>
  toggleWatchlist: (id: number) => Promise<number | null>
  addLocalToWatchlist: (id: number, category: string) => Promise<any>
  addToWatchlistExternal: (item: any) => Promise<any>
  removeFromWatchlistExternal: (tmdbId: number) => Promise<any>
  getWatchlist: () => Promise<any[]>
  getFavorites: () => Promise<any[]>
  onUpdateAvailable: (callback: (info: { version: string }) => void) => void
  onUpdateProgress: (callback: (info: { percent: number }) => void) => void
  onUpdateDownloaded: (callback: () => void) => void
  startUpdateDownload: () => Promise<any>
  installUpdate: () => void
  // Torrent download APIs
  searchTMDB: (query: string) => Promise<any[]>
  searchTorrentSources: (title: string, year: string, mediaType: string, tmdbId: number) => Promise<any[]>
  startTorrentDownload: (magnetUrl: string, title: string, tmdbId?: number) => Promise<string | boolean>
  cancelTorrentDownload: (id: string) => Promise<boolean>
  removeDownload: (id: string, deleteFile?: boolean) => Promise<boolean>
  pauseResumeTorrent: (id: string) => Promise<boolean>
  getActiveDownloads: () => Promise<any[]>
  onTorrentProgress: (callback: (data: any) => void) => () => void
  // File utilities
  openFolder: (filePath: string) => Promise<void>
  getMediaInfo: (filePath: string) => Promise<any>
  openDownloadsFolder: () => Promise<void>
  // OpenSubtitles API
  searchOnlineSubtitles: (params: { query?: string; tmdbId?: number; season?: number; episode?: number; languages?: string; mediaType?: string }) => Promise<any>
  downloadOnlineSubtitle: (params: { fileId: number; videoFilePath: string; fileName?: string }) => Promise<any>
  minimizeWindow: () => Promise<void>
  toggleFullscreen: () => Promise<boolean>
  isFullscreen: () => Promise<boolean>
  closeWindow: () => Promise<void>
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => () => void
  getAppSettings: () => Promise<{ launchFullscreen: boolean }>
  setLaunchFullscreen: (launchFullscreen: boolean) => Promise<{ launchFullscreen: boolean }>
  onAppSettingsChanged: (callback: (settings: { launchFullscreen: boolean }) => void) => () => void
}

declare global {
  interface Window {
    electron: typeof electronAPI
    api: Api
    controlsTimeout: any
  }
}
