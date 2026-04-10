import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as db from './db'
import { scanFolder, getEmbeddedSubtitles, getEmbeddedAudio } from './scanner'
import fs from 'fs'
import crypto from 'crypto'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { PassThrough } from 'stream'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { pathToFileURL } from 'url'
import https from 'https'
import dns from 'dns'

// Custom DNS resolver using Google/Cloudflare to bypass ISP blocks
const customDns = new dns.Resolver()
customDns.setServers(['8.8.8.8', '1.1.1.1'])

function resolveHostname(hostname: string): Promise<string> {
  return new Promise((resolve) => {
    customDns.resolve4(hostname, (err, addresses) => {
      if (err || !addresses?.length) {
        // Fallback: try system DNS
        dns.resolve4(hostname, (err2, addrs2) => {
          if (err2 || !addrs2?.length) resolve(hostname) // give up, pass original
          else resolve(addrs2[0])
        })
      } else {
        resolve(addresses[0])
      }
    })
  })
}

// Make HTTPS GET requests, resolving DNS through Google/Cloudflare first
function nodeHttpGet(url: string, timeoutMs: number = 10000): Promise<any> {
  return new Promise(async (resolve, reject) => {
    let req: any = null
    const timer = setTimeout(() => {
      if (req) req.destroy()
      reject(new Error(`Timeout fetching ${url} after ${timeoutMs}ms`))
    }, timeoutMs)

    try {
      const parsed = new URL(url)
      const ip = await resolveHostname(parsed.hostname)
      console.log(`[DNS] ${parsed.hostname} -> ${ip}`)

      const options = {
        hostname: ip,
        port: 443,
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'MyCinema/1.5',
          'Host': parsed.hostname
        },
        servername: parsed.hostname, // TLS SNI — required for HTTPS to IP
      }

      req = https.get(options, (res) => {
        let data = ''
        res.on('data', (chunk: string) => { data += chunk })
        res.on('end', () => {
          clearTimeout(timer)
          try { resolve(JSON.parse(data)) } catch { resolve(null) }
        })
      }).on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    } catch (err) {
      clearTimeout(timer)
      reject(err)
    }
  })
}

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

// ─── File Path Security Guard ─────────────────────────────────────────────────
/**
 * Validates that a file path is within one of the user's registered library
 * folders, the MyCinema downloads folder, or the app userData directory.
 * Prevents path-traversal attacks where a malicious torrent/subtitle could
 * craft a URL like media://file/C:/sensitive/passwords.txt to exfiltrate
 * arbitrary files from the user's system.
 */
