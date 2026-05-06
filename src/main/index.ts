import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as db from './db'
import { scanFolder, getEmbeddedSubtitles, getEmbeddedAudio } from './scanner'
import * as tmdb from './tmdb'
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

// Generic HTTPS request helper — supports GET/POST + custom headers (needed for OpenSubtitles API)
function nodeHttpRequest(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {}
): Promise<any> {
  const { method = 'GET', headers = {}, body, timeoutMs = 10000 } = opts
  return new Promise(async (resolve, reject) => {
    let req: any = null
    const timer = setTimeout(() => {
      if (req) req.destroy()
      reject(new Error(`Timeout ${method} ${url} after ${timeoutMs}ms`))
    }, timeoutMs)

    try {
      const parsed = new URL(url)
      const ip = await resolveHostname(parsed.hostname)

      const requestOpts: any = {
        hostname: ip,
        port: 443,
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          'User-Agent': 'MyCinema v1.7',
          'Host': parsed.hostname,
          ...headers,
        },
        servername: parsed.hostname,
      }

      if (body) {
        requestOpts.headers['Content-Length'] = Buffer.byteLength(body)
      }

      req = https.request(requestOpts, (res) => {
        let data = ''
        res.on('data', (chunk: string) => { data += chunk })
        res.on('end', () => {
          clearTimeout(timer)
          try { resolve(JSON.parse(data)) } catch { resolve(data) }
        })
      }).on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })

      if (body) req.write(body)
      req.end()
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
    const normalized = path.normalize(inputPath).toLowerCase()
    const allowedRoots = [
      // User's registered library folders (dynamically checked each call)
      ...(db.getFolders() as any[]).map((f: any) => path.normalize(f.path).toLowerCase()),
      // The MyCinema torrent download destination
      path.normalize(path.join(app.getPath('downloads'), 'MyCinema')).toLowerCase(),
      // App userData: poster cache, subtitle cache, window state, db
      path.normalize(app.getPath('userData')).toLowerCase(),
      // Temp dir used by subtitle pre-conversion
      path.normalize(app.getPath('temp')).toLowerCase(),
      // Dirs implicitly allowed by user opening a file from the shell
      ...Array.from(allowedExternalDirs).map(d => d.toLowerCase())
    ]
    
    return allowedRoots.some(root => {
      // Direct match
      if (normalized === root) return true;
      // Is inside directory (ensure trailing slash comparison to avoid partial name matches)
      const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
      return normalized.startsWith(rootWithSep);
    })
  } catch {
    return false
  }
}

function isPathInsideRoot(candidatePath: string, rootPath: string): boolean {
  const resolvedCandidate = path.resolve(candidatePath).toLowerCase()
  const resolvedRoot = path.resolve(rootPath).toLowerCase()
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(rootWithSep)
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
const appIconPath = isDev
  ? join(app.getAppPath(), 'build', 'icon.png')
  : join(process.resourcesPath, 'icon.ico')

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
    icon: appIconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // webSecurity remains false for local media serving: the real path-traversal
      // protection is the isSafeFilePath() whitelist guard on every IPC handler and
      // protocol handler. Enabling webSecurity caused cross-origin CSP rejections
      // for the custom media:// / subtitle:// / audio:// schemes in some Electron builds.
      webSecurity: false,
      backgroundThrottling: false
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
    handleCommandLine(process.argv, null)
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
    if (isInstallingUpdate) {
      return
    }

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

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

let pendingExternalFilePath: string | null = null;
const allowedExternalDirs = new Set<string>();

app.on('second-instance', (event, commandLine, workingDirectory) => {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    handleCommandLine(commandLine, mainWindow)
  }
})

