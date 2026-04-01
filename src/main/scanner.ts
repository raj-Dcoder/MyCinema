import fs from 'fs'
import path from 'path'
import { addVideo, getVideos, updateVideoMetadata, deleteVideo } from './db'
import { fetchMetadata } from './omdb'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

import { app, BrowserWindow } from 'electron'

// Set ffmpeg/ffprobe paths
const isDev = !app.isPackaged
const ffmpegPath = isDev 
  ? path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe') 
  : path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
  
const ffprobePath = isDev 
  ? path.join(app.getAppPath(), 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe')
  : path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe')

ffmpeg.setFfprobePath(ffprobePath)
ffmpeg.setFfmpegPath(ffmpegPath)

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm']

async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error(`Error probing file ${filePath}:`, err)
        resolve(0)
      } else {
        resolve(metadata.format.duration || 0)
      }
    })
  })
}

interface VideoMetadata {
  title: string
  file_path: string
  type: 'movie' | 'series'
  series_name?: string
  season?: number
  episode?: number
}

async function getAllFiles(dirPath: string, fileList: string[] = []): Promise<string[]> {
  const files = await fs.promises.readdir(dirPath)

  for (const file of files) {
    const filePath = path.join(dirPath, file)
    const stat = await fs.promises.stat(filePath)

    if (stat.isDirectory()) {
      await getAllFiles(filePath, fileList)
    } else if (VIDEO_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
      fileList.push(filePath)
    }
  }

  return fileList
}

async function findLocalPoster(videoPath: string): Promise<string | null> {
  const dir = path.dirname(videoPath)
  const posterNames = ['poster.jpg', 'poster.png', 'folder.jpg', 'cover.jpg', 'cover.png']
  
  for (const name of posterNames) {
    const fullPath = path.join(dir, name)
    if (fs.existsSync(fullPath)) return fullPath
  }
  
  // Also check for image with same name as video
  const baseName = path.basename(videoPath, path.extname(videoPath))
  const sameNameJpg = path.join(dir, `${baseName}.jpg`)
  const sameNamePng = path.join(dir, `${baseName}.png`)
  if (fs.existsSync(sameNameJpg)) return sameNameJpg
  if (fs.existsSync(sameNamePng)) return sameNamePng
  
  return null
}

export async function extractOfflineThumbnail(videoPath: string, videoId: number): Promise<string | null> {
  const posterDir = path.join(app.getPath('userData'), 'posters')
  if (!fs.existsSync(posterDir)) {
    fs.mkdirSync(posterDir, { recursive: true })
  }
  return new Promise((resolve) => {
    const ext = '.jpg'
    const fileName = `${videoId}-snap${ext}`
    const localPath = path.join(posterDir, fileName)
    
    if (fs.existsSync(localPath)) {
      resolve(localPath)
      return
    }

    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['10%'],
        filename: fileName,
        folder: posterDir,
        size: '?x720'
      })
      .on('end', () => {
        console.log(`[FFMPEG] Extracted frame to ${localPath}`)
        resolve(localPath)
      })
      .on('error', (err) => {
        console.error('[FFMPEG] Thumbnail extraction failed:', err)
        resolve(null)
      })
  })
}

export async function scanFolder(rootPath: string) {
  const allInitialVideos = getVideos()

  // 1. Purge globally deleted files from the database before adding new ones
  for (const dbVideo of allInitialVideos as any[]) {
    if (!fs.existsSync(dbVideo.file_path)) {
      console.log(`[Scanner] Purging physically deleted file from DB: ${dbVideo.file_path}`)
      deleteVideo(dbVideo.id)
      
      // Reclaim disk space if it was a dynamically generated extraction
      if (dbVideo.poster_path && dbVideo.poster_path.includes('-snap.jpg')) {
        if (fs.existsSync(dbVideo.poster_path)) {
          fs.unlinkSync(dbVideo.poster_path)
        }
      }
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('library-updated'))
    }
  }

  const videoFiles = await getAllFiles(rootPath)

  for (const filePath of videoFiles) {
    const metadata = parseFilename(filePath)
    const duration = await getVideoDuration(filePath)
    const localPoster = await findLocalPoster(filePath)
    
    const result = addVideo({
      ...metadata,
      file_path: filePath,
      duration: duration,
      poster_path: localPoster
    })

    const allVideos = getVideos()
    let videoId = 0
    if (result.changes > 0) {
      videoId = Number(result.lastInsertRowid)
    } else {
      const existing = allVideos.find((v: any) => v.file_path === filePath)
      if (existing) videoId = existing.id
    }

    if (videoId > 0) {
      const currentVideoNode = allVideos.find((v: any) => v.id === videoId);
      const isSnap = currentVideoNode && currentVideoNode.poster_path && currentVideoNode.poster_path.includes('-snap.jpg');
      const isMissingPoster = !localPoster && (!currentVideoNode || !currentVideoNode.poster_path || currentVideoNode.poster_path === 'N/A' || isSnap);
      
      if (isMissingPoster) {
        const searchTitle = metadata.series_name || metadata.title
        console.log(`[Scanner] Requesting OMDB API for video ${videoId} with title: "${searchTitle}"`)
        const omdbMetadata = await fetchMetadata(videoId, searchTitle, metadata.type)
        if (!omdbMetadata || !omdbMetadata.poster_path || omdbMetadata.poster_path === 'N/A') {
           if (isSnap && currentVideoNode) {
             console.log(`[Scanner] OMDB failed, maintaining existing -snap.jpg thumbnail for ${videoId}`)
             continue; // Don't snap again if we already have it!
           }
           console.log(`[Scanner] OMDB failed or N/A, falling back to FFmpeg screenshot for ${videoId}`)
           const snapPath = await extractOfflineThumbnail(filePath, videoId)
           if (snapPath) {
             console.log(`[Scanner] Saving FFmpeg thumbnail to DB for video ${videoId}`)
             const existingMeta = currentVideoNode ? { overview: currentVideoNode.overview, tmdb_id: currentVideoNode.tmdb_id } : { overview: null, tmdb_id: null }
             updateVideoMetadata(videoId, { poster_path: snapPath, overview: existingMeta.overview, tmdb_id: existingMeta.tmdb_id })
           } else {
             console.log(`[Scanner] FFmpeg snapshot completely failed for ${videoId}`)
           }
        } else {
           console.log(`[Scanner] Retrieved official OMDB Poster!`)
        }
      }
    }
    
    // Broadcast update after each file is processed (smooth UI updates during full scan)
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('library-updated'))
  }
  
  // Final broadcast just in case
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('library-updated'))
}

