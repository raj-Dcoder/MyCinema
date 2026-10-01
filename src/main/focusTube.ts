import { getRawDb } from './db'

// ─── Focus Tube ───────────────────────────────────────────────────────────────
// A YouTube alternative where the user, not an algorithm, decides what plays.
//
// The feed is built from the channels the user subscribed to, grouped into
// categories the user created, merged latest-first. Nothing is recommended and
// nothing is autoplayed. Playback uses the official YouTube embed (never direct
// stream extraction), so the feature stays inside YouTube's supported surface.
//
// Metadata comes from the public channel Atom feed
// (https://www.youtube.com/feeds/videos.xml?channel_id=UC...), which needs no
// API key and returns roughly the latest 15 uploads per channel.
//
// The feed advertises `Cache-Control: public, max-age=900` and returns no
// ETag/Last-Modified, so we cannot use conditional GET. Polling is therefore
// interval-based (>= 15 min) and new uploads are detected by diffing video ids.

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
  includeSeen: boolean
  includeSavedOnly: boolean
  hideShorts: boolean
  limit: number
  search: string | null
}

function toCategory(row: any): FtCategory {
  return {
    id: Number(row.id),
    name: String(row.name),
    color: String(row.color || 'red'),
    position: Number(row.position ?? 0),
    channelCount: row.channel_count === undefined ? undefined : Number(row.channel_count || 0),
    unseenCount: row.unseen_count === undefined ? undefined : Number(row.unseen_count || 0),
  }
}

function toChannel(row: any, categoryIds: number[]): FtChannel {
  return {
    channelId: String(row.channel_id),
    title: String(row.title),
    handle: row.handle ? String(row.handle) : null,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    url: String(row.url || ''),
    hideShorts: Number(row.hide_shorts) ? true : false,
    position: Number(row.position ?? 0),
    lastFetched: row.last_fetched ? String(row.last_fetched) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    categoryIds,
  }
}

function toVideo(row: any): FtVideo {
  return {
    videoId: String(row.video_id),
    channelId: String(row.channel_id),
    channelTitle: String(row.channel_title || ''),
    title: String(row.title || ''),
    publishedAt: String(row.published_at || ''),
    duration: row.duration === null || row.duration === undefined ? null : Number(row.duration),
    isLive: Number(row.is_live) ? true : false,
    isShort: Number(row.is_short) ? true : false,
    views: row.views === null || row.views === undefined ? null : Number(row.views),
    description: row.description ? String(row.description) : null,
    embeddable: row.embeddable === null || row.embeddable === undefined ? true : Number(row.embeddable) ? true : false,
    firstSeenAt: String(row.first_seen_at || ''),
    seen: Number(row.seen) ? true : false,
    seenAt: row.seen_at ? String(row.seen_at) : null,
    saved: Number(row.saved) ? true : false,
    position: Number(row.position ?? 0),
  }
}

const CATEGORY_COLORS = ['red', 'blue', 'emerald', 'amber', 'violet', 'cyan', 'rose', 'lime']

function nextCategoryColor(): string {
  const db = getRawDb()
  const used = db.prepare('SELECT color FROM ft_categories').all() as any[]
  const taken = new Set(used.map((r) => String(r.color)))
  return CATEGORY_COLORS.find((c) => !taken.has(c)) || 'red'
}

