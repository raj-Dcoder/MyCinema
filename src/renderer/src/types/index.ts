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

// ─── Focus Tube ───────────────────────────────────────────────────────────────

export interface FtCategory {
  id: number
  name: string
  color: string
  position: number
  channelCount?: number
  unseenCount?: number
}

export interface FtChannel {
  channelId: string
  title: string
  handle: string | null
  avatarUrl: string | null
  url: string
  hideShorts: boolean
  position: number
  lastFetched: string | null
  lastError: string | null
  categoryIds: number[]
}

export interface FtVideo {
  videoId: string
  channelId: string
  channelTitle: string
  title: string
  publishedAt: string
  duration: number | null
  isLive: boolean
  isShort: boolean
  views: number | null
  description: string | null
  embeddable: boolean
  firstSeenAt: string
  seen: boolean
  seenAt: string | null
  saved: boolean
  position: number
}

export interface FtFeedOptions {
  categoryId: number | null
  includeSeen?: boolean
  includeSavedOnly?: boolean
  hideShorts?: boolean
  limit?: number
  search?: string | null
}

export interface FtComment {
  commentId: string | null
  author: string
  authorId: string | null
  avatarUrl: string | null
  content: string
  publishedText: string | null
  likeCount: number | null
  replyCount: number
  replyContinuation: string | null
}
