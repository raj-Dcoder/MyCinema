import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import https from 'https'
import http from 'http'
import { app } from 'electron'
import * as db from './db'

export interface HttpDownloadItem {
  id: string
  url: string
  fileName: string
  title: string
  savePath: string
  partPath: string
  totalBytes: number
  downloadedBytes: number
  status: 'downloading' | 'paused' | 'done' | 'error' | 'queued'
  speed: number
  timeRemaining: number
  lastBytes: number
  lastTime: number
  abortController?: AbortController
  fileStream?: fs.WriteStream
  errorMessage?: string
  tmdbId?: number
}

// Active in-flight HTTP downloads keyed by ID
const activeHttpDownloads = new Map<string, HttpDownloadItem>()

// Progress callback registered by index.ts
type ProgressBroadcaster = (id: string, torrentLike: any, status: string, errorMessage?: string) => void
let progressBroadcaster: ProgressBroadcaster | null = null

export function registerHttpProgressBroadcaster(fn: ProgressBroadcaster): void {
  progressBroadcaster = fn
}

export function isHttpDownload(id: string): boolean {
  return activeHttpDownloads.has(id) || Boolean(
    db.getDownloads().find((d: any) => d.id === id && (d.magnet?.startsWith('http://') || d.magnet?.startsWith('https://')))
  )
}

export function getActiveHttpDownload(id: string): HttpDownloadItem | undefined {
  return activeHttpDownloads.get(id)
}

let downloadDirResolver: (() => string) | null = null

export function registerDownloadDirResolver(fn: () => string): void {
  downloadDirResolver = fn
}

export function getDownloadRoot(): string {
  if (downloadDirResolver) {
    try {
      const resolved = downloadDirResolver()
      if (resolved && typeof resolved === 'string') return resolved
    } catch (err) {
      console.warn('[HttpDownloader] Resolver failed, falling back to default:', err)
    }
  }
  return path.join(app.getPath('downloads'), 'MyCinema')
}

