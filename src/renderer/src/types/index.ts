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
  still_path?: string
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
  release_date?: string
  tmdb_id?: number
  imdb_id?: string
  isExternal?: boolean
  is_favorite?: boolean
  is_watchlist?: boolean
  category?: string
  media_type?: 'movie' | 'tv'
  keywords?: string[]
  streamSourceId?: string
  sourceMagnet?: string
  fetchedSources?: any[]
  // Online resume (#1): explicit seek target + whether the magnet was re-found.
  resumeFrom?: number
  sourceRefreshed?: boolean
  isOnlineResume?: boolean
  // #2: card points at the computed next episode (unwatched) rather than a
  // partially-watched one.
  onlineNextEpisode?: boolean
  // #3: that next episode dropped since the user last caught up.
  onlineNewEpisode?: boolean
  // Original torrent file position (?file=) — pins resume to the exact file
  // for packs whose filenames carry no parseable S/E tags.
  fileIndex?: number
}

export interface TmdbProvider {
  provider_name: string
  logo_path: string
}

export interface TmdbReleaseInfo {
  releaseDate: string | null
  providers: TmdbProvider[]
  type: 'theatrical' | 'digital' | 'tv' | null
}
