import type { Video, WatchlistIntent } from '../types'

export type { WatchlistIntent }

export const WATCHLIST_INTENT_ORDER: WatchlistIntent[] = ['asap', 'weekend', 'someday']

export function normalizeWatchlistIntent(value: unknown): WatchlistIntent {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'asap' || v === 'now' || v === 'urgent' || v === 'tonight') return 'asap'
  if (v === 'weekend' || v === 'week-end' || v === 'this-weekend' || v === 'weekly') return 'weekend'
  return 'someday'
}

/** Authoritative intent for a watchlist row. Null when the title isn't saved. */
export function getWatchlistIntent(video: {
  is_watchlist?: boolean | number | null
  priority?: unknown
  watchlist_priority?: unknown
  watchlistPriority?: unknown
} | null | undefined): WatchlistIntent | null {
  if (!video?.is_watchlist) {
    // External search cards carry no flag yet — still surface a stored lane if one exists.
    const raw = (video as any)?.priority ?? (video as any)?.watchlist_priority ?? (video as any)?.watchlistPriority
    if (raw == null || raw === '') return null
    return normalizeWatchlistIntent(raw)
  }
  const raw = (video as any)?.priority ?? (video as any)?.watchlist_priority ?? (video as any)?.watchlistPriority ?? 'someday'
  return normalizeWatchlistIntent(raw)
}

export function intentRank(intent: WatchlistIntent): number {
  switch (intent) {
    case 'asap': return 0
    case 'weekend': return 1
    default: return 2
  }
}

export function compareWatchlistItems(a: Video, b: Video): number {
  const rankDiff = intentRank(getWatchlistIntent(a) ?? 'someday') - intentRank(getWatchlistIntent(b) ?? 'someday')
  if (rankDiff !== 0) return rankDiff
  const aTime = new Date((a as any)?.added_at ?? 0).getTime()
  const bTime = new Date((b as any)?.added_at ?? 0).getTime()
  return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0)
}

export interface WatchlistIntentMeta {
  id: WatchlistIntent
  label: string
  shortLabel: string
  tagline: string
  detail: string
  queueHint: string
}

export const WATCHLIST_INTENT_META: Record<WatchlistIntent, WatchlistIntentMeta> = {
  asap: {
    id: 'asap',
    label: 'ASAP',
    shortLabel: 'ASAP',
    tagline: 'Tonight or tomorrow',
    detail: 'Top of your queue — the very next thing you press play on.',
    queueHint: 'Sits first in All'
  },
  weekend: {
    id: 'weekend',
    label: 'Weekend',
    shortLabel: 'Weekend',
    tagline: 'Save it for the weekend',
    detail: 'Cozy binge picks waiting for Friday night lights.',
    queueHint: 'Grouped under Weekend'
  },
  someday: {
    id: 'someday',
    label: 'Someday',
    shortLabel: 'Someday',
    tagline: 'For a rainy day',
    detail: 'No pressure. The backlog you raid when nothing else calls.',
    queueHint: 'Rests in Someday stash'
  }
}
