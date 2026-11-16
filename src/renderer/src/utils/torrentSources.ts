export interface TorrentSourceLike {
  title?: string
  quality?: string
  seeds?: number | string
  peers?: number | string
  codec?: string
  isHevc?: boolean
  magnet?: string
  isSeasonPack?: boolean
  parsedSeason?: number | null
  parsedEpisode?: number | null
}

export const isHevcSource = (source: TorrentSourceLike): boolean => {
  if (!source) return false
  if (typeof source.isHevc === 'boolean') return source.isHevc
  const title = source.title || ''
  const codec = source.codec || ''
  return /\b(hevc|h\.?265|x265|265)\b/i.test(title) || /\b(hevc|h\.?265|x265)\b/i.test(codec)
}

export const isCamOrLowQuality = (source: TorrentSourceLike): boolean => {
  if (!source) return false
  const title = source.title || ''
  return /\b(cam|camrip|hdcam|hd-cam|ts|hdts|hd-ts|telesync|telecine|tc|workprint)\b/i.test(title)
}

export const getTorrentSourceHealthScore = (source: TorrentSourceLike) => {
  const seeds = Number(source.seeds) || 0
  const peers = Number(source.peers) || 0
  const seedPeerRatio = seeds / Math.max(1, peers)
  const isCam = isCamOrLowQuality(source)

  // Sweet spot for streaming: 1080p is sharp & buffers instantly
  let qualityBoost = 0
  if (source.quality === '1080p') qualityBoost = 25
  else if (source.quality === '2160p') qualityBoost = seeds >= 20 ? 30 : 10
  else if (source.quality === '720p') qualityBoost = 15
  else if (source.quality === '480p') qualityBoost = 5

  const hevcBoost = isHevcSource(source) ? 10 : 0
  const camPenalty = isCam ? -2000 : 0

  return (seeds * 10) + seedPeerRatio - (peers * 0.05) + qualityBoost + hevcBoost + camPenalty
}

export const getTorrentSourceSpeedLabel = (source: TorrentSourceLike) => {
  const seeds = Number(source.seeds) || 0
  if (seeds >= 100) return 'FAST'
  if (seeds >= 25) return 'GOOD'
  if (seeds >= 5) return 'OK'
  return 'SLOW'
}

export const pickBestStreamingSource = (
  sources: any[],
  opts?: { season?: number | null; episode?: number | null; isMovie?: boolean }
): any | null => {
  if (!sources || sources.length === 0) return null

  // 1. Must have a valid magnet
  let valid = sources.filter(s => Boolean(s?.magnet))
  if (valid.length === 0) return null

  // 2. If movie, prefer non-season packs
  if (opts?.isMovie) {
    const nonPacks = valid.filter(s => !s.isSeasonPack)
    if (nonPacks.length > 0) valid = nonPacks
  }

  // 3. If specific season/episode requested
  if (opts?.season != null || opts?.episode != null) {
    const exactMatching = valid.filter(s => {
      if (opts.season != null && s.parsedSeason != null && s.parsedSeason !== opts.season) return false
      if (opts.episode != null && s.parsedEpisode != null && s.parsedEpisode !== opts.episode) return false
      return true
    })
    if (exactMatching.length > 0) {
      valid = exactMatching
    } else {
      // Fallback: Season packs that cover the requested season
      const seasonPacks = valid.filter(s => {
        if (opts.season != null && s.parsedSeason != null && s.parsedSeason !== opts.season) return false
        return Boolean(s.isSeasonPack) || !s.parsedEpisode
      })
      if (seasonPacks.length > 0) valid = seasonPacks
    }
  }

  // 4. Prefer clean/HD releases over CAM if clean exists
  const nonCam = valid.filter(s => !isCamOrLowQuality(s))
  const pool = nonCam.length > 0 ? nonCam : valid

  // 5. Pick highest health score
  return [...pool].sort((a, b) => getTorrentSourceHealthScore(b) - getTorrentSourceHealthScore(a))[0] || null
}

