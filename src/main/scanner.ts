import fs from 'fs'
import path from 'path'
import { addVideo, getVideos, updateVideoMetadata, deleteVideo } from './db'
import { fetchTmdbMetadata } from './tmdb'
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
  year?: number
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

export async function extractOfflineThumbnail(videoPath: string, videoId: number, duration: number = 0): Promise<string | null> {
  const posterDir = path.join(app.getPath('userData'), 'posters')
  if (!fs.existsSync(posterDir)) {
    fs.mkdirSync(posterDir, { recursive: true })
  }
  return new Promise((resolve) => {
    const ext = '.jpg'
    const fileName = `${videoId}-snap${ext}`
    const localPath = path.join(posterDir, fileName)
    
    if (fs.existsSync(localPath)) {
      const stats = fs.statSync(localPath)
      if (stats.size > 0) {
        console.log(`[FFMPEG] Cache Hit: Snapshot for ${videoId} already exists on disk.`)
        resolve(localPath)
        return
      } else {
        console.warn(`[FFMPEG] Found corrupted 0-byte ghost thumb at ${localPath}. Purging and regenerating...`)
        try { fs.unlinkSync(localPath) } catch (e) {}
      }
    }

    const stamp = (duration > 0 && duration < 2) ? 0.1 : 1

    ffmpeg(videoPath)
      .screenshots({
        timestamps: [stamp],
        filename: fileName,
        folder: posterDir
      })
      .on('end', () => {
        if (fs.existsSync(localPath)) {
          const stats = fs.statSync(localPath)
          if (stats.size > 0) {
            console.log(`[FFMPEG] Extracted frame to ${localPath}`)
            return resolve(localPath)
          } else {
            fs.unlinkSync(localPath) // cleanup corrupted 0 byte file
          }
        }
        console.error(`[FFMPEG] Failed: file not generated correctly at ${localPath}`)
        resolve(null)
      })
      .on('error', (err) => {
        console.error('[FFMPEG] Thumbnail extraction failed:', err.message)
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
      const isMissingMetadata = currentVideoNode && (!currentVideoNode.tagline && !currentVideoNode.genres);
      
      // If we are missing metadata, we should ALSO check if we have a TMDB ID.
      // If we have a TMDB ID but no metadata, we can fetch it directly.
      if (isMissingPoster || isMissingMetadata) {
        const searchTitle = metadata.series_name || metadata.title
        
        // Junk title filter: skip GUIDs, hashes, and extremely long descriptive titles
        const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchTitle) || /^[0-9a-f]{32,40}$/i.test(searchTitle.replace(/\s/g, ''));
        const spaceCount = (searchTitle.match(/ /g) || []).length;
        const isTooLong = searchTitle.length > 80 && spaceCount > 6;
        
        if (isGuid || isTooLong || (spaceCount > 6 && !metadata.series_name)) {
          console.log(`[Scanner] Skipping TMDB for "${searchTitle}" (likely junk/personal file)`)
          
          if (isMissingPoster) {
            console.log(`[Scanner] Taking manual snapshot for junk/personal video ${videoId}`)
            const snapPath = await extractOfflineThumbnail(filePath, videoId, duration)
            if (snapPath) {
               updateVideoMetadata(videoId, { 
                 poster_path: snapPath, 
                 backdrop_path: null,
                 overview: null, tagline: null, genres: null, tmdb_id: null, vote_average: null, release_year: null 
               })
            }
          }
          continue;
        }
        
        // --- NEW CATEGORIZATION LOGIC & TMDB SHORT-CIRCUIT ---
        // If it's a short clip (< 1 hour) AND it is NOT a strictly formatted series, disable TMDB matching
        // so it doesn't randomly scrape movies. Wait, in `addVideo` we recorded duration. 
        if (metadata.type === 'movie' && duration > 0 && duration < 3600) {
          console.log(`[Scanner] Skipping TMDB for short clip ${videoId} (Duration: ${duration}s). Falls under Videos tab.`)
          if (isMissingPoster) {
            console.log(`[Scanner] Taking manual snapshot for short video ${videoId}`)
            const snapPath = await extractOfflineThumbnail(filePath, videoId, duration)
            if (snapPath) {
               updateVideoMetadata(videoId, { 
                 poster_path: snapPath, 
                 backdrop_path: null,
                 overview: null, tagline: null, genres: null, tmdb_id: null, vote_average: null, release_year: null 
               })
            }
          }
          continue;
        }

        console.log(`[Scanner] Requesting TMDB API for video ${videoId} with title: "${searchTitle}" ${metadata.year ? `(${metadata.year})` : ''}`)
        
        // Anti-rate-limit throttle: 500ms between requests
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Pass tmdb_id if we already have it to avoid searching
        const tmdbMetadata = await fetchTmdbMetadata(
          videoId, 
          searchTitle, 
          metadata.type, 
          metadata.year, 
          currentVideoNode?.tmdb_id
        )
        if (!tmdbMetadata || !tmdbMetadata.poster_path) {
           console.log(`[Scanner] TMDB search for ${videoId} ("${searchTitle}") yielded no poster or failed.`)
           if (isSnap && currentVideoNode) {
             // Already have a snap, but let's see if we should try snapping again ONLY if snap is missing or 0 bytes
             const p = currentVideoNode.poster_path
             let isValidSnap = false
             try { isValidSnap = fs.existsSync(p) && fs.statSync(p).size > 0 } catch(e) {}
             
             if (!isValidSnap) {
                console.log(`[Scanner] Snap file missing or corrupt for ${videoId}, re-extracting…`)
                const snapPath = await extractOfflineThumbnail(filePath, videoId, duration)
                if (snapPath) {
                  updateVideoMetadata(videoId, {
                    poster_path: snapPath,
                    backdrop_path: tmdbMetadata?.backdrop_path || null,
                    overview: null, 
                    tagline: null, 
                    genres: null, 
                    tmdb_id: null,
                    vote_average: null,
                    release_year: null
                  })
                }
             }
             continue; // Don't snap again if we already have it!
           }
           console.log(`[Scanner] Falling back to FFmpeg screenshot for ${videoId}`)
           const snapPath = await extractOfflineThumbnail(filePath, videoId, duration)
           if (snapPath) {
             console.log(`[Scanner] Saving FFmpeg thumbnail to DB for video ${videoId}`)
             const existingMeta = currentVideoNode 
              ? { 
                  overview: currentVideoNode.overview, 
                  tagline: currentVideoNode.tagline,
                  genres: currentVideoNode.genres,
                  tmdb_id: currentVideoNode.tmdb_id,
                  vote_average: currentVideoNode.vote_average,
                  release_year: currentVideoNode.release_year,
                  backdrop_path: currentVideoNode.backdrop_path || (tmdbMetadata ? tmdbMetadata.backdrop_path : null)
                } 
              : { overview: null, tagline: null, genres: null, tmdb_id: null, vote_average: null, release_year: null, backdrop_path: tmdbMetadata ? tmdbMetadata.backdrop_path : null }
             updateVideoMetadata(videoId, { 
               poster_path: snapPath, 
               backdrop_path: existingMeta.backdrop_path,
               overview: existingMeta.overview, 
               tagline: existingMeta.tagline,
               genres: existingMeta.genres,
               tmdb_id: existingMeta.tmdb_id,
               vote_average: existingMeta.vote_average,
               release_year: existingMeta.release_year
             })
           }
        } else {
           console.log(`[Scanner] Retrieved official TMDB poster for video ${videoId}!`)
           updateVideoMetadata(videoId, { 
             poster_path: tmdbMetadata.poster_path, 
             backdrop_path: tmdbMetadata.backdrop_path,
             overview: tmdbMetadata.overview, 
             tagline: tmdbMetadata.tagline,
             genres: tmdbMetadata.genres,
             tmdb_id: tmdbMetadata.tmdb_id,
             vote_average: tmdbMetadata.vote_average,
             release_year: tmdbMetadata.release_year
           })
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
  const fileName = path.basename(filePath, path.extname(filePath))
  const parentDir = path.basename(path.dirname(filePath))
  const grandParentDir = path.basename(path.dirname(path.dirname(filePath)))

  // 1. Extract Year but don't truncate the whole filename yet
  let year: number | undefined
  const yearMatch = fileName.match(/[._\s(](19|20)\d{2}([._\s)]|$)/)
  if (yearMatch) {
    year = parseInt(yearMatch[0].replace(/[^0-9]/g, ''))
  }

  // 2. Robust Series patterns (applied to the FULL filename)
  const seriesPatterns = [
    /(.+?)[. ]s(\d+)e(\d+)(.*)/i,
    /(.+?)[. ](\d+)x(\d+)(.*)/i,
    /(.+?)[. ]season[. ](\d+)[. ]episode[. ](\d+)(.*)/i,
    /(.+?)[. ]s(\d+)[. ]e(\d+)(.*)/i,
    /(.+?)[. ]episode[. ](\d+)(.*)/i,
    /(.+?)[. ]ep[. ]?(\d+)(.*)/i
  ]

  for (let i = 0; i < seriesPatterns.length; i++) {
    const pattern = seriesPatterns[i]
    const match = fileName.match(pattern)
    
    if (match) {
      const isAggressivePattern = i === seriesPatterns.length - 1
      if (isAggressivePattern && year && !fileName.toLowerCase().includes('episode') && !fileName.toLowerCase().includes('ep')) {
         // If it's just a number at the end and we have a year, it's likely a movie sequel
         continue;
      }

      let seriesName = match[1].trim()
      
      // Clean seriesName of year and noise
      const seriesYearMatch = seriesName.match(/[._\s(](19|20)\d{2}([._\s)]|$)/)
      if (seriesYearMatch) {
        seriesName = seriesName.substring(0, seriesYearMatch.index).trim()
      }

      const noise = [
        /\b\d{3,4}p\b/gi, /\bWEBRip\b/gi, /\bBluRay\b/gi, /\bx264\b/gi, /\bx265\b/gi, /\bh264\b/gi, /\bh265\b/gi,
        /\bHDR\b/gi, /\bDVDRip\b/gi, /\bBDRip\b/gi, /\bHDRip\b/gi, /\bAAC\b/gi, /\bDTS\b/gi, /\bDD5\.1\b/gi, /\b10bit\b/gi, /\bWEB-DL\b/gi,
        /\[.*?\]/g, /\(.*?\)/g, /[._-]/g
      ]
      noise.forEach(p => { seriesName = seriesName.replace(p, ' ') })
      seriesName = seriesName.replace(/\s+/g, ' ').trim()

      const isShortMatch = !match[4]
      const season = isShortMatch ? 1 : parseInt(match[2])
      const episode = isShortMatch ? parseInt(match[2]) : parseInt(match[3])
      const extra = (match[4] || match[3] || '').replace(/^[. -]+/, '').trim()
      
      if (isShortMatch && (episode > 1900 && episode < 2100)) continue;
      if (isAggressivePattern && episode < 10 && !extra) continue;

      const episodeTitle = extra ? extra : `S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`

      return {
        title: `${seriesName} - ${episodeTitle}`,
        type: 'series',
        series_name: seriesName,
        season,
        episode,
        file_path: filePath
      }
    }
  }

  // 3. Check folder structure (Season/Series)
  const seasonMatch = parentDir.match(/season[. ](\d+)/i) || parentDir.match(/s(\d+)/i)
  if (seasonMatch) {
    const season = parseInt(seasonMatch[1])
    const episodeMatch = fileName.match(/episode[. ](\d+)/i) || fileName.match(/e(\d+)/i) || fileName.match(/^(\d+)/)
    
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

  // 4. Movie (fallback) - Now we do the heavy cleaning for movie title
  let cleanName = fileName
  if (yearMatch) {
    cleanName = fileName.substring(0, yearMatch.index).trim()
  }

  const movieNoise = [
    /\b\d{3,4}p\b/gi, /\bWEBRip\b/gi, /\bBluRay\b/gi, /\bx264\b/gi, /\bx265\b/gi, /\bh264\b/gi, /\bh265\b/gi,
    /\bHDR\b/gi, /\bDVDRip\b/gi, /\bBDRip\b/gi, /\bHDRip\b/gi, /\bAAC\b/gi, /\bDTS\b/gi, /\bDD5\.1\b/gi, /\b10bit\b/gi, /\bWEB-DL\b/gi,
    /\bDirectors?\.Cut\b/gi, /\bRemastered\b/gi, /\bExtended\b/gi, /\bUncut\b/gi, /\bRepack\b/gi, /\bProper\b/gi,
    /\[.*?\]/g, /\(.*?\)/g, /www\..*?\.[a-z]{2,3}/gi, /\bHDHub4u\b/gi, /\bHindi\b/gi, /\bEnglish\b/gi, /\bDual Audio\b/gi, /\bESub\b/gi, /\bHD\b/gi
  ]
  movieNoise.forEach(pattern => { cleanName = cleanName.replace(pattern, '') })
  cleanName = cleanName.replace(/[._-]/g, ' ').replace(/\s+/g, ' ').trim()

  if (cleanName.toLowerCase().endsWith(' the movie')) {
    cleanName = cleanName.substring(0, cleanName.length - 10).trim()
  }
  if (cleanName.length > 100) cleanName = cleanName.substring(0, 100).trim()

  return {
    title: cleanName,
    type: 'movie',
    file_path: filePath,
    year
  }
}