function handleCommandLine(argv: string[], mainWindow: BrowserWindow | null) {
  const filePath = argv.find(arg => 
    !arg.startsWith('--') && 
    arg !== process.execPath &&
    arg !== app.getAppPath() &&
    ['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(path.extname(arg).toLowerCase())
  );
  if (filePath) {
    const normalizedDir = path.normalize(path.dirname(filePath))
    allowedExternalDirs.add(normalizedDir)
    pendingExternalFilePath = filePath;
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
      mainWindow.webContents.send('open-external-file', filePath)
    }
  }
}



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
ipcMain.on('log-to-main', (_event, message) => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[Renderer Log][${timestamp}] ${message}`);
})

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
  return db.getVideoProgress(videoId)
})

ipcMain.on('update-video-progress', (_, videoId, time, completed, isClosing) => {
  if (videoId === -1) return; // Don't save progress for ad-hoc external files (crashes DB FK constraint)
  db.updateVideoProgress(videoId, time, completed, Boolean(isClosing))
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

ipcMain.handle('get-pending-external-file', () => {
  const file = pendingExternalFilePath;
  pendingExternalFilePath = null;
  return file;
})

function tokenizeSubtitleName(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .split(/[^a-z0-9]+/i)
    .filter(token =>
      token.length >= 2 &&
      !/^(srt|sub|vtt|utf|utf8|default|english|eng|en|cc|sdh|subtitles?)$/.test(token)
    )
}

function scoreSubtitleCandidate(videoFilePath: string, subtitlePath: string): number {
  const videoBaseName = path.basename(videoFilePath, path.extname(videoFilePath)).toLowerCase()
  const subtitleFileName = path.basename(subtitlePath).toLowerCase()
  const subtitleBaseName = path.basename(subtitlePath, path.extname(subtitlePath)).toLowerCase()

  if (subtitleBaseName === videoBaseName) return 1_000
  if (subtitleBaseName === `${videoBaseName}.en` || subtitleBaseName === `${videoBaseName}.eng`) return 980
  if (subtitleBaseName.startsWith(`${videoBaseName}.`) || subtitleBaseName.startsWith(`${videoBaseName} `)) return 940

  let score = 0
  const videoTokens = new Set(tokenizeSubtitleName(videoBaseName))
  for (const token of tokenizeSubtitleName(subtitleBaseName)) {
    if (videoTokens.has(token)) score += 25
  }

  const parentDir = path.basename(path.dirname(subtitlePath)).toLowerCase()
  if (parentDir === 'subs' || parentDir === 'subtitles') score += 10
  if (subtitleFileName.includes('opensubtitles')) score -= 15
  if (subtitleBaseName === 'english' || subtitleBaseName === 'eng' || subtitleBaseName === 'en') score -= 30

  return score
}

function findBestExternalSubtitle(videoFilePath: string): string | null {
  const dir = path.dirname(videoFilePath)
  const baseName = path.basename(videoFilePath, path.extname(videoFilePath))
  const candidatePaths = new Set<string>([
    path.join(dir, `${baseName}.srt`),
    path.join(dir, `${baseName}.en.srt`),
    path.join(dir, `${baseName}.eng.srt`),
    path.join(dir, 'English.srt'),
    path.join(dir, 'english.srt'),
    path.join(dir, 'subs', `${baseName}.srt`),
    path.join(dir, 'Subtitles', `${baseName}.srt`),
  ])

  const directoriesToScan = [
    dir,
    path.join(dir, 'subs'),
    path.join(dir, 'Subtitles'),
  ]

  for (const scanDir of directoriesToScan) {
    if (!fs.existsSync(scanDir)) continue
    for (const entry of fs.readdirSync(scanDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      if (path.extname(entry.name).toLowerCase() !== '.srt') continue
      candidatePaths.add(path.join(scanDir, entry.name))
    }
  }

  const rankedCandidates = Array.from(candidatePaths)
    .filter(candidate => fs.existsSync(candidate))
    .map(candidate => ({ candidate, score: scoreSubtitleCandidate(videoFilePath, candidate) }))
    .sort((a, b) => b.score - a.score)

  if (rankedCandidates.length === 0) return null
  if (rankedCandidates[0].score < 30) return null
  return rankedCandidates[0].candidate
}

ipcMain.handle('get-subtitles', async (_, filePath: string) => {
  if (!isSafeFilePath(filePath)) {
    console.error(`[IPC] 403 Forbidden path in get-subtitles: ${filePath}`)
    return null
  }
  try {
    return findBestExternalSubtitle(filePath)
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
    
    // Include file metadata so a replaced/updated subtitle does not reuse an
    // older converted VTT with stale timings.
    const stat = fs.statSync(filePath)
    const cacheKey = `${filePath}-${trackIndex}-${stat.size}-${Math.floor(stat.mtimeMs)}`
    const hash = crypto.createHash('sha1').update(cacheKey).digest('hex').slice(0, 16)
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
  if (!isSafeFilePath(filePath)) {
    console.error(`[IPC] 403 Forbidden path in open-folder: ${filePath}`)
    return false
  }
  if (!fs.existsSync(filePath)) {
    return false
  }
  shell.showItemInFolder(filePath)
  return true
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

let isInstallingUpdate = false

ipcMain.on('install-update', () => {
  isInstallingUpdate = true
  autoUpdater.quitAndInstall(false, true)
})

ipcMain.handle('start-update-download', async () => {
  return await autoUpdater.downloadUpdate()
})

function setupAutoUpdater(win: BrowserWindow): void {
  // Only run auto-update in packaged (production) builds
  if (!app.isPackaged) return

  // Keep both download and installation explicit so the user controls when
  // network download starts and when the app restarts into the new version.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

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
      // Privacy: DHT enabled for better magnet resolution, but with privacy caution
      dht: true,
      // Privacy: LSD disabled by default
      lsd: false,
      // Reduced from 1000: extreme connection counts can crash home routers
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

function formatBytes(bytes: any): string {
  if (typeof bytes === 'string') return bytes
  if (typeof bytes !== 'number' || isNaN(bytes)) return '—'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatTime(seconds: any): string {
  if (typeof seconds === 'string') return seconds
  if (!isFinite(seconds) || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function broadcastProgress(id: string, torrent: any, status: string, errorMessage?: string): void {
  // Try to get existing data from DB to avoid UI flickers (0/0 size when pausing/resuming)
  const existing = db.getDownloads().find((d: any) => d.id === id)

  // Calculate new progress percentage
  let newProgress = existing?.progress || 0
  if (torrent.progress !== undefined) {
    const calculated = Math.round((torrent.progress || 0) * 100 * 100) / 100
    // Only update if it's higher, or if it's a "done" status (to allow 100%)
    // But never let it drop to 0 if we already have progress, unless it's an error/reset
    if (calculated > newProgress || status === 'done') {
      newProgress = calculated
    }
  }

  // Determine actual status - if it's "downloading" but has no size, it's resolving metadata
  let displayStatus = status
  if (status === 'downloading' && (!torrent.length || torrent.length === 0)) {
    displayStatus = 'connecting'
  }

  const data: any = {
    id,
    title: (torrent as any)._myCinemaTitle || torrent.name || existing?.title || 'Download',
    name: torrent.name || (torrent as any)._myCinemaName || existing?.name || null,
    progress: newProgress,
    downloadSpeed: torrent.downloadSpeed !== undefined 
      ? formatBytes(torrent.downloadSpeed || 0) + '/s' 
      : (existing?.downloadSpeed || '0 B/s'),
    timeRemaining: torrent.timeRemaining !== undefined 
      ? formatTime(torrent.timeRemaining ? torrent.timeRemaining / 1000 : Infinity) 
      : (existing?.timeRemaining || '—'),
    status: displayStatus,
    // Only update size/downloaded if they are greater than 0, or if we don't have existing data
    size: (torrent.length && torrent.length > 0) 
      ? formatBytes(torrent.length) 
      : (existing?.size || '—'),
    downloaded: (torrent.downloaded && torrent.downloaded > 0) 
      ? formatBytes(torrent.downloaded) 
      : (existing?.downloaded || '0 B'),
    tmdbId: existing?.tmdbId || null
  }
  if (errorMessage) data.errorMessage = errorMessage
  
  db.updateDownload(data)
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('torrent-progress', data))
}

// ─── IPC: Search TMDB ────────────────────────────────────────────────────────
// Read the key from the environment (injected by electron-vite from .env at build time).
// Never hardcode API keys in source files.
const TMDB_API_KEY = process.env.MAIN_VITE_TMDB_API_KEY || (import.meta as any).env?.MAIN_VITE_TMDB_API_KEY || ''
const OPENSUBTITLES_API_KEY = process.env.MAIN_VITE_OPENSUBTITLES_API_KEY || (import.meta as any).env?.MAIN_VITE_OPENSUBTITLES_API_KEY || ''

function computeOpenSubtitlesHash(filePath: string): { moviehash: string; moviebytesize: number } | null {
  try {
    const stat = fs.statSync(filePath)
    const chunkSize = 64 * 1024
    if (stat.size < chunkSize * 2) return null

    const fd = fs.openSync(filePath, 'r')
    try {
      const buffer = Buffer.alloc(chunkSize)
      let hash = BigInt(stat.size)

      fs.readSync(fd, buffer, 0, chunkSize, 0)
      for (let i = 0; i < chunkSize; i += 8) {
        hash = (hash + buffer.readBigUInt64LE(i)) & BigInt('0xffffffffffffffff')
      }

      fs.readSync(fd, buffer, 0, chunkSize, stat.size - chunkSize)
      for (let i = 0; i < chunkSize; i += 8) {
        hash = (hash + buffer.readBigUInt64LE(i)) & BigInt('0xffffffffffffffff')
      }

      return {
        moviehash: hash.toString(16).padStart(16, '0'),
        moviebytesize: stat.size,
      }
    } finally {
      fs.closeSync(fd)
    }
  } catch (err: any) {
    console.error('[OpenSubtitles] Failed to compute movie hash:', err.message)
    return null
  }
}

function getReleaseTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .split(/[^a-z0-9]+/i)
    .filter(token => token.length >= 3 && !/^(720p|1080p|2160p|480p|x264|x265|h264|h265|web|webrip|bluray|brrip|hdrip|dvdrip|aac|dts|yts|rarbg)$/.test(token))
}

function scoreSubtitleReleaseMatch(videoFilePath: string | undefined, releaseName: string, fileName: string): number {
  if (!videoFilePath) return 0
  const videoName = path.basename(videoFilePath, path.extname(videoFilePath)).toLowerCase()
  const combined = `${releaseName} ${fileName}`.toLowerCase()
  if (combined.includes(videoName)) return 100

  const videoTokens = new Set(getReleaseTokens(videoName))
  if (videoTokens.size === 0) return 0

  let score = 0
  for (const token of getReleaseTokens(combined)) {
    if (videoTokens.has(token)) score += 6
  }
  return Math.min(score, 60)
}

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

ipcMain.handle('fetch-trending', async (_, type: 'movie' | 'series') => {
  return await tmdb.fetchTrending(type)
})

ipcMain.handle('fetch-trending-india', async () => {
  return await tmdb.fetchTrendingInIndia()
})

ipcMain.handle('toggle-favorite', (_, id: number) => {
  return db.toggleFavorite(id)
})

ipcMain.handle('toggle-watchlist', (_, id: number) => {
  return db.toggleWatchlist(id)
})

ipcMain.handle('add-to-watchlist-external', (_, item: any) => {
  return db.addToWatchlistExternal(item)
})

ipcMain.handle('remove-from-watchlist-external', (_, tmdbId: number) => {
  return db.removeFromWatchlistExternal(tmdbId)
})

ipcMain.handle('get-watchlist', () => {
  return db.getWatchlist()
})

ipcMain.handle('get-favorites', () => {
  return db.getFavorites()
})

ipcMain.handle('find-video-by-tmdb-id', (_, tmdbId: number) => {
  return db.findVideoByTmdbId(tmdbId)
})

// ─── Hindi Detection & Ranking Helpers ────────────────────────────────────────
function isHindiContent(title: string): boolean {
  const lower = title.toLowerCase()
  return (
    lower.includes('hindi') ||
    lower.includes('हिंदी') ||
    lower.includes('audio:hindi') ||
    lower.includes('audio hindi') ||
    lower.includes('dual audio') ||
    lower.includes('dual-audio') ||
    lower.includes('multi audio') ||
    lower.includes('multi-audio') ||
    lower.includes('dubbed') ||
    lower.includes('hin-eng') ||
    lower.includes('katmoviehd') ||
    lower.includes('katmovieshd') ||
    lower.includes('hdhub4u') ||
    lower.includes('vegamovies') ||
    lower.includes('dotmovies') ||
    lower.includes('bolly4u') ||
    lower.includes('gdtot') ||
    lower.includes('hubcloud') ||
    lower.includes('extramovies') ||
    lower.includes('9xmovies') ||
    lower.includes('world4ufree') ||
    lower.includes('moviesflix') ||
    lower.includes('skymovieshd') ||
    lower.includes('uhdmovies') ||
    lower.includes('luxmovies') ||
    lower.includes('mkvmoviespoint') ||
    lower.includes('mkvmad') ||
    lower.includes('u3p') ||
    lower.includes('darksiderg') ||
    lower.includes('mkvcinemas') ||
    lower.includes('1tamilmv') ||
    lower.includes('tamilmv') ||
    lower.includes('bollyshare') ||
    lower.includes('desiremovies') ||
    lower.includes('moviespapa') ||
    lower.includes('moviesnation') ||
    lower.includes('hdmovies24') ||
    lower.includes('hdmovies4u') ||
    lower.includes('filmyzilla') ||
    lower.includes('downloadhub') ||
    lower.includes('khatrimaza') ||
    lower.includes('moviespur') ||
    lower.includes('7starhd') ||
    lower.includes('tamilyogi') ||
    lower.includes('isaimini') ||
    lower.includes('tamilrockers') ||
    /\bhin(di?)?\b/i.test(lower) ||
    /[\[\(\.]hin[\]\)\.]/i.test(lower)
  )
}

function getHindiScore(title: string): number {
  const lower = title.toLowerCase()
  let score = 0
  
  // High quality sites requested by user
  const premiumSites = [
    'katmoviehd', 'katmovieshd', 'vegamovies', 'dotmovies', 'hdhub4u', 'uhdmovies', 
    'luxmovies', 'darksiderg', 'bolly4u', '1tamilmv', 'tamilmv', 'hdmovies4u', 
    'bollyshare', 'desiremovies', 'moviespapa', 'moviesnation', 'hdmovies24',
    'filmyzilla', 'downloadhub', 'tamilblasters', '7starhd'
  ]
  
  for (const site of premiumSites) {
    if (lower.includes(site)) {
      score += 45 // Slightly higher priority
      break
    }
  }

  if (lower.includes('hindi')) score += 20
  if (lower.includes('dual audio') || lower.includes('dual-audio')) score += 15
  if (lower.includes('multi audio') || lower.includes('multi-audio')) score += 15
  if (lower.includes('dubbed')) score += 10
  if (lower.includes('official')) score += 10
  if (lower.includes('1080p')) score += 5
  if (lower.includes('2160p') || lower.includes('4k')) score += 15
  
  return score
}

// ─── Torrentio Stream Parser Helper ──────────────────────────────────────────
const TORRENTIO_BASE = 'https://torrentio.strem.fun/sort=seeders|qualityfilter=cam,screener'

function parseTorrentioStream(stream: any, fallbackTitle: string): any | null {
  if (!stream.infoHash) return null
  const streamTitle = stream.title || ''
  
  // Parse quality
  const qualityMatch = streamTitle.match(/(2160p|1080p|720p|480p)/i)
  const quality = qualityMatch ? qualityMatch[1] : (stream.name?.includes('1080p') ? '1080p' : 'HD')
  
  // Parse size e.g. "💾 2.34 GB" or "💾 980 MB"
  const sizeMatch = streamTitle.match(/([0-9.]+\s*(GB|MB|KB|GiB|MiB))/i)
  const size = sizeMatch ? sizeMatch[1] : '—'

  // Parse seeds e.g. "👤 123"
  const seedMatch = streamTitle.match(/(?:👤|Seeders:)\s*([0-9]+)/i)
  const seeds = seedMatch ? parseInt(seedMatch[1]) : 0
  if (seeds === 0) return null // Skip dead torrents
  
  const isHindi = isHindiContent(streamTitle)
  
  // Clean up title
  const cleanTitle = streamTitle.split('\n')[0].replace(/[\[\(][A-Za-z0-9 ]*[\]\)]/g, '').trim() || `${fallbackTitle} (Aggregated)`

  return {
    title: cleanTitle.substring(0, 80),
    quality,
    size,
    magnet: `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(cleanTitle)}`,
    seeds,
    peers: Math.floor(seeds * 0.2),
    type: 'web',
    isHindi
  }
}

// ─── Shared Tracker List & Magnet Enrichment ─────────────────────────────────
const EXTRA_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://tracker.bitsearch.to:1337/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://9.rarbg.com:2810/announce',
  'udp://p4p.arenabg.com:1337',
  'udp://open.tracker.cl:1337/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
]

function isRelevanceMatch(resultTitle: string, searchTitle: string, mediaType: string, year: string): boolean {
  const rt = resultTitle.toLowerCase().replace(/[.\-_]/g, ' ');
  const st = searchTitle.toLowerCase().replace(/[.\-_]/g, ' ');
  
  // 1. Title MUST be present as a whole word
  const titleRegex = new RegExp(`\\b${st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (!titleRegex.test(rt)) return false;

  // 2. Short title protection (e.g. "From", "The Bear")
  // If title is short, it should appear at the very beginning of the result
  if (st.length <= 5) {
    const titleIndex = rt.indexOf(st);
    if (titleIndex > 2) return false; // Must be near start
  }

  // 3. If it's a TV series, check for season/episode markers or "complete"
  if (mediaType === 'tv') {
    const isTVPattern = /s\d{1,2}|season\s*\d{1,2}|episode\s*\d{1,2}|complete/i.test(rt);
    if (!isTVPattern) return false;
  }

  // 4. For movies, if year is provided, check if a different year exists in the result title
  if (mediaType === 'movie' && year) {
    const yearsInTitle = rt.match(/\b(19|20)\d{2}\b/g);
    if (yearsInTitle && !yearsInTitle.includes(year)) return false;
  }

  return true;
}

