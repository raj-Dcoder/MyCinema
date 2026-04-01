import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as db from './db'
import { scanFolder, getEmbeddedSubtitles, getEmbeddedAudio } from './scanner'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { PassThrough } from 'stream'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { pathToFileURL } from 'url'

// ─── File-system Watcher Registry ────────────────────────────────────────────
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm'])
const folderWatchers = new Map<string, fs.FSWatcher>()

/**
 * Debounce helper — collapses rapid fire events (e.g. file still being copied)
 * into a single scan kick-off after `delay` ms of silence.
 */
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: any[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }) as T
}

function attachFolderWatcher(folderPath: string): void {
  if (folderWatchers.has(folderPath)) return // already watching
  if (!fs.existsSync(folderPath)) return

  const triggerRescan = debounce(async () => {
    console.log(`[Watcher] Change detected in "${folderPath}" — rescanning…`)
    try {
      await scanFolder(folderPath)
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('library-updated'))
    } catch (err) {
      console.error('[Watcher] Rescan error:', err)
    }
  }, 3000) // 3 s quiet period before scanning

  try {
    const watcher = fs.watch(folderPath, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const ext = path.extname(filename).toLowerCase()
      if (VIDEO_EXTS.has(ext)) {
        console.log(`[Watcher] Video file event: ${filename}`)
        triggerRescan()
      }
    })
    watcher.on('error', (err) => {
      console.warn(`[Watcher] Error watching "${folderPath}": ${err.message} — removing watcher`)
      folderWatchers.delete(folderPath)
    })
    folderWatchers.set(folderPath, watcher)
    console.log(`[Watcher] Now watching: ${folderPath}`)
  } catch (err) {
    console.warn(`[Watcher] Could not watch "${folderPath}": ${(err as Error).message}`)
  }
}

function detachFolderWatcher(folderPath: string): void {
  const watcher = folderWatchers.get(folderPath)
  if (watcher) {
    watcher.close()
    folderWatchers.delete(folderPath)
    console.log(`[Watcher] Stopped watching: ${folderPath}`)
  }
}

/**
 * Startup scan: silently rescan every saved folder in the background.
 * Runs after the window is visible so it doesn't slow down first-paint.
 */
async function runStartupScan(): Promise<void> {
  const folders = db.getFolders() as any[]
  if (folders.length === 0) return
  console.log(`[Startup] Auto-scanning ${folders.length} saved folder(s)…`)
  for (const folder of folders) {
    try {
      await scanFolder(folder.path)
    } catch (err) {
      console.error(`[Startup] Scan failed for "${folder.path}":`, err)
    }
  }
  console.log('[Startup] Auto-scan complete.')
}

const isDev = !app.isPackaged
const ffmpegExecPath = isDev 
  ? path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe') 
  : path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
  
const ffprobeExecPath = isDev 
  ? path.join(app.getAppPath(), 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe')
  : path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe')

ffmpeg.setFfmpegPath(ffmpegExecPath)
ffmpeg.setFfprobePath(ffprobeExecPath)

// Register custom protocol as privileged
// This MUST be called before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  },
  {
    scheme: 'subtitle',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  },
  {
    scheme: 'audio',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false // Allow local video playback
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    setupAutoUpdater(mainWindow)
    // Kick off startup scan after window is visible (non-blocking)
    setImmediate(() => runStartupScan().catch(err => console.error('[Startup] Scan error:', err)))
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Custom Protocol Handler to serve local media files with seeking support
function registerMediaProtocol(): void {
  protocol.handle('media', (request) => {
    try {
      const prefix = 'media://file/'
      const encodedPath = request.url.startsWith(prefix) 
        ? request.url.slice(prefix.length) 
        : request.url.slice('media://'.length)
      
      let normalizedPath = decodeURIComponent(encodedPath)
      if (normalizedPath.startsWith('/') && normalizedPath.includes(':')) {
        normalizedPath = normalizedPath.slice(1)
      }

      if (!fs.existsSync(normalizedPath)) {
        return new Response('Not Found', { status: 404 })
      }

      const stat = fs.statSync(normalizedPath)
      const fileSize = stat.size
      const range = request.headers.get('range')

      let contentType = 'video/mp4'
      const ext = path.extname(normalizedPath).toLowerCase()
      if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg'
      else if (ext === '.png') contentType = 'image/png'
      else if (ext === '.webp') contentType = 'image/webp'
      else if (ext === '.mkv') contentType = 'video/x-matroska'
      else if (ext === '.webm') contentType = 'video/webm'
      else if (ext === '.avi') contentType = 'video/x-msvideo'

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-")
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
        const chunksize = (end - start) + 1
        
        const fileStream = fs.createReadStream(normalizedPath, { start, end })
        
        return new Response(fileStream as any, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': contentType,
          }
        })
      } else {
        const fileStream = fs.createReadStream(normalizedPath)
        return new Response(fileStream as any, {
          headers: {
            'Content-Length': fileSize.toString(),
            'Accept-Ranges': 'bytes',
            'Content-Type': contentType,
          }
        })
      }
    } catch (error) {
      console.error('Failed to fetch media:', error)
      return new Response('Error', { status: 500 })
    }
  })
}