export async function getEmbeddedSubtitles(filePath: string): Promise<any[]> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata || !metadata.streams) {
        console.error('Error probing file for subtitles:', err)
        resolve([])
        return
      }
      const subs = metadata.streams.filter(s => 
        s.codec_type === 'subtitle' && 
        s.codec_name !== 'hdmv_pgs_subtitle' && 
        s.codec_name !== 'dvd_subtitle' &&
        s.codec_name !== 'dvbsub'
      )
      const formatted = subs.map(s => ({
        index: s.index,
        language: s.tags?.language || 'Unknown',
        title: s.tags?.title || ''
      }))
      resolve(formatted)
    })
  })
}

export async function getEmbeddedAudio(filePath: string): Promise<any[]> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata || !metadata.streams) {
        console.error('Error probing file for audio:', err)
        resolve([])
        return
      }
      const audios = metadata.streams.filter(s => s.codec_type === 'audio')
      const formatted = audios.map(s => ({
        index: s.index,
        language: s.tags?.language || 'Unknown',
        title: s.tags?.title || '',
        codec: s.codec_name || 'unknown',
        channels: s.channels || 2
      }))
      resolve(formatted)
    })
  })
}

function parseFilename(filePath: string): VideoMetadata {
  let fileName = path.basename(filePath, path.extname(filePath))
  const parentDir = path.basename(path.dirname(filePath))
  const grandParentDir = path.basename(path.dirname(path.dirname(filePath)))

  // Strip year and everything after it for scene releases
  let cleanName = fileName
  const yearMatch = fileName.match(/[._\s(](19|20)\d{2}([._\s)]|$)/)
  if (yearMatch) {
    cleanName = fileName.substring(0, yearMatch.index).trim()
  }

  // Heavy cleaning for pirated site noise
  const noise = [
    /\b\d{3,4}p\b/gi, /\bWEBRip\b/gi, /\bBluRay\b/gi, /\bx264\b/gi, /\bx265\b/gi, /\bh264\b/gi, /\bh265\b/gi,
    /\bHDR\b/gi, /\bDVDRip\b/gi, /\bBDRip\b/gi, /\bAAC\b/gi, /\bDTS\b/gi, /\bDD5\.1\b/gi, /\b10bit\b/gi, /\bWEB-DL\b/gi,
    /\[.*?\]/g, /\(.*?\)/g, /www\..*?\.[a-z]{2,3}/gi, /\bHDHub4u\b/gi, /\bHindi\b/gi, /\bEnglish\b/gi, /\bDual Audio\b/gi, /\bESub\b/gi, /\bHD\b/gi
  ]
  
  noise.forEach(pattern => { cleanName = cleanName.replace(pattern, '') })
  cleanName = cleanName.replace(/[._-]/g, ' ').replace(/\s+/g, ' ').trim()

  // Robust Series patterns
  const seriesPatterns = [
    /(.+?)[. ]s(\d+)e(\d+)/i,
    /(.+?)[. ](\d+)x(\d+)/i,
    /(.+?)[. ]season[. ](\d+)[. ]episode[. ](\d+)/i,
    /(.+?)[. ]s(\d+)[. ]e(\d+)/i
  ]

  for (const pattern of seriesPatterns) {
    const match = cleanName.match(pattern)
    if (match) {
      const seriesName = match[1].trim()
      const season = parseInt(match[2])
      const episode = parseInt(match[3])
      
      return {
        title: `${seriesName} - S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`,
        type: 'series',
        series_name: seriesName,
        season,
        episode,
        file_path: filePath
      }
    }
  }

  // Check if parent folder looks like a season and grandparent like a series
  const seasonMatch = parentDir.match(/season[. ](\d+)/i) || parentDir.match(/s(\d+)/i)
  if (seasonMatch) {
    const season = parseInt(seasonMatch[1])
    const episodeMatch = cleanName.match(/episode[. ](\d+)/i) || cleanName.match(/e(\d+)/i) || cleanName.match(/^(\d+)/)
    
    if (episodeMatch) {
      const episode = parseInt(episodeMatch[1])
      const seriesName = grandParentDir.replace(/[._]/g, ' ').trim()
      
      return {
        title: `${seriesName} - S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`,
        type: 'series',
        series_name: seriesName,
        season,
        episode,
        file_path: filePath
      }
    }
  }

  // Movie (fallback)
  return {
    title: cleanName,
    type: 'movie',
    file_path: filePath
  }
}
