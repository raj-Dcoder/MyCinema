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
  backdrop_path?: string
  overview?: string
  tagline?: string
  genres?: string
  last_watched_time?: number
  completed?: boolean
  episode_count?: number
  vote_average?: number
  release_year?: number
  tmdb_id?: number
}
