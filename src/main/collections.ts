import { getRawDb, getVideos } from './db'

// ─── Collections ─────────────────────────────────────────────────────────────
// Manual-only playlists: every collection is a hand-picked set of titles —
// pinned library files plus any online (TMDB) title. No auto-rules, no
// auto-seeding. Shareable via JSON.

export interface CollectionRule {
  genres?: string[]
  matchGenres?: 'any' | 'all'
  minRating?: number | null
  minRuntimeMin?: number | null
  maxRuntimeMin?: number | null
  yearFrom?: number | null
  yearTo?: number | null
  languages?: string[]
  titles?: string[]
  titleContains?: string | null
  keywords?: string[]
  types?: Array<'movie' | 'series' | 'video'>
  resolutions?: Array<'4k' | '1080p' | '720p' | 'sd'>
}

export interface CollectionRow {
  id: number
  key: string | null
  name: string
  description: string | null
  rules: CollectionRule
  is_smart: number
  sort_4k_first: number
  created_at: string
  updated_at: string
  memberCount?: number
  preview?: Array<string | null>
}

export function normalizeTitle(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function sortMembers(members: any[]): any[] {
  return [...members].sort((a, b) => {
    const ratingDiff = (Number(b?.vote_average) || 0) - (Number(a?.vote_average) || 0)
    if (ratingDiff !== 0) return ratingDiff
    return (Number(b?.id) || 0) - (Number(a?.id) || 0)
  })
}

function toRow(row: any): CollectionRow {
  let rules: CollectionRule = {}
  try {
    rules = row.rules_json ? JSON.parse(row.rules_json) : {}
  } catch { rules = {} }
  return {
    id: row.id,
    key: row.key || null,
    name: row.name,
    description: row.description || null,
    rules,
    is_smart: Number(row.is_smart) ? 1 : 0,
    sort_4k_first: Number(row.sort_4k_first) ? 1 : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function initCollections() {
  const db = getRawDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      rules_json TEXT NOT NULL DEFAULT '{}',
      is_smart INTEGER DEFAULT 1,
      sort_4k_first INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS collection_pins (
      collection_id INTEGER NOT NULL,
      video_id INTEGER NOT NULL,
      PRIMARY KEY (collection_id, video_id),
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );
    -- Titles that are NOT in the local library (any TMDB title): playable via
    -- DetailScreen source search, and preserved across share import/export.
    CREATE TABLE IF NOT EXISTS collection_external (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL,
      tmdb_id INTEGER,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'movie',
      poster_path TEXT,
      backdrop_path TEXT,
      overview TEXT,
      vote_average REAL,
      release_year INTEGER,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    );
  `)

  // Ordering support for drag-to-reorder on existing databases.
  const collectionColumns = db.prepare('PRAGMA table_info(collections)').all() as any[]
  if (!collectionColumns.some((c) => c.name === 'sort_order')) {
    db.exec('ALTER TABLE collections ADD COLUMN sort_order INTEGER DEFAULT 0')
  }
}

export function reorderCollections(ids: number[]): boolean {
  const db = getRawDb()
  const ordered = (Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isFinite(id))
  const tx = db.transaction(() => {
    ordered.forEach((id, index) => {
      db.prepare('UPDATE collections SET sort_order = ? WHERE id = ?').run(index, id)
    })
  })
  tx()
  return true
}

// ─── Smart retirement ───────────────────────────────────────────────────────
// Collections are manual-only now. Any leftover smart collection (from older
// builds, seeds, or shared files) is converted: its hand-added titles
// (pins + online entries) are kept, smart-only leftovers are dropped with it.
// A smart collection with nothing hand-added is deleted. Titles in the
// library are never touched.
export function retireSmartCollections(): { converted: string[]; deleted: string[] } {
  const db = getRawDb()
  const converted: string[] = []
  const deleted: string[] = []
  const smartRows = db.prepare('SELECT * FROM collections WHERE is_smart = 1').all() as any[]
  for (const row of smartRows) {
    const pins = db.prepare('SELECT video_id FROM collection_pins WHERE collection_id = ?').all(row.id) as any[]
    const externals = db.prepare('SELECT id FROM collection_external WHERE collection_id = ?').all(row.id) as any[]
    if (pins.length === 0 && externals.length === 0) {
      db.prepare('DELETE FROM collections WHERE id = ?').run(row.id)
      deleted.push(String(row.name))
    } else {
      db.prepare(`UPDATE collections SET is_smart = 0, rules_json = '{}', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id)
      converted.push(String(row.name))
    }
  }
  return { converted, deleted }
}