function getDownloadDestination(fileName: string, explicitRoot?: string): { savePath: string; partPath: string } {
  const root = explicitRoot || getDownloadRoot()
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }
  const cleanName = fileName.replace(/[<>:"/\\|?*]+/g, '_')
  const savePath = path.join(root, cleanName)
  const partPath = path.join(root, `${cleanName}.part`)
  return { savePath, partPath }
}

/**
 * Initiates an HTTP/HTTPS direct file download and registers it into MyCinema's downloads system.
 */
export async function startHttpDownload(params: {
  url: string
  fileName: string
  title?: string
  totalBytes?: number
  tmdbId?: number
  id?: string
}): Promise<string> {
  const id = params.id || crypto.randomUUID()
  const { savePath, partPath } = getDownloadDestination(params.fileName)
  const title = params.title || params.fileName.replace(/\.[^/.]+$/, '').replace(/[._]/g, ' ')

  // Check if partially downloaded
  let existingBytes = 0
  if (fs.existsSync(partPath)) {
    try {
      existingBytes = fs.statSync(partPath).size
    } catch {
      existingBytes = 0
    }
  }

  const item: HttpDownloadItem = {
    id,
    url: params.url,
    fileName: params.fileName,
    title,
    savePath,
    partPath,
    totalBytes: params.totalBytes || 0,
    downloadedBytes: existingBytes,
    status: 'downloading',
    speed: 0,
    timeRemaining: 0,
    lastBytes: existingBytes,
    lastTime: Date.now(),
    tmdbId: params.tmdbId
  }

  activeHttpDownloads.set(id, item)

  // Persist into downloads SQLite table
  db.addDownload({
    id,
    title,
    name: params.fileName,
    magnet: params.url,
    progress: params.totalBytes && params.totalBytes > 0 ? (existingBytes / params.totalBytes) * 100 : 0,
    downloadSpeed: '0 B/s',
    timeRemaining: '—',
    status: 'downloading',
    size: params.totalBytes ? formatBytes(params.totalBytes) : '—',
    downloaded: formatBytes(existingBytes),
    tmdbId: params.tmdbId,
    downloadPath: savePath
  })

  // Broadcast initial status
  notifyProgress(item, 'downloading')

  // Run the download worker stream
  runDownloadStream(item).catch(err => {
    console.error(`[HttpDownloader] Stream error for ${item.fileName}:`, err)
    item.status = 'error'
    item.errorMessage = err?.message || 'Download failed'
    notifyProgress(item, 'error', item.errorMessage)
  })

  return id
}

async function runDownloadStream(item: HttpDownloadItem, redirectCount = 0): Promise<void> {
  if (redirectCount > 8) {
    throw new Error('Too many HTTP redirects')
  }

  const urlObj = new URL(item.url)
  const isHttps = urlObj.protocol === 'https:'
  const client = isHttps ? https : http

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Connection': 'keep-alive'
  }

  if (item.downloadedBytes > 0) {
    headers['Range'] = `bytes=${item.downloadedBytes}-`
  }

  const abortController = new AbortController()
  item.abortController = abortController

  return new Promise((resolve, reject) => {
    const req = client.get(item.url, {
      headers,
      signal: abortController.signal
    }, (res) => {
      // Handle HTTP redirects
      if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
        const redirectUrl = res.headers.location
        if (redirectUrl) {
          const resolved = new URL(redirectUrl, item.url).toString()
          console.log(`[HttpDownloader] Redirecting to: ${resolved}`)
          item.url = resolved
          runDownloadStream(item, redirectCount + 1).then(resolve).catch(reject)
          return
        }
      }

      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300) && res.statusCode !== 416) {
        reject(new Error(`HTTP Server returned status ${res.statusCode}`))
        return
      }

      // Check Content-Length
      const contentLength = res.headers['content-length']
      if (contentLength && !item.totalBytes) {
        const total = parseInt(contentLength, 10)
        item.totalBytes = item.downloadedBytes > 0 ? existingOrSum(item.downloadedBytes, total, res.statusCode) : total
      }

      // If server does not support range and returned 200 instead of 206, reset offset
      const isRangeResponse = res.statusCode === 206
      const fileFlags = (item.downloadedBytes > 0 && isRangeResponse) ? 'a' : 'w'
      if (!isRangeResponse && item.downloadedBytes > 0) {
        item.downloadedBytes = 0
        item.lastBytes = 0
      }

      const fileStream = fs.createWriteStream(item.partPath, { flags: fileFlags })
      item.fileStream = fileStream

      res.on('data', (chunk: Buffer) => {
        item.downloadedBytes += chunk.length
        calculateSpeedAndEta(item)
      })

      res.pipe(fileStream)

      fileStream.on('finish', () => {
        fileStream.close(() => {
          if (item.status === 'downloading') {
            // Rename from .part to final file
            try {
              if (fs.existsSync(item.savePath)) {
                fs.unlinkSync(item.savePath)
              }
              fs.renameSync(item.partPath, item.savePath)
            } catch (err) {
              console.warn('[HttpDownloader] Rename error, keeping .part:', err)
            }

            item.status = 'done'
            item.speed = 0
            item.timeRemaining = 0
            notifyProgress(item, 'done')
            console.log(`[HttpDownloader] Download completed successfully: ${item.savePath}`)
            activeHttpDownloads.delete(item.id)
            resolve()
          } else {
            resolve()
          }
        })
      })

      fileStream.on('error', (err) => {
        reject(err)
      })
    })

    req.on('error', (err: any) => {
      if (abortController.signal.aborted) {
        // Normal abort on pause / cancel
        resolve()
      } else {
        reject(err)
      }
    })
  })
}

function existingOrSum(existing: number, fromHeader: number, status?: number): number {
  if (status === 206) {
    return existing + fromHeader
  }
  return fromHeader
}

let lastBroadcastTime = 0
function calculateSpeedAndEta(item: HttpDownloadItem): void {
  const now = Date.now()
  const elapsedSec = (now - item.lastTime) / 1000

  if (elapsedSec >= 0.8) {
    const bytesDelta = item.downloadedBytes - item.lastBytes
    item.speed = Math.max(0, bytesDelta / elapsedSec)
    item.lastBytes = item.downloadedBytes
    item.lastTime = now

    if (item.totalBytes > 0 && item.speed > 0) {
      const remainingBytes = Math.max(0, item.totalBytes - item.downloadedBytes)
      item.timeRemaining = (remainingBytes / item.speed) * 1000 // ms
    } else {
      item.timeRemaining = 0
    }

    if (now - lastBroadcastTime >= 800) {
      lastBroadcastTime = now
      notifyProgress(item, 'downloading')
    }
  }
}

