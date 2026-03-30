import axios from 'axios'
import { updateVideoMetadata } from './db'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'

const OMDb_API_KEY = process.env.OMDB_API_KEY || '12ef5151'
const BASE_URL = 'https://www.omdbapi.com/'

const posterDir = path.join(app.getPath('userData'), 'posters')
if (!fs.existsSync(posterDir)) {
  fs.mkdirSync(posterDir, { recursive: true })
}

async function downloadPoster(url: string, videoId: number): Promise<string | null> {
  if (!url || url === 'N/A') return null
  
  try {
    const ext = path.extname(new URL(url).pathname) || '.jpg'
    const localPath = path.join(posterDir, `${videoId}${ext}`)
    
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    })

    await pipeline(response.data, createWriteStream(localPath))
    return localPath
  } catch (error) {
    console.error(`Failed to download poster for video ${videoId}:`, error)
    return null
  }
}

export async function fetchMetadata(videoId: number, title: string, type: 'movie' | 'series') {
  try {
    console.log(`[OMDB API] Firing request for: "${title}", type: "${type}"`)
    const response = await axios.get(BASE_URL, {
      params: {
        apikey: OMDb_API_KEY,
        t: title,
        type: type === 'series' ? 'series' : 'movie'
      }
    })

    console.log(`[OMDB API] Response logic for "${title}":`, response.data?.Response, '| Poster:', response.data?.Poster)

    if (response.data && response.data.Response === 'True') {
      const result = response.data
      
      // Download poster for offline use
      const localPosterPath = await downloadPoster(result.Poster, videoId)
      const validPoster = result.Poster && result.Poster !== 'N/A' ? result.Poster : null

      const metadata = {
        poster_path: localPosterPath || validPoster,
        overview: result.Plot,
        tmdb_id: result.imdbID // Store IMDb ID as fallback
      }
      updateVideoMetadata(videoId, metadata)
      return metadata
    }
  } catch (error) {
    console.error(`Failed to fetch metadata for ${title}:`, error)
  }
  return null
}