export function initFocusTube(): void {
  const db = getRawDb()
  db.exec(`
    -- User-created rooms. The unit of control: pick a category, watch only that.
    CREATE TABLE IF NOT EXISTS ft_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT 'red',
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Subscribed channels. etag/last_modified were considered but the feed sends
    -- neither, so freshness is tracked with last_fetched only.
    CREATE TABLE IF NOT EXISTS ft_channels (
      channel_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      handle TEXT,
      avatar_url TEXT,
      url TEXT,
      hide_shorts INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      last_fetched DATETIME,
      last_error TEXT
    );

    -- Many-to-many: a news channel can legitimately live in both News and Tech.
    CREATE TABLE IF NOT EXISTS ft_channel_categories (
      channel_id TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (channel_id, category_id),
      FOREIGN KEY (channel_id) REFERENCES ft_channels(channel_id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES ft_categories(id) ON DELETE CASCADE
    );

    -- One row per discovered upload, shared across every category its channel
    -- belongs to. duration/is_live/embeddable are filled by the enrichment pass,
    -- which runs only for newly discovered videos.
    CREATE TABLE IF NOT EXISTS ft_videos (
      video_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      published_at TEXT NOT NULL,
      duration REAL,
      is_live INTEGER DEFAULT 0,
      views INTEGER,
      description TEXT,
      embeddable INTEGER DEFAULT 1,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES ft_channels(channel_id) ON DELETE CASCADE
    );

    -- Consumption state. Kept separate from ft_videos so re-polling a feed never
    -- clobbers what the user has already watched.
    --
    -- "seen" is deliberately per-VIDEO, not per-category: a video is a single
    -- ft_videos row shared by every category its channel belongs to. Watching it
    -- once from Tech therefore also clears it from News, which is what you want
    -- ("I have seen this, do not show it to me again"). Per-category unseen
    -- counts are just views over that one seen set.
    CREATE TABLE IF NOT EXISTS ft_video_state (
      video_id TEXT PRIMARY KEY,
      seen INTEGER DEFAULT 0,
      seen_at DATETIME,
      saved INTEGER DEFAULT 0,
      position REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Time-boxed viewing sessions (see ft_sessions.budget_ms).
    CREATE TABLE IF NOT EXISTS ft_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      budget_ms INTEGER,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      watched_ms INTEGER DEFAULT 0
    );

    -- One-shot bookkeeping (e.g. "starter content already seeded"). Without this
    -- the starter seed would resurrect itself every time the user emptied their
    -- subscriptions on purpose.
    CREATE TABLE IF NOT EXISTS ft_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ft_videos_published ON ft_videos(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ft_videos_channel ON ft_videos(channel_id);
    CREATE INDEX IF NOT EXISTS idx_ft_cc_category ON ft_channel_categories(category_id);
    CREATE INDEX IF NOT EXISTS idx_ft_state_seen ON ft_video_state(seen, saved);
  `)

  // `is_short` arrived after the original schema. The codebase migrates with
  // idempotent PRAGMA checks, so follow that style.
  const videoColumns = db.prepare('PRAGMA table_info(ft_videos)').all() as any[]
  if (!videoColumns.some((c) => c.name === 'is_short')) {
    db.exec('ALTER TABLE ft_videos ADD COLUMN is_short INTEGER DEFAULT 0')
  }

  seedDefaultContent()
}

/**
 * First-run starter content: one "Tech" category with the Fireship channel, so
 * the tab has something to show before the user subscribes to anything.
 *
 * Runs exactly once per database. Gating on "tables are empty" would be wrong:
 * a user who deliberately unsubscribes from everything would find Fireship
 * silently reappearing on the next launch.
 */
