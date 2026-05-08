export interface TorrentSourceLike {
  quality?: string
  seeds?: number | string
  peers?: number | string
}

export const getTorrentSourceHealthScore = (source: TorrentSourceLike) => {
  const seeds = Number(source.seeds) || 0
  const peers = Number(source.peers) || 0
  const seedPeerRatio = seeds / Math.max(1, peers)
  const qualityBoost = source.quality === '2160p' ? 6 : source.quality === '1080p' ? 4 : source.quality === '720p' ? 2 : 0
  return (seeds * 10) + seedPeerRatio - (peers * 0.05) + qualityBoost
}

export const getTorrentSourceSpeedLabel = (source: TorrentSourceLike) => {
  const seeds = Number(source.seeds) || 0
  if (seeds >= 100) return 'FAST'
  if (seeds >= 25) return 'GOOD'
  if (seeds >= 5) return 'OK'
  return 'SLOW'
}