// ─── Watchlist category retirement ──────────────────────────────────────────
// The watchlist is now exactly one inbox ("Watchlist"). Any legacy custom
// categories are migrated into manual collections of the same name — titles
// are COPIED, never deleted — and the watchlist rows are normalized back to
// the default inbox. Re-running is a natural no-op: once no custom
// categories remain, there is nothing to do. Backup-restore calls this too,
// so legacy backups with categories are absorbed the same way.
export function migrateWatchlistCategoriesToCollections(): { migrated: string[] } {
  const db = getRawDb()
  const migrated: string[] = []

  const externalCats = db.prepare(`
    SELECT DISTINCT category FROM watchlist WHERE TRIM(COALESCE(category, '')) <> ''
  `).all() as any[]
  const localCats = db.prepare(`
    SELECT DISTINCT watchlist_category AS category FROM videos
    WHERE is_watchlist = 1 AND TRIM(COALESCE(watchlist_category, '')) <> ''
  `).all() as any[]

  const seen = new Map<string, string>()
  for (const row of [...externalCats, ...localCats]) {
    const display = String(row?.category || '').trim()
    if (!display || display.toLowerCase() === 'watchlist') continue
    const norm = display.toLowerCase()
    if (!seen.has(norm)) seen.set(norm, display)
  }
  if (seen.size === 0) return { migrated }

  for (const [norm, display] of seen) {
    const migrationKey = `watchlist-cat:${norm}`
    let collection = db.prepare('SELECT * FROM collections WHERE key = ?').get(migrationKey) as any
    if (!collection) {
      const byName = db.prepare('SELECT * FROM collections WHERE LOWER(name) = ?').get(norm) as any
      if (byName) {
        db.prepare(`UPDATE collections SET key = ?, is_smart = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(migrationKey, byName.id)
        collection = { id: byName.id }
      } else {
        const created = db.prepare(`
          INSERT INTO collections (key, name, description, rules_json, is_smart, sort_4k_first, updated_at)
          VALUES (?, ?, ?, '{}', 0, 0, CURRENT_TIMESTAMP)
        `).run(migrationKey, display, 'Migrated from your watchlist.')
        collection = { id: Number(created.lastInsertRowid) }
      }
    }
    const collectionId = Number(collection.id)

    const externalRows = db.prepare(`SELECT * FROM watchlist WHERE LOWER(TRIM(category)) = ?`).all(norm) as any[]
    for (const item of externalRows) {
      try {
        addExternalToCollection(collectionId, {
          tmdb_id: item.tmdb_id,
          title: item.title,
          type: item.type,
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          overview: item.overview,
          vote_average: item.vote_average,
          release_year: item.release_year,
        })
      } catch { /* keep migrating the rest */ }
    }
    if (externalRows.length > 0) {
      db.prepare(`UPDATE watchlist SET category = 'Watchlist' WHERE LOWER(TRIM(category)) = ?`).run(norm)
    }

    const localRows = db.prepare(`
      SELECT id FROM videos
      WHERE is_watchlist = 1 AND LOWER(TRIM(COALESCE(watchlist_category, 'Watchlist'))) = ?
    `).all(norm) as any[]
    for (const local of localRows) {
      try {
        pinVideoToCollection(collectionId, Number(local.id))
      } catch { /* keep migrating the rest */ }
    }
    if (localRows.length > 0) {
      db.prepare(`
        UPDATE videos SET watchlist_category = 'Watchlist'
        WHERE is_watchlist = 1 AND LOWER(TRIM(COALESCE(watchlist_category, 'Watchlist'))) = ?
      `).run(norm)
    }

    migrated.push(display)
  }

  return { migrated }
}

function getPinnedIds(collectionId: number): Set<number> {
  const db = getRawDb()
  const rows = db.prepare('SELECT video_id FROM collection_pins WHERE collection_id = ?').all(collectionId) as any[]
  return new Set(rows.map((r) => Number(r.video_id)))
}

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p'

function normalizeExternalType(value: unknown): 'movie' | 'series' | 'video' {
  const v = String(value || '').toLowerCase()
  if (v === 'tv' || v === 'series') return 'series'
  if (v === 'video') return 'video'
  return 'movie'
}

function toFullPosterUrl(poster: unknown): string | null {
  if (!poster) return null
  const value = String(poster)
  if (value.startsWith('http')) return value
  if (value.startsWith('/')) return `${TMDB_IMG_BASE}/w780${value}`
  return null
}

// External (non-library) row → Video-shaped object the renderer already
// understands (same contract as Watchlist's toExternalVideo).
export function externalToVideo(row: any): any {
  return {
    id: -Number(row.id),
    collection_external_id: Number(row.id),
    tmdb_id: row.tmdb_id != null ? Number(row.tmdb_id) : null,
    title: String(row.title || 'Untitled'),
    file_path: '',
    type: normalizeExternalType(row.type),
    poster_path: row.poster_path || null,
    backdrop_path: row.backdrop_path || null,
    overview: row.overview || null,
    vote_average: row.vote_average != null ? Number(row.vote_average) : null,
    release_year: row.release_year != null ? Number(row.release_year) : null,
    isExternal: true,
  }
}

export function getExternalItems(collectionId: number): any[] {
  const db = getRawDb()
  const rows = db.prepare('SELECT * FROM collection_external WHERE collection_id = ? ORDER BY added_at ASC, id ASC').all(collectionId) as any[]
  return rows
}

export function addExternalToCollection(collectionId: number, item: any): any {
  const db = getRawDb()
  const exists = db.prepare('SELECT * FROM collections WHERE id = ?').get(collectionId) as any
  if (!exists) throw new Error('Collection not found')
  const tmdbId = item?.tmdb_id != null ? Number(item.tmdb_id) : (item?.id != null ? Number(item.id) : null)
  const title = String(item?.title || item?.name || '').trim()
  if (!title && tmdbId == null) throw new Error('Title is required')
  if (tmdbId != null) {
    const dup = db.prepare('SELECT id FROM collection_external WHERE collection_id = ? AND tmdb_id = ?').get(collectionId, tmdbId) as any
    if (dup) return externalToVideo(db.prepare('SELECT * FROM collection_external WHERE id = ?').get(dup.id))
  }
  const releaseYearRaw = item?.release_year ?? String(item?.release_date || item?.first_air_date || '').slice(0, 4)
  const releaseYear = releaseYearRaw ? Number(releaseYearRaw) : null
  const result = db.prepare(`
    INSERT INTO collection_external (collection_id, tmdb_id, title, type, poster_path, backdrop_path, overview, vote_average, release_year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    collectionId,
    tmdbId,
    title || 'Untitled',
    normalizeExternalType(item?.type || item?.media_type),
    toFullPosterUrl(item?.poster_path),
    item?.backdrop_path
      ? (String(item.backdrop_path).startsWith('http') ? String(item.backdrop_path) : String(item.backdrop_path).startsWith('/') ? `${TMDB_IMG_BASE}/w1280${item.backdrop_path}` : null)
      : null,
    item?.overview ? String(item.overview) : null,
    item?.vote_average != null ? Number(item.vote_average) : null,
    releaseYear != null && Number.isFinite(releaseYear) ? releaseYear : null,
  )
  return externalToVideo(db.prepare('SELECT * FROM collection_external WHERE id = ?').get(Number(result.lastInsertRowid)))
}

export function removeExternalFromCollection(externalId: number) {
  const db = getRawDb()
  const result = db.prepare('DELETE FROM collection_external WHERE id = ?').run(Number(externalId))
  return result.changes > 0
}

export function getCollectionMembers(collectionId: number): any[] {
  const db = getRawDb()
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(collectionId) as any
  if (!row) return []
  const videos = getVideos() as any[]
  const byId = new Map(videos.map((v) => [Number(v.id), v]))
  const pinnedIds = getPinnedIds(collectionId)

  // Manual-only: pinned library titles + any-title online entries.
  const members: any[] = [...pinnedIds].map((id) => byId.get(id)).filter(Boolean)
  for (const external of getExternalItems(collectionId)) {
    members.push(externalToVideo(external))
  }
  return sortMembers(members)
}

export function getCollections(): CollectionRow[] {
  const db = getRawDb()
  const rows = db.prepare('SELECT * FROM collections ORDER BY sort_order ASC, created_at ASC, id ASC').all() as any[]
  return rows.map((row) => {
    const collection = toRow(row)
    const members = getCollectionMembers(collection.id)
    return {
      ...collection,
      memberCount: members.length,
      preview: members.slice(0, 4).map((m) => m.poster_path || null),
    }
  })
}

export function createCollection(input: { name: string; description?: string }) {
  const name = String(input?.name || '').trim()
  if (!name) throw new Error('Collection name is required')
  const db = getRawDb()
  const result = db.prepare(`
    INSERT INTO collections (key, name, description, rules_json, is_smart, sort_4k_first, sort_order, updated_at)
    VALUES (NULL, ?, ?, '{}', 0, 0, COALESCE((SELECT MAX(sort_order) FROM collections), 0) + 1, CURRENT_TIMESTAMP)
  `).run(name, String(input?.description || ''))
  return getCollections().find((c) => c.id === Number(result.lastInsertRowid))
}

export function updateCollection(id: number, patch: { name?: string; description?: string }) {
  const db = getRawDb()
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as any
  if (!row) throw new Error('Collection not found')
  const current = toRow(row)
  const name = patch.name !== undefined ? String(patch.name).trim() : current.name
  if (!name) throw new Error('Collection name is required')
  db.prepare(`
    UPDATE collections
    SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name,
    patch.description !== undefined ? String(patch.description) : (current.description || ''),
    id,
  )
  return getCollections().find((c) => c.id === Number(id))
}

export function deleteCollection(id: number) {
  const db = getRawDb()
  db.prepare('DELETE FROM collection_pins WHERE collection_id = ?').run(id)
  db.prepare('DELETE FROM collection_external WHERE collection_id = ?').run(id)
  const result = db.prepare('DELETE FROM collections WHERE id = ?').run(id)
  return result.changes > 0
}

export function pinVideoToCollection(collectionId: number, videoId: number) {
  const db = getRawDb()
  db.prepare(`
    INSERT INTO collection_pins (collection_id, video_id) VALUES (?, ?)
    ON CONFLICT(collection_id, video_id) DO NOTHING
  `).run(collectionId, videoId)
  return true
}

export function unpinVideoFromCollection(collectionId: number, videoId: number) {
  const db = getRawDb()
  db.prepare('DELETE FROM collection_pins WHERE collection_id = ? AND video_id = ?').run(collectionId, videoId)
  return true
}

export interface SharedCollectionPayload {
  app: string
  kind: string
  version: number
  exportedAt: string
  collection: {
    name: string
    description: string
    rules: CollectionRule
    isSmart: boolean
    sort4kFirst: boolean
  }
  snapshot: Array<{
    tmdb_id: number | null
    title: string
    type: string
    poster_path: string | null
    backdrop_path: string | null
    overview: string | null
    vote_average: number | null
    release_year: number | null
    in_library: boolean
  }>
}

function shareableArtwork(value: unknown): string | null {
  if (!value) return null
  const str = String(value)
  // Local file artwork (media:// or disk paths) is meaningless on another machine.
  if (str.startsWith('http')) return str
  if (str.startsWith('/')) return `${TMDB_IMG_BASE}/w780${str}`
  return null
}

// Compact link payload: same import-compatible shape, but stripped of
// overviews/backdrops so the share URL stays short enough for chat apps.
export function buildShareData(collectionId: number): { encoded: string; items: number } {
  const payload = buildSharePayload(collectionId)
  const compact = {
    app: payload.app,
    kind: payload.kind,
    version: payload.version,
    exportedAt: payload.exportedAt,
    collection: {
      name: payload.collection.name,
      description: payload.collection.description,
    },
    snapshot: payload.snapshot.map((item) => ({
      tmdb_id: item.tmdb_id,
      title: item.title,
      type: item.type,
      poster_path: item.poster_path,
      vote_average: item.vote_average,
      release_year: item.release_year,
    })),
  }
  const encoded = Buffer.from(JSON.stringify(compact), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  return { encoded, items: compact.snapshot.length }
}

export function buildSharePayload(collectionId: number): SharedCollectionPayload {
  const db = getRawDb()
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(collectionId) as any
  if (!row) throw new Error('Collection not found')
  const collection = toRow(row)
  const members = getCollectionMembers(collectionId)
  return {
    app: 'MyCinema',
    kind: 'collection',
    version: 1,
    exportedAt: new Date().toISOString(),
    collection: {
      name: collection.name,
      description: collection.description || '',
      rules: {},
      isSmart: false,
      sort4kFirst: false,
    },
    snapshot: members.map((m) => ({
      tmdb_id: m.tmdb_id != null ? Number(m.tmdb_id) : null,
      title: String(m.series_name || m.title || ''),
      type: String(m.type || ''),
      poster_path: shareableArtwork(m.poster_path),
      backdrop_path: m.backdrop_path && String(m.backdrop_path).startsWith('http') ? String(m.backdrop_path) : null,
      overview: m.overview ? String(m.overview) : null,
      vote_average: m.vote_average != null ? Number(m.vote_average) : null,
      release_year: m.release_year != null ? Number(m.release_year) : null,
      in_library: !m.isExternal,
    })),
  }
}

export function importSharePayload(payload: SharedCollectionPayload): { id: number; matched: number; addedOnline: number; total: number } {
  if (!payload || payload.app !== 'MyCinema' || payload.kind !== 'collection' || !payload.collection?.name) {
    throw new Error('Not a valid MyCinema collection file')
  }
  const created = createCollection({
    name: String(payload.collection.name),
    description: String(payload.collection.description || ''),
  })
  if (!created) throw new Error('Failed to import collection')
  const videos = getVideos() as any[]
  const byTmdb = new Map<number, any>()
  for (const v of videos) {
    if (v.tmdb_id != null) byTmdb.set(Number(v.tmdb_id), v)
  }
  let matched = 0
  let addedOnline = 0
  const snapshot = Array.isArray(payload.snapshot) ? payload.snapshot : []
  for (const item of snapshot) {
    let video: any = null
    if (item.tmdb_id != null && byTmdb.has(Number(item.tmdb_id))) {
      video = byTmdb.get(Number(item.tmdb_id))
    } else if (item.title) {
      const needle = normalizeTitle(item.title)
      video = videos.find((v) => normalizeTitle(v.title) === needle || normalizeTitle(v.series_name) === needle) || null
    }
    if (video) {
      pinVideoToCollection(created.id, Number(video.id))
      matched += 1
    } else if (item.title || item.tmdb_id != null) {
      // Not in this library — keep it as an online (TMDB) entry so the shared
      // collection arrives complete and watchable via source search.
      addExternalToCollection(created.id, item)
      addedOnline += 1
    }
  }
  return { id: created.id, matched, addedOnline, total: snapshot.length }
}