function seedDefaultContent(): void {
  const db = getRawDb()

  const alreadySeeded = db.prepare('SELECT value FROM ft_meta WHERE key = ?').get('starter_seeded') as any
  if (alreadySeeded) return

  const tech = db.prepare('SELECT id FROM ft_categories WHERE name = ? COLLATE NOCASE').get('Tech') as any
  let categoryId = tech?.id as number | undefined
  if (!categoryId) {
    const max = db.prepare('SELECT MAX(position) AS p FROM ft_categories').get() as any
    const inserted = db
      .prepare('INSERT INTO ft_categories (name, color, position) VALUES (?, ?, ?)')
      .run('Tech', 'blue', Number(max?.p ?? -1) + 1)
    categoryId = Number(inserted.lastInsertRowid)
  }

  const channelId = 'UCsBjURrPoezykLs9EqgamOA'
  db.prepare(`
    INSERT INTO ft_channels (channel_id, title, handle, url, position)
    VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(channel_id) DO NOTHING
  `).run(channelId, 'Fireship', '@Fireship', `https://www.youtube.com/channel/${channelId}`)

  db.prepare(`
    INSERT OR IGNORE INTO ft_channel_categories (channel_id, category_id) VALUES (?, ?)
  `).run(channelId, categoryId)

  db.prepare(`
    INSERT INTO ft_meta (key, value) VALUES ('starter_seeded', CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run()
}

// ─── Categories ───────────────────────────────────────────────────────────────

export function listCategories(): FtCategory[] {
  const db = getRawDb()
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM ft_channel_categories cc WHERE cc.category_id = c.id) AS channel_count,
      (SELECT COUNT(*) FROM ft_videos v
         JOIN ft_channel_categories cc2 ON cc2.channel_id = v.channel_id
        WHERE cc2.category_id = c.id
          AND COALESCE((SELECT seen FROM ft_video_state s WHERE s.video_id = v.video_id), 0) = 0
      ) AS unseen_count
    FROM ft_categories c
    ORDER BY c.position ASC, c.id ASC
  `).all() as any[]
  return rows.map(toCategory)
}

export function createCategory(name: string, color?: string): FtCategory {
  const db = getRawDb()
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('Category name is required')
  const max = db.prepare('SELECT MAX(position) AS p FROM ft_categories').get() as any
  const inserted = db
    .prepare('INSERT INTO ft_categories (name, color, position) VALUES (?, ?, ?)')
    .run(trimmed, color || nextCategoryColor(), Number(max?.p ?? -1) + 1)
  const row = db.prepare('SELECT * FROM ft_categories WHERE id = ?').get(inserted.lastInsertRowid) as any
  return toCategory(row)
}

export function renameCategory(id: number, name: string, color?: string): FtCategory {
  const db = getRawDb()
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('Category name is required')
  if (color) {
    db.prepare('UPDATE ft_categories SET name = ?, color = ? WHERE id = ?').run(trimmed, color, id)
  } else {
    db.prepare('UPDATE ft_categories SET name = ? WHERE id = ?').run(trimmed, id)
  }
  const row = db.prepare('SELECT * FROM ft_categories WHERE id = ?').get(id) as any
  if (!row) throw new Error('Category not found')
  return toCategory(row)
}

export function deleteCategory(id: number): boolean {
  const db = getRawDb()
  // Channels are not deleted with their category — only the membership row is
  // removed, so a channel can be re-filed into another category later.
  db.prepare('DELETE FROM ft_categories WHERE id = ?').run(id)
  return true
}

export function reorderCategories(ids: number[]): boolean {
  const db = getRawDb()
  const tx = db.transaction(() => {
    ids.forEach((id, index) => {
      db.prepare('UPDATE ft_categories SET position = ? WHERE id = ?').run(index, id)
    })
  })
  tx()
  return true
}

// ─── Channels ─────────────────────────────────────────────────────────────────

function categoryIdsFor(channelId: string): number[] {
  const db = getRawDb()
  const rows = db
    .prepare('SELECT category_id FROM ft_channel_categories WHERE channel_id = ?')
    .all(channelId) as any[]
  return rows.map((r) => Number(r.category_id))
}

export function listChannels(categoryId?: number | null): FtChannel[] {
  const db = getRawDb()
  const rows = (
    categoryId
      ? db.prepare(`
          SELECT c.* FROM ft_channels c
          JOIN ft_channel_categories cc ON cc.channel_id = c.channel_id
          WHERE cc.category_id = ?
          ORDER BY c.position ASC, c.title COLLATE NOCASE ASC
        `).all(categoryId)
      : db.prepare('SELECT * FROM ft_channels ORDER BY position ASC, title COLLATE NOCASE ASC').all()
  ) as any[]
  return rows.map((row) => toChannel(row, categoryIdsFor(String(row.channel_id))))
}

