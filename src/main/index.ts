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
import { AsyncLocalStorage } from 'async_hooks'

function isExpectedCloseAbort(error: unknown): boolean {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error)

  return message.includes('OperationError') &&
    message.includes('User-Initiated Abort') &&
    message.includes('Close called')
}

process.on('uncaughtException', (error) => {
  if (isExpectedCloseAbort(error)) {
    console.warn('[Shutdown] Ignored expected close-abort from pending async work:', error.message)
    return
  }

  console.error('[Main] Uncaught exception:', error)
  throw error
})

process.on('unhandledRejection', (reason) => {
  if (isExpectedCloseAbort(reason)) {
    console.warn('[Shutdown] Ignored expected close-abort rejection from pending async work:', reason)
    return
  }

  console.error('[Main] Unhandled rejection:', reason)
})

// Custom DNS resolver using Google/Cloudflare to bypass ISP blocks
const customDns = new dns.Resolver()
customDns.setServers(['8.8.8.8', '1.1.1.1'])

const devProfileRoot = process.env.MYCINEMA_USER_DATA_DIR
if (is.dev && devProfileRoot) {
  fs.mkdirSync(devProfileRoot, { recursive: true })
  app.setPath('userData', devProfileRoot)
  console.log(`[Dev] Using MyCinema profile: ${devProfileRoot}`)
}

function resolveHostname(hostname: string, timeoutMs: number = 1500, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', handleAbort)
    }
    const finish = (value: string) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    const handleAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => finish(hostname), timeoutMs)
    signal?.addEventListener('abort', handleAbort, { once: true })

    customDns.resolve4(hostname, (err, addresses) => {
      if (err || !addresses?.length) {
        // Fallback: try system DNS, then let https use the hostname normally.
        dns.lookup(hostname, { family: 4 }, (err2, address) => {
          if (err2 || !address) finish(hostname)
          else finish(address)
        })
      } else {
        finish(addresses[0])
      }
    })
  })
}

const torrentSourceAbortContext = new AsyncLocalStorage<AbortSignal>()

function getActiveTorrentSourceSignal(): AbortSignal | undefined {
  return torrentSourceAbortContext.getStore()
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message === 'Aborted')
}

function parseHttpResponse(data: string): any {
  try { return JSON.parse(data) } catch { return data }
}

function nodeHttpsRequestOnce(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number; resolvedHost?: string; redirectsCount?: number; signal?: AbortSignal } = {}
): Promise<string> {
  const { method = 'GET', headers = {}, body, timeoutMs = 10000, resolvedHost, redirectsCount = 0, signal = getActiveTorrentSourceSignal() } = opts
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    let req: any = null
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', handleAbort)
    }
    const finishResolve = (value: string | Promise<string>) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    const finishReject = (err: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }
    const handleAbort = () => {
      if (req) req.destroy()
      finishReject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      if (req) req.destroy()
      finishReject(new Error(`Timeout ${method} ${url} after ${timeoutMs}ms`))
    }, timeoutMs)
    signal?.addEventListener('abort', handleAbort, { once: true })

    try {
      const parsed = new URL(url)
      const requestOpts: any = {
        hostname: resolvedHost || parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MyCinema/1.20',
          'Accept': 'application/json,text/html;q=0.9,*/*;q=0.8',
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
          if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirectsCount < 3) {
            let redirectUrl = res.headers.location
            if (redirectUrl.startsWith('/')) {
              const parsed = new URL(url)
              redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`
            }
            const newOpts = { ...opts, redirectsCount: redirectsCount + 1 }
            delete newOpts.resolvedHost
            finishResolve(nodeHttpsRequestOnce(redirectUrl, newOpts))
            return
          }
          if (res.statusCode && res.statusCode >= 400) {
            finishReject(new Error(`HTTP ${res.statusCode} fetching ${url}`))
            return
          }
          finishResolve(data)
        })
      }).on('error', (err) => {
        finishReject(err)
      })
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout ${method} ${url} after ${timeoutMs}ms`)))

      if (body) req.write(body)
      req.end()
    } catch (err) {
      finishReject(err)
    }
  })
}

// Make HTTPS GET requests using the OS resolver first; custom DNS is only a fallback.
function nodeHttpGet(url: string, timeoutMs: number = 10000): Promise<any> {
  return nodeHttpRequest(url, { timeoutMs }).then((data) => {
    if (typeof data !== 'string') return data
    try { return JSON.parse(data) } catch { return null }
  })
}

// Generic HTTPS request helper — supports GET/POST + custom headers (needed for OpenSubtitles API)
async function nodeHttpRequest(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<any> {
  const signal = opts.signal || getActiveTorrentSourceSignal()
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  try {
    return parseHttpResponse(await nodeHttpsRequestOnce(url, { ...opts, signal }))
  } catch (directErr) {
    if (signal?.aborted || isAbortError(directErr)) throw directErr
    const parsed = new URL(url)
    const resolvedHost = await resolveHostname(parsed.hostname, 1500, signal)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (resolvedHost === parsed.hostname) throw directErr
    if (process.env.MYCINEMA_DEBUG_DNS === '1') {
      console.log(`[DNS fallback] ${parsed.hostname} -> ${resolvedHost}`)
    }
    return parseHttpResponse(await nodeHttpsRequestOnce(url, { ...opts, resolvedHost, signal }))
  }
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

const YOUTUBE_EMBED_ORIGIN = 'https://mycinema.app'

function setupYoutubeEmbedHeaders(): void {
  const filter = {
    urls: [
      'https://www.youtube.com/embed/*',
      'https://www.youtube-nocookie.com/embed/*'
    ]
  }

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const requestHeaders = {
      ...details.requestHeaders,
      Referer: `${YOUTUBE_EMBED_ORIGIN}/`,
      Origin: YOUTUBE_EMBED_ORIGIN
    }

    callback({ requestHeaders })
  })
}

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
  },
  {
    scheme: 'torrent',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      allowServiceWorkers: false,
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

type AppSettings = {
  launchFullscreen: boolean
}

const defaultAppSettings: AppSettings = {
  launchFullscreen: true
}

function getAppSettingsPath() {
  return join(app.getPath('userData'), 'app-settings.json')
}

function loadAppSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(getAppSettingsPath(), 'utf8')
    return { ...defaultAppSettings, ...JSON.parse(raw) }
  } catch {
    return defaultAppSettings
  }
}

function saveAppSettings(settings: AppSettings) {
  fs.writeFileSync(getAppSettingsPath(), JSON.stringify(settings))
}

function createWindow(): void {
  const state = loadWindowState()
  const settings = loadAppSettings()

  const mainWindow = new BrowserWindow({
    width: state.width || 1200,
    height: state.height || 800,
    x: state.x,
    y: state.y,
    show: false,
    fullscreen: settings.launchFullscreen,
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
  if (state.isMaximized && !mainWindow.isFullScreen()) {
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
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('window-fullscreen-changed', true))
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('window-fullscreen-changed', false))

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (settings.launchFullscreen) {
      mainWindow.setFullScreen(true)
      setTimeout(() => {
        if (!mainWindow.isDestroyed() && !mainWindow.isFullScreen()) {
          mainWindow.setFullScreen(true)
        }
      }, 250)
    }
    setupAutoUpdater(mainWindow)
    // Kick off startup scan after window is visible (non-blocking)
    setImmediate(() => {
      runStartupScan().catch(err => console.error('[Startup] Scan error:', err))
      autoResumeDownloads().catch(err => console.error('[Startup] Auto-resume error:', err))
    })
    handleCommandLine(process.argv, mainWindow)
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
function parseRangeHeader(range: string, fileSize: number): { start: number; end: number } | null {
  const match = range.match(/^bytes=(\d*)-(\d*)/)
  if (!match || fileSize <= 0) return null

  const [, rawStart, rawEnd] = match
  let start: number
  let end: number

  if (rawStart === '' && rawEnd === '') return null

  if (rawStart === '') {
    const suffixLength = Number.parseInt(rawEnd, 10)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null
    start = Math.max(fileSize - suffixLength, 0)
    end = fileSize - 1
  } else {
    start = Number.parseInt(rawStart, 10)
    end = rawEnd ? Number.parseInt(rawEnd, 10) : fileSize - 1
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  }

  if (start < 0 || start >= fileSize || end < start) return null
  return { start, end: Math.min(end, fileSize - 1) }
}

function getContentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.mkv') return 'video/x-matroska'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.avi') return 'video/x-msvideo'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.m4v') return 'video/mp4'
  return 'video/mp4'
}

function waitForTorrentReady(torrent: any, timeoutMs = 25000): Promise<void> {
  if (!torrent || torrent.destroyed) return Promise.reject(new Error('Torrent is not active'))
  if (torrent.ready || (Array.isArray(torrent.files) && torrent.files.length > 0)) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      torrent.removeListener?.('ready', onReady)
      torrent.removeListener?.('error', onError)
    }
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = (err: Error) => {
      cleanup()
      reject(err)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Torrent metadata is not ready yet'))
    }, timeoutMs)

    torrent.once?.('ready', onReady)
    torrent.once?.('error', onError)
  })
}

function getPlayableTorrentFile(torrent: any): any | null {
  if (!torrent || !Array.isArray(torrent.files)) return null
  const videoFiles = torrent.files.filter((file: any) => isVideoFilePath(file?.path || file?.name))
  if (videoFiles.length === 0) return null
  return videoFiles.sort((a: any, b: any) => (b.length || 0) - (a.length || 0))[0]
}

async function getPreparedTorrentFile(downloadId: string): Promise<any> {
  const torrent = activeTorrents.get(downloadId)
  if (!torrent || torrent.destroyed) throw new Error('Download is not active')

  await waitForTorrentReady(torrent)
  const file = getPlayableTorrentFile(torrent)
  if (!file) throw new Error('No playable video file found in this torrent')

  try {
    for (const other of torrent.files || []) {
      if (other === file) other.select?.()
      else other.deselect?.()
    }
  } catch (err) {
    console.warn('[TorrentStream] Could not reprioritize torrent files:', err)
  }

  return file
}

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

      const contentType = getContentTypeForPath(normalizedPath)

      if (range) {
        const parsedRange = parseRangeHeader(range, fileSize)
        if (!parsedRange) {
          return new Response(null, {
            status: 416,
            statusText: 'Range Not Satisfiable',
            headers: {
              'Content-Range': `bytes */${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'no-cache'
            }
          })
        }

        const { start, end } = parsedRange
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

  protocol.handle('torrent', async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'stream') return new Response('Not Found', { status: 404 })

      const downloadId = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!downloadId) return new Response('Missing download id', { status: 400 })

      const file = await getPreparedTorrentFile(downloadId)
      const fileSize = Number(file.length || 0)
      if (!fileSize) return new Response('File is not ready', { status: 503 })

      const range = request.headers.get('range')
      const contentType = getContentTypeForPath(file.path || file.name || '')

      if (range) {
        const parsedRange = parseRangeHeader(range, fileSize)
        if (!parsedRange) {
          return new Response(null, {
            status: 416,
            statusText: 'Range Not Satisfiable',
            headers: {
              'Content-Range': `bytes */${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'no-cache'
            }
          })
        }

        const { start, end } = parsedRange
        const chunksize = (end - start) + 1
        const stream = file.createReadStream({ start, end })
        return new Response(stream as any, {
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
      }

      const stream = file.createReadStream()
      return new Response(stream as any, {
        headers: {
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType,
          'Cache-Control': 'no-cache'
        }
      })
    } catch (error: any) {
      console.error('[TorrentStream] Failed to serve torrent stream:', error)
      return new Response(error?.message || 'Torrent stream unavailable', { status: 503 })
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
        .outputOptions([
          `-map 0:${trackIndex}`,
          '-vn',
          '-sn',
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

const APP_PROTOCOL = 'mycinema'

type SharedMediaTarget = {
  type: 'movie' | 'series'
  tmdbId: number
  source?: {
    title: string
    quality?: string
    size?: string
    magnet: string
    seeds?: number
    peers?: number
    isHindi?: boolean
  }
}

const allowDevMultiClient = is.dev && process.env.MYCINEMA_MULTI_CLIENT === '1'
const gotTheLock = allowDevMultiClient || app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

let pendingExternalFilePath: string | null = null;
let pendingSharedMediaTarget: SharedMediaTarget | null = null
const allowedExternalDirs = new Set<string>();

if (!allowDevMultiClient) {
  app.on('second-instance', (_event, commandLine, _workingDirectory) => {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      handleCommandLine(commandLine, mainWindow)
    }
  })
}

function parseSharedMediaUrl(rawUrl: string): SharedMediaTarget | null {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== `${APP_PROTOCOL}:`) return null

    const hostType = parsed.hostname.toLowerCase()
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    const rawType = hostType || pathParts[0] || ''
    const rawId = hostType ? pathParts[0] : pathParts[1]
    const type = rawType === 'tv' ? 'series' : rawType
    const tmdbId = Number.parseInt(rawId || parsed.searchParams.get('tmdbId') || parsed.searchParams.get('id') || '', 10)

    if ((type !== 'movie' && type !== 'series') || !Number.isFinite(tmdbId) || tmdbId <= 0) {
      return null
    }

    let source: SharedMediaTarget['source']
    const encodedSource = parsed.searchParams.get('source')
    if (encodedSource) {
      try {
        const normalized = encodedSource.replace(/-/g, '+').replace(/_/g, '/')
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
        const parsedSource = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
        if (
          parsedSource &&
          typeof parsedSource.title === 'string' &&
          typeof parsedSource.magnet === 'string' &&
          parsedSource.magnet.startsWith('magnet:')
        ) {
          source = {
            title: parsedSource.title,
            quality: typeof parsedSource.quality === 'string' ? parsedSource.quality : undefined,
            size: typeof parsedSource.size === 'string' ? parsedSource.size : undefined,
            magnet: parsedSource.magnet,
            seeds: typeof parsedSource.seeds === 'number' ? parsedSource.seeds : undefined,
            peers: typeof parsedSource.peers === 'number' ? parsedSource.peers : undefined,
            isHindi: Boolean(parsedSource.isHindi)
          }
        }
      } catch {
        source = undefined
      }
    }

    return { type, tmdbId, source }
  } catch {
    return null
  }
}

function dispatchSharedMediaTarget(target: SharedMediaTarget, mainWindow: BrowserWindow | null) {
  pendingSharedMediaTarget = target
  if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('open-shared-media', target)
  }
}

function handleCommandLine(argv: string[], mainWindow: BrowserWindow | null) {
  const sharedUrl = argv.find(arg => arg.startsWith(`${APP_PROTOCOL}://`))
  if (sharedUrl) {
    const target = parseSharedMediaUrl(sharedUrl)
    if (target) {
      dispatchSharedMediaTarget(target, mainWindow)
      return
    }
  }

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

app.on('open-url', (event, url) => {
  event.preventDefault()
  const target = parseSharedMediaUrl(url)
  if (!target) return
  const mainWindow = BrowserWindow.getAllWindows()[0] || null
  dispatchSharedMediaTarget(target, mainWindow)
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

const MAX_SEEK_PREVIEW_JOBS = 2
const seekPreviewJobs = new Map<string, Promise<string | null>>()

function getSeekPreviewCachePath(filePath: string, time: number): string | null {
  try {
    const normalizedPath = path.normalize(filePath)
    const stat = fs.statSync(normalizedPath)
    const cacheRoot = path.join(app.getPath('userData'), 'seek_previews')
    const cacheKey = crypto
      .createHash('sha1')
      .update(`${normalizedPath}:${stat.size}:${stat.mtimeMs}`)
      .digest('hex')
    const cacheDir = path.join(cacheRoot, cacheKey)
    const bucketTime = Math.max(0, Math.floor(time / 5) * 5)

    return path.join(cacheDir, `${bucketTime.toString().padStart(6, '0')}.jpg`)
  } catch {
    return null
  }
}

function generateSeekPreviewThumbnail(filePath: string, time: number): Promise<string | null> {
  const normalizedPath = path.normalize(filePath)
  const localPath = getSeekPreviewCachePath(normalizedPath, time)
  if (!localPath) return Promise.resolve(null)

  if (fs.existsSync(localPath)) {
    try {
      if (fs.statSync(localPath).size > 0) return Promise.resolve(localPath)
      fs.unlinkSync(localPath)
    } catch {
      return Promise.resolve(null)
    }
  }

  const existingJob = seekPreviewJobs.get(localPath)
  if (existingJob) return existingJob
  if (seekPreviewJobs.size >= MAX_SEEK_PREVIEW_JOBS) return Promise.resolve(null)

  const job = new Promise<string | null>((resolve) => {
    fs.mkdirSync(path.dirname(localPath), { recursive: true })
    const bucketTime = Math.max(0, Math.floor(time / 5) * 5)

    ffmpeg(normalizedPath)
      .seekInput(bucketTime)
      .frames(1)
      .videoFilters('scale=-2:144')
      .outputOptions(['-q:v 10'])
      .output(localPath)
      .on('end', () => {
        try {
          if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
            resolve(localPath)
            return
          }
        } catch {}
        resolve(null)
      })
      .on('error', (err) => {
        console.warn(`[FFMPEG] Seek preview thumbnail failed: ${err.message}`)
        try {
          if (fs.existsSync(localPath) && fs.statSync(localPath).size === 0) fs.unlinkSync(localPath)
        } catch {}
        resolve(null)
      })
      .run()
  }).finally(() => {
    seekPreviewJobs.delete(localPath)
  })

  seekPreviewJobs.set(localPath, job)
  return job
}

type BackupImportSummary = {
  imported: boolean
  canceled?: boolean
  filePath?: string
  foldersAdded: number
  foldersScanned: number
  foldersMissing: number
  externalWatchlistImported: number
  localWatchlistRestored: number
  favoritesRestored: number
}

const BACKUP_FORMAT = 'mycinema.backup'
const BACKUP_VERSION = 1

function getBackupDefaultPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return join(app.getPath('documents'), `mycinema-backup-${stamp}.json`)
}

function parseBackupFile(filePath: string): any {
  const raw = fs.readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(raw)

  if (
    !parsed ||
    parsed.app !== 'MyCinema' ||
    parsed.format !== BACKUP_FORMAT ||
    typeof parsed.version !== 'number' ||
    !parsed.data
  ) {
    throw new Error('Selected file is not a valid MyCinema backup.')
  }

  return parsed
}



app.whenReady().then(() => {
  // Register media protocol
  registerMediaProtocol()
  registerSubtitleProtocol()
  registerAudioProtocol()
  setupYoutubeEmbedHeaders()
  db.initDb()
  electronApp.setAppUserModelId('com.electron')

  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [path.resolve(process.argv[1])])
  } else {
    app.setAsDefaultProtocolClient(APP_PROTOCOL)
  }

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
  torrentProgressIntervals.forEach(interval => clearInterval(interval))
  torrentProgressIntervals.clear()
  activeTorrents.forEach(t => { try { t.destroy() } catch {} })
  activeTorrents.clear()
  pausedTorrentIds.clear()
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

ipcMain.handle('window-minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.handle('window-toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false

  const nextState = !win.isFullScreen()
  win.setFullScreen(nextState)
  return nextState
})

ipcMain.handle('window-is-fullscreen', (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
})

ipcMain.handle('window-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle('get-app-settings', () => {
  return loadAppSettings()
})

