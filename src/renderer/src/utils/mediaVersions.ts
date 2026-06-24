import { Video } from '../types'

const normalizeIdentity = (value?: string | null) => (
  (value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')
)

export const getMovieIdentity = (video: Video) => {
  if (video.tmdb_id) return `tmdb:${video.tmdb_id}`
  return `title:${normalizeIdentity(video.title)}:${video.release_year || ''}`
}

export const getEpisodeIdentity = (video: Video) => {
  const seriesIdentity = video.tmdb_id
    ? `tmdb:${video.tmdb_id}`
    : `series:${normalizeIdentity(video.series_name || video.title)}`
  return `${seriesIdentity}:s${Number(video.season || 1)}:e${Number(video.episode || 0)}`
}

export const getMediaUnitIdentity = (video: Video) => {
  if (video.type === 'series') return getEpisodeIdentity(video)
  if (video.type === 'movie') return getMovieIdentity(video)
  return `file:${video.file_path || video.id}`
}

const getProgressUpdatedTime = (video: Video) => {
  if (!video.updated_at) return 0
  const timestamp = new Date(video.updated_at).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export const pickPreferredVersion = (versions: Video[], fallback?: Video) => {
  if (versions.length === 0) return fallback
  return versions.find(version => Boolean(version.is_preferred))
    || [...versions].sort((a, b) => {
      const progressDifference = getProgressUpdatedTime(b) - getProgressUpdatedTime(a)
      if (progressDifference !== 0) return progressDifference
      return b.id - a.id
    })[0]
}

export type MediaVersionGroup = {
  identity: string
  representative: Video
  versions: Video[]
}

export const groupMediaVersions = (videos: Video[]): MediaVersionGroup[] => {
  const groups = new Map<string, Video[]>()

  for (const video of videos) {
    const identity = getMediaUnitIdentity(video)
    const versions = groups.get(identity) || []
    versions.push(video)
    groups.set(identity, versions)
  }

  return Array.from(groups.entries()).map(([identity, versions]) => ({
    identity,
    versions,
    representative: pickPreferredVersion(versions)!
  }))
}

export const groupMovieCards = (videos: Video[]) => (
  groupMediaVersions(videos.filter(video => video.type === 'movie')).map(group => ({
    ...group.representative,
    version_count: group.versions.length
  }))
)

export const getVersionLabel = (video: Video) => {
  const name = video.file_path.split(/[\\/]/).pop() || video.title
  const quality = name.match(/\b(2160p|4k|uhd|1440p|1080p|720p|480p)\b/i)?.[1]?.toUpperCase()
  const audio = name.match(/\b(dual[ ._-]?audio|multi[ ._-]?audio|hindi|english|tamil|telugu)\b/i)?.[1]
    ?.replace(/[._-]+/g, ' ')
  return [quality, audio].filter(Boolean).join(' • ') || 'Local version'
}
