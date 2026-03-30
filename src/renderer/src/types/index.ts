export interface Video {
  id: number
  title: string
  file_path: string
  type: 'movie' | 'series'
  series_name?: string
  season?: number
  episode?: number
  duration?: number
  poster_path?: string
  overview?: string
  last_watched_time?: number
  completed?: boolean
}
