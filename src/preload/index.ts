import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getVideos: () => ipcRenderer.invoke('get-videos'),
  getVideoProgress: (videoId: number) => ipcRenderer.invoke('get-video-progress', videoId),
  updateVideoProgress: (videoId: number, time: number, completed: boolean, isClosing?: boolean) => 
    ipcRenderer.send('update-video-progress', videoId, time, completed, isClosing),
  scanFolder: (path: string) => ipcRenderer.invoke('scan-folder', path),
  getContinueWatching: () => ipcRenderer.invoke('get-continue-watching'),
  playVideo: (videoId: number) => ipcRenderer.invoke('play-video', videoId),
  getSeriesInfo: (seriesName: string) => ipcRenderer.invoke('get-series-info', seriesName),
  getSubtitlePath: (filePath: string) => ipcRenderer.invoke('get-subtitles', filePath),
  getEmbeddedSubtitles: (filePath: string) => ipcRenderer.invoke('get-embedded-subtitles', filePath),
  getEmbeddedAudio: (filePath: string) => ipcRenderer.invoke('get-embedded-audio', filePath),
  preConvertSubtitle: (filePath: string, trackIndex: number, isExternal: boolean) => ipcRenderer.invoke('pre-convert-subtitle', filePath, trackIndex, isExternal),
  onLibraryUpdated: (callback: () => void) => ipcRenderer.on('library-updated', (_event) => callback()),
  removeAllLibraryUpdateListeners: () => ipcRenderer.removeAllListeners('library-updated'),
  getFolders: () => ipcRenderer.invoke('get-folders'),
  removeFolder: (folderPath: string) => ipcRenderer.invoke('remove-folder', folderPath),
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
  // Auto-update
  onUpdateAvailable: (callback: (info: { version: string }) => void) => ipcRenderer.on('update-available', (_e, info) => callback(info)),
  onUpdateProgress: (callback: (info: { percent: number }) => void) => ipcRenderer.on('update-progress', (_e, info) => callback(info)),
  onUpdateDownloaded: (callback: () => void) => ipcRenderer.on('update-downloaded', () => callback()),
  installUpdate: () => ipcRenderer.send('install-update'),
  // Torrent download APIs
  searchTMDB: (query: string) => ipcRenderer.invoke('search-tmdb', query),
  searchTorrentSources: (title: string, year: string, mediaType: string, tmdbId: number) => 
    ipcRenderer.invoke('search-torrent-sources', title, year, mediaType, tmdbId),
  startTorrentDownload: (magnetUrl: string, title: string, tmdbId?: number) => 
    ipcRenderer.invoke('start-torrent-download', magnetUrl, title, tmdbId),
  cancelTorrentDownload: (id: string) => 
    ipcRenderer.invoke('cancel-torrent-download', id),
  removeDownload: (id: string, deleteFile?: boolean) => 
    ipcRenderer.invoke('remove-download', id, deleteFile),
  pauseResumeTorrent: (id: string) => 
    ipcRenderer.invoke('pause-resume-torrent', id),
  getActiveDownloads: () => 
    ipcRenderer.invoke('get-active-downloads'),
  onTorrentProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('torrent-progress', handler)
    return () => ipcRenderer.removeListener('torrent-progress', handler)
  },
  // File utilities
  openFolder: (filePath: string) => ipcRenderer.invoke('open-folder', filePath),
  getMediaInfo: (filePath: string) => ipcRenderer.invoke('get-media-info', filePath),
  openDownloadsFolder: () => ipcRenderer.invoke('open-downloads-folder'),
  // OpenSubtitles API
  searchOnlineSubtitles: (params: { query?: string; tmdbId?: number; season?: number; episode?: number; languages?: string; mediaType?: string }) =>
    ipcRenderer.invoke('search-opensubtitles', params),
  downloadOnlineSubtitle: (params: { fileId: number; videoFilePath: string; fileName?: string }) =>
    ipcRenderer.invoke('download-opensubtitle', params),
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
