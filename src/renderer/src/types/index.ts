export interface Video {
  id: number
  title: string
  file_path: string
  type: 'movie' | 'series' | 'video'
  series_name?: string
  season?: number
  episode?: number
  duration?: number
  poster_path?: string
  backdrop_path?: string
  logo_path?: string
  overview?: string
  tagline?: string
  genres?: string
  last_watched_time?: number
  completed?: boolean
  updated_at?: string
  episode_count?: number
  version_count?: number
  is_preferred?: boolean
  vote_average?: number
  release_year?: number
  tmdb_id?: number
  imdb_id?: string
  isExternal?: boolean
  is_favorite?: boolean
  is_watchlist?: boolean
  category?: string
  media_type?: 'movie' | 'tv'
}
