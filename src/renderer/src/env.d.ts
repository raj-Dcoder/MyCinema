import { electronAPI } from '@electron-toolkit/preload'

interface Api {
  selectFolder: () => Promise<string | null>
  getVideos: () => Promise<any[]>
  getVideoProgress: (videoId: number) => Promise<any>
  updateVideoProgress: (videoId: number, time: number, completed: boolean) => void
  scanFolder: (path: string) => Promise<void>
  getContinueWatching: () => Promise<any[]>
  playVideo: (videoId: number) => Promise<void>
  getSeriesInfo: (seriesName: string) => Promise<any[]>
  getSubtitlePath: (filePath: string) => Promise<string | null>
}

declare global {
  interface Window {
    electron: typeof electronAPI
    api: Api
    controlsTimeout: any
  }
}
