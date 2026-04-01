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
  onLibraryUpdated: (callback: () => void) => void
  removeAllLibraryUpdateListeners: () => void
  getFolders: () => Promise<any[]>
  removeFolder: (folderPath: string) => Promise<boolean>
  onUpdateAvailable: (callback: (info: { version: string }) => void) => void
  onUpdateProgress: (callback: (info: { percent: number }) => void) => void
  onUpdateDownloaded: (callback: () => void) => void
  installUpdate: () => void
}

declare global {
  interface Window {
    electron: typeof electronAPI
    api: Api
    controlsTimeout: any
  }
}