export function getChannel(channelId: string): FtChannel | null {
  const db = getRawDb()
  const row = db.prepare('SELECT * FROM ft_channels WHERE channel_id = ?').get(channelId) as any
  return row ? toChannel(row, categoryIdsFor(String(row.channel_id))) : null
}

export function upsertChannel(input: {
  channelId: string
  title: string
  handle?: string | null
  avatarUrl?: string | null
  url?: string | null
}): FtChannel {
  const db = getRawDb()
  const channelId = String(input.channelId || '').trim()
  const title = String(input.title || '').trim()
  if (!channelId) throw new Error('channelId is required')
  if (!title) throw new Error('Channel title is required')

  const max = db.prepare('SELECT MAX(position) AS p FROM ft_channels').get() as any
  db.prepare(`
    INSERT INTO ft_channels (channel_id, title, handle, avatar_url, url, position)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(channel_id) DO UPDATE SET
      title = excluded.title,
      handle = COALESCE(excluded.handle, ft_channels.handle),
      avatar_url = COALESCE(excluded.avatar_url, ft_channels.avatar_url),
      url = COALESCE(excluded.url, ft_channels.url),
      last_error = NULL
  `).run(
    channelId,
    title,
    input.handle ?? null,
    input.avatarUrl ?? null,
    input.url ?? `https://www.youtube.com/channel/${channelId}`,
    Number(max?.p ?? -1) + 1,
  )

  return getChannel(channelId)!
}

export function deleteChannel(channelId: string): boolean {
  const db = getRawDb()
  db.prepare('DELETE FROM ft_channels WHERE channel_id = ?').run(channelId)
  return true
}

export function setChannelHideShorts(channelId: string, hideShorts: boolean): boolean {
  const db = getRawDb()
  db.prepare('UPDATE ft_channels SET hide_shorts = ? WHERE channel_id = ?')
    .run(hideShorts ? 1 : 0, channelId)
  return true
}

export function setChannelCategories(channelId: string, categoryIds: number[]): boolean {
  const db = getRawDb()
  const unique = [...new Set((categoryIds || []).map(Number).filter(Number.isFinite))]
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM ft_channel_categories WHERE channel_id = ?').run(channelId)
    const insert = db.prepare('INSERT OR IGNORE INTO ft_channel_categories (channel_id, category_id) VALUES (?, ?)')
    for (const categoryId of unique) insert.run(channelId, categoryId)
  })
  tx()
  return true
}

export function setChannelLastFetched(channelId: string, error?: string | null): void {
  const db = getRawDb()
  db.prepare('UPDATE ft_channels SET last_fetched = CURRENT_TIMESTAMP, last_error = ? WHERE channel_id = ?')
    .run(error ?? null, channelId)
}

// ─── Videos / feed ────────────────────────────────────────────────────────────

/**
 * The stack: newest-first merge of every subscribed channel in the selected
 * category. `categoryId: null` means "All", which is still user-curated (it is
 * the union of their own subscriptions) — never a recommendation.
 */
