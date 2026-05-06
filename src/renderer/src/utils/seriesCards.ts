import { Video } from '../types'

const getSeriesKey = (video: Video) => video.series_name?.trim().toLowerCase()

const getProgressUpdatedTime = (video: Video) => {
  if (!video.updated_at) return 0
  const timestamp = new Date(video.updated_at).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

const isInProgressEpisode = (video: Video) => {
  return video.type === 'series' && !video.completed && (video.last_watched_time ?? 0) > 0
}

export function groupSeriesCards(videos: Video[]) {
  const seriesEpisodes = videos.filter(video => video.type === 'series' && video.series_name)
  const counts = new Map<string, number>()
  const fallbackBySeries = new Map<string, Video>()
  const resumeBySeries = new Map<string, Video>()

  for (const episode of seriesEpisodes) {
    const key = getSeriesKey(episode)
    if (!key) continue

    counts.set(key, (counts.get(key) || 0) + 1)
    if (!fallbackBySeries.has(key)) fallbackBySeries.set(key, episode)

    if (isInProgressEpisode(episode)) {
      const currentResume = resumeBySeries.get(key)
      if (!currentResume || getProgressUpdatedTime(episode) > getProgressUpdatedTime(currentResume)) {
        resumeBySeries.set(key, episode)
      }
    }
  }

  return Array.from(fallbackBySeries.entries()).map(([key, fallback]) => ({
    ...(resumeBySeries.get(key) || fallback),
    episode_count: counts.get(key) || 1
  }))
}