function enrichMagnetWithTrackers(magnetUrl: string): string {
  if (!magnetUrl || !magnetUrl.startsWith('magnet:')) return magnetUrl
  
  let enriched = magnetUrl
  // Ensure we have a query separator
  if (!enriched.includes('?')) enriched += '?'
  
  for (const tr of EXTRA_TRACKERS) {
    const encodedTr = encodeURIComponent(tr)
    // Check both encoded and unencoded to avoid duplicates
    if (!enriched.includes(encodedTr) && !enriched.includes(tr)) {
      // Use & if we already have parameters, otherwise ? (though xt is usually first)
      const separator = enriched.endsWith('?') ? '' : '&'
      enriched += `${separator}tr=${encodedTr}`
    }
  }
  return enriched
}

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
              const seeds = torrent.seeds || 0
              const peers = torrent.peers || 0
              if (seeds === 0 && peers === 0) continue // Skip dead torrents
              sources.push({
                title: `${movie.title_long} [${torrent.type?.toUpperCase() || 'WEB'}] (YTS)`,
                quality: torrent.quality || '720p',
                size: torrent.size || 'ΓÇö',
                magnet: `magnet:?xt=urn:btih:${torrent.hash}&dn=${encodeURIComponent(movie.title_long)}`,
                seeds,
                peers,
                type: torrent.type || 'web',
                isHindi: isHindiContent(movie.title_long || '')
              })
            }
          }
        }
      }

      // B. Fetch from Torrentio as an aggregator for high-speed, dual-audio, and hindi content
      if (imdbId) {
        try {
          const torrentioUrl = `${TORRENTIO_BASE}/stream/movie/${imdbId}.json`
          console.log(`[Torrent] Fetching Torrentio: ${torrentioUrl}`)
          const tData: any = await nodeHttpGet(torrentioUrl, 6000)
          if (tData && tData.streams) {
            for (const stream of tData.streams) {
              const parsed = parseTorrentioStream(stream, title)
              if (parsed) sources.push(parsed)
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
          const seeds = t.seeds || 0
          const peers = t.peers || 0
          if (seeds === 0 && peers === 0) continue // Skip dead torrents
          const torrentTitle = t.title || t.filename || 'Unknown'
          sources.push({
            title: torrentTitle,
            quality: torrentTitle.match(/(720p|1080p|2160p|480p)/i)?.[1] || 'SD',
            size: formatBytes(t.size_bytes || 0),
            magnet: t.magnet_url,
            seeds,
            peers,
            type: 'web',
            isHindi: isHindiContent(torrentTitle)
          })
        }
      }

      // D. Fetch from Torrentio for TV Series (aggregates many sources)
      if (imdbId) {
        try {
          // Fetch general series streams (Torrentio returns season packs + recent episodes)
          const torrentioUrl = `${TORRENTIO_BASE}/stream/series/${imdbId}.json`
          console.log(`[Torrent] Fetching Torrentio series: ${torrentioUrl}`)
          const tData: any = await nodeHttpGet(torrentioUrl, 6000)
          if (tData && tData.streams) {
            for (const stream of tData.streams) {
              const parsed = parseTorrentioStream(stream, title)
              if (parsed) sources.push(parsed)
            }
          }
        } catch (err: any) {
          console.error('[Torrent] Torrentio series fetch failed:', err.message)
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
            
            const qualityMatch = titleName.match(/(2160p|1080p|720p|480p)/i)
            const quality = qualityMatch ? qualityMatch[1] : 'HD'
            
            sources.push({
              title: `${titleName.substring(0, 80)} (TPB)`,
              quality: quality,
              size: formatBytes(parseInt(t.size) || 0),
              magnet: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(titleName)}`,
              seeds: seeders,
              peers: leechers,
              type: 'web',
              isHindi: isHindiContent(titleName)
            })
          }
        }
      } catch (err: any) {
        console.error('[Torrent] APIBay fetch failed:', err.message)
      }
    }

    // E. Fetch from MediaFusion (Stremio addon ΓÇö indexes many Hindi/Dual audio sources)
    if (imdbId) {
      try {
        const mfType = mediaType === 'movie' ? 'movie' : 'series'
        const mfUrl = `https://mediafusion.elfhosted.com/stream/${mfType}/${imdbId}.json`
        console.log(`[Torrent] Fetching MediaFusion: ${mfUrl}`)
        const mfData: any = await nodeHttpGet(mfUrl, 6000)
        if (mfData && mfData.streams) {
          for (const stream of mfData.streams) {
            const parsed = parseTorrentioStream(stream, title) // Same stream format as Torrentio
            if (parsed) {
              parsed.title = parsed.title ? `${parsed.title}` : `${title} (MF)`
              sources.push(parsed)
            }
          }
          console.log(`[Torrent] MediaFusion returned ${mfData.streams.length} streams`)
        }
      } catch (err: any) {
        console.error('[Torrent] MediaFusion fetch failed:', err.message)
      }
    }

    // G. SolidTorrents: Excellent coverage for Indian/Hindi content
    try {
      const solidQueries = [
        mediaType === 'movie' ? `${title} ${year} Hindi` : `${title} Hindi`,
        `${title} Dual Audio`
      ]
      
      for (const q of solidQueries) {
        const solidUrl = `https://solidtorrents.to/api/v1/search?q=${encodeURIComponent(q)}&category=all&sort=seeders`
        console.log(`[Torrent] Fetching SolidTorrents: ${solidUrl}`)
        const solidData: any = await nodeHttpGet(solidUrl, 5000)
        if (solidData && solidData.results) {
          for (const t of solidData.results) {
            const seeds = t.swarm?.seeders || 0
            if (seeds < 1) continue

            const titleName = t.title || ''
            if (!isRelevanceMatch(titleName, title, mediaType, year)) continue

            sources.push({
              title: `${titleName.substring(0, 80)} (Solid)`,
              quality: titleName.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
              size: formatBytes(t.size || 0),
              magnet: t.magnet || `magnet:?xt=urn:btih:${t.infoHash}&dn=${encodeURIComponent(titleName)}`,
              seeds,
              peers: t.swarm?.leechers || 0,
              type: 'web',
              isHindi: isHindiContent(titleName)
            })
          }
        }
      }
    } catch (err: any) {
      console.error('[Torrent] SolidTorrents fetch failed:', err.message)
    }

    // H. Bitsearch: Targeted multi-keyword search for Hindi sites (KatmovieHD, HDhub4u, etc.)
    const siteKeywords = [
      'Hindi', 'KatmovieHD', 'HDhub4u', 'Vegamovies', 'UHDmovies', 
      'Dotmovies', 'Bolly4u', 'Hdmovies4u', '1TamilMV', 'TamilMV', 
      'Moviesflix', 'Filmyzilla', 'Downloadhub', 'TamilBlasters', '7starhd'
    ]
    const queryYear = (mediaType === 'movie' && year) ? ` ${year}` : ''
    
    // Use a smaller batch size for parallel requests to avoid being blocked or timing out
    const keywordBatches = []
    const batchSize = 4
    for (let i = 0; i < siteKeywords.length; i += batchSize) {
      keywordBatches.push(siteKeywords.slice(i, i + batchSize))
    }

    for (const batch of keywordBatches) {
      await Promise.all(batch.map(async (keyword) => {
        try {
          const query = `${title}${queryYear} ${keyword}`
          const bitUrl = `https://bitsearch.to/search?q=${encodeURIComponent(query)}&sort=seeders`
          const html = await nodeHttpRequest(bitUrl, { timeoutMs: 8000 }) 
          if (typeof html === 'string') {
            // Robust regex for Bitsearch results
            const resultRegex = /<li class="search-result[\s\S]*?<h3 class="title">[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>[\s\S]*?<div class="stats">[\s\S]*?<div>[\s\S]*?([0-9.]+\s*[GMK]B)[\s\S]*?<div>[\s\S]*?([0-9,]+)[\s\S]*?<div>[\s\S]*?([0-9,]+)[\s\S]*?<a class="dl-magnet" href="([^"]+)"/g
            let match
            while ((match = resultRegex.exec(html)) !== null) {
              const [, , tTitle, tSize, tSeeds, tPeers, tMagnet] = match
              const cleanTitle = tTitle.trim()
              const seeds = parseInt(tSeeds.replace(/,/g, '')) || 0
              if (seeds < 1) continue
              if (!isRelevanceMatch(cleanTitle, title, mediaType, year)) continue

              sources.push({
                title: `${cleanTitle.substring(0, 80)} (Bit)`,
                quality: cleanTitle.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
                size: tSize.trim(),
                magnet: tMagnet,
                seeds,
                peers: parseInt(tPeers.replace(/,/g, '')) || 0,
                type: 'web',
                isHindi: isHindiContent(cleanTitle)
              })
            }
          }
        } catch (e) {}
      }))
    }

    // H2. 1337x: High-quality results often including Hindi/Dual-Audio
    try {
      const x1337Mirrors = ['1337x.to', '1337x.st', 'x1337x.ws']
      const xQuery = mediaType === 'movie' ? `${title} ${year} Hindi` : `${title} Hindi`
      
      for (const domain of x1337Mirrors) {
        try {
          const xUrl = `https://${domain}/sort-search/${encodeURIComponent(xQuery)}/seeders/desc/1/`
          const html = await nodeHttpRequest(xUrl, { timeoutMs: 6000 })
          if (typeof html === 'string') {
            // Regex for 1337x search results table
            const rowRegex = /<td class="coll-1 name">[\s\S]*?<a href="\/torrent\/(\d+)\/([^/]+)\/">([^<]+)<\/a>[\s\S]*?<td class="coll-2 seeds">(\d+)<\/td>[\s\S]*?<td class="coll-3 leeches">(\d+)<\/td>[\s\S]*?<td class="coll-4 size">([^<]+)<span/g
            let match
            const torrentsToFetch = []
            while ((match = rowRegex.exec(html)) !== null) {
              const [ , tId, tSlug, tTitle, tSeeds, tLeeches, tSize] = match
              const seeds = parseInt(tSeeds) || 0
              if (seeds < 1) continue
              if (!isRelevanceMatch(tTitle, title, mediaType, year)) continue
              
              torrentsToFetch.push({ id: tId, slug: tSlug, title: tTitle, seeds, peers: parseInt(tLeeches) || 0, size: tSize.trim() })
              if (torrentsToFetch.length >= 5) break // Limit to top 5 for speed
            }

            // Fetch magnets for the top results (1337x requires a separate page load for magnet)
            await Promise.all(torrentsToFetch.map(async (t) => {
              try {
                const detailUrl = `https://${domain}/torrent/${t.id}/${t.slug}/`
                const detailHtml = await nodeHttpRequest(detailUrl, { timeoutMs: 5000 })
                const magnetMatch = detailHtml.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/)
                if (magnetMatch) {
                  sources.push({
                    title: `${t.title.substring(0, 80)} (1337x)`,
                    quality: t.title.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
                    size: t.size,
                    magnet: magnetMatch[1],
                    seeds: t.seeds,
                    peers: t.peers,
                    type: 'web',
                    isHindi: isHindiContent(t.title)
                  })
                }
              } catch (e) {}
            }))
            
            if (torrentsToFetch.length > 0) break // Success, don't try other mirrors
          }
        } catch (e) {}
      }
    } catch (err: any) {}

    // I. Secondary Search: Title-based search on APIBay for Hindi content
    try {
      const searchTitle = `${title}${queryYear} Hindi`
      const apibayTitleUrl = `https://apibay.org/q.php?q=${encodeURIComponent(searchTitle)}`
      const apiBayData: any = await nodeHttpGet(apibayTitleUrl, 5000)
      
      if (Array.isArray(apiBayData) && apiBayData[0]?.id !== '0') {
        for (const t of apiBayData) {
          const seeders = parseInt(t.seeders) || 0
          if (seeders < 1) continue
          
          const titleName = t.name || ''
          if (isHindiContent(titleName) && isRelevanceMatch(titleName, title, mediaType, year)) {
            sources.push({
              title: `${titleName.substring(0, 80)} (TPB-HI)`,
              quality: titleName.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
              size: formatBytes(parseInt(t.size) || 0),
              magnet: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(titleName)}`,
              seeds: seeders,
              peers: parseInt(t.leechers) || 0,
              type: 'web',
              isHindi: true
            })
          }
        }
      }
    } catch (err: any) {}

    // J. Dedicated Hindi/Dubbed Aggregators (KnightCrawler)
    if (imdbId) {
      try {
        const kcUrl = `https://knightcrawler.elfhosted.com/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
        const kcData: any = await nodeHttpGet(kcUrl, 6000)
        if (kcData && kcData.streams) {
          for (const stream of kcData.streams) {
            if (isHindiContent(stream.title || '')) {
              const parsed = parseTorrentioStream(stream, title)
              if (parsed) {
                parsed.title = `${parsed.title} (KC)`
                sources.push(parsed)
              }
            }
          }
        }
      } catch (err: any) {}
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

    // Sort heavily by requirements ΓÇö Hindi content and premium sites prioritized
    enrichedSources.sort((a, b) => {
      const scoreA = getHindiScore(a.title)
      const scoreB = getHindiScore(b.title)

      if (mediaType === 'movie') {
        // Priority 1: Hindi Score (includes site priority)
        if (scoreA !== scoreB) return scoreB - scoreA
        
        // Priority 2: Seeds
        return b.seeds - a.seeds
      } else {
        // TV Series logic
        // Both are Season Packs
        if (a.isSeasonPack && b.isSeasonPack) {
          if (a.parsedSeason !== b.parsedSeason) return (a.parsedSeason || 0) - (b.parsedSeason || 0)
          
          // Same season pack: Hindi score first
          if (scoreA !== scoreB) return scoreB - scoreA
          return b.seeds - a.seeds
        }
        
        // Pack vs Episode
        if (a.isSeasonPack && !b.isSeasonPack) return -1
        if (!a.isSeasonPack && b.isSeasonPack) return 1

        // Both are Episodes
        if (a.parsedSeason !== b.parsedSeason) return (a.parsedSeason || 0) - (b.parsedSeason || 0)
        if (a.parsedEpisode !== b.parsedEpisode) return (a.parsedEpisode || 0) - (b.parsedEpisode || 0)
        
        // Same Episode: Hindi score first, then seeds
        if (scoreA !== scoreB) return scoreB - scoreA
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

// ΓöÇΓöÇΓöÇ IPC: Start Torrent Download ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

async function startWebTorrent(torrentId: string, magnetUrl: string, title: string, initialProgress: number = 0) {
  const client = await getWebTorrentClient()
  const downloadPath = getDownloadPath()

  console.log(`[Torrent] Starting download: "${title}" -> ${downloadPath}`)
  console.log(`[Torrent] Magnet: ${magnetUrl.slice(0, 80)}...`)

  broadcastProgress(torrentId, { downloadSpeed: 0, timeRemaining: 0, length: 0, downloaded: 0, progress: initialProgress / 100, name: title } as any, 'downloading')

  const torrent = client.add(magnetUrl, { 
    path: downloadPath,
    announce: EXTRA_TRACKERS
  })
  console.log(`[Torrent] Added to client. infoHash: ${torrent.infoHash}`)
  
  torrent._myCinemaTitle = title
  
  // Set internal name as soon as we can, even before 'ready'
  // WebTorrent often sets .name from the magnet 'dn' parameter if available
  if (torrent.name) {
    torrent._myCinemaName = torrent.name
  }

  activeTorrents.set(torrentId, torrent)

  torrent.on('ready', () => {
    console.log(`[Torrent] Metadata resolved: ${torrent.name} (${formatBytes(torrent.length)})`)
    console.log(`[Torrent] Peers: ${torrent.numPeers}`)
    torrent._myCinemaName = torrent.name
    broadcastProgress(torrentId, torrent, torrent.paused ? 'paused' : 'downloading')
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
    if (dl.status === 'downloading' || dl.status === 'connecting') {
      console.log(`[AutoResume] Resuming incomplete download: ${dl.title}`)
      try {
        await startWebTorrent(dl.id, dl.magnet, dl.title, dl.progress || 0)
      } catch (e: any) {
        console.error(`[AutoResume] Failed to resume ${dl.id}:`, e.message)
      }
    }
  }
}

ipcMain.handle('start-torrent-download', async (_, magnetUrl: string, title: string, tmdbId?: number) => {
  try {
    const torrentId = crypto.randomUUID()
    
    db.addDownload({
      id: torrentId,
      title,
      magnet: magnetUrl,
      status: 'downloading',
      tmdbId
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
    
    // Capture state before destroying
    const finalProgress = torrent ? torrent.progress : null
    const finalLength = torrent ? torrent.length : null
    const finalDownloaded = torrent ? torrent.downloaded : null

    if (torrent && !torrent.destroyed) {
      torrent.destroy()
    }
    activeTorrents.delete(id)
    
    const dlDbData = db.getDownloads().find((d: any) => d.id === id)
    if (dlDbData) {
      dlDbData.status = 'paused'
      db.updateDownload(dlDbData)
      // Broadcast it so UI updates immediately
      broadcastProgress(id, { 
        downloadSpeed: 0, 
        timeRemaining: 0, 
        length: finalLength || 0, 
        downloaded: finalDownloaded || 0, 
        progress: finalProgress !== null ? finalProgress : (dlDbData.progress / 100), 
        name: dlDbData.title 
      } as any, 'paused')
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
    
    // Capture state before destroying
    const finalProgress = torrent.progress
    const finalLength = torrent.length
    const finalDownloaded = torrent.downloaded
    
    torrent.destroy()
    activeTorrents.delete(id)
    
    const dlDbData = db.getDownloads().find((d: any) => d.id === id)
    if (dlDbData) {
      dlDbData.status = 'paused'
      db.updateDownload(dlDbData)
      broadcastProgress(id, { 
        downloadSpeed: 0, 
        timeRemaining: 0, 
        length: finalLength || 0, 
        downloaded: finalDownloaded || 0, 
        progress: finalProgress, 
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
ipcMain.handle('remove-download', async (_, id: string, deleteFile: boolean = false) => {
  try {
    const torrent = activeTorrents.get(id)
    let folderName = ''
    
    // 1. Get folder name if possible
    if (torrent) {
      folderName = torrent.name
    } else {
      const dbDl = db.getDownloads().find((d: any) => d.id === id)
      if (dbDl) folderName = dbDl.name
    }

    // 2. Stop and remove from memory
    if (torrent) {
      if (!torrent.destroyed) {
        torrent.destroy()
      }
      activeTorrents.delete(id)
    }
    
    // 3. Delete from DB
    db.removeDownloadRow(id)

    // 4. Optionally delete physical files
    if (deleteFile && folderName) {
      // Run deletion in background and don't let it block success of UI removal
      // We also wait a tiny bit to allow WebTorrent to release file handles
      setTimeout(() => {
        try {
          const downloadRoot = getDownloadPath()
          const dlPath = path.resolve(downloadRoot, folderName)
          if (!isPathInsideRoot(dlPath, downloadRoot) || dlPath === path.resolve(downloadRoot)) {
            console.warn(`[Torrent] Refusing unsafe delete path: ${dlPath}`)
            return
          }
          if (fs.existsSync(dlPath)) {
            console.log(`[Torrent] Deleting physical files at: ${dlPath}`)
            fs.rmSync(dlPath, { recursive: true, force: true })
          }
        } catch (err: any) {
          console.error(`[Torrent] Physical file deletion failed for ${folderName}:`, err.message)
          // Retry once more after 2 seconds if it failed (likely due to file lock)
          setTimeout(() => {
            try {
              const downloadRoot = getDownloadPath()
              const dlPath = path.resolve(downloadRoot, folderName)
              if (!isPathInsideRoot(dlPath, downloadRoot) || dlPath === path.resolve(downloadRoot)) return
              if (fs.existsSync(dlPath)) fs.rmSync(dlPath, { recursive: true, force: true })
            } catch (e) {}
          }, 2000)
        }
      }, 200)
    }
    
    return true
  } catch (err) {
    console.error('[Torrent] Remove error:', err)
    return false
  }
})

// ─── OpenSubtitles: Search Subtitles ─────────────────────────────────────────
ipcMain.handle('search-opensubtitles', async (_, params: {
  query?: string
  tmdbId?: number
  season?: number
  episode?: number
  languages?: string
  mediaType?: string
  videoFilePath?: string
}) => {
  if (!OPENSUBTITLES_API_KEY) {
    console.error('[OpenSubtitles] No API key configured')
    return { error: 'No OpenSubtitles API key configured. Add MAIN_VITE_OPENSUBTITLES_API_KEY to your .env file.' }
  }

  try {
    const searchParams = new URLSearchParams()
    const videoFilePath = params.videoFilePath && isSafeFilePath(params.videoFilePath)
      ? params.videoFilePath
      : undefined
    const fileHash = videoFilePath ? computeOpenSubtitlesHash(videoFilePath) : null

    if (params.tmdbId) {
      searchParams.set('tmdb_id', params.tmdbId.toString())
      if (params.mediaType === 'tv' || params.mediaType === 'series') {
        searchParams.set('type', 'episode')
      }
    } else if (params.query) {
      searchParams.set('query', params.query)
    } else {
      return { error: 'No search query or TMDB ID provided' }
    }

    if (params.season) searchParams.set('season_number', params.season.toString())
    if (params.episode) searchParams.set('episode_number', params.episode.toString())
    if (fileHash) {
      searchParams.set('moviehash', fileHash.moviehash)
      searchParams.set('moviebytesize', fileHash.moviebytesize.toString())
    }
    searchParams.set('languages', params.languages || 'en,hi')
    searchParams.set('order_by', 'download_count')
    searchParams.set('order_direction', 'desc')

    const url = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams.toString()}`
    console.log('[OpenSubtitles] Searching:', url)

    // Use Electron's net.fetch (Chromium network stack) to bypass ISP blocks
    const response = await net.fetch(url, {
      method: 'GET',
      headers: {
        'Api-Key': OPENSUBTITLES_API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'MyCinema v1.7',
      },
    })

    const data = await response.json()

    if (data.errors || data.error) {
      console.error('[OpenSubtitles] API error:', data.errors || data.error)
      return { error: data.errors?.[0] || data.error || 'API request failed' }
    }

    const results = (data.data || []).map((item: any) => {
      const attrs = item.attributes || {}
      const bestFile = attrs.files?.[0]
      const releaseName = attrs.release || attrs.feature_details?.movie_name || 'Subtitle'
      const fileName = bestFile?.file_name || 'subtitle.srt'
      const hashMatch = Boolean(attrs.moviehash_match)
      const releaseMatchScore = scoreSubtitleReleaseMatch(videoFilePath, releaseName, fileName)
      return {
        id: item.id,
        fileId: bestFile?.file_id,
        language: attrs.language || 'unknown',
        releaseName,
        downloadCount: attrs.download_count || 0,
        fileName,
        rating: attrs.ratings || 0,
        hashMatch,
        releaseMatchScore,
        hearingImpaired: attrs.hearing_impaired || false,
        aiTranslated: attrs.ai_translated || false,
        machineTranslated: attrs.machine_translated || false,
      }
    }).filter((result: any) => result.fileId)
      .sort((a: any, b: any) => {
        if (a.hashMatch !== b.hashMatch) return a.hashMatch ? -1 : 1
        if (a.releaseMatchScore !== b.releaseMatchScore) return b.releaseMatchScore - a.releaseMatchScore
        return (b.downloadCount || 0) - (a.downloadCount || 0)
      })

    console.log(`[OpenSubtitles] Found ${results.length} results`)
    return { results }
  } catch (err: any) {
    console.error('[OpenSubtitles] Search error:', err.message)
    return { error: err.message }
  }
})

// ─── OpenSubtitles: Download Subtitle ────────────────────────────────────────
ipcMain.handle('download-opensubtitle', async (_, params: {
  fileId: number
  videoFilePath: string
  fileName?: string
}) => {
  if (!OPENSUBTITLES_API_KEY) {
    return { error: 'No OpenSubtitles API key configured' }
  }
  if (!isSafeFilePath(params.videoFilePath)) {
    console.error(`[OpenSubtitles] 403 Forbidden video path: ${params.videoFilePath}`)
    return { error: 'Invalid video path' }
  }

  try {
    // Step 1: Request download link from OpenSubtitles
    console.log(`[OpenSubtitles] Requesting download link for file_id: ${params.fileId}`)
    const dlResponse = await net.fetch('https://api.opensubtitles.com/api/v1/download', {
      method: 'POST',
      headers: {
        'Api-Key': OPENSUBTITLES_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'MyCinema v1.7',
      },
      body: JSON.stringify({ file_id: params.fileId }),
    })

    const dlData = await dlResponse.json()

    if (dlData.errors || dlData.error) {
      console.error('[OpenSubtitles] Download API error:', dlData)
      return { error: dlData.errors?.[0] || dlData.error || 'Download request failed' }
    }

    const downloadUrl = dlData.link
    if (!downloadUrl) {
      return { error: 'No download link received from OpenSubtitles' }
    }

    const remaining = dlData.remaining
    console.log(`[OpenSubtitles] Download link received. Remaining downloads today: ${remaining}`)

    // Step 2: Download the SRT file content using Electron's net.fetch
    const srtResponse = await net.fetch(downloadUrl)
    const srtContent = await srtResponse.text()

    // Step 3: Save the SRT file alongside the video
    const videoDir = path.dirname(params.videoFilePath)
    const videoBaseName = path.basename(params.videoFilePath, path.extname(params.videoFilePath))
    const srtPath = path.join(videoDir, `${videoBaseName}.opensubtitles.${params.fileId}.srt`)

    fs.writeFileSync(srtPath, srtContent, 'utf-8')
    console.log(`[OpenSubtitles] Saved subtitle to: ${srtPath}`)

    // Step 4: Pre-convert to WebVTT for the player
    const subsDir = path.join(app.getPath('userData'), 'subtitles')
    if (!fs.existsSync(subsDir)) fs.mkdirSync(subsDir, { recursive: true })
    const hash = crypto.createHash('sha1').update(`${srtPath}-0`).digest('hex').slice(0, 16)
    const vttPath = path.join(subsDir, `${hash}.vtt`)

    // Remove stale cache if exists
    if (fs.existsSync(vttPath)) fs.unlinkSync(vttPath)

    const vttResult: string | null = await new Promise((resolve) => {
      ffmpeg(srtPath)
        .outputOptions(['-map 0:0', '-c:s webvtt', '-f webvtt'])
        .output(vttPath)
        .on('end', () => {
          console.log(`[OpenSubtitles] Converted to VTT: ${vttPath}`)
          resolve(vttPath)
        })
        .on('error', (err) => {
          console.error('[OpenSubtitles] VTT conversion failed:', err.message)
          if (fs.existsSync(vttPath)) try { fs.unlinkSync(vttPath) } catch {}
          resolve(null)
        })
        .run()
    })

    return {
      srtPath,
      vttPath: vttResult,
      remaining,
    }
  } catch (err: any) {
    console.error('[OpenSubtitles] Download error:', err.message)
    return { error: err.message }
  }
})