export function getFeed(options: FtFeedOptions): FtVideo[] {
  const db = getRawDb()
  const params: any[] = []
  const where: string[] = []

  if (options.categoryId !== null && options.categoryId !== undefined) {
    where.push('EXISTS (SELECT 1 FROM ft_channel_categories cc WHERE cc.channel_id = v.channel_id AND cc.category_id = ?)')
    params.push(options.categoryId)
  }

  if (options.includeSavedOnly) {
    where.push('COALESCE(s.saved, 0) = 1')
  } else if (!options.includeSeen) {
    where.push('COALESCE(s.seen, 0) = 0')
  }

  if (options.hideShorts) {
    // The Atom feed carries no Shorts flag, so classification comes from the
    // channel's Shorts tab (see focusTubeFeed.fetchChannelShorts) and lands in
    // v.is_short. Anything unclassified (0) is shown — we hide only what we
    // positively know is a Short. Duration is deliberately NOT used here:
    // durations are unknown for almost every video (watch pages are bot-gated)
    // and Shorts can now run up to 3 minutes, so <=60s would both miss and
    // over-match.
    where.push('COALESCE(v.is_short, 0) = 0')
  }

  if (options.search && String(options.search).trim()) {
    where.push('(v.title LIKE ? OR c.title LIKE ?)')
    const like = `%${String(options.search).trim()}%`
    params.push(like, like)
  }

  const limit = Math.min(Math.max(Number(options.limit) || 60, 1), 200)
  params.push(limit)

  const rows = db.prepare(`
    SELECT v.*, c.title AS channel_title,
      COALESCE(s.seen, 0) AS seen, s.seen_at, COALESCE(s.saved, 0) AS saved,
      COALESCE(s.position, 0) AS position
    FROM ft_videos v
    JOIN ft_channels c ON c.channel_id = v.channel_id
    LEFT JOIN ft_video_state s ON s.video_id = v.video_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY v.is_live DESC, v.published_at DESC
    LIMIT ?
  `).all(...params) as any[]

  return rows.map(toVideo)
}

export function getVideo(videoId: string): FtVideo | null {
  const db = getRawDb()
  const row = db.prepare(`
    SELECT v.*, c.title AS channel_title,
      COALESCE(s.seen, 0) AS seen, s.seen_at, COALESCE(s.saved, 0) AS saved,
      COALESCE(s.position, 0) AS position
    FROM ft_videos v
    JOIN ft_channels c ON c.channel_id = v.channel_id
    LEFT JOIN ft_video_state s ON s.video_id = v.video_id
    WHERE v.video_id = ?
  `).get(videoId) as any
  return row ? toVideo(row) : null
}

export function setVideoSeen(videoId: string, seen: boolean): boolean {
  const db = getRawDb()
  db.prepare(`
    INSERT INTO ft_video_state (video_id, seen, seen_at, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(video_id) DO UPDATE SET
      seen = excluded.seen,
      seen_at = excluded.seen_at,
      updated_at = CURRENT_TIMESTAMP
  `).run(videoId, seen ? 1 : 0, seen ? new Date().toISOString() : null)
  return true
}

export function markAllSeen(categoryId: number | null): number {
  const db = getRawDb()
  const params: any[] = []
  let scope = ''
  if (categoryId !== null && categoryId !== undefined) {
    scope = 'AND v.channel_id IN (SELECT channel_id FROM ft_channel_categories WHERE category_id = ?)'
    params.push(categoryId)
  }
  const result = db.prepare(`
    INSERT INTO ft_video_state (video_id, seen, seen_at, updated_at)
    SELECT v.video_id, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM ft_videos v
    WHERE COALESCE((SELECT seen FROM ft_video_state s WHERE s.video_id = v.video_id), 0) = 0
    ${scope}
    ON CONFLICT(video_id) DO UPDATE SET seen = 1, seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
  `).run(...params)
  return Number(result.changes || 0)
}

export function toggleVideoSaved(videoId: string, saved: boolean): boolean {
  const db = getRawDb()
  db.prepare(`
    INSERT INTO ft_video_state (video_id, saved, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(video_id) DO UPDATE SET saved = excluded.saved, updated_at = CURRENT_TIMESTAMP
  `).run(videoId, saved ? 1 : 0)
  return true
}

export function getVideoProgress(videoId: string): number {
  const db = getRawDb()
  const row = db.prepare('SELECT position FROM ft_video_state WHERE video_id = ?').get(videoId) as any
  return Number(row?.position || 0)
}

export function updateVideoProgress(videoId: string, position: number): boolean {
  const db = getRawDb()
  const safe = Number.isFinite(position) ? Math.max(0, position) : 0
  db.prepare(`
    INSERT INTO ft_video_state (video_id, position, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(video_id) DO UPDATE SET position = excluded.position, updated_at = CURRENT_TIMESTAMP
  `).run(videoId, safe)
  return true
}

