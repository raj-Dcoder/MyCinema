export interface TorrentSourceLike {
  title?: string
  quality?: string
  seeds?: number | string
  peers?: number | string
  codec?: string
  isHevc?: boolean
}

export const isHevcSource = (source: TorrentSourceLike): boolean => {
  if (!source) return false
  if (typeof source.isHevc === 'boolean') return source.isHevc
  const title = source.title || ''
  const codec = source.codec || ''
  return /\b(hevc|h\.?265|x265|265)\b/i.test(title) || /\b(hevc|h\.?265|x265)\b/i.test(codec)
}

export const getTorrentSourceHealthScore = (source: TorrentSourceLike) => {
  const seeds = Number(source.seeds) || 0
  const peers = Number(source.peers) || 0
  const seedPeerRatio = seeds / Math.max(1, peers)
  const qualityBoost = source.quality === '2160p' ? 6 : source.quality === '1080p' ? 4 : source.quality === '720p' ? 2 : 0
  const hevcBoost = isHevcSource(source) ? 3 : 0
  return (seeds * 10) + seedPeerRatio - (peers * 0.05) + qualityBoost + hevcBoost
}

export const getTorrentSourceSpeedLabel = (source: TorrentSourceLike) => {
  const seeds = Number(source.seeds) || 0
  if (seeds >= 100) return 'FAST'
  if (seeds >= 25) return 'GOOD'
  if (seeds >= 5) return 'OK'
  return 'SLOW'
}