function registerSubtitleProtocol(): void {
  protocol.handle('subtitle', (request) => {
    try {
      const url = new URL(request.url)
      const prefix = 'subtitle://file/'
      const encodedPath = request.url.startsWith(prefix) ? request.url.slice(prefix.length).split('?')[0] : url.pathname
      let normalizedPath = decodeURIComponent(encodedPath)
      if (normalizedPath.startsWith('/') && normalizedPath.includes(':')) {
        normalizedPath = normalizedPath.slice(1)
      }

      if (!fs.existsSync(normalizedPath)) {
        return new Response('Not Found', { status: 404 })
      }

      const trackIndex = url.searchParams.get('track') || '0'
      const pass = new PassThrough()

      ffmpeg(normalizedPath)
        .outputOptions([`-map 0:${trackIndex}`, '-c:s webvtt', '-f webvtt'])
        .on('error', (err) => console.error('FFmpeg subtitle extr error:', err.message))
        .pipe(pass)

      return new Response(pass as any, {
        headers: {
          'Content-Type': 'text/vtt',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch (error) {
      console.error('Failed to fetch subtitle stream:', error)
      return new Response('Error', { status: 500 })
    }
  })
}

function registerAudioProtocol(): void {
  protocol.handle('audio', (request) => {
    try {
      const url = new URL(request.url)
      const prefix = 'audio://file/'
      const encodedPath = request.url.startsWith(prefix) ? request.url.slice(prefix.length).split('?')[0] : url.pathname
      let normalizedPath = decodeURIComponent(encodedPath)
      if (normalizedPath.startsWith('/') && normalizedPath.includes(':')) {
        normalizedPath = normalizedPath.slice(1)
      }

      if (!fs.existsSync(normalizedPath)) {
        return new Response('Not Found', { status: 404 })
      }

      const trackIndex = url.searchParams.get('track') || '1'
      const start = parseFloat(url.searchParams.get('time') || '0')
      
      const pass = new PassThrough()

      const cmd = ffmpeg(normalizedPath)
        .setStartTime(start)
        .inputOptions([
          '-hwaccel', 'd3d11va',     // Use GPU for video decoding
          '-hwaccel_output_format', 'nv12' // Keep decoded frames in GPU memory
        ])
        .outputOptions([
          `-map 0:${trackIndex}`,
          '-c:a libmp3lame',
          '-b:a 192k',
          '-f mp3'
        ])
        .on('error', (err) => {
          if (!err.message.includes('Output stream closed') && !err.message.includes('SIGKILL') && !err.message.includes('The operation was aborted')) {
            // Gracefully fall back — d3d11va may not be supported on all machines
            // so we silently swallow init errors and let the stream naturally fall back
            if (!err.message.includes('Cannot load d3d11') && !err.message.includes('No device available')) {
              console.error('FFmpeg audio extr error:', err.message)
            }
          }
        })
        
      cmd.pipe(pass)
      
      request.signal.addEventListener('abort', () => {
        cmd.kill('SIGKILL')
      })

      return new Response(pass as any, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'Accept-Ranges': 'none',
          'Cache-Control': 'no-cache'
        }
      })
    } catch (error) {
      console.error('Failed to fetch audio stream:', error)
      return new Response('Error', { status: 500 })
    }
  })
}

app.commandLine.appendSwitch('enable-blink-features', 'AudioVideoTracks')

app.whenReady().then(() => {
  // Register media protocol
  registerMediaProtocol()
  registerSubtitleProtocol()
  registerAudioProtocol()
  
  db.initDb()
  electronApp.setAppUserModelId('com.electron')

  // Attach file-system watchers for all already-saved folders
  const savedFolders = db.getFolders() as any[]
  savedFolders.forEach(f => attachFolderWatcher(f.path))

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  folderWatchers.forEach(w => w.close())
  folderWatchers.clear()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('get-videos', () => {
  const allVideos = db.getVideos();
  const validVideos: any[] = [];
  
  for (const video of allVideos as any[]) {
    if (fs.existsSync(video.file_path)) {
      validVideos.push(video);
    } else {
      console.log(`[Auto-Prune] Intercepted missing file: ${video.file_path}`);
      db.deleteVideo(video.id);
      
      if (video.poster_path && video.poster_path.includes('-snap.jpg')) {
        if (fs.existsSync(video.poster_path)) {
          try { fs.unlinkSync(video.poster_path); } catch (e) {}
        }
      }
    }
  }
  return validVideos;
})

ipcMain.handle('get-video-progress', (_, videoId) => {
  return db.getProgress(videoId)
})

ipcMain.on('update-video-progress', (_, videoId, time, completed, isClosing) => {
  db.updateProgress(videoId, time, completed)
  if (isClosing) {
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('library-updated'))
  }
})

ipcMain.handle('get-continue-watching', () => {
  const cwVideos = db.getContinueWatching();
  const validCw: any[] = [];
  
  for (const video of cwVideos as any[]) {
    if (fs.existsSync(video.file_path)) {
      validCw.push(video);
    } else {
      // Auto-pruner handles DB deletion cleanly through other views too
      db.deleteVideo(video.id);
    }
  }
  return validCw;
})

ipcMain.handle('get-series-info', (_, seriesName) => {
  return db.getSeriesInfo(seriesName)
})

ipcMain.handle('get-folders', () => {
  return db.getFolders()
})

ipcMain.handle('remove-folder', (_, folderPath: string) => {
  detachFolderWatcher(folderPath) // stop watching before removing
  db.removeFolder(folderPath)
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('library-updated'))
  return true
})

ipcMain.handle('scan-folder', async (_, folderPath) => {
  db.addFolder(folderPath)
  attachFolderWatcher(folderPath) // start watching immediately after adding
  return await scanFolder(folderPath)
})

ipcMain.handle('get-embedded-subtitles', async (_, filePath) => {
  return await getEmbeddedSubtitles(filePath)
})

ipcMain.handle('get-embedded-audio', async (_, filePath) => {
  return await getEmbeddedAudio(filePath)
})

ipcMain.handle('get-subtitles', async (_, filePath) => {
  try {
    const dir = path.dirname(filePath)
    const baseName = path.basename(filePath, path.extname(filePath))
    
    // 1. Check for exact match or common naming conventions
    const possibleSrts = [
      path.join(dir, `${baseName}.srt`),
      path.join(dir, `${baseName}.en.srt`),
      path.join(dir, `${baseName}.eng.srt`),
      path.join(dir, 'English.srt'),
      path.join(dir, 'english.srt'),
      path.join(dir, 'subs', `${baseName}.srt`),
      path.join(dir, 'Subtitles', `${baseName}.srt`)
    ]

    for (const srt of possibleSrts) {
      if (fs.existsSync(srt)) return srt
    }

    // 2. Fallback: Search for ANY .srt file in the same directory
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
      const anySrt = files.find(f => f.toLowerCase().endsWith('.srt'))
      if (anySrt) return path.join(dir, anySrt)
    }

    return null
  } catch (error) {
    console.error('Failed to get subtitles:', error)
    return null
  }
})

// ─── Auto Updater Setup ──────────────────────────────────────────────────────

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall()
})

function setupAutoUpdater(win: BrowserWindow): void {
  // Only run auto-update in packaged (production) builds
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update-available', { version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('update-progress', { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update-downloaded')
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto updater error:', err.message)
  })

  // Check now and every 2 hours afterwards
  autoUpdater.checkForUpdates().catch(err => console.error('Update check failed:', err))
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 2 * 60 * 60 * 1000)
}