function notifyProgress(item: HttpDownloadItem, status: string, errorMessage?: string): void {
  if (!progressBroadcaster) return
  const progressRatio = item.totalBytes > 0 ? item.downloadedBytes / item.totalBytes : 0

  progressBroadcaster(
    item.id,
    {
      progress: progressRatio,
      downloadSpeed: item.status === 'paused' || item.status === 'done' ? 0 : item.speed,
      timeRemaining: item.timeRemaining,
      length: item.totalBytes,
      downloaded: item.downloadedBytes,
      name: item.fileName,
      _myCinemaTitle: item.title,
      _myCinemaName: item.fileName
    },
    status,
    errorMessage
  )
}

export function pauseHttpDownload(id: string): boolean {
  const item = activeHttpDownloads.get(id)
  if (!item) {
    // Check if recorded in DB
    const row = db.getDownloads().find((d: any) => d.id === id)
    if (row) {
      row.status = 'paused'
      row.downloadSpeed = '0 B/s'
      row.timeRemaining = '—'
      db.updateDownload(row)
      return true
    }
    return false
  }

  item.status = 'paused'
  item.speed = 0
  item.timeRemaining = 0
  if (item.abortController) {
    item.abortController.abort()
  }
  if (item.fileStream) {
    item.fileStream.close()
  }

  notifyProgress(item, 'paused')
  return true
}

export async function resumeHttpDownload(id: string): Promise<boolean> {
  const row = db.getDownloads().find((d: any) => d.id === id)
  if (!row) return false

  let item = activeHttpDownloads.get(id)
  if (!item) {
    let savePath = row.download_path
    let partPath = savePath ? `${savePath}.part` : ''
    if (!savePath) {
      const dest = getDownloadDestination(row.name || row.title)
      savePath = dest.savePath
      partPath = dest.partPath
    }
    let existingBytes = 0
    if (fs.existsSync(partPath)) {
      try { existingBytes = fs.statSync(partPath).size } catch {}
    }

    item = {
      id,
      url: row.magnet,
      fileName: row.name || row.title,
      title: row.title,
      savePath,
      partPath,
      totalBytes: 0,
      downloadedBytes: existingBytes,
      status: 'downloading',
      speed: 0,
      timeRemaining: 0,
      lastBytes: existingBytes,
      lastTime: Date.now(),
      tmdbId: row.tmdb_id
    }
    activeHttpDownloads.set(id, item)
  }

  item.status = 'downloading'
  item.lastTime = Date.now()
  item.lastBytes = item.downloadedBytes

  notifyProgress(item, 'downloading')
  runDownloadStream(item).catch(err => {
    console.error(`[HttpDownloader] Resume error for ${item?.fileName}:`, err)
    if (item) {
      item.status = 'error'
      item.errorMessage = err?.message || 'Resume failed'
      notifyProgress(item, 'error', item.errorMessage)
    }
  })

  return true
}

export function cancelHttpDownload(id: string, deleteFile = false): boolean {
  const item = activeHttpDownloads.get(id)
  if (item) {
    item.status = 'paused'
    if (item.abortController) item.abortController.abort()
    if (item.fileStream) item.fileStream.close()
    if (deleteFile) {
      try { if (fs.existsSync(item.partPath)) fs.unlinkSync(item.partPath) } catch {}
      try { if (fs.existsSync(item.savePath)) fs.unlinkSync(item.savePath) } catch {}
    }
    activeHttpDownloads.delete(id)
  }

  const row = db.getDownloads().find((d: any) => d.id === id)
  if (row && deleteFile) {
    const savePath = row.download_path || getDownloadDestination(row.name || row.title).savePath
    const partPath = `${savePath}.part`
    try { if (fs.existsSync(partPath)) fs.unlinkSync(partPath) } catch {}
    try { if (fs.existsSync(savePath)) fs.unlinkSync(savePath) } catch {}
  }

  return true
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
