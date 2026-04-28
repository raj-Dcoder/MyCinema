export interface SubCue {
  start: number
  end: number
  text: string
}

export const SUBTITLE_SYNC_MIN_MS = -60_000
export const SUBTITLE_SYNC_MAX_MS = 60_000
export const SUBTITLE_SYNC_FINE_STEP_MS = 250
export const SUBTITLE_SYNC_COARSE_STEP_MS = 2_000

export function clampSubtitleOffsetMs(offsetMs: number): number {
  if (!Number.isFinite(offsetMs)) return 0
  return Math.min(SUBTITLE_SYNC_MAX_MS, Math.max(SUBTITLE_SYNC_MIN_MS, Math.round(offsetMs)))
}

export function formatSubtitleOffsetMs(offsetMs: number): string {
  const clamped = clampSubtitleOffsetMs(offsetMs)
  const absMs = Math.abs(clamped)
  const decimals = absMs % 1000 === 0 ? 0 : absMs % 100 === 0 ? 1 : 2
  const seconds = (absMs / 1000).toFixed(decimals)
  const sign = clamped > 0 ? '+' : clamped < 0 ? '-' : ''
  return `${sign}${seconds}s`
}

export function parseStoredSubtitleOffsetMs(rawValue: string | null): number {
  if (rawValue === null) return 0
  const parsed = Number(rawValue)
  return clampSubtitleOffsetMs(parsed)
}

export function createSubtitleSyncStorageKey(videoFilePath: string, subtitleSourceId: string): string {
  return `mycinema_sub_sync_${encodeURIComponent(videoFilePath)}_${encodeURIComponent(subtitleSourceId)}`
}

export function findCueIndexAtTime(cues: SubCue[], timeSeconds: number, hintIndex = -1): number {
  if (cues.length === 0 || !Number.isFinite(timeSeconds)) return -1

  if (hintIndex >= 0 && hintIndex < cues.length) {
    const hintedCue = cues[hintIndex]
    if (timeSeconds >= hintedCue.start && timeSeconds <= hintedCue.end) return hintIndex

    const nextCue = cues[hintIndex + 1]
    if (nextCue && timeSeconds >= nextCue.start && timeSeconds <= nextCue.end) return hintIndex + 1

    const previousCue = cues[hintIndex - 1]
    if (previousCue && timeSeconds >= previousCue.start && timeSeconds <= previousCue.end) return hintIndex - 1
  }

  let low = 0
  let high = cues.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const cue = cues[mid]

    if (timeSeconds < cue.start) {
      high = mid - 1
    } else if (timeSeconds > cue.end) {
      low = mid + 1
    } else {
      return mid
    }
  }

  return -1
}

export function resolveSubtitleCue(
  cues: SubCue[],
  playbackTimeSeconds: number,
  subtitleOffsetMs: number,
  hintIndex = -1
): { cue: SubCue | null; index: number } {
  const effectiveTime = playbackTimeSeconds - clampSubtitleOffsetMs(subtitleOffsetMs) / 1000
  const index = findCueIndexAtTime(cues, effectiveTime, hintIndex)
  return {
    cue: index >= 0 ? cues[index] : null,
    index
  }
}