ipcMain.handle('set-launch-fullscreen', (event, launchFullscreen: boolean) => {
  const settings = { ...loadAppSettings(), launchFullscreen }
  saveAppSettings(settings)

  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.setFullScreen(launchFullscreen)
  }

  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('app-settings-changed', settings)
  })

  return settings
})

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('get-videos', () => {
  return db.getVideos();
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
  return db.getContinueWatching();
})

ipcMain.handle('get-series-info', (_, seriesName) => {
  return db.getSeriesInfo(seriesName)
})

ipcMain.handle('get-folders', () => {
  return db.getFolders()
})

ipcMain.handle('export-user-backup', async () => {
  try {
    const result = await dialog.showSaveDialog({
      title: 'Export MyCinema Backup',
      defaultPath: getBackupDefaultPath(),
      filters: [
        { name: 'MyCinema Backup', extensions: ['json'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { exported: false, canceled: true }
    }

    const backup = {
      app: 'MyCinema',
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: db.getBackupData()
    }

    fs.writeFileSync(result.filePath, JSON.stringify(backup, null, 2), 'utf8')

    return {
      exported: true,
      filePath: result.filePath,
      folders: backup.data.folders.length,
      externalWatchlist: backup.data.watchlist.external.length,
      localWatchlist: backup.data.watchlist.local.length,
      favorites: backup.data.favorites.length
    }
  } catch (err) {
    console.error('[Backup] Export failed:', err)
    return {
      exported: false,
      error: err instanceof Error ? err.message : 'Export failed.'
    }
  }
})

ipcMain.handle('import-user-backup', async (): Promise<BackupImportSummary | { imported: false; canceled?: boolean; error?: string }> => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Import MyCinema Backup',
      properties: ['openFile'],
      filters: [
        { name: 'MyCinema Backup', extensions: ['json'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { imported: false, canceled: true }
    }

    const filePath = result.filePaths[0]
    const backup = parseBackupFile(filePath)
    const folders = Array.isArray(backup.data.folders) ? backup.data.folders : []
    const externalWatchlist = Array.isArray(backup.data.watchlist?.external) ? backup.data.watchlist.external : []
    const localWatchlist = Array.isArray(backup.data.watchlist?.local) ? backup.data.watchlist.local : []
    const favorites = Array.isArray(backup.data.favorites) ? backup.data.favorites : []

    const summary: BackupImportSummary = {
      imported: true,
      filePath,
      foldersAdded: 0,
      foldersScanned: 0,
      foldersMissing: 0,
      externalWatchlistImported: 0,
      localWatchlistRestored: 0,
      favoritesRestored: 0
    }

    for (const folder of folders) {
      const folderPath = typeof folder === 'string' ? folder : folder?.path
      if (!folderPath || typeof folderPath !== 'string') continue

      const addResult = db.addFolder(folderPath)
      summary.foldersAdded += addResult.changes

      if (!fs.existsSync(folderPath)) {
        summary.foldersMissing += 1
        continue
      }

      attachFolderWatcher(folderPath)
      await scanFolder(folderPath)
      summary.foldersScanned += 1
    }

    for (const item of externalWatchlist) {
      if (!item || typeof item.tmdb_id !== 'number' || !item.title || !['movie', 'series'].includes(item.type)) {
        continue
      }

      db.importExternalWatchlistItem(item)
      summary.externalWatchlistImported += 1
    }

    for (const item of localWatchlist) {
      if (!item || !['movie', 'series', 'video'].includes(item.type)) continue
      const restoreResult = db.restoreLocalWatchlistItem(item)
      summary.localWatchlistRestored += restoreResult.changes > 0 ? 1 : 0
    }

    for (const item of favorites) {
      if (!item || !['movie', 'series', 'video'].includes(item.type)) continue
      const restoreResult = db.restoreFavoriteItem(item)
      summary.favoritesRestored += restoreResult.changes > 0 ? 1 : 0
    }

    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('library-updated'))
    return summary
  } catch (err) {
    console.error('[Backup] Import failed:', err)
    return {
      imported: false,
      error: err instanceof Error ? err.message : 'Import failed.'
    }
  }
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

type EpisodeSignature = {
  season?: number
  episode: number
}

function parseSeasonNumber(value: string): number | null {
  const match =
    value.match(/\bseason[\s._-]*(\d{1,2})\b/i) ||
    value.match(/\bs(\d{1,2})\b/i)

  if (!match) return null
  const season = Number(match[1])
  return Number.isFinite(season) ? season : null
}

function parseEpisodeSignature(value: string): EpisodeSignature | null {
  const normalized = value.toLowerCase()
  const seasonEpisodeMatch =
    normalized.match(/\bs(\d{1,2})[\s._-]*e(\d{1,3})\b/i) ||
    normalized.match(/\bseason[\s._-]*(\d{1,2})[\s._-]*(?:episode|ep)[\s._-]*(\d{1,3})\b/i) ||
    normalized.match(/\b(\d{1,2})x(\d{1,3})\b/i)

  if (seasonEpisodeMatch) {
    const season = Number(seasonEpisodeMatch[1])
    const episode = Number(seasonEpisodeMatch[2])
    if (Number.isFinite(season) && Number.isFinite(episode)) {
      return { season, episode }
    }
  }

  const episodeSeasonMatch = normalized.match(/\b(?:episode|ep)[\s._-]*(\d{1,3})\b[\s\S]*?\bseason[\s._-]*(\d{1,2})\b/i)
  if (episodeSeasonMatch) {
    const episode = Number(episodeSeasonMatch[1])
    const season = Number(episodeSeasonMatch[2])
    if (Number.isFinite(season) && Number.isFinite(episode)) {
      return { season, episode }
    }
  }

  const episodeOnlyMatch =
    normalized.match(/\b(?:episode|ep)[\s._-]*(\d{1,3})\b/i) ||
    normalized.match(/\be(\d{1,3})\b/i)

  if (episodeOnlyMatch) {
    const episode = Number(episodeOnlyMatch[1])
    if (Number.isFinite(episode)) return { episode }
  }

  return null
}

function getEpisodeSignature(filePath: string): EpisodeSignature | null {
  const baseName = path.basename(filePath, path.extname(filePath))
  const parentDir = path.basename(path.dirname(filePath))
  const signature = parseEpisodeSignature(baseName)
  const parentSeason = parseSeasonNumber(parentDir)

  if (signature) {
    return {
      season: signature.season ?? parentSeason ?? undefined,
      episode: signature.episode,
    }
  }

  if (!parentSeason) return null
  const leadingEpisodeMatch = baseName.match(/^(?:episode|ep)?[\s._-]*(\d{1,3})(?:\D|$)/i)
  if (!leadingEpisodeMatch) return null

  const episode = Number(leadingEpisodeMatch[1])
  return Number.isFinite(episode) ? { season: parentSeason, episode } : null
}

function isSubtitleEpisodeCompatible(videoFilePath: string, subtitlePath: string): boolean {
  const videoBaseName = path.basename(videoFilePath, path.extname(videoFilePath)).toLowerCase()
  const subtitleFileName = path.basename(subtitlePath).toLowerCase()
  const subtitleBaseName = path.basename(subtitlePath, path.extname(subtitlePath)).toLowerCase()

  if (
    subtitleFileName.includes('.opensubtitles.') &&
    !subtitleBaseName.startsWith(`${videoBaseName}.opensubtitles.`)
  ) {
    return false
  }

  const videoSignature = getEpisodeSignature(videoFilePath)
  if (!videoSignature) return true

  const subtitleSignature = getEpisodeSignature(subtitlePath)
  if (!subtitleSignature) return true

  if (
    videoSignature.season !== undefined &&
    subtitleSignature.season !== undefined &&
    videoSignature.season !== subtitleSignature.season
  ) {
    return false
  }

  return videoSignature.episode === subtitleSignature.episode
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
    .filter(candidate => isSubtitleEpisodeCompatible(videoFilePath, candidate))
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

ipcMain.handle('get-downloads-storage', async () => {
  const dlPath = path.join(app.getPath('downloads'), 'MyCinema')
  try {
    if (!fs.existsSync(dlPath)) fs.mkdirSync(dlPath, { recursive: true })
    const stats = await fs.promises.statfs(dlPath)
    const blockSize = Number(stats.bsize || 0)
    const total = Number(stats.blocks || 0) * blockSize
    const free = Number((stats as any).bavail ?? stats.bfree ?? 0) * blockSize
    const used = Math.max(0, total - free)

    return {
      path: dlPath,
      free,
      total,
      used,
      percentUsed: total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0
    }
  } catch (err: any) {
    console.error('[Storage] Failed to read downloads storage:', err?.message || err)
    return {
      path: dlPath,
      free: 0,
      total: 0,
      used: 0,
      percentUsed: 0,
      error: err?.message || 'Unable to read storage'
    }
  }
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

ipcMain.handle('get-seek-preview-thumbnail', async (_event, filePath: string, time: number): Promise<string | null> => {
  if (!isSafeFilePath(filePath)) {
    console.error(`[IPC] 403 Forbidden path in get-seek-preview-thumbnail: ${filePath}`)
    return null
  }

  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0
  return generateSeekPreviewThumbnail(filePath, safeTime)
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
      join(userData, 'app-settings.json'),
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
const torrentProgressIntervals = new Map<string, NodeJS.Timeout>()
const pausedTorrentIds = new Set<string>()

function clearTorrentProgressInterval(id: string): void {
  const interval = torrentProgressIntervals.get(id)
  if (interval) {
    clearInterval(interval)
    torrentProgressIntervals.delete(id)
  }
}

function markTorrentInactive(id: string): void {
  clearTorrentProgressInterval(id)
  activeTorrents.delete(id)
}

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
      // Keep enough peers for healthy swarms without pushing most home routers too hard.
      maxConns: 350,
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
  if (pausedTorrentIds.has(id) && displayStatus !== 'done' && displayStatus !== 'error') {
    displayStatus = 'paused'
  }

  const data: any = {
    id,
    title: (torrent as any)._myCinemaTitle || torrent.name || existing?.title || 'Download',
    name: torrent.name || (torrent as any)._myCinemaName || existing?.name || null,
    progress: newProgress,
    downloadSpeed: displayStatus === 'paused'
      ? '0 B/s'
      : torrent.downloadSpeed !== undefined 
      ? formatBytes(torrent.downloadSpeed || 0) + '/s' 
      : (existing?.downloadSpeed || '0 B/s'),
    timeRemaining: displayStatus === 'paused'
      ? '—'
      : torrent.timeRemaining !== undefined 
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

async function fetchSharedMediaByTmdbId(type: 'movie' | 'series', tmdbId: number): Promise<any | null> {
  const localVideo = db.findVideoByTmdbId(tmdbId) as any
  if (localVideo && (!localVideo.type || localVideo.type === type)) {
    return localVideo
  }

  if (!TMDB_API_KEY) {
    console.warn('[TMDB] TMDB_API_KEY is not set — cannot resolve shared media link')
    return null
  }

  const endpoint = type === 'series' ? 'tv' : 'movie'
  const data = await nodeHttpGet(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`)
  if (!data || data.success === false) return null

  const title = type === 'series' ? data.name : data.title
  const releaseDate = type === 'series' ? data.first_air_date : data.release_date

  return {
    id: -tmdbId,
    title: title || 'Untitled',
    file_path: '',
    type,
    series_name: type === 'series' ? title || 'Untitled' : undefined,
    poster_path: data.poster_path ? `https://image.tmdb.org/t/p/w780${data.poster_path}` : undefined,
    backdrop_path: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : undefined,
    overview: data.overview || undefined,
    tagline: data.tagline || undefined,
    genres: Array.isArray(data.genres) ? data.genres.map((genre: any) => genre.name).filter(Boolean).join(', ') : undefined,
    vote_average: typeof data.vote_average === 'number' ? data.vote_average : undefined,
    release_year: releaseDate ? Number(String(releaseDate).slice(0, 4)) : undefined,
    tmdb_id: tmdbId,
    isExternal: true
  }
}

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

ipcMain.handle('fetch-trending-india', async (_, type: 'movie' | 'series' = 'movie') => {
  return await tmdb.fetchTrendingInIndia(type)
})

ipcMain.handle('get-tmdb-trailer', async (_, params: { tmdbId?: number | null; title: string; type: 'movie' | 'series'; year?: number | null; seasonNumber?: number | null; preferLatestSeason?: boolean }) => {
  return await tmdb.fetchTmdbTrailer(params)
})

ipcMain.handle('get-introdb-segments', async (_, params: { imdbId?: string | null; tmdbId?: number | null; season?: number | null; episode?: number | null; filePath?: string | null; duration?: number | null }) => {
  return await getIntroDbSegments(params || {})
})

ipcMain.handle('get-pending-shared-media-target', () => {
  const target = pendingSharedMediaTarget
  pendingSharedMediaTarget = null
  return target
})

ipcMain.handle('get-shared-media-by-tmdb-id', async (_, type: 'movie' | 'series', tmdbId: number) => {
  try {
    return await fetchSharedMediaByTmdbId(type, tmdbId)
  } catch (err) {
    console.error('[TMDB] Shared media lookup failed:', err)
    return null
  }
})

ipcMain.handle('toggle-favorite', (_, id: number) => {
  return db.toggleFavorite(id)
})

ipcMain.handle('toggle-watchlist', (_, id: number) => {
  return db.toggleWatchlist(id)
})

ipcMain.handle('add-local-to-watchlist', (_, id: number, category: string) => {
  return db.addLocalVideoToWatchlist(id, category)
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
function normalizeLanguageProbe(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[\[\](){}|:;,_./\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isHindiContent(title: string): boolean {
  const lower = normalizeLanguageProbe(title)
  return (
    lower.includes('hindi') ||
    lower.includes('हिंदी') ||
    lower.includes('audio hindi') ||
    lower.includes('hindi audio') ||
    lower.includes('hindi dubbed') ||
    lower.includes('hin eng') ||
    lower.includes('eng hin') ||
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
    /\bhin(di?)?\b/i.test(lower) ||
    /\b(hin|hindi)\s*(audio|dub|dubbed|voice|lang|language)\b/i.test(lower) ||
    /\b(audio|dub|dubbed|voice|lang|language)\s*(hin|hindi)\b/i.test(lower) ||
    /\bhin\s*(eng|tam|tel|mal|kan)\b/i.test(lower) ||
    /\b(eng|tam|tel|mal|kan)\s*hin\b/i.test(lower) ||
    title.includes('🇮🇳')
  )
}

function getTorrentSourceLanguageProbe(source: any): string {
  return [
    source?.title,
    source?.name,
    source?.description,
    source?.filename,
    source?.language,
    source?.behaviorHints?.bingeGroup,
    source?.behaviorHints?.videoHash
  ].filter(Boolean).join(' ')
}

function normalizeTorrentSourceHindiFlag<T extends { isHindi?: boolean }>(source: T): T {
  return {
    ...source,
    isHindi: isHindiContent(getTorrentSourceLanguageProbe(source))
  }
}

function getHindiScore(title: string): number {
  const lower = normalizeLanguageProbe(title)
  let score = 0
  
  // High quality sites / Indian release groups — consistently provide Hindi dubbed content
  const premiumSites = [
    'katmoviehd', 'katmovieshd', 'vegamovies', 'dotmovies', 'hdhub4u', 'uhdmovies', 
    'luxmovies', 'darksiderg', 'bolly4u', 'hdmovies4u', 
    'bollyshare', 'desiremovies', 'moviespapa', 'moviesnation', 'hdmovies24',
    'filmyzilla', 'downloadhub', 'tamilblasters', '7starhd', 'skymovies', 'skymovieshd',
    'mkvcinemas', 'mkvmoviespoint', 'mkvmad', 'extramovies', '9xmovies', 'world4ufree',
    'moviesflix', 'khatrimaza', 'moviespur', '1tamilmv', 'tamilmv', 'gdtot', 'hubcloud',
    'torrentgalaxy hindi', 'dual audio', 'pahe', 'psa', 'mkvcage', 'ssrmovies',
    'worldfree4u', 'hdmovieshub', 'cinevood', 'filmyhit', 'jalshamovie', 'uncutmaza',
    'coolmoviez', 'hdmoviearea', 'themoviesflix', 'mlwbd', 'mkvking', 'ofilmywap'
  ]
  
  for (const site of premiumSites) {
    if (lower.includes(site)) {
      score += 50
      break
    }
  }

  if (lower.includes('hindi dubbed')) score += 40
  if (lower.includes('hindi audio')) score += 35
  if (lower.includes('hindi')) score += 25
  if (/\bhin(di?)?\b/i.test(lower) || lower.includes('hin eng') || lower.includes('eng hin')) score += 25
  if (lower.includes('dual audio') || lower.includes('multi audio')) score += 20
  if (lower.includes('official')) score += 10

  // Quality bonuses — push higher quality Hindi to the top
  if (lower.includes('2160p') || lower.includes('4k') || lower.includes('uhd')) score += 25
  if (lower.includes('1080p')) score += 12
  if (lower.includes('bluray') || lower.includes('blu ray') || lower.includes('bdrip') || lower.includes('brrip')) score += 8
  if (lower.includes('web dl') || lower.includes('web-dl') || lower.includes('webdl') || lower.includes('webrip')) score += 5
  if (lower.includes('x265') || lower.includes('h265') || lower.includes('hevc')) score += 3
  if (lower.includes('10bit') || lower.includes('10 bit')) score += 2
  if (lower.includes('atmos') || lower.includes('dd5 1') || lower.includes('ddp5 1') || lower.includes('dts')) score += 3
  
  return score
}

// ─── Torrentio Stream Parser Helper ──────────────────────────────────────────
const TORRENTIO_BASE = 'https://torrentio.strem.fun/sort=seeders|qualityfilter=cam,screener'

function parseTorrentioStream(stream: any, fallbackTitle: string, options: { provider?: string } = {}): any | null {
  if (!stream.infoHash) return null
  const streamTitle = stream.title || ''
  const languageProbe = getTorrentSourceLanguageProbe({
    ...stream,
    provider: options.provider
  })
  
  // Parse quality
  const qualityMatch = `${streamTitle} ${stream.name || ''}`.match(/(2160p|1080p|720p|480p)/i)
  const quality = qualityMatch ? qualityMatch[1] : (stream.name?.includes('1080p') ? '1080p' : 'HD')
  
  // Parse size e.g. "💾 2.34 GB" or "💾 980 MB"
  const sizeMatch = streamTitle.match(/([0-9.]+\s*(GB|MB|KB|GiB|MiB))/i)
  const size = sizeMatch ? sizeMatch[1] : '—'

  // Parse seeds e.g. "👤 123"
  const seedMatch = streamTitle.match(/(?:👤|Seeders:)\s*([0-9]+)/i)
  const seeds = seedMatch ? parseInt(seedMatch[1]) : 0
  if (seeds === 0) return null
  
  const isHindi = isHindiContent(languageProbe)
  
  // Clean up title: multi-line strings in Stremio APIs usually have the release name on line 2 if line 1 is a tracker or uploader name
  const lines = streamTitle.split('\n')
  let cleanTitle = lines[0]
  if (lines.length > 1) {
    const normFallback = fallbackTitle.toLowerCase().replace(/[^a-z0-9]/g, '')
    const normLine0 = lines[0].toLowerCase().replace(/[^a-z0-9]/g, '')
    const normLine1 = lines[1].toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!normLine0.includes(normFallback) && normLine1.includes(normFallback)) {
      cleanTitle = lines[1]
    } else if (lines[0].toLowerCase().includes('imdb') || lines[0].length < 15) {
      cleanTitle = lines[1]
    }
  }

  cleanTitle = cleanTitle.replace(/[\[\(][A-Za-z0-9 ]*[\]\)]/g, '').replace(/💾.*/, '').replace(/👤.*/, '').trim() || `${fallbackTitle} (Aggregated)`

  return {
    title: cleanTitle.substring(0, 100),
    quality,
    size,
    magnet: `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(cleanTitle)}`,
    seeds,
    peers: Math.floor(seeds * 0.2),
    type: 'web',
    provider: options.provider,
    isHindi
  }
}

// ─── Shared Tracker List & Magnet Enrichment ─────────────────────────────────
const EXTRA_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://tracker.bitsearch.to:1337/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://9.rarbg.com:2810/announce',
  'udp://p4p.arenabg.com:1337',
  'udp://open.tracker.cl:1337/announce',
  'udp://tracker.tryhackx.org:6969/announce',
  'udp://tracker-udp.gbitt.info:80/announce',
  'udp://uploads.gamecoast.net:6969/announce',
  'https://tracker.gbitt.info/announce',
  'https://tracker.bt4g.com:443/announce',
  'https://tracker.nanoha.org/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
]

function isRelevanceMatch(resultTitle: string, searchTitle: string, mediaType: string, year: string): boolean {
  const normalize = (value: string) => value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.\-_:()[\]]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const rt = normalize(resultTitle)
  const st = normalize(searchTitle)
  const titleWords = st
    .split(' ')
    .filter(word => word.length > 1 && !['the', 'and', 'of', 'a', 'an'].includes(word))
  
  // Prefer exact phrase matches, but allow torrent titles that include all meaningful title words.
  const exactTitleMatch = st.length > 0 && rt.includes(st)
  const wordMatch = titleWords.length > 0 && titleWords.every(word => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(rt))
  if (!exactTitleMatch && !wordMatch) return false

  // 3. For movies, if year is provided, check if a different year exists in the result title.
  // TV results are intentionally allowed without Sxx/episode markers because many
  // providers label show packs generically, especially for new or regional series.
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

const torrentSourceCache = new Map<string, { sources: any[]; timestamp: number }>()
const TORRENT_SOURCE_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const activeTorrentSourceRequests = new Map<number, { requestId: string; controller: AbortController }>()

function getTorrentSourceCacheKey(title: string, year: string, mediaType: string, tmdbId: number): string {
  return `${mediaType}:${tmdbId}:${title.toLowerCase()}:${year || ''}`
}

function parseTvTorrentMetadata(sourceTitle: string): { parsedSeason?: number; parsedEpisode?: number; isSeasonPack?: boolean } {
  const titleLower = sourceTitle.toLowerCase()
  const seasonEpisodeMatch =
    titleLower.match(/\bs(\d{1,2})[\s._-]*e(?:p)?[\s._-]*(\d{1,3})\b/i) ||
    titleLower.match(/\b(\d{1,2})x(\d{1,3})\b/i) ||
    titleLower.match(/\bseason[\s._-]*(\d{1,2})[\s._-]*(?:episode|ep)[\s._-]*(\d{1,3})\b/i) ||
    titleLower.match(/\b(?:episode|ep)\s*(\d{1,3})\b[\s\S]*?\bseason\s*(\d{1,2})\b/i)

  if (seasonEpisodeMatch) {
    const episodeFirst = /^(?:episode|ep)/i.test(seasonEpisodeMatch[0])
    return {
      parsedSeason: parseInt(seasonEpisodeMatch[episodeFirst ? 2 : 1]),
      parsedEpisode: parseInt(seasonEpisodeMatch[episodeFirst ? 1 : 2]),
      isSeasonPack: false
    }
  }

  const seasonMatch =
    titleLower.match(/\bs(\d{1,2})\b/i) ||
    titleLower.match(/\bseason\s*(\d{1,2})\b/i)

  if (!seasonMatch) return {}

  const hasEpisodeSignal =
    /\be(?:p)?[\s._-]*\d{1,3}\b/i.test(titleLower) ||
    /\b(?:episode|ep)[\s._-]*\d{1,3}\b/i.test(titleLower)

  return {
    parsedSeason: parseInt(seasonMatch[1]),
    isSeasonPack: !hasEpisodeSignal
  }
}

function normalizeTorrentSources(sources: any[], mediaType: string): any[] {
    // Parse Season / Episode metadata
    let enrichedSources = sources.map(src => {
      const normalized = normalizeTorrentSourceHindiFlag({ ...src })
      if (mediaType === 'tv') {
        const metadata = parseTvTorrentMetadata(normalized.title)
        normalized.parsedSeason = metadata.parsedSeason
        normalized.parsedEpisode = metadata.parsedEpisode
        normalized.isSeasonPack = Boolean(metadata.isSeasonPack)
      }
      return normalized
    })

    // Improve quality label using file size when no explicit tag is present
    enrichedSources = enrichedSources.map(src => {
      const qualityText = `${src.quality || ''} ${src.title || ''}`.toLowerCase()
      if (!/\b(480p|720p|1080p|2160p|4k|uhd)\b/i.test(qualityText)) {
        // Estimate quality from file size for unlabeled torrents
        const sizeMatch = (src.size || '').match(/([\d.]+)\s*(GB|MB|TB)/i)
        if (sizeMatch) {
          const sizeInMB = sizeMatch[2].toUpperCase() === 'GB' ? parseFloat(sizeMatch[1]) * 1024
            : sizeMatch[2].toUpperCase() === 'TB' ? parseFloat(sizeMatch[1]) * 1024 * 1024
            : parseFloat(sizeMatch[1])
          if (sizeInMB > 8000) src.quality = '2160p'
          else if (sizeInMB > 2500) src.quality = '1080p'
          else if (sizeInMB > 800) src.quality = '720p'
          else src.quality = '480p'
        }
      }
      return src
    })

    // Quality filter: Keep 1080p+ by default, but allow 720p for Hindi content
    // (many Hindi dubs only exist in 720p — dropping them loses most Hindi results)
    enrichedSources = enrichedSources.filter(src => {
      const qualityText = `${src.quality || ''} ${src.title || ''}`.toLowerCase()
      const is1080pPlus = /\b(1080p|2160p|4k|uhd)\b/i.test(qualityText)
      if (is1080pPlus) return true
      // Allow 720p for Hindi content since it's often the best available
      const is720p = /\b720p\b/i.test(qualityText)
      if (is720p && src.isHindi) return true
      return false
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

    // Sort heavily by requirements — Hindi content and premium sites prioritized
    enrichedSources.sort((a, b) => {
      const scoreA = getHindiScore(getTorrentSourceLanguageProbe(a)) + (a.isHindi ? 25 : 0)
      const scoreB = getHindiScore(getTorrentSourceLanguageProbe(b)) + (b.isHindi ? 25 : 0)
      const qualityScore = (source: any) => {
        const quality = String(source.quality || '').toLowerCase()
        if (quality.includes('2160') || quality.includes('4k')) return 30
        if (quality.includes('1080')) return 20
        if (quality.includes('720')) return 10
        if (quality.includes('480')) return 2
        return 6
      }
      const healthScore = (source: any) => (Number(source.seeds) || 0) * 3 + (Number(source.peers) || 0) * 0.4 + qualityScore(source) + getHindiScore(getTorrentSourceLanguageProbe(source)) + (source.isHindi ? 25 : 0)

      if (mediaType === 'movie') {
        // Priority 1: Hindi Score (includes site priority)
        if (scoreA !== scoreB) return scoreB - scoreA
        
        // Priority 2: Health and quality
        return healthScore(b) - healthScore(a)
      } else {
        // TV Series logic
        // Both are Season Packs
        if (a.isSeasonPack && b.isSeasonPack) {
          if (a.parsedSeason !== b.parsedSeason) return (a.parsedSeason || 0) - (b.parsedSeason || 0)
          
          // Same season pack: Hindi score first
          if (scoreA !== scoreB) return scoreB - scoreA
          return healthScore(b) - healthScore(a)
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
        uniqueSources.push({
          ...src,
          magnet: enrichMagnetWithTrackers(src.magnet)
        })
      }
    }

    return uniqueSources
}

function sendTorrentSourceProgress(
  event: Electron.IpcMainInvokeEvent | null,
  requestId: string | undefined,
  payload: { sources: any[]; provider?: string; done?: boolean; cached?: boolean; completedProviders?: number; totalProviders?: number; error?: string }
) {
  if (!event || !requestId) return
  if (activeTorrentSourceRequests.get(event.sender.id)?.requestId !== requestId) return
  event.sender.send('torrent-sources-progress', { requestId, ...payload })
}

function isTorrentSourceRequestActive(event: Electron.IpcMainInvokeEvent | null, requestId?: string): boolean {
  if (!event || !requestId) return true
  const activeRequest = activeTorrentSourceRequests.get(event.sender.id)
  return activeRequest?.requestId === requestId && !activeRequest.controller.signal.aborted
}

function clearTorrentSourceRequest(event: Electron.IpcMainInvokeEvent | null, requestId?: string): void {
  if (!event || !requestId) return
  if (activeTorrentSourceRequests.get(event.sender.id)?.requestId === requestId) {
    activeTorrentSourceRequests.delete(event.sender.id)
  }
}

type IntroDbSegmentType = 'intro' | 'recap' | 'outro'
type SkipSegmentSource = 'theintrodb' | 'introdb' | 'chapters'

type IntroDbSegment = {
  type: IntroDbSegmentType
  startSec: number
  endSec: number
  confidence: number | null
  submissionCount: number | null
  updatedAt: string | null
  source: SkipSegmentSource
}

type IntroDbSegmentsResult = {
  imdbId: string | null
  season: number | null
  episode: number | null
  segments: IntroDbSegment[]
  sources: SkipSegmentSource[]
  error?: string
}

const TMDB_IMDB_CACHE_TTL = 1000 * 60 * 60 * 24 * 7
const INTRODB_SEGMENT_CACHE_TTL = 1000 * 60 * 60 * 12
const tmdbImdbIdCache = new Map<string, { imdbId: string; timestamp: number }>()
const introDbSegmentCache = new Map<string, { result: IntroDbSegmentsResult; timestamp: number }>()

function readTimedCache<T>(cache: Map<string, { timestamp: number } & T>, key: string, ttlMs: number): T | null {
  const cached = cache.get(key)
  if (!cached || Date.now() - cached.timestamp > ttlMs) return null
  const { timestamp: _timestamp, ...value } = cached
  return value as T
}

async function getImdbIdForTmdb(mediaType: string, tmdbId: number): Promise<string> {
  if (!TMDB_API_KEY || !tmdbId) return ''

  const cacheKey = `${mediaType}:${tmdbId}`
  const cached = readTimedCache<{ imdbId: string }>(tmdbImdbIdCache, cacheKey, TMDB_IMDB_CACHE_TTL)
  if (cached) return cached.imdbId

  try {
    const extUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
    const extData: any = await nodeHttpGet(extUrl)
    const imdbId = typeof extData?.imdb_id === 'string' ? extData.imdb_id : ''
    tmdbImdbIdCache.set(cacheKey, { imdbId, timestamp: Date.now() })
    return imdbId
  } catch (e) {
    console.error('[TMDB] Failed to get IMDb ID:', e)
    return ''
  }
}

function normalizeImdbId(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return /^tt\d+$/i.test(trimmed) ? trimmed.toLowerCase() : ''
}

function parseIntroDbTime(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) return numeric

  const parts = trimmed.split(':').map(part => Number(part))
  if (parts.some(part => !Number.isFinite(part))) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

function parseMillisToSeconds(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value / 1000 : null
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed / 1000 : null
  }
  return null
}

function parseIntroDbSegment(type: IntroDbSegmentType, raw: any): IntroDbSegment | null {
  if (!raw) return null

  const startSec = parseIntroDbTime(raw.start_sec ?? raw.start)
  const endSec = parseIntroDbTime(raw.end_sec ?? raw.end)
  if (startSec === null || endSec === null || endSec <= startSec) return null

  return {
    type,
    startSec,
    endSec,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
    submissionCount: typeof raw.submission_count === 'number' ? raw.submission_count : null,
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : null,
    source: 'introdb'
  }
}

function parseTheIntroDbSegment(type: IntroDbSegmentType, raw: any, durationSec: number | null): IntroDbSegment | null {
  if (!raw) return null

  const startSec = parseMillisToSeconds(raw.start_ms) ?? (type === 'intro' ? 0 : null)
  let endSec = parseMillisToSeconds(raw.end_ms)
  if (endSec === null && type === 'outro') {
    endSec = durationSec && durationSec > 0 ? durationSec : (startSec !== null ? startSec + 180 : null)
  }

  if (startSec === null || endSec === null || endSec <= startSec) return null

  return {
    type,
    startSec,
    endSec,
    confidence: null,
    submissionCount: null,
    updatedAt: null,
    source: 'theintrodb'
  }
}

function normalizeChapterTitle(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function classifyChapterTitle(value: unknown): IntroDbSegmentType | null {
  const normalized = normalizeChapterTitle(value)
  if (!normalized) return null

  const tokens = new Set(normalized.split(/\s+/).filter(Boolean))
  if (tokens.has('recap') || normalized.includes('previously on') || normalized.includes('last time')) return 'recap'
  if (
    tokens.has('outro') ||
    tokens.has('credits') ||
    tokens.has('ending') ||
    tokens.has('ed') ||
    normalized.includes('end credits') ||
    normalized.includes('closing credits')
  ) return 'outro'
  if (
    tokens.has('intro') ||
    tokens.has('opening') ||
    tokens.has('op') ||
    normalized.includes('title sequence') ||
    normalized.includes('opening credits')
  ) return 'intro'

  return null
}

function addMissingSegmentTypes(target: IntroDbSegment[], candidates: IntroDbSegment[]): void {
  for (const candidate of candidates) {
    if (!target.some(segment => segment.type === candidate.type)) {
      target.push(candidate)
    }
  }
}

function uniqueSegmentSources(segments: IntroDbSegment[]): SkipSegmentSource[] {
  return Array.from(new Set(segments.map(segment => segment.source)))
}

async function getIntroDbSegments(params: {
  imdbId?: string | null
  tmdbId?: number | null
  season?: number | null
  episode?: number | null
  filePath?: string | null
  duration?: number | null
}): Promise<IntroDbSegmentsResult> {
  const season = Number(params.season)
  const episode = Number(params.episode)
  const tmdbId = Number(params.tmdbId)
  const durationSec = Number.isFinite(Number(params.duration)) && Number(params.duration) > 0 ? Number(params.duration) : null
  const filePath = typeof params.filePath === 'string' ? params.filePath : null

  if (!Number.isFinite(season) || !Number.isFinite(episode) || season < 0 || episode <= 0) {
    return { imdbId: null, season: null, episode: null, segments: [], sources: [] }
  }

  const safeFileKey = filePath ? crypto.createHash('sha1').update(path.normalize(filePath).toLowerCase()).digest('hex') : 'none'
  const cacheKey = `skip-segments:${Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : 'no-tmdb'}:${normalizeImdbId(params.imdbId) || 'no-imdb'}:${season}:${episode}:${safeFileKey}:${durationSec || 'no-duration'}`
  const cached = readTimedCache<{ result: IntroDbSegmentsResult }>(introDbSegmentCache, cacheKey, INTRODB_SEGMENT_CACHE_TTL)
  if (cached) return cached.result

  const segments: IntroDbSegment[] = []
  let imdbId = normalizeImdbId(params.imdbId)

  if (Number.isFinite(tmdbId) && tmdbId > 0) {
    addMissingSegmentTypes(segments, await fetchTheIntroDbSegments(tmdbId, season, episode, durationSec))
  }

  if (!imdbId && Number.isFinite(tmdbId) && tmdbId > 0) {
    imdbId = normalizeImdbId(await getImdbIdForTmdb('tv', tmdbId))
  }

  if (imdbId && segments.length < 3) {
    addMissingSegmentTypes(segments, await fetchIntroDbSegments(imdbId, season, episode))
  }

  if (filePath && segments.length < 3) {
    addMissingSegmentTypes(segments, await getChapterSkipSegments(filePath, durationSec))
  }

  segments.sort((a, b) => a.startSec - b.startSec)
  const result = { imdbId: imdbId || null, season, episode, segments, sources: uniqueSegmentSources(segments) }
  introDbSegmentCache.set(cacheKey, { result, timestamp: Date.now() })
  return result
}

async function fetchTheIntroDbSegments(
  tmdbId: number,
  season: number,
  episode: number,
  durationSec: number | null
): Promise<IntroDbSegment[]> {
  try {
    const query = new URLSearchParams({
      tmdb_id: String(tmdbId),
      season: String(season),
      episode: String(episode)
    })
    const data: any = await nodeHttpGet(`https://api.theintrodb.org/v2/media?${query.toString()}`, 7000)
    const rawIntro = Array.isArray(data?.intro) ? data.intro : []
    const rawCredits = Array.isArray(data?.credits) ? data.credits : []
    const rawRecap = Array.isArray(data?.recap) ? data.recap : []

    return [
      ...rawRecap.map((segment: any) => parseTheIntroDbSegment('recap', segment, durationSec)),
      ...rawIntro.map((segment: any) => parseTheIntroDbSegment('intro', segment, durationSec)),
      ...rawCredits.map((segment: any) => parseTheIntroDbSegment('outro', segment, durationSec))
    ]
      .filter((segment): segment is IntroDbSegment => segment !== null)
      .sort((a, b) => a.startSec - b.startSec)
  } catch (e) {
    console.warn('[TheIntroDB] Failed to fetch skip segments:', e)
    return []
  }
}

async function fetchIntroDbSegments(imdbId: string, season: number, episode: number): Promise<IntroDbSegment[]> {
  try {
    const query = new URLSearchParams({
      imdb_id: imdbId,
      season: String(season),
      episode: String(episode)
    })
    const data: any = await nodeHttpGet(`https://api.introdb.app/segments?${query.toString()}`, 7000)
    return (['recap', 'intro', 'outro'] as IntroDbSegmentType[])
      .map(type => parseIntroDbSegment(type, data?.[type]))
      .filter((segment): segment is IntroDbSegment => segment !== null)
      .sort((a, b) => a.startSec - b.startSec)
  } catch (e) {
    console.warn('[IntroDB] Failed to fetch skip segments:', e)
    return []
  }
}

async function getChapterSkipSegments(filePath: string, durationSec: number | null): Promise<IntroDbSegment[]> {
  if (!isSafeFilePath(filePath) || !fs.existsSync(filePath)) return []

  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.warn('[Chapters] Failed to inspect skip chapters:', err.message)
        resolve([])
        return
      }

      const metadataDuration = parseIntroDbTime(metadata.format?.duration)
      const inferredDuration = durationSec || (metadataDuration && metadataDuration > 0 ? metadataDuration : null)

      const chapters = Array.isArray((metadata as any).chapters) ? (metadata as any).chapters : []
      const segments = chapters
        .map((chapter: any) => {
          const type = classifyChapterTitle(chapter?.tags?.title || chapter?.title)
          if (!type) return null

          const startSec = parseIntroDbTime(chapter.start_time ?? chapter.start)
          let endSec = parseIntroDbTime(chapter.end_time ?? chapter.end)
          if (endSec !== null && endSec > 100000 && startSec !== null && startSec < 100000) {
            endSec = endSec / 1000
          }
          if (endSec === null && type === 'outro' && inferredDuration) endSec = inferredDuration
          if (startSec === null || endSec === null || endSec <= startSec) return null

          return {
            type,
            startSec,
            endSec,
            confidence: null,
            submissionCount: null,
            updatedAt: null,
            source: 'chapters' as SkipSegmentSource
          }
        })
        .filter((segment: IntroDbSegment | null): segment is IntroDbSegment => segment !== null)
        .sort((a: IntroDbSegment, b: IntroDbSegment) => a.startSec - b.startSec)

      resolve(segments)
    })
  })
}

async function fetchYtsSources(imdbId: string): Promise<any[]> {
  if (!imdbId) return []
  const mirrors = ['yts.mx', 'yts.rs', 'yts.do', 'yts.lt', 'yts.ag']
  let ytsData: any = null

  for (const domain of mirrors) {
    try {
      const searchUrl = `https://${domain}/api/v2/list_movies.json?query_term=${imdbId}&limit=10&sort_by=seeds`
      const res = await nodeHttpGet(searchUrl, 4500)
      if (res?.status === 'ok' && res?.data?.movies?.length > 0) {
        ytsData = res
        break
      }
    } catch {
      console.log(`[Torrent] YTS mirror ${domain} failed`)
    }
  }

  const sources: any[] = []
  for (const movie of (ytsData?.data?.movies || [])) {
    for (const torrent of (movie.torrents || [])) {
      const seeds = torrent.seeds || 0
      const peers = torrent.peers || 0
      if (seeds === 0 && peers === 0) continue
      sources.push({
        title: `${movie.title_long} [${torrent.type?.toUpperCase() || 'WEB'}] (YTS)`,
        quality: torrent.quality || '720p',
        size: torrent.size || '—',
        magnet: `magnet:?xt=urn:btih:${torrent.hash}&dn=${encodeURIComponent(movie.title_long)}`,
        seeds,
        peers,
        type: torrent.type || 'web',
        isHindi: isHindiContent(movie.title_long || '')
      })
    }
  }
  return sources
}

async function fetchEztvSources(imdbId: string): Promise<any[]> {
  if (!imdbId) return []
  const imdbNumeric = imdbId.replace(/^tt/, '')
  const eztvMirrors = ['eztvx.to', 'eztv.re', 'eztv.wf', 'eztv.tf', 'eztv.yt']
  let data: any = null

  for (const domain of eztvMirrors) {
    try {
      const searchUrl = `https://${domain}/api/get-torrents?imdb_id=${imdbNumeric}&limit=100&page=1`
      const res = await nodeHttpGet(searchUrl, 7500)
      if (res && res.torrents) {
        data = res
        break
      }
    } catch {
      console.log(`[Torrent] EZTV mirror ${domain} failed`)
    }
  }

  return (data?.torrents || []).flatMap((t: any) => {
    if (!t.magnet_url) return []
    const seeds = t.seeds || 0
    const peers = t.peers || 0
    if (seeds === 0 && peers === 0) return []
    const torrentTitle = t.title || t.filename || 'Unknown'
    return [{
      title: torrentTitle,
      quality: torrentTitle.match(/(720p|1080p|2160p|480p)/i)?.[1] || 'SD',
      size: formatBytes(t.size_bytes || 0),
      magnet: t.magnet_url,
      seeds,
      peers,
      type: 'web',
      isHindi: isHindiContent(torrentTitle)
    }]
  })
}

async function fetchTorrentioSources(imdbId: string, title: string, mediaType: string): Promise<any[]> {
  if (!imdbId) return []
  const url = `${TORRENTIO_BASE}/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
  const data: any = await nodeHttpGet(url, 6500)
  return (data?.streams || []).flatMap((stream: any) => {
    const parsed = parseTorrentioStream(stream, title, { provider: 'Torrentio' })
    if (!parsed) return []
    parsed.title = `${parsed.title} (Torrentio)`
    return [parsed]
  })
}

async function fetchTorrentioHindiSources(imdbId: string, title: string, mediaType: string): Promise<any[]> {
  if (!imdbId) return []
  const url = `https://torrentio.strem.fun/sort=seeders|language=hindi/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
  const data: any = await nodeHttpGet(url, 6500)
  return (data?.streams || []).flatMap((stream: any) => {
    const parsed = parseTorrentioStream(stream, title, { provider: 'Torrentio Hindi' })
    if (!parsed) return []
    parsed.title = `${parsed.title} (Torrentio)`
    return [parsed]
  })
}

// ─── MediaFusion — specifically great for Indian/Hindi content ───────────────
async function fetchMediaFusionSources(imdbId: string, title: string, mediaType: string): Promise<any[]> {
  if (!imdbId) return []
  // Use public elfhosted mediafusion instance
  const url = `https://mediafusion.elfhosted.com/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
  const data: any = await nodeHttpGet(url, 7500)
  return (data?.streams || []).flatMap((stream: any) => {
    // MediaFusion stream format is similar to Torrentio
    const parsed = parseTorrentioStream(stream, title, { provider: 'MediaFusion' })
    if (!parsed) return []
    // Add MediaFusion tag and make sure hindi content is marked
    parsed.title = `${parsed.title} (MF)`
    const streamInfo = `${stream.title || ''} ${stream.name || ''} ${stream.description || ''}`
    if (/hindi|hin\s*eng|eng\s*hin|dual\s*audio|multi\s*audio|हिंदी|🇮🇳/i.test(streamInfo)) {
      parsed.isHindi = true
    }
    return [parsed]
  })
}

async function fetchApiBaySources(imdbId: string): Promise<any[]> {
  if (!imdbId) return []
  const apiBayData: any = await nodeHttpGet(`https://apibay.org/q.php?q=${imdbId}`, 6000)
  if (!Array.isArray(apiBayData) || apiBayData[0]?.id === '0') return []
  return apiBayData.flatMap((t: any) => {
    const seeders = parseInt(t.seeders) || 0
    if (seeders === 0) return []
    const titleName = t.name || ''
    return [{
      title: `${titleName.substring(0, 80)} (TPB)`,
      quality: titleName.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
      size: formatBytes(parseInt(t.size) || 0),
      magnet: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(titleName)}`,
      seeds: seeders,
      peers: parseInt(t.leechers) || 0,
      type: 'web',
      isHindi: isHindiContent(titleName)
    }]
  })
}

async function fetchApiBayTitleSources(title: string, year: string, mediaType: string): Promise<any[]> {
  const baseQuery = mediaType === 'movie' && year ? `${title} ${year}` : title
  const queries = Array.from(new Set([
    baseQuery,
    `${baseQuery} 1080p`,
    `${baseQuery} 2160p`,
    `${baseQuery} Hindi`,
    `${baseQuery} Hindi Audio`,
    `${baseQuery} Hindi Dubbed`,
    `${baseQuery} Hin Eng`,
    `${baseQuery} Dual Audio`,
    mediaType === 'tv' ? `${title} S01` : '',
    mediaType === 'tv' ? `${title} Season` : ''
  ].filter(Boolean)))
  const results = await Promise.allSettled(queries.map(async (query) => {
    const apiBayData: any = await nodeHttpGet(`https://apibay.org/q.php?q=${encodeURIComponent(query)}`, 7500)
    if (!Array.isArray(apiBayData) || apiBayData[0]?.id === '0') return []
    return apiBayData.flatMap((t: any) => {
      const titleName = t.name || ''
      if (!isRelevanceMatch(titleName, title, mediaType, year)) return []
      return [{
        title: `${titleName.substring(0, 80)} (TPB)`,
        quality: titleName.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
        size: formatBytes(parseInt(t.size) || 0),
        magnet: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(titleName)}`,
        seeds: parseInt(t.seeders) || 0,
        peers: parseInt(t.leechers) || 0,
        type: 'web',
        isHindi: isHindiContent(titleName)
      }]
    })
  }))
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
}



async function fetchSolidSources(title: string, year: string, mediaType: string): Promise<any[]> {
  const baseQuery = mediaType === 'movie' && year ? `${title} ${year}` : title
  const solidQueries = Array.from(new Set([
    baseQuery,
    `${baseQuery} 1080p`,
    `${baseQuery} 2160p`,
    `${baseQuery} Hindi`,
    `${baseQuery} Hindi Audio`,
    `${baseQuery} Hindi Dubbed`,
    `${baseQuery} Hin Eng`,
    `${baseQuery} Dual Audio`,
    mediaType === 'tv' ? `${title} S01` : '',
    mediaType === 'tv' ? `${title} Season` : ''
  ].filter(Boolean)))
  const batches = await Promise.allSettled(solidQueries.map(async (q) => {
    const solidUrl = `https://solidtorrents.to/api/v1/search?q=${encodeURIComponent(q)}&category=all&sort=seeders`
    const solidData: any = await nodeHttpGet(solidUrl, 7500)
    return (solidData?.results || []).flatMap((t: any) => {
      const seeds = t.swarm?.seeders || 0
      const titleName = t.title || ''
      if (!isRelevanceMatch(titleName, title, mediaType, year)) return []
      return [{
        title: `${titleName.substring(0, 80)} (Solid)`,
        quality: titleName.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
        size: formatBytes(t.size || 0),
        magnet: t.magnet || `magnet:?xt=urn:btih:${t.infoHash}&dn=${encodeURIComponent(titleName)}`,
        seeds,
        peers: t.swarm?.leechers || 0,
        type: 'web',
        isHindi: isHindiContent(titleName)
      }]
    })
  }))
  return batches.flatMap(result => result.status === 'fulfilled' ? result.value : [])
}

async function fetchBitsearchSources(title: string, year: string, mediaType: string): Promise<any[]> {
  const siteKeywords = ['Hindi', 'KatmovieHD', 'HDhub4u', 'Vegamovies', 'UHDmovies', 'Dotmovies', 'Bolly4u', 'Hdmovies4u', '1TamilMV', 'TamilMV', 'Moviesflix', 'Filmyzilla', 'Downloadhub', 'TamilBlasters', '7starhd']
  const queryYear = (mediaType === 'movie' && year) ? ` ${year}` : ''
  const queries = Array.from(new Set([
    `${title}${queryYear}`,
    `${title}${queryYear} 1080p`,
    `${title}${queryYear} 2160p`,
    `${title}${queryYear} Hindi`,
    `${title}${queryYear} Hindi Audio`,
    `${title}${queryYear} Hindi Dubbed`,
    `${title}${queryYear} Hin Eng`,
    `${title}${queryYear} Dual Audio`,
    ...siteKeywords.map(keyword => `${title}${queryYear} ${keyword}`)
  ]))
  const results = await Promise.allSettled(queries.map(async (query) => {
    const bitUrl = `https://bitsearch.to/search?q=${encodeURIComponent(query)}&sort=seeders`
    const html = await nodeHttpRequest(bitUrl, { timeoutMs: 9000 })
    const sources: any[] = []
    if (typeof html === 'string') {
      const resultRegex = /<li class="search-result[\s\S]*?<h3 class="title">[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>[\s\S]*?<div class="stats">[\s\S]*?<div>[\s\S]*?([0-9.]+\s*[GMK]B)[\s\S]*?<div>[\s\S]*?([0-9,]+)[\s\S]*?<div>[\s\S]*?([0-9,]+)[\s\S]*?<a class="dl-magnet" href="([^"]+)"/g
      let match
      while ((match = resultRegex.exec(html)) !== null) {
        const [, , tTitle, tSize, tSeeds, tPeers, tMagnet] = match
        const cleanTitle = tTitle.trim()
        const seeds = parseInt(tSeeds.replace(/,/g, '')) || 0
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
    return sources
  }))
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
}

async function fetch1337xSources(title: string, year: string, mediaType: string): Promise<any[]> {
  const x1337Mirrors = ['1337x.to', '1337x.st', 'x1337x.ws']
  const baseQuery = mediaType === 'movie' && year ? `${title} ${year}` : title
  const xQueries = Array.from(new Set([
    baseQuery,
    `${baseQuery} 1080p`,
    `${baseQuery} 2160p`,
    `${baseQuery} Hindi Audio`,
    `${baseQuery} Hindi Dubbed`,
    `${baseQuery} Hin Eng`,
    `${baseQuery} Dual Audio`,
    mediaType === 'movie' && year ? `${title} ${year}` : title,
    mediaType === 'movie' && year ? `${title} ${year} Hindi` : `${title} Hindi`
  ]))
  const allSources: any[] = []
  for (const domain of x1337Mirrors) {
    for (const xQuery of xQueries) try {
      const xUrl = `https://${domain}/sort-search/${encodeURIComponent(xQuery)}/seeders/desc/1/`
      const html = await nodeHttpRequest(xUrl, { timeoutMs: 8500 })
      if (typeof html !== 'string') continue
      const rowRegex = /<td class="coll-1 name">[\s\S]*?<a href="\/torrent\/(\d+)\/([^/]+)\/">([^<]+)<\/a>[\s\S]*?<td class="coll-2 seeds">(\d+)<\/td>[\s\S]*?<td class="coll-3 leeches">(\d+)<\/td>[\s\S]*?<td class="coll-4 size">([^<]+)<span/g
      let match
      const torrentsToFetch = []
      while ((match = rowRegex.exec(html)) !== null) {
        const [, tId, tSlug, tTitle, tSeeds, tLeeches, tSize] = match
        const seeds = parseInt(tSeeds) || 0
        if (!isRelevanceMatch(tTitle, title, mediaType, year)) continue
        torrentsToFetch.push({ id: tId, slug: tSlug, title: tTitle, seeds, peers: parseInt(tLeeches) || 0, size: tSize.trim() })
        if (torrentsToFetch.length >= 10) break
      }
      const magnets = await Promise.allSettled(torrentsToFetch.map(async (t) => {
        const detailUrl = `https://${domain}/torrent/${t.id}/${t.slug}/`
        const detailHtml = await nodeHttpRequest(detailUrl, { timeoutMs: 7500 })
        const magnetMatch = detailHtml.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/)
        if (!magnetMatch) return null
        return {
          title: `${t.title.substring(0, 80)} (1337x)`,
          quality: t.title.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
          size: t.size,
          magnet: magnetMatch[1],
          seeds: t.seeds,
          peers: t.peers,
          type: 'web',
          isHindi: isHindiContent(t.title)
        }
      }))
      const sources = magnets.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : [])
      allSources.push(...sources)
    } catch {}
  }
  return allSources
}

async function fetchKnightCrawlerSources(imdbId: string, title: string, mediaType: string): Promise<any[]> {
  if (!imdbId) return []
  const kcUrl = `https://knightcrawler.elfhosted.com/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
  const kcData: any = await nodeHttpGet(kcUrl, 6500)
  return (kcData?.streams || []).flatMap((stream: any) => {
    const parsed = parseTorrentioStream(stream, title, { provider: 'KnightCrawler' })
    if (!parsed) return []
    parsed.title = `${parsed.title} (KC)`
    return [parsed]
  })
}

async function fetchAnnatarSources(imdbId: string, title: string, mediaType: string): Promise<any[]> {
  if (!imdbId) return []
  const url = `https://annatar.elfhosted.com/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
  const data: any = await nodeHttpGet(url, 6500)
  return (data?.streams || []).flatMap((stream: any) => {
    const parsed = parseTorrentioStream(stream, title, { provider: 'Annatar' })
    if (!parsed) return []
    parsed.title = `${parsed.title} (Annatar)`
    return [parsed]
  })
}

async function fetchCometSources(imdbId: string, title: string, mediaType: string): Promise<any[]> {
  if (!imdbId) return []
  const url = `https://comet.elfhosted.com/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
  const data: any = await nodeHttpGet(url, 6500)
  return (data?.streams || []).flatMap((stream: any) => {
    const parsed = parseTorrentioStream(stream, title, { provider: 'Comet' })
    if (!parsed) return []
    parsed.title = `${parsed.title} (Comet)`
    return [parsed]
  })
}

async function fetchJackettioSources(imdbId: string, title: string, mediaType: string): Promise<any[]> {
  if (!imdbId) return []
  const url = `https://jackettio.elfhosted.com/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
  const data: any = await nodeHttpGet(url, 6500)
  return (data?.streams || []).flatMap((stream: any) => {
    const parsed = parseTorrentioStream(stream, title, { provider: 'Jackettio' })
    if (!parsed) return []
    parsed.title = `${parsed.title} (Jackettio)`
    return [parsed]
  })
}

async function fetchShluflixSources(imdbId: string, title: string, mediaType: string): Promise<any[]> {
  if (!imdbId) return []
  const url = `https://shluflix.elfhosted.com/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
  const data: any = await nodeHttpGet(url, 6500)
  return (data?.streams || []).flatMap((stream: any) => {
    const parsed = parseTorrentioStream(stream, title, { provider: 'Shluflix' })
    if (!parsed) return []
    parsed.title = `${parsed.title} (Shluflix)`
    return [parsed]
  })
}

async function fetchPeerflixSources(imdbId: string, title: string, mediaType: string): Promise<any[]> {
  if (!imdbId) return []
  const url = `https://peerflix.elfhosted.com/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
  const data: any = await nodeHttpGet(url, 6500)
  return (data?.streams || []).flatMap((stream: any) => {
    const parsed = parseTorrentioStream(stream, title, { provider: 'Peerflix' })
    if (!parsed) return []
    parsed.title = `${parsed.title} (Peerflix)`
    return [parsed]
  })
}

async function fetchStremifySources(imdbId: string, title: string, mediaType: string): Promise<any[]> {
  if (!imdbId) return []
  const url = `https://stremify.elfhosted.com/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
  const data: any = await nodeHttpGet(url, 6500)
  return (data?.streams || []).flatMap((stream: any) => {
    const parsed = parseTorrentioStream(stream, title, { provider: 'Stremify' })
    if (!parsed) return []
    parsed.title = `${parsed.title} (Stremify)`
    return [parsed]
  })
}

async function fetchNyaaSources(title: string, year: string, mediaType: string): Promise<any[]> {
  const baseQuery = mediaType === 'movie' && year ? `${title} ${year}` : title
  const queries = [baseQuery, `${baseQuery} 1080p`, `${baseQuery} Hindi`]
  const allSources: any[] = []
  
  for (const q of queries) {
    try {
      const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(q)}&c=0_0&f=0`
      const xml = await nodeHttpRequest(url, { timeoutMs: 7000 })
      if (typeof xml !== 'string') continue
      
      const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<nyaa:seeders>(\d+)<\/nyaa:seeders>[\s\S]*?<nyaa:leechers>(\d+)<\/nyaa:leechers>[\s\S]*?<nyaa:size>([^<]+)<\/nyaa:size>[\s\S]*?<\/item>/g
      let match
      while ((match = itemRegex.exec(xml)) !== null) {
        const [, tTitle, tMagnet, tSeeds, tPeers, tSize] = match
        const cleanTitle = tTitle.trim().replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
        const seeds = parseInt(tSeeds) || 0
        if (seeds === 0) continue
        if (!isRelevanceMatch(cleanTitle, title, mediaType, year)) continue
        
        allSources.push({
          title: `${cleanTitle.substring(0, 80)} (Nyaa)`,
          quality: cleanTitle.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
          size: tSize.trim(),
          magnet: tMagnet.trim(),
          seeds,
          peers: parseInt(tPeers) || 0,
          type: 'web',
          isHindi: isHindiContent(cleanTitle)
        })
      }
    } catch (e) {}
  }
  return allSources
}

// ─── Torrentio Dual Audio (separate config for dual-audio/multi-audio content) ─
async function fetchTorrentioDualAudioSources(imdbId: string, title: string, mediaType: string): Promise<any[]> {
  if (!imdbId) return []
  // Use multiple Torrentio configurations optimized for Hindi/dual audio content
  const configs = [
    'sort=seeders|language=hindi|qualityfilter=cam,screener',
    'sort=seeders|qualityfilter=cam,screener'
  ]
  const allSources: any[] = []
  for (const config of configs) {
    try {
      const url = `https://torrentio.strem.fun/${config}/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
      const data: any = await nodeHttpGet(url, 6500)
      for (const stream of (data?.streams || [])) {
        const streamInfo = `${stream.title || ''} ${stream.name || ''}`
        // Only keep results that mention dual audio, multi audio, or Hindi
        const isDualOrHindi = /dual\s*audio|multi\s*audio|hindi|hin\s*eng|eng\s*hin|हिंदी|🇮🇳/i.test(streamInfo)
        if (!isDualOrHindi) continue
        const parsed = parseTorrentioStream(stream, title, { provider: 'Torrentio DA' })
        if (!parsed) continue
        parsed.title = `${parsed.title} (Dual Audio)`
        parsed.isHindi = true
        allSources.push(parsed)
      }
    } catch {}
  }
  return allSources
}

// ─── TorrentGalaxy — popular public tracker with strong Hindi/Indian content ──
async function fetchTorrentGalaxySources(title: string, year: string, mediaType: string): Promise<any[]> {
  const baseQuery = mediaType === 'movie' && year ? `${title} ${year}` : title
  const tgxMirrors = ['torrentgalaxy.to', 'torrentgalaxy.mx', 'tgx.rs']
  const hindiQueries = Array.from(new Set([
    `${baseQuery} 1080p Hindi`,
    `${baseQuery} 2160p Hindi`,
    `${baseQuery} Hindi Dubbed`,
    `${baseQuery} 1080p Dual Audio`,
    `${baseQuery} Dual Audio`,
    `${baseQuery} Hindi`,
    baseQuery
  ]))
  const allSources: any[] = []

  for (const domain of tgxMirrors) {
    let succeeded = false
    for (const query of hindiQueries) {
      try {
        const searchUrl = `https://${domain}/torrents.php?search=${encodeURIComponent(query)}&sort=seeders&order=desc&lang=0`
        const html = await nodeHttpRequest(searchUrl, { timeoutMs: 9000 })
        if (typeof html !== 'string' || html.length < 500) continue
        succeeded = true

        // Parse TorrentGalaxy HTML results
        // Each result row contains: title, magnet, seeds, leechers, size
        const rowRegex = /<a href="\/torrent\/[^"]*" title="([^"]*)"[\s\S]*?<a href="(magnet:\?[^"]+)"[\s\S]*?font color[^>]*>(\d+)<[\s\S]*?<\/font>[\s\S]*?<font[^>]*>(\d+)<\/font>[\s\S]*?<span class="badge[^"]*">([^<]+)<\/span>/g
        let match
        while ((match = rowRegex.exec(html)) !== null) {
          const [, tTitle, tMagnet, tSeeds, tLeeches, tSize] = match
          const cleanTitle = tTitle.trim()
          const seeds = parseInt(tSeeds) || 0
          if (seeds === 0) continue
          if (!isRelevanceMatch(cleanTitle, title, mediaType, year)) continue
          allSources.push({
            title: `${cleanTitle.substring(0, 80)} (TGx)`,
            quality: cleanTitle.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
            size: tSize.trim(),
            magnet: tMagnet,
            seeds,
            peers: parseInt(tLeeches) || 0,
            type: 'web',
            isHindi: isHindiContent(cleanTitle)
          })
        }
      } catch {}
    }
    if (succeeded) break // Got results from this mirror, skip others
  }
  return allSources
}

// ─── LimeTorrents — good international tracker with Hindi content ─────────────
async function fetchLimeTorrentsSources(title: string, year: string, mediaType: string): Promise<any[]> {
  const baseQuery = mediaType === 'movie' && year ? `${title} ${year}` : title
  const queries = Array.from(new Set([
    baseQuery,
    `${baseQuery} Hindi`,
    `${baseQuery} Hindi Dubbed`,
    `${baseQuery} Dual Audio`
  ]))
  const allSources: any[] = []

  for (const query of queries) {
    try {
      // LimeTorrents RSS feed for search
      const rssUrl = `https://www.limetorrents.lol/searchrss/${encodeURIComponent(query)}/seeds/1/`
      const xml = await nodeHttpRequest(rssUrl, { timeoutMs: 8000 })
      if (typeof xml !== 'string') continue

      // Parse RSS items
      const itemRegex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<description><!\[CDATA\[Size: ([^\s]+)\s+([^\s]+)[\s\S]*?Seeds: (\d+)[\s\S]*?Leechers: (\d+)[\s\S]*?\]\]><\/description>[\s\S]*?<enclosure[^>]*url="(magnet:\?[^"]*)"[\s\S]*?<\/item>/g
      let match
      while ((match = itemRegex.exec(xml)) !== null) {
        const [, tTitle, , tSizeVal, tSizeUnit, tSeeds, tLeeches, tMagnet] = match
        const cleanTitle = tTitle.trim()
        const seeds = parseInt(tSeeds) || 0
        if (seeds === 0) continue
        if (!isRelevanceMatch(cleanTitle, title, mediaType, year)) continue
        allSources.push({
          title: `${cleanTitle.substring(0, 80)} (Lime)`,
          quality: cleanTitle.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
          size: `${tSizeVal} ${tSizeUnit}`,
          magnet: tMagnet,
          seeds,
          peers: parseInt(tLeeches) || 0,
          type: 'web',
          isHindi: isHindiContent(cleanTitle)
        })
      }

      // Fallback: simpler RSS format (some mirrors use this format)
      if (allSources.length === 0) {
        const simpleItemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<enclosure[^>]*url="(magnet:\?[^"]*)"[\s\S]*?<\/item>/g
        let simpleMatch
        while ((simpleMatch = simpleItemRegex.exec(xml)) !== null) {
          const [, tTitle, tMagnet] = simpleMatch
          const cleanTitle = tTitle.trim().replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
          if (!isRelevanceMatch(cleanTitle, title, mediaType, year)) continue
          allSources.push({
            title: `${cleanTitle.substring(0, 80)} (Lime)`,
            quality: cleanTitle.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
            size: '—',
            magnet: tMagnet,
            seeds: 1,
            peers: 0,
            type: 'web',
            isHindi: isHindiContent(cleanTitle)
          })
        }
      }
    } catch {}
  }
  return allSources
}

// ─── GloTorrents — international tracker known for dual-audio releases ────────
async function fetchGloTorrentsSources(title: string, year: string, mediaType: string): Promise<any[]> {
  const baseQuery = mediaType === 'movie' && year ? `${title} ${year}` : title
  const queries = Array.from(new Set([
    `${baseQuery} Hindi`,
    `${baseQuery} Dual Audio`,
    `${baseQuery} Hindi Dubbed`,
    `${baseQuery} 1080p Hindi`
  ]))
  const allSources: any[] = []

  for (const query of queries) {
    try {
      const searchUrl = `https://glodls.to/search_results.php?search=${encodeURIComponent(query)}&cat=1&incldead=0&inclexternal=0&lang=0&sort=seeders&order=desc`
      const html = await nodeHttpRequest(searchUrl, { timeoutMs: 8500 })
      if (typeof html !== 'string' || html.length < 500) continue

      // Parse GloTorrents HTML table rows
      const rowRegex = /<td class="ttable_col1"[\s\S]*?<a[^>]*title="([^"]*)"[\s\S]*?<a[^>]*href="(magnet:\?[^"]+)"[\s\S]*?<td[^>]*class="ttable_col1"[^>]*>([\d,.]+\s*[GMKT]B)[\s\S]*?<td[^>]*class="ttable_col2"[^>]*><font[^>]*>(\d+)<\/font>[\s\S]*?<td[^>]*class="ttable_col1"[^>]*><font[^>]*>(\d+)<\/font>/g
      let match
      while ((match = rowRegex.exec(html)) !== null) {
        const [, tTitle, tMagnet, tSize, tSeeds, tLeeches] = match
        const cleanTitle = tTitle.trim()
        const seeds = parseInt(tSeeds) || 0
        if (seeds === 0) continue
        if (!isRelevanceMatch(cleanTitle, title, mediaType, year)) continue
        allSources.push({
          title: `${cleanTitle.substring(0, 80)} (Glo)`,
          quality: cleanTitle.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
          size: tSize.trim(),
          magnet: tMagnet,
          seeds,
          peers: parseInt(tLeeches) || 0,
          type: 'web',
          isHindi: isHindiContent(cleanTitle)
        })
      }
    } catch {}
  }
  return allSources
}

// ─── Dedicated 1337x Hindi Scraper — targets Indian release groups directly ───
async function fetch1337xHindiSources(title: string, year: string, mediaType: string): Promise<any[]> {
  const x1337Mirrors = ['1337x.to', '1337x.st', 'x1337x.ws']
  const queryYear = (mediaType === 'movie' && year) ? ` ${year}` : ''
  
  // Indian release group branded searches — these groups consistently tag Hindi dubbed releases
  const hindiGroupKeywords = [
    'KatmovieHD', 'HDhub4u', 'Vegamovies', 'UHDmovies', 'Dotmovies',
    'Bolly4u', 'Filmyzilla', 'Moviesflix', 'DesireMovies', 'MoviesPapa',
    'MoviesNation', '7StarHD', 'SkymoviesHD', 'MKVCinemas', 'Downloadhub',
    'Hdmovies4u', 'ExtraMovies', 'Luxmovies', 'BollyShare', 'MKVMoviesPoint',
    'TamilBlasters', '1TamilMV', 'KhatriMaza'
  ]
  
  const queries = Array.from(new Set([
    `${title}${queryYear} 1080p Hindi Dubbed`,
    `${title}${queryYear} 2160p Hindi Dubbed`,
    `${title}${queryYear} Hindi Dubbed`,
    `${title}${queryYear} 1080p Dual Audio`,
    `${title}${queryYear} Hindi 1080p`,
    `${title}${queryYear} Hindi 2160p`,
    ...hindiGroupKeywords.slice(0, 6).flatMap(group => [
      `${title}${queryYear} ${group} 1080p`,
      `${title}${queryYear} ${group}`
    ])
  ]))
  
  const allSources: any[] = []
  for (const domain of x1337Mirrors) {
    let mirrorWorked = false
    for (const xQuery of queries) {
      try {
        const xUrl = `https://${domain}/sort-search/${encodeURIComponent(xQuery)}/seeders/desc/1/`
        const html = await nodeHttpRequest(xUrl, { timeoutMs: 8500 })
        if (typeof html !== 'string') continue
        mirrorWorked = true

        const rowRegex = /<td class="coll-1 name">[\s\S]*?<a href="\/torrent\/(\d+)\/([^/]+)\/">([\s\S]*?)<\/a>[\s\S]*?<td class="coll-2 seeds">(\d+)<\/td>[\s\S]*?<td class="coll-3 leeches">(\d+)<\/td>[\s\S]*?<td class="coll-4 size">([^<]+)<span/g
        let match
        const torrentsToFetch: any[] = []
        while ((match = rowRegex.exec(html)) !== null) {
          const [, tId, tSlug, tTitleHtml, tSeeds, tLeeches, tSize] = match
          const tTitle = tTitleHtml.replace(/<[^>]+>/g, '').trim()
          const seeds = parseInt(tSeeds) || 0
          if (!isRelevanceMatch(tTitle, title, mediaType, year)) continue
          // Only keep results that look like Hindi content
          if (!isHindiContent(tTitle)) continue
          torrentsToFetch.push({ id: tId, slug: tSlug, title: tTitle, seeds, peers: parseInt(tLeeches) || 0, size: tSize.trim() })
          if (torrentsToFetch.length >= 8) break
        }

        const magnets = await Promise.allSettled(torrentsToFetch.map(async (t) => {
          const detailUrl = `https://${domain}/torrent/${t.id}/${t.slug}/`
          const detailHtml = await nodeHttpRequest(detailUrl, { timeoutMs: 7500 })
          const magnetMatch = detailHtml.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/)
          if (!magnetMatch) return null
          return {
            title: `${t.title.substring(0, 80)} (1337x Hindi)`,
            quality: t.title.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
            size: t.size,
            magnet: magnetMatch[1],
            seeds: t.seeds,
            peers: t.peers,
            type: 'web',
            isHindi: true
          }
        }))
        allSources.push(...magnets.flatMap(r => r.status === 'fulfilled' && r.value ? [r.value] : []))
      } catch {}
    }
    if (mirrorWorked && allSources.length > 0) break
  }
  return allSources
}

// ─── BTDIG — DHT search engine with good coverage of Hindi releases ──────────
async function fetchBtdigSources(title: string, year: string, mediaType: string): Promise<any[]> {
  const baseQuery = mediaType === 'movie' && year ? `${title} ${year}` : title
  const queries = Array.from(new Set([
    `${baseQuery} Hindi`,
    `${baseQuery} Hindi Dubbed`,
    `${baseQuery} Dual Audio`,
    `${baseQuery} Hin Eng`
  ]))
  const allSources: any[] = []

  for (const query of queries) {
    try {
      const searchUrl = `https://btdig.com/search?q=${encodeURIComponent(query)}&order=0`
      const html = await nodeHttpRequest(searchUrl, { timeoutMs: 9000 })
      if (typeof html !== 'string' || html.length < 300) continue

      // Parse BTDigg results
      const rowRegex = /<div class="one_result">[\s\S]*?<div class="torrent_name">[\s\S]*?<a href="[^"]*">([\s\S]*?)<\/a>[\s\S]*?<div class="torrent_size">\s*([^<]+)<\/div>[\s\S]*?<div class="torrent_magnet">[\s\S]*?<a href="(magnet:\?[^"]+)"/g
      let match
      while ((match = rowRegex.exec(html)) !== null) {
        const [, tTitleHtml, tSize, tMagnet] = match
        const cleanTitle = tTitleHtml.replace(/<[^>]+>/g, '').trim()
        if (!isRelevanceMatch(cleanTitle, title, mediaType, year)) continue
        allSources.push({
          title: `${cleanTitle.substring(0, 80)} (BTDig)`,
          quality: cleanTitle.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
          size: tSize.trim(),
          magnet: tMagnet,
          seeds: 1, // BTDigg doesn't show live seed counts; we mark as 1 so normalization doesn't discard
          peers: 0,
          type: 'web',
          isHindi: isHindiContent(cleanTitle)
        })
      }
    } catch {}
  }
  return allSources
}

function createChildAbortController(parentSignal?: AbortSignal): { controller: AbortController; release: () => void } {
  const controller = new AbortController()
  if (!parentSignal) return { controller, release: () => {} }

  if (parentSignal.aborted) {
    controller.abort()
    return { controller, release: () => {} }
  }

  const abortChild = () => controller.abort()
  parentSignal.addEventListener('abort', abortChild, { once: true })
  const release = () => parentSignal.removeEventListener('abort', abortChild)
  controller.signal.addEventListener('abort', release, { once: true })
  return { controller, release }
}

function withTimeout<T>(run: () => Promise<T>, timeoutMs: number, label: string, parentSignal?: AbortSignal): Promise<T> {
  const { controller, release } = createChildAbortController(parentSignal)
  return new Promise((resolve, reject) => {
    if (controller.signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      controller.signal.removeEventListener('abort', handleAbort)
      release()
    }
    const finishResolve = (value: T) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    const finishReject = (err: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }
    const handleAbort = () => {
      finishReject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      finishReject(new Error(`${label} timed out after ${timeoutMs}ms`))
      controller.abort()
    }, timeoutMs)

    controller.signal.addEventListener('abort', handleAbort, { once: true })
    torrentSourceAbortContext.run(controller.signal, run)
      .then((value) => {
        finishResolve(value)
      })
      .catch((err) => {
        finishReject(err)
      })
  })
}

const TORRENT_SOURCE_PROVIDER_CONCURRENCY = 5

async function searchTorrentSourcesProgressive(
  event: Electron.IpcMainInvokeEvent | null,
  title: string,
  year: string,
  mediaType: string,
  tmdbId: number,
  requestId?: string
): Promise<any[]> {
  const previousRequest = event ? activeTorrentSourceRequests.get(event.sender.id) : null
  if (previousRequest && previousRequest.requestId !== requestId) {
    previousRequest.controller.abort()
  }
  const controller = new AbortController()
  if (event && requestId) {
    activeTorrentSourceRequests.set(event.sender.id, { requestId, controller })
  }

  return torrentSourceAbortContext.run(controller.signal, async () => {
  try {
    console.log(`[Torrent] Searching sources for: "${title}" (${year}) type=${mediaType} tmdbId=${tmdbId}`)
    const cacheKey = getTorrentSourceCacheKey(title, year, mediaType, tmdbId)
    const cached = torrentSourceCache.get(cacheKey)
    const cachedFresh = cached && Date.now() - cached.timestamp < TORRENT_SOURCE_CACHE_TTL_MS
    if (cachedFresh) {
      sendTorrentSourceProgress(event, requestId, { sources: cached.sources, cached: true, completedProviders: 0, totalProviders: 0 })
    }

    const rawSources: any[] = cachedFresh ? [...cached.sources] : []
    const imdbPromise = getImdbIdForTmdb(mediaType, tmdbId).then((id) => {
      console.log(`[Torrent] Got IMDB ID: ${id}`)
      return id
    })
    const providers: Array<{ name: string; timeoutMs: number; run: () => Promise<any[]> }> = [
      ...(mediaType === 'movie'
        ? [{ name: 'YTS', timeoutMs: 12000, run: async () => fetchYtsSources(await imdbPromise) }]
        : [{ name: 'EZTV', timeoutMs: 14000, run: async () => fetchEztvSources(await imdbPromise) }]),
      { name: 'Torrentio', timeoutMs: 8000, run: async () => fetchTorrentioSources(await imdbPromise, title, mediaType) },
      { name: 'Torrentio Hindi', timeoutMs: 8000, run: async () => fetchTorrentioHindiSources(await imdbPromise, title, mediaType) },
      { name: 'Torrentio Dual Audio', timeoutMs: 10000, run: async () => fetchTorrentioDualAudioSources(await imdbPromise, title, mediaType) },
      { name: 'MediaFusion', timeoutMs: 10000, run: async () => fetchMediaFusionSources(await imdbPromise, title, mediaType) },
      // Elfhosted addons are intentionally omitted here: current public endpoints
      // return 403/404, deprecated pages, config prompts, or no usable infoHash streams.
      { name: '1337x', timeoutMs: 15000, run: () => fetch1337xSources(title, year, mediaType) },
      { name: '1337x Hindi', timeoutMs: 18000, run: () => fetch1337xHindiSources(title, year, mediaType) },
      { name: 'TorrentGalaxy', timeoutMs: 14000, run: () => fetchTorrentGalaxySources(title, year, mediaType) },
      { name: 'APIBay Title', timeoutMs: 10000, run: () => fetchApiBayTitleSources(title, year, mediaType) },
      { name: 'APIBay', timeoutMs: 8000, run: async () => fetchApiBaySources(await imdbPromise) },
      { name: 'SolidTorrents', timeoutMs: 10000, run: () => fetchSolidSources(title, year, mediaType) },
      { name: 'Bitsearch', timeoutMs: 12000, run: () => fetchBitsearchSources(title, year, mediaType) },
      { name: 'LimeTorrents', timeoutMs: 10000, run: () => fetchLimeTorrentsSources(title, year, mediaType) },
      { name: 'GloTorrents', timeoutMs: 10000, run: () => fetchGloTorrentsSources(title, year, mediaType) },
      { name: 'BTDig', timeoutMs: 12000, run: () => fetchBtdigSources(title, year, mediaType) },
      { name: 'Nyaa', timeoutMs: 8000, run: async () => fetchNyaaSources(title, year, mediaType) }
    ]

    let completedProviders = 0
    const totalProviders = providers.length
    sendTorrentSourceProgress(event, requestId, {
      sources: normalizeTorrentSources(rawSources, mediaType),
      completedProviders,
      totalProviders,
      cached: Boolean(cachedFresh)
    })

    const pendingProviders = [...providers]
    const activeProviders: Array<{
      provider: { name: string; timeoutMs: number; run: () => Promise<any[]> }
      task: Promise<{ sources: any[]; error: string | null }>
    }> = []

    const startNextProviders = () => {
      while (
        pendingProviders.length > 0 &&
        activeProviders.length < TORRENT_SOURCE_PROVIDER_CONCURRENCY &&
        isTorrentSourceRequestActive(event, requestId)
      ) {
        const provider = pendingProviders.shift()!
        activeProviders.push({
          provider,
          task: withTimeout(provider.run, provider.timeoutMs, provider.name, controller.signal)
            .then((sources) => ({ sources, error: null as string | null }))
            .catch((err: any) => ({ sources: [] as any[], error: err?.message || 'Provider failed' }))
        })
      }
    }

    startNextProviders()

    while (activeProviders.length > 0) {
      if (!isTorrentSourceRequestActive(event, requestId)) {
        sendTorrentSourceProgress(event, requestId, {
          sources: normalizeTorrentSources(rawSources, mediaType),
          done: true,
          completedProviders,
          totalProviders,
          error: 'Source search canceled'
        })
        return normalizeTorrentSources(rawSources, mediaType)
      }

      const { index, provider, sources, error } = await Promise.race(
        activeProviders.map((entry, index) =>
          entry.task.then((result) => ({
            index,
            provider: entry.provider,
            sources: result.sources,
            error: result.error
          }))
        )
      )
      activeProviders.splice(index, 1)

      if (!isTorrentSourceRequestActive(event, requestId)) {
        sendTorrentSourceProgress(event, requestId, {
          sources: normalizeTorrentSources(rawSources, mediaType),
          done: true,
          completedProviders,
          totalProviders,
          error: 'Source search canceled'
        })
        return normalizeTorrentSources(rawSources, mediaType)
      }

      completedProviders += 1
      if (error) {
        console.error(`[Torrent] ${provider.name} fetch failed:`, error)
        sendTorrentSourceProgress(event, requestId, {
          sources: normalizeTorrentSources(rawSources, mediaType),
          provider: provider.name,
          completedProviders,
          totalProviders,
          error
        })
        startNextProviders()
        continue
      }

      console.log(`[Torrent] ${provider.name} returned ${sources.length} source(s) for "${title}"`)
      if (sources.length > 0) {
        rawSources.push(...sources)
      }
      const normalized = normalizeTorrentSources(rawSources, mediaType)
      sendTorrentSourceProgress(event, requestId, {
        sources: normalized,
        provider: provider.name,
        completedProviders,
        totalProviders
      })
      startNextProviders()
    }

    const finalSources = normalizeTorrentSources(rawSources, mediaType)
    torrentSourceCache.set(cacheKey, { sources: finalSources, timestamp: Date.now() })
    sendTorrentSourceProgress(event, requestId, {
      sources: finalSources,
      done: true,
      completedProviders: totalProviders,
      totalProviders
    })
    return finalSources
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err)) {
      sendTorrentSourceProgress(event, requestId, {
        sources: [],
        done: true,
        error: 'Source search canceled'
      })
      return []
    }
    console.error('[Torrent] Source search error:', err)
    sendTorrentSourceProgress(event, requestId, { sources: [], done: true, error: 'Source search failed' })
    return []
  } finally {
    controller.abort()
    clearTorrentSourceRequest(event, requestId)
  }
  })
}

// ─── IPC: Search Torrent Sources ─────────────────────────────────────────────
ipcMain.handle('search-torrent-sources', async (event, title: string, year: string, mediaType: string, tmdbId: number, requestId?: string) => {
  return searchTorrentSourcesProgressive(event, title, year, mediaType, tmdbId, requestId)
})

ipcMain.handle('cancel-torrent-source-search', async (event, requestId: string) => {
  const activeRequest = activeTorrentSourceRequests.get(event.sender.id)
  if (!activeRequest || activeRequest.requestId !== requestId) return false
  activeRequest.controller.abort()
  activeTorrentSourceRequests.delete(event.sender.id)
  event.sender.send('torrent-sources-progress', {
    requestId,
    sources: [],
    done: true,
    error: 'Source search canceled'
  })
  return true
})

// ΓöÇΓöÇΓöÇ IPC: Start Torrent Download ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

async function startWebTorrent(torrentId: string, magnetUrl: string, title: string, initialProgress: number = 0, initialName?: string | null) {
  pausedTorrentIds.delete(torrentId)
  clearTorrentProgressInterval(torrentId)
  const client = await getWebTorrentClient()
  const downloadPath = getDownloadPath()
  const enrichedMagnetUrl = enrichMagnetWithTrackers(magnetUrl)
  const existingDownload = db.getDownloads().find((d: any) => d.id === torrentId)
  const displayName = initialName || existingDownload?.name || getMagnetDisplayName(enrichedMagnetUrl) || title

  console.log(`[Torrent] Starting download: "${title}" -> ${downloadPath}`)
  console.log(`[Torrent] Magnet: ${enrichedMagnetUrl.slice(0, 80)}...`)

  broadcastProgress(torrentId, { downloadSpeed: 0, timeRemaining: 0, length: 0, downloaded: 0, progress: initialProgress / 100, name: displayName, _myCinemaTitle: title, _myCinemaName: displayName } as any, 'downloading')

  const torrent = client.add(enrichedMagnetUrl, { 
    path: downloadPath,
    announce: EXTRA_TRACKERS
  })
  console.log(`[Torrent] Added to client. infoHash: ${torrent.infoHash}`)
  
  torrent._myCinemaTitle = title
  torrent._myCinemaName = displayName
  
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
      clearTorrentProgressInterval(torrentId)
      return
    }
    broadcastProgress(torrentId, torrent, torrent.paused ? 'paused' : 'downloading')
  }, 1000)
  torrentProgressIntervals.set(torrentId, progressInterval)

  torrent.on('done', () => {
    pausedTorrentIds.delete(torrentId)
    clearTorrentProgressInterval(torrentId)
    broadcastProgress(torrentId, torrent, 'done')
    console.log(`[Torrent] Download complete: ${title}`)
    setTimeout(() => {
      if (!torrent.destroyed) torrent.destroy()
      markTorrentInactive(torrentId)
    }, 5000)
  })

  torrent.on('error', (err: Error) => {
    pausedTorrentIds.delete(torrentId)
    clearTorrentProgressInterval(torrentId)
    broadcastProgress(torrentId, torrent, 'error', err.message)
    console.error(`[Torrent] Error: ${err.message}`)
    if (!torrent.destroyed) {
      torrent.destroy()
    }
    markTorrentInactive(torrentId)
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

ipcMain.handle('start-torrent-download', async (_, magnetUrl: string, title: string, tmdbId?: number, name?: string) => {
  try {
    const torrentId = crypto.randomUUID()
    const enrichedMagnetUrl = enrichMagnetWithTrackers(magnetUrl)
    const displayName = name || getMagnetDisplayName(enrichedMagnetUrl) || title
    
    db.addDownload({
      id: torrentId,
      title,
      name: displayName,
      magnet: enrichedMagnetUrl,
      status: 'downloading',
      tmdbId
    })

    await startWebTorrent(torrentId, enrichedMagnetUrl, title, 0, displayName)
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
    pausedTorrentIds.add(id)
    clearTorrentProgressInterval(id)
    
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
        name: dlDbData.name || getMagnetDisplayName(dlDbData.magnet) || dlDbData.title
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
        pausedTorrentIds.delete(id)
        console.log(`[Torrent] Resuming "${dbDl.title}" from ${dbDl.progress}%`)
        await startWebTorrent(id, dbDl.magnet, dbDl.title, dbDl.progress || 0)
        return true
      }
      return false
    }
    
    // Pause Logic (Stop & Destroy pattern for reliability)
    console.log(`[Torrent] Pausing download: ${id}`)
    pausedTorrentIds.add(id)
    clearTorrentProgressInterval(id)
    
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
        name: dlDbData.name || getMagnetDisplayName(dlDbData.magnet) || dlDbData.title
      } as any, 'paused')
    }
    
    return true
  } catch (err) {
    console.error('[Torrent] Pause/Resume error:', err)
    return false
  }
})

// ─── IPC: Retry Failed Torrent ────────────────────────────────────────────────
ipcMain.handle('retry-torrent-download', async (_, id: string) => {
  try {
    pausedTorrentIds.delete(id)
    const dbDl = db.getDownloads().find((d: any) => d.id === id)
    if (!dbDl) return false

    const existingTorrent = activeTorrents.get(id)
    if (existingTorrent && !existingTorrent.destroyed) {
      clearTorrentProgressInterval(id)
      existingTorrent.destroy()
      activeTorrents.delete(id)
    }

    try {
      const client = await getWebTorrentClient()
      const duplicateTorrent = typeof client.get === 'function' ? client.get(dbDl.magnet) : null
      if (duplicateTorrent && !duplicateTorrent.destroyed) {
        await destroyTorrentForDelete(duplicateTorrent)
      }
    } catch (err: any) {
      console.warn('[Torrent] Could not clear previous failed torrent before retry:', err.message)
    }

    db.updateDownload({
      ...dbDl,
      downloadSpeed: '0 B/s',
      timeRemaining: '—',
      status: 'connecting',
      errorMessage: null
    })

    await startWebTorrent(id, dbDl.magnet, dbDl.title, dbDl.progress || 0)
    return true
  } catch (err) {
    console.error('[Torrent] Retry error:', err)
    return false
  }
})

// ─── IPC: Get Active Downloads ───────────────────────────────────────────────
ipcMain.handle('get-active-downloads', async () => {
  return db.getDownloads()
})

ipcMain.handle('prepare-torrent-stream', async (_, id: string) => {
  try {
    const file = await getPreparedTorrentFile(id)
    return {
      url: `torrent://stream/${encodeURIComponent(id)}`,
      fileName: file.name || file.path || 'Torrent video',
      size: file.length || 0
    }
  } catch (err: any) {
    console.error('[TorrentStream] Prepare failed:', err)
    return { error: err?.message || 'Torrent stream unavailable' }
  }
})

function normalizeTorrentRelativePath(relativePath: string): string {
  return path.normalize(relativePath).replace(/^(\.\.(\\|\/|$))+/, '')
}

function getTopLevelDownloadTarget(downloadRoot: string, relativePath: string): string | null {
  const normalized = normalizeTorrentRelativePath(relativePath)
  const firstSegment = normalized.split(/[\\/]/).filter(Boolean)[0]
  if (!firstSegment) return null
  return path.resolve(downloadRoot, firstSegment)
}

function getMagnetDisplayName(magnet?: string | null): string | null {
  if (!magnet) return null
  try {
    const params = new URLSearchParams(magnet.split('?')[1] || '')
    return params.get('dn')
  } catch {
    return null
  }
}

function normalizeSearchName(value?: string | null): string {
  return (value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(480p|720p|1080p|2160p|4k|hdrip|webrip|web-dl|bluray|x264|x265|hevc|hindi|dual|audio)\b/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function collectMatchingDownloadRootTargets(downloadRoot: string, download: any): string[] {
  const targets: string[] = []
  const searchNames = [
    normalizeSearchName(download?.title),
    normalizeSearchName(download?.name),
    normalizeSearchName(getMagnetDisplayName(download?.magnet))
  ].filter(name => name.length >= 3)

  if (searchNames.length === 0 || !fs.existsSync(downloadRoot)) return targets

  try {
    const entries = fs.readdirSync(downloadRoot, { withFileTypes: true })
    for (const entry of entries) {
      const entryName = normalizeSearchName(entry.name)
      if (!entryName) continue

      const isMatch = searchNames.some(searchName =>
        entryName.includes(searchName) || searchName.includes(entryName)
      )
      if (isMatch) {
        targets.push(path.resolve(downloadRoot, entry.name))
      }
    }
  } catch (err: any) {
    console.warn('[Torrent] Could not scan download root for paused delete fallback:', err.message)
  }

  return targets
}

function getDownloadSearchNames(torrent: any, download: any): string[] {
  const sourceNames = [
    torrent?.name,
    torrent?._myCinemaName,
    download?.name,
    getMagnetDisplayName(download?.magnet)
  ]
    .map(name => normalizeSearchName(name))
    .filter(name => name.length >= 6)

  if (sourceNames.length > 0) return sourceNames

  return [download?.title]
    .map(name => normalizeSearchName(name))
    .filter(name => name.length >= 6)
}

function isLikelyDownloadMatch(candidatePath: string, torrent: any, download: any): boolean {
  const candidateName = normalizeSearchName(candidatePath)
  if (!candidateName) return false

  const searchNames = getDownloadSearchNames(torrent, download)
  if (searchNames.length === 0) return true

  return searchNames.some(searchName =>
    candidateName.includes(searchName) || searchName.includes(candidateName)
  )
}

function collectMatchingEpisodeFileTargets(
  downloadRoot: string,
  torrent: any,
  download: any,
  tvMeta: { parsedSeason?: number; parsedEpisode?: number }
): string[] {
  if (typeof tvMeta.parsedEpisode !== 'number' || !fs.existsSync(downloadRoot)) return []

  const targets: string[] = []
  const stack = [downloadRoot]
  let visited = 0

  while (stack.length > 0 && visited < 5000) {
    const current = stack.pop()
    if (!current) continue
    visited++

    let entries: any[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(entryPath)
        continue
      }

      if (!entry.isFile() || !isVideoFilePath(entry.name)) continue
      const meta = parseTvTorrentMetadata(entryPath)
      const sameEpisode = Number(meta.parsedSeason || 1) === Number(tvMeta.parsedSeason || 1) &&
        Number(meta.parsedEpisode) === Number(tvMeta.parsedEpisode)
      if (sameEpisode && isLikelyDownloadMatch(path.relative(downloadRoot, entryPath), torrent, download)) {
        targets.push(entryPath)
      }
    }
  }

  return targets
}

function isVideoFilePath(candidate?: string | null): boolean {
  return Boolean(candidate && VIDEO_EXTS.has(path.extname(candidate).toLowerCase()))
}

function getDownloadSourceNames(torrent: any, download: any): string[] {
  return [
    torrent?.name,
    torrent?._myCinemaName,
    download?.name,
    getMagnetDisplayName(download?.magnet),
    download?.title
  ].filter(Boolean)
}

function inferDownloadTvMetadata(torrent: any, download: any): { parsedSeason?: number; parsedEpisode?: number; isSeasonPack?: boolean } {
  const videoFileMetas: ReturnType<typeof parseTvTorrentMetadata>[] = Array.isArray(torrent?.files)
    ? torrent.files
        .map((file: any) => file?.path || file?.name)
        .filter((filePath: string | undefined) => isVideoFilePath(filePath))
        .map((filePath: string) => parseTvTorrentMetadata(filePath))
    : []

  const episodeMetas = videoFileMetas.filter(meta => typeof meta.parsedEpisode === 'number')
  const episodeKeys = new Set(episodeMetas.map(meta => `${meta.parsedSeason || 1}:${meta.parsedEpisode}`))
  if (episodeKeys.size > 1) {
    const seasons = new Set(episodeMetas.map(meta => meta.parsedSeason).filter((season): season is number => typeof season === 'number'))
    return {
      parsedSeason: seasons.size === 1 ? Array.from(seasons)[0] : undefined,
      isSeasonPack: true
    }
  }
  if (episodeMetas.length === 1) return { ...episodeMetas[0], isSeasonPack: false }

  for (const name of getDownloadSourceNames(torrent, download)) {
    const meta = parseTvTorrentMetadata(name)
    if (typeof meta.parsedEpisode === 'number') return { ...meta, isSeasonPack: false }
  }

  for (const meta of videoFileMetas) {
    if (meta.isSeasonPack) return meta
  }

  for (const name of getDownloadSourceNames(torrent, download)) {
    const meta = parseTvTorrentMetadata(name)
    if (meta.isSeasonPack) return meta
  }

  return {}
}

function getMatchingDownloadedVideos(downloadRoot: string, download: any, tvMeta: { parsedSeason?: number; parsedEpisode?: number; isSeasonPack?: boolean }): any[] {
  if (!download?.tmdbId) return []

  return (db.getVideos() as any[]).filter((video: any) => {
    if (video.tmdb_id !== download.tmdbId || !isPathInsideRoot(video.file_path, downloadRoot)) return false

    if (typeof tvMeta.parsedEpisode === 'number') {
      return Number(video.season || 1) === Number(tvMeta.parsedSeason || 1) && Number(video.episode) === Number(tvMeta.parsedEpisode)
    }

    if (tvMeta.isSeasonPack && typeof tvMeta.parsedSeason === 'number') {
      return Number(video.season || 1) === Number(tvMeta.parsedSeason)
    }

    return Boolean(tvMeta.isSeasonPack)
  })
}

function collectDownloadDeleteTargets(id: string, torrent: any, download: any): string[] {
  const downloadRoot = getDownloadPath()
  const targets = new Set<string>()
  const tvMeta = inferDownloadTvMetadata(torrent, download)
  const isSingleEpisodeDownload = typeof tvMeta.parsedEpisode === 'number' && tvMeta.isSeasonPack === false
  const isSeasonPackDownload = Boolean(tvMeta.isSeasonPack) && !isSingleEpisodeDownload

  const addTarget = (candidate?: string | null) => {
    if (!candidate) return
    const resolved = path.resolve(downloadRoot, candidate)
    if (isPathInsideRoot(resolved, downloadRoot) && resolved !== path.resolve(downloadRoot)) {
      targets.add(resolved)
    }
  }

  const addAbsoluteTarget = (candidate?: string | null) => {
    if (!candidate) return
    const resolved = path.resolve(candidate)
    if (isPathInsideRoot(resolved, downloadRoot) && resolved !== path.resolve(downloadRoot)) {
      targets.add(resolved)
    }
  }

  const matchingVideos = getMatchingDownloadedVideos(downloadRoot, download, tvMeta)
  for (const video of matchingVideos) {
    addAbsoluteTarget(video.file_path)
  }

  if (!isSingleEpisodeDownload) {
    addTarget(torrent?.name)
    addTarget(torrent?._myCinemaName)
    addTarget(download?.name)
    addTarget(getMagnetDisplayName(download?.magnet))
  }

  if (Array.isArray(torrent?.files)) {
    for (const file of torrent.files) {
      const relativeFilePath = file?.path || file?.name
      if (!relativeFilePath) continue

      addTarget(relativeFilePath)
      if (!isSingleEpisodeDownload) {
        addAbsoluteTarget(getTopLevelDownloadTarget(downloadRoot, relativeFilePath))
      }
    }
  }

  if (download?.tmdbId && !isSingleEpisodeDownload && !isSeasonPackDownload) {
    const videos = db.getVideos() as any[]
    for (const video of videos) {
      if (video.tmdb_id === download.tmdbId && video.type !== 'series' && isPathInsideRoot(video.file_path, downloadRoot)) {
        addAbsoluteTarget(video.file_path)
        addAbsoluteTarget(getTopLevelDownloadTarget(downloadRoot, path.relative(downloadRoot, video.file_path)))
      }
    }
  }

  if (targets.size === 0 && !isSingleEpisodeDownload) {
    for (const target of collectMatchingDownloadRootTargets(downloadRoot, download)) {
      addAbsoluteTarget(target)
    }
  }

  if (targets.size === 0 && isSingleEpisodeDownload) {
    for (const target of collectMatchingEpisodeFileTargets(downloadRoot, torrent, download, tvMeta)) {
      addAbsoluteTarget(target)
    }
  }

  if (targets.size === 0) {
    const fallbackName = download?.name || torrent?.name || torrent?._myCinemaName || download?.title || id
    if (!isSingleEpisodeDownload || isVideoFilePath(fallbackName)) {
      addTarget(fallbackName)
    }
  }

  return Array.from(targets).sort((a, b) => a.length - b.length)
}

function destroyTorrentForDelete(torrent: any): Promise<void> {
  if (!torrent || torrent.destroyed) return Promise.resolve()

  return new Promise(resolve => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }

    try {
      torrent.destroy(done)
      setTimeout(done, 1000)
    } catch {
      done()
    }
  })
}

async function hardDeletePaths(pathsToDelete: string[]) {
  const downloadRoot = getDownloadPath()
  const uniquePaths = Array.from(new Set(pathsToDelete))
    .filter(target => isPathInsideRoot(target, downloadRoot) && path.resolve(target) !== path.resolve(downloadRoot))
    .sort((a, b) => b.length - a.length)

  for (const target of uniquePaths) {
    for (const delay of [0, 500, 1500]) {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      try {
        if (fs.existsSync(target)) {
          console.log(`[Torrent] Hard deleting from disk: ${target}`)
          fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 })
        }
        break
      } catch (err: any) {
        if (delay === 1500) {
          console.error(`[Torrent] Hard delete failed for ${target}:`, err.message)
        }
      }
    }
  }

  for (const target of uniquePaths) {
    db.removeVideosUnderPath(target)
  }
}

// ─── IPC: Remove Download ────────────────────────────────────────────────────
ipcMain.handle('remove-download', async (_, id: string, deleteFile: boolean = false) => {
  try {
    const torrent = activeTorrents.get(id)
    const download = db.getDownloads().find((d: any) => d.id === id)
    const deleteTargets = deleteFile ? collectDownloadDeleteTargets(id, torrent, download) : []

    // 1. Stop and remove from memory
    pausedTorrentIds.delete(id)
    clearTorrentProgressInterval(id)
    if (torrent) {
      await destroyTorrentForDelete(torrent)
      activeTorrents.delete(id)
    }
    
    // 2. Delete download row from DB
    db.removeDownloadRow(id)
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('downloads-changed'))

    // 3. Optionally hard delete physical files and related library metadata
    if (deleteFile) {
      await hardDeletePaths(deleteTargets)
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('library-updated'))
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