/**
 * Flags videos as Shorts from a channel's Shorts tab listing. One-way only:
 * absence from the tab (a 48-item window) does not prove a video is long-form,
 * so we never auto-clear the flag. Returns the number of rows actually marked.
 */
export function setVideosShort(videoIds: string[]): number {
  const db = getRawDb()
  const unique = [...new Set((videoIds || []).map(String).filter(Boolean))]
  if (!unique.length) return 0
  const result = db.prepare(`
    UPDATE ft_videos SET is_short = 1 WHERE video_id IN (${unique.map(() => '?').join(', ')})
  `).run(...unique)
  return Number(result.changes || 0)
}

/** Total unseen count for a category, or across all categories when null. */
export function getUnseenCount(categoryId: number | null): number {
  const db = getRawDb()
  const params: any[] = []
  let scope = ''
  if (categoryId !== null && categoryId !== undefined) {
    scope = 'AND v.channel_id IN (SELECT channel_id FROM ft_channel_categories WHERE category_id = ?)'
    params.push(categoryId)
  }
  const row = db.prepare(`
    SELECT COUNT(*) AS c FROM ft_videos v
    WHERE COALESCE((SELECT seen FROM ft_video_state s WHERE s.video_id = v.video_id), 0) = 0
    ${scope}
  `).get(...params) as any
  return Number(row?.c || 0)
}

/** Last upload time per category — powers the "caught up, last post 3d ago" state. */
export function getLatestPublished(categoryId: number | null): string | null {
  const db = getRawDb()
  const params: any[] = []
  let scope = ''
  if (categoryId !== null && categoryId !== undefined) {
    scope = 'AND v.channel_id IN (SELECT channel_id FROM ft_channel_categories WHERE category_id = ?)'
    params.push(categoryId)
  }
  const row = db.prepare(`SELECT MAX(v.published_at) AS latest FROM ft_videos v WHERE 1 = 1 ${scope}`).get(...params) as any
  return row?.latest ? String(row.latest) : null
}

// ─── Upsert helpers (used by the network layer) ───────────────────────────────

export interface FtFeedEntry {
  videoId: string
  channelId: string
  title: string
  publishedAt: string
  views: number | null
  description: string | null
}

export interface FtUpsertResult {
  inserted: number
  existing: number
  newVideoIds: string[]
}

/**
 * Upserts one channel's feed. `first_seen_at` is preserved for existing rows so
 * "new since yesterday" stays truthful, and newly discovered ids are returned so
 * the caller can queue duration/live/embeddability enrichment.
 */
export function upsertFeedEntries(channelId: string, entries: FtFeedEntry[]): FtUpsertResult {
  const db = getRawDb()
  const result: FtUpsertResult = { inserted: 0, existing: 0, newVideoIds: [] }

  const find = db.prepare('SELECT video_id FROM ft_videos WHERE video_id = ?')
  const insert = db.prepare(`
    INSERT INTO ft_videos (video_id, channel_id, title, published_at, views, description)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(video_id) DO UPDATE SET
      title = excluded.title,
      published_at = excluded.published_at,
      views = COALESCE(excluded.views, ft_videos.views),
      description = COALESCE(excluded.description, ft_videos.description)
  `)

  const tx = db.transaction(() => {
    for (const entry of entries) {
      if (!entry.videoId) continue
      if (find.get(entry.videoId)) {
        result.existing += 1
      } else {
        result.newVideoIds.push(entry.videoId)
      }
      insert.run(
        entry.videoId,
        channelId,
        entry.title || 'Untitled',
        entry.publishedAt,
        entry.views ?? null,
        entry.description ?? null,
      )
    }
  })
  tx()

  result.inserted = result.newVideoIds.length
  return result
}

