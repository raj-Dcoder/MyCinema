import fs from 'fs'
import path from 'path'
import { addVideo, getVideos } from './db'
import { fetchMetadata } from './omdb'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

// Set ffmpeg/ffprobe paths
if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic)
ffmpeg.setFfprobePath(ffprobeStatic.path)

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

export async function scanFolder(rootPath: string) {
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

    // Fetch metadata if it was newly added AND we don't have a local poster
    if (result.changes > 0 && !localPoster) {
      const videoId = Number(result.lastInsertRowid)
      const searchTitle = metadata.series_name || metadata.title
      fetchMetadata(videoId, searchTitle, metadata.type)
    }
  }
}

function parseFilename(filePath: string): VideoMetadata {
  let fileName = path.basename(filePath, path.extname(filePath))
  const parentDir = path.basename(path.dirname(filePath))
  const grandParentDir = path.basename(path.dirname(path.dirname(filePath)))

  // Heavy cleaning for pirated site noise
  const noise = [
    /\d{3,4}p/gi, /WEBRip/gi, /BluRay/gi, /x264/gi, /x265/gi, /h264/gi, /h265/gi,
    /HDR/gi, /DVDRip/gi, /BDRip/gi, /AAC/gi, /DTS/gi, /DD5\.1/gi, /10bit/gi,
    /\[.*?\]/g, /\(.*?\)/g, /www\..*?\.[a-z]{2,3}/gi
  ]
  
  let cleanName = fileName
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
