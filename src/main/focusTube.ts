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
  playlistCount?: number
  unseenCount?: number
}

export interface FtChannel {
  channelId: string
  title: string
  thumbnail?: string | null
  handle: string | null
  avatarUrl: string | null
  url: string
  hideShorts: boolean
  position: number
  lastFetched: string | null
  lastError: string | null
  categoryIds: number[]
}

export interface FtPlaylist {
  playlistId: string
  channelId: string | null
  channelTitle: string | null
  title: string
  thumbnailUrl: string | null
  url: string
  position: number
  lastFetched: string | null
  lastError: string | null
  categoryIds: number[]
  videoCount?: number
}

export interface FtVideo {
  videoId: string
  channelId: string
  channelTitle: string
  channelAvatarUrl?: string | null
  channelHandle?: string | null
  title: string
  thumbnail?: string | null
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
  playlistId?: string | null
  playlistTitle?: string | null
}

export interface FtFeedOptions {
  categoryId: number | null
  includeSeen: boolean
  includeSavedOnly: boolean
  hideShorts: boolean
  limit: number
  search: string | null
  sortOrder?: 'newest' | 'oldest'
}

function toCategory(row: any): FtCategory {
  return {
    id: Number(row.id),
    name: String(row.name),
    color: String(row.color || 'red'),
    position: Number(row.position ?? 0),
    channelCount: row.channel_count === undefined ? undefined : Number(row.channel_count || 0),
    playlistCount: row.playlist_count === undefined ? undefined : Number(row.playlist_count || 0),
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

function toPlaylist(row: any, categoryIds: number[]): FtPlaylist {
  return {
    playlistId: String(row.playlist_id),
    channelId: row.channel_id ? String(row.channel_id) : null,
    channelTitle: row.channel_title ? String(row.channel_title) : null,
    title: String(row.title),
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
    url: String(row.url || `https://www.youtube.com/playlist?list=${row.playlist_id}`),
    position: Number(row.position ?? 0),
    lastFetched: row.last_fetched ? String(row.last_fetched) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    categoryIds,
    videoCount: row.video_count !== undefined ? Number(row.video_count) : undefined,
  }
}

function toVideo(row: any): FtVideo {
  const isGarbage = (t: string | null | undefined) =>
    !t || t === 'YouTube Creator' || /\b\d+[\d,.]*\s*[kmb]?\s*views?\b/i.test(t) || /\bviews?\b/i.test(t) || /\bago\b/i.test(t)
  const channelTitle = isGarbage(row.channel_title)
    ? (row.playlist_channel_title || 'YouTube Creator')
    : String(row.channel_title || '')

  return {
    videoId: String(row.video_id),
    channelId: String(row.channel_id),
    channelTitle,
    channelAvatarUrl: row.channel_avatar_url ? String(row.channel_avatar_url) : (row.avatar_url ? String(row.avatar_url) : null),
    channelHandle: row.channel_handle ? String(row.channel_handle) : (row.handle ? String(row.handle) : null),
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
    playlistId: row.playlist_id ? String(row.playlist_id) : null,
    playlistTitle: row.playlist_title ? String(row.playlist_title) : null,
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

    -- Subscribed Playlists
    CREATE TABLE IF NOT EXISTS ft_playlists (
      playlist_id TEXT PRIMARY KEY,
      channel_id TEXT,
      channel_title TEXT,
      title TEXT NOT NULL,
      thumbnail_url TEXT,
      url TEXT,
      position INTEGER DEFAULT 0,
      last_fetched DATETIME,
      last_error TEXT
    );

    -- Many-to-many: a playlist can belong to multiple categories
    CREATE TABLE IF NOT EXISTS ft_playlist_categories (
      playlist_id TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, category_id),
      FOREIGN KEY (playlist_id) REFERENCES ft_playlists(playlist_id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES ft_categories(id) ON DELETE CASCADE
    );

    -- Videos belonging to a playlist
    CREATE TABLE IF NOT EXISTS ft_playlist_videos (
      playlist_id TEXT NOT NULL,
      video_id TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (playlist_id, video_id),
      FOREIGN KEY (playlist_id) REFERENCES ft_playlists(playlist_id) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES ft_videos(video_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ft_videos_published ON ft_videos(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ft_videos_channel ON ft_videos(channel_id);
    CREATE INDEX IF NOT EXISTS idx_ft_cc_category ON ft_channel_categories(category_id);
    CREATE INDEX IF NOT EXISTS idx_ft_state_seen ON ft_video_state(seen, saved);
    CREATE INDEX IF NOT EXISTS idx_ft_pc_category ON ft_playlist_categories(category_id);
    CREATE INDEX IF NOT EXISTS idx_ft_pv_playlist ON ft_playlist_videos(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_ft_pv_video ON ft_playlist_videos(video_id);
  `)

  // `is_short` arrived after the original schema. The codebase migrates with
  // idempotent PRAGMA checks, so follow that style.
  const videoColumns = db.prepare('PRAGMA table_info(ft_videos)').all() as any[]
  if (!videoColumns.some((c) => c.name === 'is_short')) {
    db.exec('ALTER TABLE ft_videos ADD COLUMN is_short INTEGER DEFAULT 0')
  }

  // `is_subscribed` differentiates direct channel subscriptions from channels
  // recorded as metadata holders for playlist videos.
  const channelColumns = db.prepare('PRAGMA table_info(ft_channels)').all() as any[]
  if (!channelColumns.some((c) => c.name === 'is_subscribed')) {
    db.exec('ALTER TABLE ft_channels ADD COLUMN is_subscribed INTEGER DEFAULT 1')
  }

  // Self-heal: repair channel titles stuck with "YouTube Creator" or view count strings
  try {
    db.exec(`
      UPDATE ft_channels
      SET title = (
        SELECT p.channel_title FROM ft_playlists p
        WHERE p.channel_id = ft_channels.channel_id
          AND p.channel_title IS NOT NULL
          AND p.channel_title != 'YouTube Creator'
          AND p.channel_title NOT LIKE '%views%'
          AND p.channel_title NOT LIKE '%ago%'
        LIMIT 1
      )
      WHERE (title = 'YouTube Creator' OR title LIKE '%views%' OR title LIKE '%ago%')
        AND EXISTS (
          SELECT 1 FROM ft_playlists p
          WHERE p.channel_id = ft_channels.channel_id
            AND p.channel_title IS NOT NULL
            AND p.channel_title != 'YouTube Creator'
            AND p.channel_title NOT LIKE '%views%'
            AND p.channel_title NOT LIKE '%ago%'
        );
    `)
  } catch (err) {
    console.warn('[FocusTube] Channel title repair failed:', err)
  }

  // Self-heal: repair playlist videos whose timestamps jumped to import time (Date.now())
  try {
    const playlists = db.prepare('SELECT playlist_id FROM ft_playlists').all() as any[]
    for (const pl of playlists) {
      const pVideos = db.prepare(`
        SELECT pv.video_id, pv.position, v.published_at
        FROM ft_playlist_videos pv
        JOIN ft_videos v ON v.video_id = pv.video_id
        WHERE pv.playlist_id = ?
        ORDER BY pv.position ASC
      `).all(pl.playlist_id) as any[]

      if (!pVideos || pVideos.length < 2) continue

      const dates = pVideos.map((r) => ({
        videoId: r.video_id,
        position: Number(r.position),
        ms: Date.parse(r.published_at),
      })).filter((d) => Number.isFinite(d.ms) && d.ms > 0)

      if (dates.length < 2) continue

      const now = Date.now()
      const oldDates = dates.filter((d) => (now - d.ms) > 180 * 86400 * 1000)
      const freshDates = dates.filter((d) => (now - d.ms) < 2 * 86400 * 1000)

      if (oldDates.length >= 3 && freshDates.length >= 3) {
        const firstOld = oldDates[0]
        const lastOld = oldDates[oldDates.length - 1]
        const isAsc = firstOld.position !== lastOld.position ? firstOld.ms <= lastOld.ms : true
        const avgStep = Math.max(60_000, Math.round(Math.abs(lastOld.ms - firstOld.ms) / Math.max(1, lastOld.position - firstOld.position)))

        const updateStmt = db.prepare('UPDATE ft_videos SET published_at = ? WHERE video_id = ?')
        const repairTx = db.transaction(() => {
          for (const f of freshDates) {
            if (f.position > lastOld.position) {
              const newMs = Math.min(lastOld.ms + (f.position - lastOld.position) * (isAsc ? avgStep : -avgStep), now - 86400 * 1000)
              updateStmt.run(new Date(newMs).toISOString(), f.videoId)
            }
          }
        })
        repairTx()
      }
    }
  } catch (err) {
    console.warn('[FocusTube] Playlist timestamps repair failed:', err)
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
      (SELECT COUNT(*) FROM ft_playlist_categories pc WHERE pc.category_id = c.id) AS playlist_count,
      (
        SELECT COUNT(DISTINCT v.video_id) FROM ft_videos v
        WHERE (
          EXISTS (SELECT 1 FROM ft_channel_categories cc2 WHERE cc2.channel_id = v.channel_id AND cc2.category_id = c.id)
          OR
          EXISTS (SELECT 1 FROM ft_playlist_videos pv JOIN ft_playlist_categories pc2 ON pc2.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id AND pc2.category_id = c.id)
        )
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

export function listChannels(categoryId?: number | null, includeUnsubscribed = false): FtChannel[] {
  const db = getRawDb()
  const rows = (
    categoryId
      ? db.prepare(`
          SELECT c.* FROM ft_channels c
          JOIN ft_channel_categories cc ON cc.channel_id = c.channel_id
          WHERE cc.category_id = ?
          ORDER BY c.position ASC, c.title COLLATE NOCASE ASC
        `).all(categoryId)
      : includeUnsubscribed
        ? db.prepare('SELECT * FROM ft_channels ORDER BY position ASC, title COLLATE NOCASE ASC').all()
        : db.prepare('SELECT * FROM ft_channels WHERE COALESCE(is_subscribed, 1) = 1 ORDER BY position ASC, title COLLATE NOCASE ASC').all()
  ) as any[]
  return rows.map((row) => toChannel(row, categoryIdsFor(String(row.channel_id))))
}

export function getChannel(channelId: string): FtChannel | null {
  const db = getRawDb()
  const row = db.prepare('SELECT * FROM ft_channels WHERE channel_id = ?').get(channelId) as any
  return row ? toChannel(row, categoryIdsFor(String(row.channel_id))) : null
}

export function ensureChannelPlaceholder(
  channelId: string,
  title?: string | null,
  avatarUrl?: string | null,
  handle?: string | null,
): void {
  const db = getRawDb()
  const id = String(channelId || '').trim()
  if (!id || id === 'UCunknown') return

  const isGarbage = (t: string | null | undefined) =>
    !t || t === 'YouTube Creator' || t === id || /\b\d+[\d,.]*\s*[kmb]?\s*views?\b/i.test(t) || /\bviews?\b/i.test(t) || /\bago\b/i.test(t)
  const cleanTitle = isGarbage(title) ? null : String(title).trim()
  const rawHandle = (handle || '').trim().replace(/^@/, '')
  const cleanHandle = rawHandle && !/^UC[\w-]{21,24}$/i.test(rawHandle) ? `@${rawHandle}` : null

  db.prepare(`
    INSERT INTO ft_channels (channel_id, title, handle, avatar_url, url, is_subscribed, position)
    VALUES (?, COALESCE(?, 'YouTube Creator'), ?, ?, ?, 0, 0)
    ON CONFLICT(channel_id) DO UPDATE SET
      avatar_url = COALESCE(excluded.avatar_url, ft_channels.avatar_url),
      handle = COALESCE(excluded.handle, ft_channels.handle),
      title = CASE
        WHEN excluded.title IS NOT NULL AND excluded.title != 'YouTube Creator' AND excluded.title NOT LIKE '%views%' AND excluded.title NOT LIKE '%ago%'
          THEN excluded.title
        WHEN ft_channels.title = 'YouTube Creator' OR ft_channels.title LIKE '%views%' OR ft_channels.title LIKE '%ago%'
          THEN COALESCE(NULLIF(excluded.title, 'YouTube Creator'), ft_channels.title)
        ELSE ft_channels.title
      END
  `).run(id, cleanTitle, cleanHandle, avatarUrl ?? null, `https://www.youtube.com/channel/${id}`)
}

export function updateChannelAvatar(channelId: string, avatarUrl: string): void {
  const db = getRawDb()
  const id = String(channelId || '').trim()
  const url = String(avatarUrl || '').trim()
  if (!id || !url) return
  db.prepare('UPDATE ft_channels SET avatar_url = ? WHERE channel_id = ?').run(url, id)
}

export function updateChannelHandle(channelId: string, handle: string): void {
  const db = getRawDb()
  const id = String(channelId || '').trim()
  const raw = String(handle || '').trim().replace(/^@/, '')
  if (!id || !raw || /^UC[\w-]{21,24}$/i.test(raw)) return
  db.prepare('UPDATE ft_channels SET handle = ? WHERE channel_id = ?').run(`@${raw}`, id)
}

export function updateChannelMetadata(
  channelId: string,
  data: { title?: string | null; handle?: string | null; avatarUrl?: string | null },
): void {
  const db = getRawDb()
  const id = String(channelId || '').trim()
  if (!id) return

  const isGarbage = (t: string | null | undefined) =>
    !t || t === 'YouTube Creator' || t === id || /\b\d+[\d,.]*\s*[kmb]?\s*views?\b/i.test(t) || /\bviews?\b/i.test(t) || /\bago\b/i.test(t)
  const cleanTitle = isGarbage(data.title) ? null : String(data.title).trim()
  const rawHandle = (data.handle || '').trim().replace(/^@/, '')
  const cleanHandle = rawHandle && !/^UC[\w-]{21,24}$/i.test(rawHandle) ? `@${rawHandle}` : null
  const avatar = data.avatarUrl ? String(data.avatarUrl).trim() : null

  db.prepare(`
    UPDATE ft_channels
    SET
      title = COALESCE(?, title),
      handle = COALESCE(?, handle),
      avatar_url = COALESCE(?, avatar_url)
    WHERE channel_id = ?
  `).run(cleanTitle, cleanHandle, avatar, id)
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
    INSERT INTO ft_channels (channel_id, title, handle, avatar_url, url, is_subscribed, position)
    VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(channel_id) DO UPDATE SET
      title = excluded.title,
      handle = COALESCE(excluded.handle, ft_channels.handle),
      avatar_url = COALESCE(excluded.avatar_url, ft_channels.avatar_url),
      url = COALESCE(excluded.url, ft_channels.url),
      is_subscribed = 1,
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

// ─── Playlists ────────────────────────────────────────────────────────────────

function playlistCategoryIdsFor(playlistId: string): number[] {
  const db = getRawDb()
  const rows = db
    .prepare('SELECT category_id FROM ft_playlist_categories WHERE playlist_id = ?')
    .all(playlistId) as any[]
  return rows.map((r) => Number(r.category_id))
}

export function listPlaylists(categoryId?: number | null): FtPlaylist[] {
  const db = getRawDb()
  const rows = (
    categoryId
      ? db.prepare(`
          SELECT p.*,
            (SELECT COUNT(*) FROM ft_playlist_videos pv WHERE pv.playlist_id = p.playlist_id) AS video_count
          FROM ft_playlists p
          JOIN ft_playlist_categories pc ON pc.playlist_id = p.playlist_id
          WHERE pc.category_id = ?
          ORDER BY p.position ASC, p.title COLLATE NOCASE ASC
        `).all(categoryId)
      : db.prepare(`
          SELECT p.*,
            (SELECT COUNT(*) FROM ft_playlist_videos pv WHERE pv.playlist_id = p.playlist_id) AS video_count
          FROM ft_playlists p
          ORDER BY p.position ASC, p.title COLLATE NOCASE ASC
        `).all()
  ) as any[]
  return rows.map((row) => toPlaylist(row, playlistCategoryIdsFor(String(row.playlist_id))))
}

export function getPlaylist(playlistId: string): FtPlaylist | null {
  const db = getRawDb()
  const row = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM ft_playlist_videos pv WHERE pv.playlist_id = p.playlist_id) AS video_count
    FROM ft_playlists p
    WHERE p.playlist_id = ?
  `).get(playlistId) as any
  return row ? toPlaylist(row, playlistCategoryIdsFor(String(row.playlist_id))) : null
}

export function upsertPlaylist(input: {
  playlistId: string
  title: string
  channelId?: string | null
  channelTitle?: string | null
  thumbnailUrl?: string | null
  url?: string | null
}): FtPlaylist {
  const db = getRawDb()
  const playlistId = String(input.playlistId || '').trim()
  const title = String(input.title || '').trim()
  if (!playlistId) throw new Error('playlistId is required')
  if (!title) throw new Error('Playlist title is required')

  if (input.channelId) {
    ensureChannelPlaceholder(input.channelId, input.channelTitle, null)
  }

  const max = db.prepare('SELECT MAX(position) AS p FROM ft_playlists').get() as any
  db.prepare(`
    INSERT INTO ft_playlists (playlist_id, channel_id, channel_title, title, thumbnail_url, url, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(playlist_id) DO UPDATE SET
      title = excluded.title,
      channel_id = COALESCE(excluded.channel_id, ft_playlists.channel_id),
      channel_title = COALESCE(excluded.channel_title, ft_playlists.channel_title),
      thumbnail_url = COALESCE(excluded.thumbnail_url, ft_playlists.thumbnail_url),
      url = COALESCE(excluded.url, ft_playlists.url),
      last_error = NULL
  `).run(
    playlistId,
    input.channelId ?? null,
    input.channelTitle ?? null,
    title,
    input.thumbnailUrl ?? null,
    input.url ?? `https://www.youtube.com/playlist?list=${playlistId}`,
    Number(max?.p ?? -1) + 1,
  )

  return getPlaylist(playlistId)!
}

export function deletePlaylist(playlistId: string): boolean {
  const db = getRawDb()
  db.prepare('DELETE FROM ft_playlists WHERE playlist_id = ?').run(playlistId)
  return true
}

export function setPlaylistCategories(playlistId: string, categoryIds: number[]): boolean {
  const db = getRawDb()
  const unique = [...new Set((categoryIds || []).map(Number).filter(Number.isFinite))]
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM ft_playlist_categories WHERE playlist_id = ?').run(playlistId)
    const insert = db.prepare('INSERT OR IGNORE INTO ft_playlist_categories (playlist_id, category_id) VALUES (?, ?)')
    for (const categoryId of unique) insert.run(playlistId, categoryId)
  })
  tx()
  return true
}

export function setPlaylistLastFetched(playlistId: string, error?: string | null): void {
  const db = getRawDb()
  db.prepare('UPDATE ft_playlists SET last_fetched = CURRENT_TIMESTAMP, last_error = ? WHERE playlist_id = ?')
    .run(error ?? null, playlistId)
}

export function getPlaylistsDueForFetch(maxAgeMinutes: number, force: boolean): FtPlaylist[] {
  const all = listPlaylists(null)
  if (force) return all
  const cutoff = Date.now() - maxAgeMinutes * 60_000
  return all.filter((playlist) => {
    if (!playlist.lastFetched) return true
    const fetched = Date.parse(playlist.lastFetched.replace(' ', 'T') + 'Z')
    return !Number.isFinite(fetched) || fetched < cutoff
  })
}

export function upsertPlaylistVideos(
  playlistId: string,
  entries: FtFeedEntry[],
): FtUpsertResult {
  const db = getRawDb()
  const result: FtUpsertResult = { inserted: 0, existing: 0, newVideoIds: [] }

  const findVideo = db.prepare('SELECT video_id FROM ft_videos WHERE video_id = ?')
  const insertVideo = db.prepare(`
    INSERT INTO ft_videos (video_id, channel_id, title, published_at, views, description)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(video_id) DO UPDATE SET
      channel_id = CASE WHEN excluded.channel_id != 'UCunknown' THEN excluded.channel_id ELSE ft_videos.channel_id END,
      title = excluded.title,
      published_at = excluded.published_at,
      views = COALESCE(excluded.views, ft_videos.views),
      description = COALESCE(excluded.description, ft_videos.description)
  `)
  const insertLink = db.prepare(`
    INSERT INTO ft_playlist_videos (playlist_id, video_id, position)
    VALUES (?, ?, ?)
    ON CONFLICT(playlist_id, video_id) DO UPDATE SET
      position = excluded.position
  `)

  const tx = db.transaction(() => {
    let pos = 0
    for (const entry of entries) {
      if (!entry.videoId) continue
      const cleanTitle = (entry.channelTitle && entry.channelTitle !== 'YouTube Creator' && !/\bviews?\b/i.test(entry.channelTitle))
        ? entry.channelTitle
        : null
      ensureChannelPlaceholder(entry.channelId, cleanTitle, entry.channelAvatarUrl || null)
      if (entry.channelAvatarUrl) {
        updateChannelAvatar(entry.channelId, entry.channelAvatarUrl)
      }

      if (findVideo.get(entry.videoId)) {
        result.existing += 1
      } else {
        result.newVideoIds.push(entry.videoId)
      }

      insertVideo.run(
        entry.videoId,
        entry.channelId,
        entry.title || 'Untitled',
        entry.publishedAt,
        entry.views ?? null,
        entry.description ?? null,
      )

      insertLink.run(playlistId, entry.videoId, pos)
      pos += 1
    }
  })
  tx()

  result.inserted = result.newVideoIds.length
  return result
}

export interface FtImportedChannel {
  channelId: string
  title: string
  handle?: string | null
  avatarUrl?: string | null
}

export interface FtImportChannelsResult {
  added: string[]
  alreadyPresent: string[]
  skipped: string[]
  createdMemberships: Array<{ channelId: string; categoryId: number }>
}

/**
 * Persists a reviewed YouTube import in one local transaction. Existing channel
 * rows are intentionally left untouched, and category writes are additive so
 * import cannot replace memberships, metadata, feed history, or seen state.
 */
export function importChannels(
  candidates: FtImportedChannel[],
  categoryAssignments: Record<string, number[]>,
): FtImportChannelsResult {
  const db = getRawDb()
  const result: FtImportChannelsResult = { added: [], alreadyPresent: [], skipped: [], createdMemberships: [] }
  const unique = new Map<string, FtImportedChannel>()
  for (const raw of candidates || []) {
    const channelId = String(raw?.channelId || '').trim()
    const title = String(raw?.title || '').trim()
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId) || !title) {
      if (channelId) result.skipped.push(channelId)
      continue
    }
    if (!unique.has(channelId)) unique.set(channelId, { ...raw, channelId, title })
  }

  const transaction = db.transaction(() => {
    let maxPosition = Number((db.prepare('SELECT MAX(position) AS p FROM ft_channels').get() as any)?.p ?? -1)
    const insertChannel = db.prepare(`
      INSERT OR IGNORE INTO ft_channels (channel_id, title, handle, avatar_url, url, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const hasChannel = db.prepare('SELECT 1 FROM ft_channels WHERE channel_id = ?')
    const insertMembership = db.prepare('INSERT OR IGNORE INTO ft_channel_categories (channel_id, category_id) VALUES (?, ?)')
    const hasCategory = db.prepare('SELECT 1 FROM ft_categories WHERE id = ?')

    for (const channel of unique.values()) {
      const channelId = channel.channelId
      if (hasChannel.get(channelId)) {
        result.alreadyPresent.push(channelId)
      } else {
        const inserted = insertChannel.run(
          channelId,
          channel.title,
          channel.handle ?? null,
          channel.avatarUrl ?? null,
          `https://www.youtube.com/channel/${channelId}`,
          ++maxPosition,
        )
        if (inserted.changes) result.added.push(channelId)
        else result.alreadyPresent.push(channelId)
      }

      const categories = [...new Set((categoryAssignments?.[channelId] || []).map(Number).filter(Number.isInteger))]
      for (const categoryId of categories) {
        if (!hasCategory.get(categoryId)) continue
        const membership = insertMembership.run(channelId, categoryId)
        if (membership.changes) result.createdMemberships.push({ channelId, categoryId })
      }
    }
  })
  transaction()
  return result
}

export interface FtUndoImportResult {
  removedChannels: number
  removedChannelIds: string[]
  removedMemberships: number
  retainedChannels: string[]
}

/**
 * Reverts only rows recorded as created by the most recent import. A newly
 * imported channel is removed only when it has no remaining category
 * memberships and no user video state, so post-import activity is preserved.
 */
export function undoImportedChannels(
  createdChannelIds: string[],
  createdMemberships: Array<{ channelId: string; categoryId: number }>,
): FtUndoImportResult {
  const db = getRawDb()
  const result: FtUndoImportResult = { removedChannels: 0, removedChannelIds: [], removedMemberships: 0, retainedChannels: [] }
  const channelIds = [...new Set((createdChannelIds || []).map((id) => String(id || '').trim()).filter((id) => /^UC[A-Za-z0-9_-]{22}$/.test(id)))]
  const memberships = [...new Map((createdMemberships || [])
    .filter((membership) => /^UC[A-Za-z0-9_-]{22}$/.test(String(membership?.channelId || '')) && Number.isInteger(Number(membership?.categoryId)))
    .map((membership) => [`${membership.channelId}:${Number(membership.categoryId)}`, { channelId: membership.channelId, categoryId: Number(membership.categoryId) }])).values()]

  const transaction = db.transaction(() => {
    const deleteMembership = db.prepare('DELETE FROM ft_channel_categories WHERE channel_id = ? AND category_id = ?')
    const hasChannel = db.prepare('SELECT 1 FROM ft_channels WHERE channel_id = ?')
    const hasMembership = db.prepare('SELECT 1 FROM ft_channel_categories WHERE channel_id = ? LIMIT 1')
    const hasVideoState = db.prepare(`
      SELECT 1 FROM ft_videos v
      JOIN ft_video_state s ON s.video_id = v.video_id
      WHERE v.channel_id = ? LIMIT 1
    `)
    const deleteChannel = db.prepare('DELETE FROM ft_channels WHERE channel_id = ?')

    for (const membership of memberships) {
      result.removedMemberships += deleteMembership.run(membership.channelId, membership.categoryId).changes
    }
    for (const channelId of channelIds) {
      if (!hasChannel.get(channelId)) continue
      if (hasMembership.get(channelId) || hasVideoState.get(channelId)) {
        result.retainedChannels.push(channelId)
        continue
      }
      const deleted = deleteChannel.run(channelId)
      if (deleted.changes) {
        result.removedChannels += 1
        result.removedChannelIds.push(channelId)
      }
    }
  })
  transaction()
  return result
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

  let categoryParam: number | null = null
  if (options.categoryId !== null && options.categoryId !== undefined) {
    const num = Number(options.categoryId)
    if (Number.isFinite(num)) {
      categoryParam = num
    }
  }

  const selectParams: any[] = []
  let playlistTitleSelect: string

  if (categoryParam !== null) {
    where.push(`(
      EXISTS (SELECT 1 FROM ft_channel_categories cc WHERE cc.channel_id = v.channel_id AND cc.category_id = ?)
      OR
      EXISTS (SELECT 1 FROM ft_playlist_videos pv JOIN ft_playlist_categories pc ON pc.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id AND pc.category_id = ?)
    )`)
    params.push(categoryParam, categoryParam)

    playlistTitleSelect = `(SELECT p.title FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id JOIN ft_playlist_categories pc ON pc.playlist_id = p.playlist_id WHERE pv.video_id = v.video_id AND pc.category_id = ? LIMIT 1) AS playlist_title,
       (SELECT pv.playlist_id FROM ft_playlist_videos pv JOIN ft_playlist_categories pc ON pc.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id AND pc.category_id = ? LIMIT 1) AS playlist_id`
    selectParams.push(categoryParam, categoryParam)
  } else {
    // "All" feed: union of user's subscriptions (channels with is_subscribed = 1, or playlists in ft_playlists)
    where.push(`(
      v.channel_id IN (SELECT channel_id FROM ft_channels WHERE COALESCE(is_subscribed, 1) = 1)
      OR
      EXISTS (SELECT 1 FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id)
    )`)

    playlistTitleSelect = `(SELECT p.title FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id LIMIT 1) AS playlist_title,
       (SELECT pv.playlist_id FROM ft_playlist_videos pv LIMIT 1) AS playlist_id`
  }

  if (options.includeSavedOnly) {
    where.push('COALESCE(s.saved, 0) = 1')
  } else if (!options.includeSeen) {
    where.push('COALESCE(s.seen, 0) = 0')
  }

  if (options.hideShorts) {
    where.push('COALESCE(v.is_short, 0) = 0')
  }

  if (options.search && String(options.search).trim()) {
    where.push('(v.title LIKE ? OR c.title LIKE ?)')
    const like = `%${String(options.search).trim()}%`
    params.push(like, like)
  }

  const limit = Math.min(Math.max(Number(options.limit) || 60, 1), 200)
  params.push(limit)

  const sortDir = options.sortOrder === 'oldest' ? 'ASC' : 'DESC'

  const rows = db.prepare(`
    SELECT v.*,
      CASE
        WHEN c.title IS NOT NULL AND c.title != 'YouTube Creator' AND c.title NOT LIKE '%views%' AND c.title NOT LIKE '%ago%'
          THEN c.title
        WHEN (SELECT p.channel_title FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id AND p.channel_title IS NOT NULL AND p.channel_title != 'YouTube Creator' AND p.channel_title NOT LIKE '%views%' LIMIT 1) IS NOT NULL
          THEN (SELECT p.channel_title FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id AND p.channel_title IS NOT NULL AND p.channel_title != 'YouTube Creator' AND p.channel_title NOT LIKE '%views%' LIMIT 1)
        ELSE COALESCE(c.title, 'YouTube Creator')
      END AS channel_title,
      COALESCE(c.avatar_url, (SELECT p.thumbnail_url FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id LIMIT 1)) AS channel_avatar_url,
      c.handle AS channel_handle,
      COALESCE(s.seen, 0) AS seen, s.seen_at, COALESCE(s.saved, 0) AS saved,
      COALESCE(s.position, 0) AS position,
      ${playlistTitleSelect}
    FROM ft_videos v
    LEFT JOIN ft_channels c ON c.channel_id = v.channel_id
    LEFT JOIN ft_video_state s ON s.video_id = v.video_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY v.is_live DESC, v.published_at ${sortDir}, v.rowid ${sortDir}
    LIMIT ?
  `).all(...selectParams, ...params) as any[]

  return rows.map(toVideo)
}

export function getVideo(videoId: string): FtVideo | null {
  const db = getRawDb()
  const row = db.prepare(`
    SELECT v.*,
      CASE
        WHEN c.title IS NOT NULL AND c.title != 'YouTube Creator' AND c.title NOT LIKE '%views%' AND c.title NOT LIKE '%ago%'
          THEN c.title
        WHEN (SELECT p.channel_title FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id AND p.channel_title IS NOT NULL AND p.channel_title != 'YouTube Creator' AND p.channel_title NOT LIKE '%views%' LIMIT 1) IS NOT NULL
          THEN (SELECT p.channel_title FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id AND p.channel_title IS NOT NULL AND p.channel_title != 'YouTube Creator' AND p.channel_title NOT LIKE '%views%' LIMIT 1)
        ELSE COALESCE(c.title, 'YouTube Creator')
      END AS channel_title,
      COALESCE(c.avatar_url, (SELECT p.thumbnail_url FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id LIMIT 1)) AS channel_avatar_url,
      c.handle AS channel_handle,
      COALESCE(s.seen, 0) AS seen, s.seen_at, COALESCE(s.saved, 0) AS saved,
      COALESCE(s.position, 0) AS position,
      (SELECT p.title FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id LIMIT 1) AS playlist_title,
      (SELECT pv.playlist_id FROM ft_playlist_videos pv WHERE pv.video_id = v.video_id LIMIT 1) AS playlist_id
    FROM ft_videos v
    LEFT JOIN ft_channels c ON c.channel_id = v.channel_id
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
    scope = `AND (
      v.channel_id IN (SELECT channel_id FROM ft_channel_categories WHERE category_id = ?)
      OR
      v.video_id IN (SELECT pv.video_id FROM ft_playlist_videos pv JOIN ft_playlist_categories pc ON pc.playlist_id = pv.playlist_id WHERE pc.category_id = ?)
    )`
    params.push(categoryId, categoryId)
  } else {
    scope = `AND (
      v.channel_id IN (SELECT channel_id FROM ft_channels WHERE COALESCE(is_subscribed, 1) = 1)
      OR
      EXISTS (SELECT 1 FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id)
    )`
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

/** Enriches a list of external or search videos with local seen state and watch progress from SQLite. */
export function attachVideoState(videos: FtVideo[]): FtVideo[] {
  if (!videos || !videos.length) return videos || []
  const db = getRawDb()
  const stateStmt = db.prepare('SELECT seen, seen_at, position FROM ft_video_state WHERE video_id = ?')
  return videos.map((v) => {
    try {
      const row = stateStmt.get(v.videoId) as any
      if (row) {
        return {
          ...v,
          seen: Boolean(row.seen),
          seenAt: row.seen_at || null,
          position: Number(row.position || 0),
        }
      }
    } catch {
      // Ignore read errors
    }
    return v
  })
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
    scope = `AND (
      v.channel_id IN (SELECT channel_id FROM ft_channel_categories WHERE category_id = ?)
      OR
      v.video_id IN (SELECT pv.video_id FROM ft_playlist_videos pv JOIN ft_playlist_categories pc ON pc.playlist_id = pv.playlist_id WHERE pc.category_id = ?)
    )`
    params.push(categoryId, categoryId)
  } else {
    scope = `AND (
      v.channel_id IN (SELECT channel_id FROM ft_channels WHERE COALESCE(is_subscribed, 1) = 1)
      OR
      EXISTS (SELECT 1 FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id)
    )`
  }
  const row = db.prepare(`
    SELECT COUNT(DISTINCT v.video_id) AS c FROM ft_videos v
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
    scope = `AND (
      v.channel_id IN (SELECT channel_id FROM ft_channel_categories WHERE category_id = ?)
      OR
      v.video_id IN (SELECT pv.video_id FROM ft_playlist_videos pv JOIN ft_playlist_categories pc ON pc.playlist_id = pv.playlist_id WHERE pc.category_id = ?)
    )`
    params.push(categoryId, categoryId)
  } else {
    scope = `AND (
      v.channel_id IN (SELECT channel_id FROM ft_channels WHERE COALESCE(is_subscribed, 1) = 1)
      OR
      EXISTS (SELECT 1 FROM ft_playlist_videos pv JOIN ft_playlists p ON p.playlist_id = pv.playlist_id WHERE pv.video_id = v.video_id)
    )`
  }
  const row = db.prepare(`SELECT MAX(v.published_at) AS latest FROM ft_videos v WHERE 1 = 1 ${scope}`).get(...params) as any
  return row?.latest ? String(row.latest) : null
}

// ─── Upsert helpers (used by the network layer) ───────────────────────────────

export interface FtFeedEntry {
  videoId: string
  channelId: string
  channelTitle?: string | null
  channelAvatarUrl?: string | null
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
  patch: { duration?: number | null; isLive?: boolean; embeddable?: boolean; description?: string | null },
): boolean {
  const db = getRawDb()
  const fields: string[] = []
  const params: any[] = []
  if (patch.duration !== undefined) {
    fields.push('duration = ?')
    params.push(patch.duration)
  }
  if (patch.description !== undefined && patch.description !== null) {
    fields.push('description = ?')
    params.push(patch.description)
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
    playlists: db.prepare('SELECT * FROM ft_playlists ORDER BY position ASC').all() as any[],
    playlistCategories: db.prepare('SELECT * FROM ft_playlist_categories').all() as any[],
    playlistVideos: db.prepare('SELECT * FROM ft_playlist_videos').all() as any[],
    videos: db.prepare('SELECT * FROM ft_videos').all() as any[],
    videoState: db.prepare('SELECT * FROM ft_video_state').all() as any[],
    sessions: db.prepare('SELECT * FROM ft_sessions').all() as any[],
    meta: db.prepare('SELECT * FROM ft_meta').all() as any[],
  }
}

export function restoreBackupData(data: any): { categoriesRestored: number; channelsRestored: number; playlistsRestored?: number } {
  if (!data || typeof data !== 'object') return { categoriesRestored: 0, channelsRestored: 0, playlistsRestored: 0 }
  const db = getRawDb()
  const tx = db.transaction(() => {
    for (const table of [
      'ft_sessions',
      'ft_meta',
      'ft_video_state',
      'ft_playlist_videos',
      'ft_videos',
      'ft_playlist_categories',
      'ft_playlists',
      'ft_channel_categories',
      'ft_channels',
      'ft_categories',
    ]) {
      db.prepare(`DELETE FROM ${table}`).run()
    }
    const insertAll = (table: string, rows: any[]) => {
      if (!Array.isArray(rows) || !rows.length) return
      const colInfo = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>
      const validCols = new Set(colInfo.map((c) => c.name))
      const stmtCache = new Map<string, any>()

      for (const row of rows) {
        if (!row || typeof row !== 'object') continue
        const keys = Object.keys(row).filter((k) => validCols.has(k))
        if (!keys.length) continue
        const keyHash = keys.sort().join(',')
        let stmt = stmtCache.get(keyHash)
        if (!stmt) {
          const placeholders = keys.map(() => '?').join(', ')
          stmt = db.prepare(`INSERT OR REPLACE INTO "${table}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${placeholders})`)
          stmtCache.set(keyHash, stmt)
        }
        stmt.run(...keys.map((k) => row[k]))
      }
    }
    insertAll('ft_categories', data.categories)
    insertAll('ft_channels', data.channels)
    insertAll('ft_channel_categories', data.channelCategories)
    if (Array.isArray(data.playlists)) insertAll('ft_playlists', data.playlists)
    if (Array.isArray(data.playlistCategories)) insertAll('ft_playlist_categories', data.playlistCategories)
    insertAll('ft_videos', data.videos)
    if (Array.isArray(data.playlistVideos)) insertAll('ft_playlist_videos', data.playlistVideos)
    insertAll('ft_video_state', data.videoState)
    if (Array.isArray(data.sessions)) insertAll('ft_sessions', data.sessions)
    if (Array.isArray(data.meta)) insertAll('ft_meta', data.meta)
  })
  tx()
  // Deliberately no re-seed: a restore must be faithful to the backup, even if
  // that means coming back with no channels at all.
  return {
    categoriesRestored: Array.isArray(data.categories) ? data.categories.length : 0,
    channelsRestored: Array.isArray(data.channels) ? data.channels.length : 0,
    playlistsRestored: Array.isArray(data.playlists) ? data.playlists.length : 0,
  }
}