export function setVideoEnrichment(
  videoId: string,
  patch: { duration?: number | null; isLive?: boolean; embeddable?: boolean },
): boolean {
  const db = getRawDb()
  const fields: string[] = []
  const params: any[] = []
  if (patch.duration !== undefined) {
    fields.push('duration = ?')
    params.push(patch.duration)
  }
  if (patch.isLive !== undefined) {
    fields.push('is_live = ?')
    params.push(patch.isLive ? 1 : 0)
  }
  if (patch.embeddable !== undefined) {
    fields.push('embeddable = ?')
    params.push(patch.embeddable ? 1 : 0)
  }
  if (!fields.length) return false
  params.push(videoId)
  db.prepare(`UPDATE ft_videos SET ${fields.join(', ')} WHERE video_id = ?`).run(...params)
  return true
}

export function getVideoChannelId(videoId: string): string | null {
  const db = getRawDb()
  const row = db.prepare('SELECT channel_id FROM ft_videos WHERE video_id = ?').get(videoId) as any
  return row?.channel_id ? String(row.channel_id) : null
}

/**
 * Oldest-first helpers for videos whose duration is still unknown. The Atom
 * feed omits duration and the watch page is bot-gated, so duration is learned
 * from the player at watch time (see focusTubeFeed.recordPlaybackObservation).
 */
export function getVideosMissingDuration(limit: number): string[] {
  const db = getRawDb()
  const rows = db.prepare(`
    SELECT video_id FROM ft_videos
    WHERE duration IS NULL
    ORDER BY published_at DESC
    LIMIT ?
  `).all(Math.min(Math.max(Number(limit) || 5, 1), 25)) as any[]
  return rows.map((row) => String(row.video_id))
}

/** Channels whose feed is due for a refresh (or all, when force is set). */
export function getChannelsDueForFetch(maxAgeMinutes: number, force: boolean): FtChannel[] {
  const all = listChannels(null)
  if (force) return all
  const cutoff = Date.now() - maxAgeMinutes * 60_000
  return all.filter((channel) => {
    if (!channel.lastFetched) return true
    const fetched = Date.parse(channel.lastFetched.replace(' ', 'T') + 'Z')
    return !Number.isFinite(fetched) || fetched < cutoff
  })
}

// ─── Backup / restore ─────────────────────────────────────────────────────────

export function getBackupData() {
  const db = getRawDb()
  return {
    categories: db.prepare('SELECT * FROM ft_categories ORDER BY position ASC').all() as any[],
    channels: db.prepare('SELECT * FROM ft_channels').all() as any[],
    channelCategories: db.prepare('SELECT * FROM ft_channel_categories').all() as any[],
    videos: db.prepare('SELECT * FROM ft_videos').all() as any[],
    videoState: db.prepare('SELECT * FROM ft_video_state').all() as any[],
  }
}

export function restoreBackupData(data: any): void {
  if (!data || typeof data !== 'object') return
  const db = getRawDb()
  const tx = db.transaction(() => {
    for (const table of ['ft_video_state', 'ft_videos', 'ft_channel_categories', 'ft_channels', 'ft_categories']) {
      db.prepare(`DELETE FROM ${table}`).run()
    }
    const insertAll = (table: string, rows: any[]) => {
      for (const row of rows || []) {
        const keys = Object.keys(row)
        if (!keys.length) continue
        const placeholders = keys.map(() => '?').join(', ')
        db.prepare(`INSERT OR REPLACE INTO ${table} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${placeholders})`)
          .run(...keys.map((k) => row[k]))
      }
    }
    insertAll('ft_categories', data.categories)
    insertAll('ft_channels', data.channels)
    insertAll('ft_channel_categories', data.channelCategories)
    insertAll('ft_videos', data.videos)
    insertAll('ft_video_state', data.videoState)
  })
  tx()
  // Deliberately no re-seed: a restore must be faithful to the backup, even if
  // that means coming back with no channels at all.
}
