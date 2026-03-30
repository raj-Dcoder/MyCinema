import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getVideos: () => ipcRenderer.invoke('get-videos'),
  getVideoProgress: (videoId: number) => ipcRenderer.invoke('get-video-progress', videoId),
  updateVideoProgress: (videoId: number, time: number, completed: boolean) => 
    ipcRenderer.send('update-video-progress', videoId, time, completed),
  scanFolder: (path: string) => ipcRenderer.invoke('scan-folder', path),
  getContinueWatching: () => ipcRenderer.invoke('get-continue-watching'),
  playVideo: (videoId: number) => ipcRenderer.invoke('play-video', videoId),
  getSeriesInfo: (seriesName: string) => ipcRenderer.invoke('get-series-info', seriesName),
  getSubtitlePath: (filePath: string) => ipcRenderer.invoke('get-subtitles', filePath),
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