function isSafeFilePath(inputPath: string): boolean {
  try {
    const normalized = path.normalize(inputPath)
    const allowedRoots = [
      // User's registered library folders (dynamically checked each call)
      ...(db.getFolders() as any[]).map((f: any) => path.normalize(f.path)),
      // The MyCinema torrent download destination — must match getDownloadPath() exactly
      path.normalize(path.join(app.getPath('downloads'), 'MyCinema')),
      // App userData: poster cache, subtitle cache, window state, db
      path.normalize(app.getPath('userData')),
      // Temp dir used by subtitle pre-conversion
      path.normalize(app.getPath('temp')),
    ]
    // Use case-insensitive prefix matching (handles Windows drive letter casing)
    return allowedRoots.some(root =>
      normalized.toLowerCase().startsWith(root.toLowerCase() + path.sep) ||
      normalized.toLowerCase() === root.toLowerCase()
    )
  } catch {
    return false
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

// ─── Window State Management ─────────────────────────────────────────────────
function loadWindowState() {
  try {
    const raw = fs.readFileSync(join(app.getPath('userData'), 'window-state.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return { width: 1200, height: 800, isMaximized: false }
  }
}

function saveWindowState(win: BrowserWindow) {
  try {
    const isMaximized = win.isMaximized()
    // getBounds() returns inaccurate values if window is minimized/maximized sometimes,
    // so we get normal bounds if we can, but saving bounds when maximized might save the max bounds.
    // getNormalBounds handles this correctly in Electron.
    const bounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds()
    const state = { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y, isMaximized }
    fs.writeFileSync(join(app.getPath('userData'), 'window-state.json'), JSON.stringify(state))
  } catch (err) {
    console.error('Failed to save window state:', err)
  }
}

function createWindow(): void {
  const state = loadWindowState()

  const mainWindow = new BrowserWindow({
    width: state.width || 1200,
    height: state.height || 800,
    x: state.x,
    y: state.y,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // webSecurity remains false for local media serving: the real path-traversal
      // protection is the isSafeFilePath() whitelist guard on every IPC handler and
      // protocol handler. Enabling webSecurity caused cross-origin CSP rejections
      // for the custom media:// / subtitle:// / audio:// schemes in some Electron builds.
      webSecurity: false
    }
  })

  // Apply maximized state after creation
  if (state.isMaximized) {
    mainWindow.maximize()
  }

  // Hook resize/move events to auto-save bounds
  let saveDebounceTimer: ReturnType<typeof setTimeout>
  const scheduleSave = () => {
    clearTimeout(saveDebounceTimer)
    saveDebounceTimer = setTimeout(() => saveWindowState(mainWindow), 500)
  }

  mainWindow.on('resize', scheduleSave)
  mainWindow.on('move', scheduleSave)
  mainWindow.on('maximize', scheduleSave)
  mainWindow.on('unmaximize', scheduleSave)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    setupAutoUpdater(mainWindow)
    // Kick off startup scan after window is visible (non-blocking)
    setImmediate(() => {
      runStartupScan().catch(err => console.error('[Startup] Scan error:', err))
      autoResumeDownloads().catch(err => console.error('[Startup] Auto-resume error:', err))
    })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Only allow safe external URLs — block javascript:, file:, data: etc.
    if (details.url.startsWith('https://') || details.url.startsWith('http://')) {
      shell.openExternal(details.url)
    } else {
      console.warn(`[Security] Blocked unsafe openExternal URL: ${details.url.slice(0, 80)}`)
    }
    return { action: 'deny' }
  })

  mainWindow.on('close', (e) => {
    if (activeTorrents.size > 0) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['Cancel', 'Yes, Quit Application'],
        defaultId: 0,
        cancelId: 0,
        title: 'Active Downloads',
        message: 'There are ongoing downloads. Closing the app will cancel them. Are you sure you want to quit?'
      })
      if (choice === 0) {
        e.preventDefault()
      }
    }
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

      // Security: block path traversal — only serve files within allowed roots
      if (!isSafeFilePath(normalizedPath)) {
        console.error(`[Protocol] 403 Forbidden path: ${normalizedPath}`)
        return new Response('Forbidden', { status: 403 })
      }

      if (!fs.existsSync(normalizedPath)) {
        console.error(`[Protocol] 404 Not Found: ${normalizedPath}`)
        return new Response('Not Found', { 
          status: 404,
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
        })
      }

      if (normalizedPath.includes('-snap')) {
        console.log(`[Protocol] Serving snap: ${normalizedPath}`)
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
        
        // Use 5MB chunks to prevent Node->Web streams fragmentation and I/O starvation (fixes random glitches)
        const fileStream = fs.createReadStream(normalizedPath, { 
          start, 
          end,
          highWaterMark: 5 * 1024 * 1024 
        })
        
        return new Response(fileStream as any, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
          }
        })
      } else {
        const fileStream = fs.createReadStream(normalizedPath, { highWaterMark: 5 * 1024 * 1024 })
        return new Response(fileStream as any, {
          headers: {
            'Content-Length': fileSize.toString(),
            'Accept-Ranges': 'bytes',
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
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

      // Security: block path traversal
      if (!isSafeFilePath(normalizedPath)) {
        console.error(`[Protocol] 403 Forbidden subtitle path: ${normalizedPath}`)
        return new Response('Forbidden', { status: 403 })
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

      // Security: block path traversal
      if (!isSafeFilePath(normalizedPath)) {
        console.error(`[Protocol] 403 Forbidden audio path: ${normalizedPath}`)
        return new Response('Forbidden', { status: 403 })
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
// Prevent Chromium's hardware decoder from artifacting (producing grey glitchy soup) on specific high-bitrate MKV frames
app.commandLine.appendSwitch('disable-features', 'D3D11VideoDecoder') 

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
  // Gracefully destroy all active torrents
  activeTorrents.forEach(t => { try { t.destroy() } catch {} })
  activeTorrents.clear()
  if (webtorrentClient) { try { webtorrentClient.destroy() } catch {} }
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

ipcMain.handle('get-embedded-subtitles', async (_, filePath: string) => {
  if (!isSafeFilePath(filePath)) {
    console.error(`[IPC] 403 Forbidden path in get-embedded-subtitles: ${filePath}`)
    return []
  }
  return await getEmbeddedSubtitles(filePath)
})

ipcMain.handle('get-embedded-audio', async (_, filePath: string) => {
  if (!isSafeFilePath(filePath)) {
    console.error(`[IPC] 403 Forbidden path in get-embedded-audio: ${filePath}`)
    return []
  }
  return await getEmbeddedAudio(filePath)
})

ipcMain.handle('get-subtitles', async (_, filePath: string) => {
  if (!isSafeFilePath(filePath)) {
    console.error(`[IPC] 403 Forbidden path in get-subtitles: ${filePath}`)
    return null
  }
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

// Pre-convert subtitle track to static WebVTT file to avoid live FFmpeg streaming glitches during playback
ipcMain.handle('pre-convert-subtitle', async (_, filePath: string, trackIndex: number, isExternal: boolean) => {
  if (!isSafeFilePath(filePath)) {
    console.error(`[IPC] 403 Forbidden path in pre-convert-subtitle: ${filePath}`)
    return null
  }
  try {
    const subsDir = path.join(app.getPath('userData'), 'subtitles')
    if (!fs.existsSync(subsDir)) fs.mkdirSync(subsDir, { recursive: true })
    
    // Create a short, fixed-length cache key (16-char hex) so the output path
    // never hits Windows' 260-char MAX_PATH limit, even for very long filenames.
    const hash = crypto.createHash('sha1').update(`${filePath}-${trackIndex}`).digest('hex').slice(0, 16)
    const outPath = path.join(subsDir, `${hash}.vtt`)
    
    // Return cached file if it already exists
    if (fs.existsSync(outPath)) {
      console.log(`[Subtitle] Serving cached WebVTT: ${outPath}`)
      return outPath
    }
    
    console.log(`[Subtitle] Pre-converting track ${trackIndex} from "${filePath}" to WebVTT...`)
    
    return new Promise<string | null>((resolve) => {
      const inputArgs = isExternal 
        ? [filePath]           // external SRT: just input the SRT file directly
        : [filePath]           // embedded: input the video file
      
      const mapTrack = isExternal ? '0:0' : `0:${trackIndex}`
      
      const cmd = ffmpeg(inputArgs[0])
        .outputOptions([`-map ${mapTrack}`, '-c:s webvtt', '-f webvtt'])
        .output(outPath)
        .on('end', () => {
          console.log(`[Subtitle] Pre-conversion done: ${outPath}`)
          resolve(outPath)
        })
        .on('error', (err) => {
          console.error(`[Subtitle] Pre-conversion failed:`, err.message)
          // Clean up partial file
          if (fs.existsSync(outPath)) try { fs.unlinkSync(outPath) } catch {}
          resolve(null)
        })
      
      cmd.run()
    })
  } catch (err) {
    console.error('[Subtitle] pre-convert-subtitle error:', err)
    return null
  }
})




// ─── Open Folder in Explorer ─────────────────────────────────────────────────
ipcMain.handle('open-folder', (_event, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('open-downloads-folder', () => {
  const dlPath = path.join(app.getPath('downloads'), 'MyCinema')
  if (!fs.existsSync(dlPath)) fs.mkdirSync(dlPath, { recursive: true })
  shell.openPath(dlPath)
})

// ─── Get Media Info via ffprobe ───────────────────────────────────────────────
ipcMain.handle('get-media-info', (_event, filePath: string): Promise<any> => {
  return new Promise((resolve) => {
    if (!isSafeFilePath(filePath)) {
      console.error(`[IPC] 403 Forbidden path in get-media-info: ${filePath}`)
      resolve({ error: 'Access denied' })
      return
    }
    if (!fs.existsSync(filePath)) {
      resolve({ error: 'File not found' })
      return
    }

    const stat = fs.statSync(filePath)
    const fileSizeBytes = stat.size

    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        resolve({ error: err.message })
        return
      }

      const format = metadata.format || {}
      const streams = metadata.streams || []

      const videoStream = streams.find((s: any) => s.codec_type === 'video')
      const audioStreams = streams.filter((s: any) => s.codec_type === 'audio')
      const subtitleStreams = streams.filter((s: any) => s.codec_type === 'subtitle')

      const formatFileSize = (bytes: number) => {
        if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
        if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
        return `${(bytes / 1e3).toFixed(0)} KB`
      }

      const formatBitrate = (bps?: number) => {
        if (!bps) return null
        if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`
        return `${(bps / 1e3).toFixed(0)} Kbps`
      }

      const parseFrameRate = (r?: string) => {
        if (!r) return null
        const parts = r.split('/')
        if (parts.length === 2) {
          const fps = parseFloat(parts[0]) / parseFloat(parts[1])
          return isNaN(fps) ? null : `${fps.toFixed(2).replace(/\.00$/, '')} fps`
        }
        return r
      }

      const channelLayout = (s: any) => {
        if (s.channel_layout) return s.channel_layout
        const ch = s.channels
        if (ch === 1) return 'Mono'
        if (ch === 2) return 'Stereo'
        if (ch === 6) return '5.1'
        if (ch === 8) return '7.1'
        return ch ? `${ch}ch` : null
      }

      resolve({
        file: {
          name: path.basename(filePath),
          path: filePath,
          size: formatFileSize(fileSizeBytes),
          sizeBytes: fileSizeBytes,
        },
        container: {
          format: (format.format_long_name || format.format_name || '').replace('Matroska / WebM', 'MKV'),
          duration: format.duration ? parseFloat(format.duration as any) : null,
          bitrate: formatBitrate(format.bit_rate ? parseInt(format.bit_rate as any) : undefined),
        },
        video: videoStream ? {
          codec: videoStream.codec_name?.toUpperCase() || null,
          codecLong: videoStream.codec_long_name || null,
          width: videoStream.width || null,
          height: videoStream.height || null,
          resolution: videoStream.width && videoStream.height ? `${videoStream.width}×${videoStream.height}` : null,
          frameRate: parseFrameRate(videoStream.r_frame_rate),
          bitDepth: videoStream.bits_per_raw_sample ? `${videoStream.bits_per_raw_sample}-bit` : null,
          colorSpace: videoStream.color_space || null,
          bitrate: formatBitrate(videoStream.bit_rate ? parseInt(videoStream.bit_rate as any) : undefined),
          profile: videoStream.profile || null,
        } : null,
        audio: audioStreams.map((s: any, i: number) => ({
          index: i + 1,
          codec: s.codec_name?.toUpperCase() || null,
          channels: channelLayout(s),
          sampleRate: s.sample_rate ? `${parseInt(s.sample_rate) / 1000} kHz` : null,
          language: s.tags?.language || s.tags?.lang || null,
          title: s.tags?.title || null,
          bitrate: formatBitrate(s.bit_rate ? parseInt(s.bit_rate as any) : undefined),
        })),
        subtitles: subtitleStreams.map((s: any, i: number) => ({
          index: i + 1,
          codec: s.codec_name?.toUpperCase() || null,
          language: s.tags?.language || s.tags?.lang || null,
          title: s.tags?.title || null,
        })),
      })
    })
  })
})

ipcMain.handle('clear-all-data', async () => {
  try {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancel', 'Clear Everything'],
      defaultId: 0,
      title: 'Clear All Data',
      message: 'Are you absolutely sure?',
      detail: 'This will delete your entire library, all watch progress, and reset all settings. This action cannot be undone.',
      noLink: true
    })

    if (response === 0) return false

    console.log('[Main] Starting full data wipe...')

    // 1. Close database
    db.default.close()

    // 2. Clear Electron session (localStorage, cookies, IndexedDB, etc)
    await session.defaultSession.clearStorageData()

    // 3. Define paths to delete
    const userData = app.getPath('userData')
    const toDelete = [
      join(userData, 'mycinema.db'),
      join(userData, 'poster_cache'),
      join(userData, 'posters'),
      join(userData, 'subtitles'),
      join(userData, 'window-state.json'),
      join(userData, 'Local Storage'),
      join(userData, 'Session Storage'),
      join(userData, 'Cache'),
      join(userData, 'Network')
    ]

    // 4. Delete files/folders
    for (const p of toDelete) {
      if (fs.existsSync(p)) {
        try {
          fs.rmSync(p, { recursive: true, force: true })
          console.log(`[Main] Deleted: ${p}`)
        } catch (e: any) {
          console.warn(`[Main] Could not delete ${p}: ${e.message}`)
        }
      }
    }

    // 5. Relaunch
    console.log('[Main] Wipe complete. Relaunching...')
    app.relaunch()
    app.exit(0)
    
    return true
  } catch (err) {
    console.error('[Main] Clear all data failed:', err)
    return false
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

// ─── WebTorrent Download Engine ──────────────────────────────────────────────
let webtorrentClient: any = null
const activeTorrents = new Map<string, any>() // id -> torrent instance

async function getWebTorrentClient(): Promise<any> {
  if (!webtorrentClient) {
    // Hide the dynamic import from Vite/Rollup so it doesn't try to bundle ESM into CJS
    const dynamicImport = new Function('modulePath', 'return import(modulePath)')
    const mod = await dynamicImport('webtorrent')
    const WebTorrent = mod.default || mod
    
    webtorrentClient = new WebTorrent({
      // Privacy: DHT disabled by default — DHT broadcasts your real public IP
      // to the global distributed hash table network, where it can be logged by
      // copyright enforcement agencies and ISP monitoring systems.
      dht: false,
      // Privacy: LSD disabled by default — Local Service Discovery announces
      // your download activity on the LAN, visible to network admins on
      // corporate/university/public Wi-Fi.
      lsd: false,
      // Reduced from 1000: extreme connection counts can crash home routers
      // and trigger ISP throttling. 200 is a good balance of speed vs stability.
      maxConns: 200,
    })
    
    webtorrentClient.on('error', (err: Error) => {
      console.error('[WebTorrent] Client error:', err.message)
    })
  }
  return webtorrentClient
}

function getDownloadPath(): string {
  const dlPath = path.join(app.getPath('downloads'), 'MyCinema')
  if (!fs.existsSync(dlPath)) fs.mkdirSync(dlPath, { recursive: true })
  return dlPath
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function broadcastProgress(id: string, torrent: any, status: string, errorMessage?: string): void {
  const data: any = {
    id,
    title: torrent.name || (torrent as any)._myCinemaTitle || 'Download',
    progress: Math.round((torrent.progress || 0) * 100 * 100) / 100,
    downloadSpeed: formatBytes(torrent.downloadSpeed || 0) + '/s',
    timeRemaining: formatTime(torrent.timeRemaining ? torrent.timeRemaining / 1000 : Infinity),
    status,
    size: formatBytes(torrent.length || 0),
    downloaded: formatBytes(torrent.downloaded || 0),
  }
  if (errorMessage) data.errorMessage = errorMessage
  
  db.updateDownload(data)
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('torrent-progress', data))
}

// ─── IPC: Search TMDB ────────────────────────────────────────────────────────
// Read the key from the environment (injected by electron-vite from .env at build time).
// Never hardcode API keys in source files.
const TMDB_API_KEY = process.env.MAIN_VITE_TMDB_API_KEY || (import.meta as any).env?.MAIN_VITE_TMDB_API_KEY || ''

ipcMain.handle('search-tmdb', async (_, query: string) => {
  try {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false&page=1`
    const data: any = await nodeHttpGet(url)
    const filtered = (data.results || []).filter(
      (r: any) => r.media_type === 'movie' || r.media_type === 'tv'
    )
    return filtered.slice(0, 12)
  } catch (err) {
    console.error('[TMDB] Search error:', err)
    return []
  }
})

// ─── IPC: Search Torrent Sources ─────────────────────────────────────────────
ipcMain.handle('search-torrent-sources', async (_, title: string, year: string, mediaType: string, tmdbId: number) => {
  try {
    console.log(`[Torrent] Searching sources for: "${title}" (${year}) type=${mediaType} tmdbId=${tmdbId}`)

    // 1. Fetch IMDB ID for both movies and series to ensure accurate matching
    let imdbId = ''
    try {
      const extUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
      const extData: any = await nodeHttpGet(extUrl)
      imdbId = extData?.imdb_id || ''
      console.log(`[Torrent] Got IMDB ID: ${imdbId}`)
    } catch (e) {
      console.error('[Torrent] Failed to get IMDB ID:', e)
    }

    const sources: any[] = []

    if (mediaType === 'movie') {
      // A. Fetch from YTS using IMDB ID for 100% accurate match (bypassing fuzzy title/year issues)
      if (imdbId) {
        const mirrors = ['yts.mx', 'yts.rs', 'yts.do', 'yts.lt', 'yts.ag']
        let ytsData: any = null

        for (const domain of mirrors) {
          try {
            // YTS supports full IMDB IDs starting with 'tt' as query_term!
            const searchUrl = `https://${domain}/api/v2/list_movies.json?query_term=${imdbId}&limit=10&sort_by=seeds`
            const res = await nodeHttpGet(searchUrl, 3000) 
            if (res?.status === 'ok' && res?.data?.movies?.length > 0) {
              ytsData = res
              break
            }
          } catch (err: any) {
            console.log(`[Torrent] YTS mirror ${domain} failed`)
          }
        }

        if (ytsData?.data?.movies) {
          for (const movie of ytsData.data.movies) {
            for (const torrent of (movie.torrents || [])) {
              sources.push({
                title: `${movie.title_long} [${torrent.type?.toUpperCase() || 'WEB'}] (YTS)`,
                quality: torrent.quality || '720p',
                size: torrent.size || '—',
                magnet: `magnet:?xt=urn:btih:${torrent.hash}&dn=${encodeURIComponent(movie.title_long)}`,
                seeds: torrent.seeds || 0,
                peers: torrent.peers || 0,
                type: torrent.type || 'web',
                isHindi: false
              })
            }
          }
        }
      }

      // B. Fetch from Torrentio as an aggregator for high-speed, dual-audio, and hindi content
      if (imdbId) {
        try {
          const torrentioUrl = `https://torrentio.strem.fun/stream/movie/${imdbId}.json`
          const tData: any = await nodeHttpGet(torrentioUrl, 6000)
          if (tData && tData.streams) {
            for (const stream of tData.streams) {
              if (stream.infoHash) {
                const streamTitle = stream.title || ''
                const lowerTitle = streamTitle.toLowerCase()
                
                // Parse quality out of Torrentio title
                const qualityMatch = streamTitle.match(/(2160p|1080p|720p|480p)/i)
                const quality = qualityMatch ? qualityMatch[1] : (stream.name?.includes('1080p') ? '1080p' : 'HD')
                
                // Parse size out of Torrentio title e.g. "💾 2.34 GB"
                const sizeMatch = streamTitle.match(/([0-9.]+\s*(GB|MB|KB))/i)
                const size = sizeMatch ? sizeMatch[1] : '—'

                // Parse seeds from Torrentio title e.g. "👤 123"
                const seedMatch = streamTitle.match(/(?:👤|Seeders:)\s*([0-9]+)/i)
                const seeds = seedMatch ? parseInt(seedMatch[1]) : 10
                
                const isHindi = lowerTitle.includes('hindi') || lowerTitle.includes('dual') || lowerTitle.includes('multi')
                
                // Clean up title to drop the emojis and meta info for a cleaner display
                const cleanTitle = streamTitle.split('\n')[0].replace(/[\[\(][A-Za-z0-9 ]*[\]\)]/g, '').trim() || `${title} (Aggregated)`

                sources.push({
                  title: cleanTitle.substring(0, 80),
                  quality: quality,
                  size: size,
                  magnet: `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(cleanTitle)}`,
                  seeds: seeds,
                  peers: Math.floor(seeds * 0.2), // Estimate peers
                  type: 'web',
                  isHindi: isHindi
                })
              }
            }
          }
        } catch (err: any) {
          console.error('[Torrent] Torrentio fetch failed:', err.message)
        }
      }

    } else {
      // TV Series logic - using EZTV
      if (!imdbId) return []

      const imdbNumeric = imdbId.replace(/^tt/, '')
      const eztvMirrors = ['eztvx.to', 'eztv.re', 'eztv.wf', 'eztv.tf', 'eztv.yt']
      let data: any = null

      for (const domain of eztvMirrors) {
        try {
          const searchUrl = `https://${domain}/api/get-torrents?imdb_id=${imdbNumeric}&limit=30&page=1`
          const res = await nodeHttpGet(searchUrl, 5000)
          if (res && res.torrents) {
            data = res
            break
          }
        } catch (err: any) {
          console.log(`[Torrent] EZTV mirror ${domain} failed`)
        }
      }

      if (data?.torrents) {
        for (const t of data.torrents) {
          if (!t.magnet_url) continue
          const lowerTitle = (t.title || t.filename || '').toLowerCase()
          sources.push({
            title: t.title || t.filename || 'Unknown',
            quality: t.title?.match(/(720p|1080p|2160p|480p)/i)?.[1] || 'SD',
            size: formatBytes(t.size_bytes || 0),
            magnet: t.magnet_url,
            seeds: t.seeds || 0,
            peers: t.peers || 0,
            type: 'web',
            isHindi: lowerTitle.includes('hindi') || lowerTitle.includes('dual')
          })
        }
      }
    }

    // C. Fetch from APIBay (The Pirate Bay) for both movies and series
    if (imdbId) {
      try {
        const apibayUrl = `https://apibay.org/q.php?q=${imdbId}`
        const apiBayData: any = await nodeHttpGet(apibayUrl, 5000)
        
        if (Array.isArray(apiBayData) && apiBayData[0]?.id !== '0') {
          for (const t of apiBayData) {
            const seeders = parseInt(t.seeders) || 0
            const leechers = parseInt(t.leechers) || 0
            if (seeders === 0) continue // Skip dead torrents early
            
            const titleName = t.name || ''
            const lowerTitle = titleName.toLowerCase()
            
            const qualityMatch = titleName.match(/(2160p|1080p|720p|480p)/i)
            const quality = qualityMatch ? qualityMatch[1] : 'HD'
            
            const isHindi = lowerTitle.includes('hindi') || lowerTitle.includes('dual') || lowerTitle.includes('multi')
            
            sources.push({
              title: `${titleName.substring(0, 80)} (TPB)`,
              quality: quality,
              size: formatBytes(parseInt(t.size) || 0),
              magnet: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(titleName)}`,
              seeds: seeders,
              peers: leechers,
              type: 'web',
              isHindi: isHindi
            })
          }
        }
      } catch (err: any) {
        console.error('[Torrent] APIBay fetch failed:', err.message)
      }
    }

    // Parse Season / Episode metadata
    let enrichedSources = sources.map(src => {
      if (mediaType === 'tv') {
        const titleLower = src.title.toLowerCase()
        const seMatch = titleLower.match(/s(\d{1,2})e(\d{1,2})/i) || titleLower.match(/season\s*(\d{1,2})\s*episode\s*(\d{1,2})/i)
        
        if (seMatch) {
          src.parsedSeason = parseInt(seMatch[1])
          src.parsedEpisode = parseInt(seMatch[2])
          src.isSeasonPack = false
        } else {
          const sMatch = titleLower.match(/s(\d{1,2})\b/i) || titleLower.match(/season\s*(\d{1,2})\b/i)
          if (sMatch) {
            src.parsedSeason = parseInt(sMatch[1])
            src.isSeasonPack = true
          }
        }
      }
      return src
    })

    // Filter Season Packs that are not 1080p+
    if (mediaType === 'tv') {
      enrichedSources = enrichedSources.filter(src => {
        if (src.isSeasonPack) {
          if (src.quality === 'SD' || src.quality === '480p' || src.quality === '720p') {
            return false
          }
        }
        return true
      })
    }

    // Sort heavily by requirements
    enrichedSources.sort((a, b) => {
      if (mediaType === 'movie') {
        return b.seeds - a.seeds
      } else {
        // Both are Season Packs
        if (a.isSeasonPack && b.isSeasonPack) {
          if (a.parsedSeason !== b.parsedSeason) return (a.parsedSeason || 0) - (b.parsedSeason || 0)
          return b.seeds - a.seeds
        }
        // Pack vs Episode
        if (a.isSeasonPack && !b.isSeasonPack) return -1
        if (!a.isSeasonPack && b.isSeasonPack) return 1

        // Both are Episodes
        if (a.parsedSeason !== b.parsedSeason) return (a.parsedSeason || 0) - (b.parsedSeason || 0)
        if (a.parsedEpisode !== b.parsedEpisode) return (a.parsedEpisode || 0) - (b.parsedEpisode || 0)
        
        // Same Episode: Sort by seeds
        if (a.seeds !== b.seeds) return b.seeds - a.seeds
        
        // Tiebreaker: Resolution
        const qA = a.quality === '2160p' ? 3 : a.quality === '1080p' ? 2 : a.quality === '720p' ? 1 : 0
        const qB = b.quality === '2160p' ? 3 : b.quality === '1080p' ? 2 : b.quality === '720p' ? 1 : 0
        return qB - qA
      }
    })

    // Deduplicate by infoHash/magnet to avoid clutter
    const uniqueSources: any[] = []
    const seenHashes = new Set()
    for (const src of enrichedSources) {
      const match = src.magnet.match(/urn:btih:([a-zA-Z0-9]+)/i)
      const hash = match ? match[1].toLowerCase() : src.magnet
      if (!seenHashes.has(hash)) {
        seenHashes.add(hash)
        uniqueSources.push(src)
      }
    }

    return uniqueSources

  } catch (err) {
    console.error('[Torrent] Source search error:', err)
    return []
  }
})

// ─── IPC: Start Torrent Download ─────────────────────────────────────────────

async function startWebTorrent(torrentId: string, magnetUrl: string, title: string, initialProgress: number = 0) {
  const client = await getWebTorrentClient()
  const downloadPath = getDownloadPath()

  console.log(`[Torrent] Starting download: "${title}" -> ${downloadPath}`)
  console.log(`[Torrent] Magnet: ${magnetUrl.slice(0, 80)}...`)

  broadcastProgress(torrentId, { downloadSpeed: 0, timeRemaining: 0, length: 0, downloaded: 0, progress: initialProgress / 100, name: title } as any, 'downloading')

  const extraTrackers = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://tracker.cyberia.is:6969/announce',
    'udp://tracker.tiny-vps.com:6969/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.moeking.me:6969/announce',
    'udp://tracker.bitsearch.to:1337/announce',
    'udp://tracker.dler.org:6969/announce',
    'udp://9.rarbg.com:2810/announce',
    'udp://p4p.arenabg.com:1337'
  ]

  let enrichedMagnet = magnetUrl
  for (const tr of extraTrackers) {
    if (!enrichedMagnet.includes(encodeURIComponent(tr))) {
      enrichedMagnet += `&tr=${encodeURIComponent(tr)}`
    }
  }

  const torrent = client.add(enrichedMagnet, { path: downloadPath })
  
  torrent._myCinemaTitle = title
  activeTorrents.set(torrentId, torrent)

  torrent.on('ready', () => {
    console.log(`[Torrent] Metadata resolved: ${torrent.name} (${formatBytes(torrent.length)})`)
  })

  // Periodic progress updates (every 1s)
  const progressInterval = setInterval(() => {
    if (torrent.destroyed) {
      clearInterval(progressInterval)
      return
    }
    broadcastProgress(torrentId, torrent, torrent.paused ? 'paused' : 'downloading')
  }, 1000)

  torrent.on('done', () => {
    clearInterval(progressInterval)
    broadcastProgress(torrentId, torrent, 'done')
    console.log(`[Torrent] Download complete: ${title}`)
    setTimeout(() => {
      if (!torrent.destroyed) torrent.destroy()
      activeTorrents.delete(torrentId)
    }, 5000)
  })

  torrent.on('error', (err: Error) => {
    clearInterval(progressInterval)
    broadcastProgress(torrentId, torrent, 'error', err.message)
    console.error(`[Torrent] Error: ${err.message}`)
    activeTorrents.delete(torrentId)
  })

  return torrent
}

async function autoResumeDownloads() {
  const downloads = db.getDownloads()
  for (const dl of downloads) {
    if (dl.status === 'downloading') {
      console.log(`[AutoResume] Resuming incomplete download: ${dl.title}`)
      try {
        await startWebTorrent(dl.id, dl.magnet, dl.title, dl.progress || 0)
      } catch (e: any) {
        console.error(`[AutoResume] Failed to resume ${dl.id}:`, e.message)
      }
    }
  }
}

ipcMain.handle('start-torrent-download', async (_, magnetUrl: string, title: string) => {
  try {
    const torrentId = crypto.randomUUID()
    
    db.addDownload({
      id: torrentId,
      title,
      magnet: magnetUrl,
      status: 'downloading'
    })

    await startWebTorrent(torrentId, magnetUrl, title, 0)
    return torrentId
  } catch (err) {
    console.error('[Torrent] Start download error:', err)
    return false
  }
})

// ─── IPC: Cancel Torrent ─────────────────────────────────────────────────────
ipcMain.handle('cancel-torrent-download', async (_, id: string) => {
  try {
    const torrent = activeTorrents.get(id)
    if (torrent && !torrent.destroyed) {
      torrent.destroy()
    }
    activeTorrents.delete(id)
    // NOTE: Canceling a torrent leaves it in DB as 'paused' or we can leave it as canceled.
    // The user wants tracking. Let's mark it as 'paused'.
    // Cancel actually stops it. Let's just update DB to 'paused'.
    const dlDbData = db.getDownloads().find((d: any) => d.id === id)
    if (dlDbData) {
      dlDbData.status = 'paused'
      db.updateDownload(dlDbData)
      // Broadcast it so UI updates immediately
      broadcastProgress(id, { downloadSpeed: 0, timeRemaining: 0, length: 0, downloaded: 0, progress: dlDbData.progress, name: dlDbData.title } as any, 'paused')
    }
    return true
  } catch (err) {
    console.error('[Torrent] Cancel error:', err)
    return false
  }
})

// ─── IPC: Pause / Resume Torrent ─────────────────────────────────────────────
ipcMain.handle('pause-resume-torrent', async (_, id: string) => {
  try {
    const torrent = activeTorrents.get(id)
    
    // Resume Logic
    if (!torrent || torrent.destroyed) {
      const dbDl = db.getDownloads().find((d: any) => d.id === id)
      if (dbDl) {
        console.log(`[Torrent] Resuming "${dbDl.title}" from ${dbDl.progress}%`)
        await startWebTorrent(id, dbDl.magnet, dbDl.title, dbDl.progress || 0)
        return true
      }
      return false
    }
    
    // Pause Logic (Stop & Destroy pattern for reliability)
    console.log(`[Torrent] Pausing download: ${id}`)
    torrent.destroy()
    activeTorrents.delete(id)
    
    const dlDbData = db.getDownloads().find((d: any) => d.id === id)
    if (dlDbData) {
      dlDbData.status = 'paused'
      db.updateDownload(dlDbData)
      broadcastProgress(id, { 
        downloadSpeed: 0, 
        timeRemaining: 0, 
        length: 0, 
        downloaded: 0, 
        progress: dlDbData.progress / 100, 
        name: dlDbData.title 
      } as any, 'paused')
    }
    
    return true
  } catch (err) {
    console.error('[Torrent] Pause/Resume error:', err)
    return false
  }
})

// ─── IPC: Get Active Downloads ───────────────────────────────────────────────
ipcMain.handle('get-active-downloads', async () => {
  return db.getDownloads()
})

// ─── IPC: Remove Download ────────────────────────────────────────────────────
ipcMain.handle('remove-download', async (_, id: string) => {
  try {
    const torrent = activeTorrents.get(id)
    if (torrent && !torrent.destroyed) {
      torrent.destroy()
    }
    activeTorrents.delete(id)
    db.removeDownloadRow(id)
    return true
  } catch (err) {
    console.error('[Torrent] Remove error:', err)
    return false
  }
})

