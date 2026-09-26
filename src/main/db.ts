import { app } from 'electron'
import { join } from 'path'
import path from 'path'
import { createRequire } from 'module'
import fs from 'fs'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const dbRoot = process.env.MYCINEMA_USER_DATA_DIR || app.getPath('userData')
fs.mkdirSync(dbRoot, { recursive: true })
const dbPath = join(dbRoot, 'mycinema.db')
const db = new Database(dbPath, { 
  timeout: 10000 // 10 seconds timeout for busy/locked database
})

function ensureTypeAllowsVideo(tableName: 'videos' | 'watchlist') {
  const row = db.prepare(`
    SELECT sql FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName) as { sql?: string } | undefined

  if (!row?.sql || row.sql.includes("'video'")) return

  const tempName = `${tableName}_migration_${Date.now()}`
  const nextSql = row.sql
    .replace(new RegExp(`CREATE TABLE ${tableName}`, 'i'), `CREATE TABLE ${tempName}`)
    .replace(/CHECK\s*\(\s*type\s+IN\s*\(\s*'movie'\s*,\s*'series'\s*\)\s*\)/gi, "CHECK(type IN ('movie', 'series', 'video'))")

  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  const columnList = columns.map(column => `"${column.name}"`).join(', ')

  db.pragma('foreign_keys = OFF')
  try {
    const migrate = db.transaction(() => {
      db.exec(nextSql)
      db.exec(`INSERT INTO ${tempName} (${columnList}) SELECT ${columnList} FROM ${tableName}`)
      db.exec(`DROP TABLE ${tableName}`)
      db.exec(`ALTER TABLE ${tempName} RENAME TO ${tableName}`)
    })

    migrate()
  } finally {
    db.pragma('foreign_keys = ON')
  }
}

// Raw handle for feature modules (e.g. collections) that own their own tables.
export function getRawDb() {
  return db
}

// Initialize database
export function initDb() {
  db.pragma('journal_mode = WAL') // Write-Ahead Logging for better concurrency
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      file_path TEXT UNIQUE NOT NULL,
      type TEXT CHECK(type IN ('movie', 'series', 'video')) NOT NULL,
      series_name TEXT,
      season INTEGER,
      episode INTEGER,
      duration REAL,
      poster_path TEXT,
      overview TEXT,
      tagline TEXT,
      genres TEXT,
      tmdb_id INTEGER,
      vote_average REAL,
      release_year INTEGER,
      is_favorite BOOLEAN DEFAULT 0,
      is_watchlist BOOLEAN DEFAULT 0,
      watchlist_category TEXT DEFAULT 'Watchlist',
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tmdb_id INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL,
      type TEXT CHECK(type IN ('movie', 'series', 'video')) NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      overview TEXT,
      vote_average REAL,
      release_year INTEGER,
      category TEXT DEFAULT 'Watchlist',
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Migration: add missing columns if they don't exist
    PRAGMA table_info(videos);
  `)

  ensureTypeAllowsVideo('videos')
  ensureTypeAllowsVideo('watchlist')

  // Check and add columns if they don't exist
  const columns = db.prepare("PRAGMA table_info(videos)").all()
  const columnNames = columns.map((c: any) => c.name)

  if (!columnNames.includes('tagline')) {
    db.exec("ALTER TABLE videos ADD COLUMN tagline TEXT")
  }
  if (!columnNames.includes('genres')) {
    db.exec("ALTER TABLE videos ADD COLUMN genres TEXT")
  }
  if (!columnNames.includes('vote_average')) {
    db.exec("ALTER TABLE videos ADD COLUMN vote_average REAL")
  }
  if (!columnNames.includes('release_year')) {
    db.exec("ALTER TABLE videos ADD COLUMN release_year INTEGER")
  }
  if (!columnNames.includes('backdrop_path')) {
    db.exec("ALTER TABLE videos ADD COLUMN backdrop_path TEXT")
  }
  if (!columnNames.includes('is_favorite')) {
    db.exec("ALTER TABLE videos ADD COLUMN is_favorite BOOLEAN DEFAULT 0")
  }
  if (!columnNames.includes('is_watchlist')) {
    db.exec("ALTER TABLE videos ADD COLUMN is_watchlist BOOLEAN DEFAULT 0")
  }
  if (!columnNames.includes('watchlist_category')) {
    db.exec("ALTER TABLE videos ADD COLUMN watchlist_category TEXT DEFAULT 'Watchlist'")
  }
  if (!columnNames.includes('is_preferred')) {
    db.exec("ALTER TABLE videos ADD COLUMN is_preferred BOOLEAN DEFAULT 0")
  }

  const watchlistColumns = db.prepare("PRAGMA table_info(watchlist)").all()
  const watchlistColumnNames = watchlistColumns.map((c: any) => c.name)
  if (!watchlistColumnNames.includes('category')) {
    db.exec("ALTER TABLE watchlist ADD COLUMN category TEXT DEFAULT 'Watchlist'")
  }

  if (!columnNames.includes('keywords')) {
    db.exec("ALTER TABLE videos ADD COLUMN keywords TEXT")
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS progress (
      video_id INTEGER PRIMARY KEY,
      last_watched_time REAL DEFAULT 0,
      completed BOOLEAN DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watched_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      name TEXT,
      magnet TEXT NOT NULL,
      progress REAL DEFAULT 0,
      download_speed TEXT DEFAULT '0 B/s',
      time_remaining TEXT DEFAULT '—',
      status TEXT DEFAULT 'pending',
      size TEXT DEFAULT '—',
      downloaded TEXT DEFAULT '0 B',
      tmdb_id INTEGER,
      media_type TEXT,
      season INTEGER,
      episode INTEGER,
      download_path TEXT,
      error_message TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Online (streamed, not downloaded) resume positions, keyed by stable
    -- TMDB identity so they survive dead magnets / re-searched sources.
    CREATE TABLE IF NOT EXISTS stream_progress (
      id TEXT PRIMARY KEY,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT CHECK(media_type IN ('movie', 'series')) NOT NULL,
      season INTEGER,
      episode INTEGER,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      overview TEXT,
      release_year INTEGER,
      position REAL DEFAULT 0,
      duration REAL DEFAULT 0,
      completed BOOLEAN DEFAULT 0,
      source_magnet TEXT,
      file_index INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_stream_progress_updated
      ON stream_progress(updated_at DESC);

    -- Series the user follows for new-episode alerts (#3). last_known_* is the
    -- latest RELEASED episode seen by the checker; has_unseen_new flags a drop
    -- the user hasn't opened yet.
    CREATE TABLE IF NOT EXISTS followed_series (
      tmdb_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      overview TEXT,
      last_known_season INTEGER,
      last_known_episode INTEGER,
      has_unseen_new BOOLEAN DEFAULT 0,
      last_checked DATETIME,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Check and add columns for downloads if they don't exist
  const dlColumns = db.prepare("PRAGMA table_info(downloads)").all()
  const dlColumnNames = dlColumns.map((c: any) => c.name)
  if (!dlColumnNames.includes('name')) {
    db.exec("ALTER TABLE downloads ADD COLUMN name TEXT")
  }
  if (!dlColumnNames.includes('tmdb_id')) {
    db.exec("ALTER TABLE downloads ADD COLUMN tmdb_id INTEGER")
  }
  if (!dlColumnNames.includes('media_type')) {
    db.exec("ALTER TABLE downloads ADD COLUMN media_type TEXT")
  }
  if (!dlColumnNames.includes('season')) {
    db.exec("ALTER TABLE downloads ADD COLUMN season INTEGER")
  }
  if (!dlColumnNames.includes('episode')) {
    db.exec("ALTER TABLE downloads ADD COLUMN episode INTEGER")
  }
  if (!dlColumnNames.includes('download_path')) {
    db.exec("ALTER TABLE downloads ADD COLUMN download_path TEXT")
  }
  // queue_order is a monotonic sequence used for true FIFO queue order.
  // added_at only has second granularity (CURRENT_TIMESTAMP), so downloads
  // started in the same second had no deterministic order — the queue came
  // out shuffled/stacked instead of chronological.
  if (!dlColumnNames.includes('queue_order')) {
    db.exec("ALTER TABLE downloads ADD COLUMN queue_order INTEGER")
    // Backfill existing rows in chronological order (added_at, then rowid).
    db.exec(`
      UPDATE downloads SET queue_order = (
        SELECT COUNT(*) FROM downloads d2
        WHERE d2.added_at < downloads.added_at
           OR (d2.added_at = downloads.added_at AND d2.rowid <= downloads.rowid)
      )
      WHERE queue_order IS NULL
    `)
  }

  // file_index pins an unparsed pack file so resume lands on the exact file.
  const streamColumns = db.prepare("PRAGMA table_info(stream_progress)").all()
  const streamColumnNames = streamColumns.map((c: any) => c.name)
  if (!streamColumnNames.includes('file_index')) {
    db.exec("ALTER TABLE stream_progress ADD COLUMN file_index INTEGER")
  }
}

export function addVideo(video: any) {
  const stmt = db.prepare(`
    INSERT INTO videos (
      title, file_path, type, series_name, season, episode, duration, poster_path, vote_average, release_year, tmdb_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      title = excluded.title,
      type = excluded.type,
      series_name = excluded.series_name,
      season = excluded.season,
      episode = excluded.episode,
      duration = CASE
        WHEN videos.duration = 0 OR videos.duration IS NULL THEN excluded.duration
        ELSE videos.duration
      END,
      tmdb_id = CASE
        WHEN excluded.tmdb_id IS NOT NULL THEN excluded.tmdb_id
        WHEN excluded.type = 'video' THEN NULL
        ELSE videos.tmdb_id
      END
  `)
  return stmt.run(
    video.title,
    video.file_path,
    video.type,
    video.series_name || null,
    video.season || null,
    video.episode || null,
    video.duration || 0,
    video.poster_path || null,
    video.vote_average || null,
    video.release_year || null,
    video.tmdb_id || null
  )
}

export function getVideos() {
  const rows = db.prepare(`
    SELECT v.*, p.last_watched_time, p.completed, p.updated_at
    FROM videos v
    LEFT JOIN progress p ON v.id = p.video_id
    ORDER BY v.added_at DESC
  `).all()
  return rows.map((row: any) => {
    if (row.keywords) {
      try { row.keywords = JSON.parse(row.keywords) } catch (e) { row.keywords = [] }
    }
    return row
  })
}

export function deleteVideo(id: number) {
  const stmt = db.prepare('DELETE FROM videos WHERE id = ?')
  return stmt.run(id)
}

export function saveVideoKeywords(id: number, keywords: string[]) {
  const stmt = db.prepare('UPDATE videos SET keywords = ? WHERE id = ?')
  return stmt.run(JSON.stringify(keywords), id)
}

export function setPreferredVideoVersion(videoId: number) {
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId) as any
  if (!video) return false

  const tx = db.transaction(() => {
    if (video.type === 'series') {
      if (video.tmdb_id) {
        db.prepare(`
          UPDATE videos SET is_preferred = 0
          WHERE type = 'series' AND tmdb_id = ?
            AND COALESCE(season, 1) = COALESCE(?, 1)
            AND COALESCE(episode, 0) = COALESCE(?, 0)
        `).run(video.tmdb_id, video.season, video.episode)
      } else {
        db.prepare(`
          UPDATE videos SET is_preferred = 0
          WHERE type = 'series' AND LOWER(TRIM(series_name)) = LOWER(TRIM(?))
            AND COALESCE(season, 1) = COALESCE(?, 1)
            AND COALESCE(episode, 0) = COALESCE(?, 0)
        `).run(video.series_name, video.season, video.episode)
      }
    } else if (video.type === 'movie') {
      if (video.tmdb_id) {
        db.prepare("UPDATE videos SET is_preferred = 0 WHERE type = 'movie' AND tmdb_id = ?").run(video.tmdb_id)
      } else {
        db.prepare(`
          UPDATE videos SET is_preferred = 0
          WHERE type = 'movie' AND LOWER(TRIM(title)) = LOWER(TRIM(?))
            AND COALESCE(release_year, 0) = COALESCE(?, 0)
        `).run(video.title, video.release_year)
      }
    }

    db.prepare('UPDATE videos SET is_preferred = 1 WHERE id = ?').run(videoId)
  })

  tx()
  return true
}

/**
 * When an episode is completed, find the very next episode in the series
 * and insert a fresh 0:00, completed=0 progress row for it.
 * This makes it appear in "Continue Watching" on the home screen.
 */
function queueNextEpisode(videoId: number) {
  try {
    const currentVideo = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId) as any
    if (!currentVideo || currentVideo.type !== 'series' || !currentVideo.series_name) return

    const episodeVersions = db.prepare(`
      SELECT * FROM videos 
      WHERE series_name = ? 
      ORDER BY season ASC, episode ASC, is_preferred DESC, added_at DESC
    `).all(currentVideo.series_name) as any[]

    const episodes: any[] = []
    const seenEpisodes = new Set<string>()
    for (const episode of episodeVersions) {
      const key = `${Number(episode.season || 1)}:${Number(episode.episode || 0)}`
      if (seenEpisodes.has(key)) continue
      seenEpisodes.add(key)
      episodes.push(episode)
    }

    const currentKey = `${Number(currentVideo.season || 1)}:${Number(currentVideo.episode || 0)}`
    const currentIndex = episodes.findIndex((episode: any) => (
      `${Number(episode.season || 1)}:${Number(episode.episode || 0)}` === currentKey
    ))
    if (currentIndex === -1) return

    // If this is the final episode in the series, mark ALL previous episodes as completed
    if (currentIndex >= episodes.length - 1) {
      db.prepare(`
        UPDATE progress 
        SET completed = 1 
        WHERE video_id IN (
          SELECT id FROM videos WHERE series_name = ?
        )
      `).run(currentVideo.series_name)
      return
    }

    const nextEpisode = episodes[currentIndex + 1]
    db.prepare(`
      INSERT INTO progress (video_id, last_watched_time, completed)
      VALUES (?, 0, 0)
      ON CONFLICT(video_id) DO NOTHING
    `).run(nextEpisode.id)
  } catch (err) {
    console.error('[DB] queueNextEpisode error:', err)
  }
}

export function updateVideoProgress(videoId: number, time: number, completed: boolean, queueNext: boolean = false) {
  const stmt = db.prepare(`
    INSERT INTO progress (video_id, last_watched_time, completed, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(video_id) DO UPDATE SET
      last_watched_time = excluded.last_watched_time,
      completed = excluded.completed,
      updated_at = excluded.updated_at
  `)
  const result = stmt.run(videoId, time, completed ? 1 : 0)
  
  if (completed && queueNext) {
    queueNextEpisode(videoId)
  }
  
  return result
}

export function getVideoProgress(videoId: number) {
  return db.prepare('SELECT * FROM progress WHERE video_id = ?').get(videoId) as any
}

export function getContinueWatching() {
  return db.prepare(`
    SELECT v.*, p.last_watched_time, p.completed, p.updated_at
    FROM videos v
    JOIN progress p ON v.id = p.video_id
    WHERE p.completed = 0
    ORDER BY p.updated_at DESC
    LIMIT 10
  `).all() as any[]
}

export function updateVideoMetadata(id: number, metadata: any) {
  const stmt = db.prepare(`
    UPDATE videos
    SET poster_path = ?, backdrop_path = ?, overview = ?, tagline = ?, genres = ?, tmdb_id = ?, vote_average = ?, release_year = ?
    WHERE id = ?
  `)
  return stmt.run(
    metadata.poster_path, 
    metadata.backdrop_path || null,
    metadata.overview, 
    metadata.tagline || null, 
    metadata.genres || null, 
    metadata.tmdb_id, 
    metadata.vote_average || null, 
    metadata.release_year || null, 
    id
  )
}

export function getSeriesInfo(seriesName: string) {
  return db.prepare(`
    SELECT * FROM videos 
    WHERE series_name = ? 
    ORDER BY season ASC, episode ASC, is_preferred DESC, added_at DESC
  `).all(seriesName)
}

export function getFolders() {
  return db.prepare('SELECT * FROM watched_folders ORDER BY added_at ASC').all()
}

export function addFolder(folderPath: string) {
  return db.prepare(`
    INSERT INTO watched_folders (path) VALUES (?)
    ON CONFLICT(path) DO NOTHING
  `).run(folderPath)
}

export function toggleFavorite(id: number) {
  const current = db.prepare('SELECT is_favorite FROM videos WHERE id = ?').get(id) as any
  if (!current) return null
  const newValue = current.is_favorite ? 0 : 1
  db.prepare('UPDATE videos SET is_favorite = ? WHERE id = ?').run(newValue, id)
  return newValue
}

export function toggleWatchlist(id: number) {
  const current = db.prepare('SELECT is_watchlist FROM videos WHERE id = ?').get(id) as any
  if (!current) return null
  const newValue = current.is_watchlist ? 0 : 1
  db.prepare(`
    UPDATE videos
    SET is_watchlist = ?,
        watchlist_category = CASE WHEN ? = 1 THEN COALESCE(watchlist_category, 'Watchlist') ELSE watchlist_category END
    WHERE id = ?
  `).run(newValue, newValue, id)
  return newValue
}

// The watchlist is exactly one inbox. The category parameter is kept for
// backwards compatibility but always normalizes to 'Watchlist' — curated
// lists live in Collections now.
export function addLocalVideoToWatchlist(id: number, _category: string = 'Watchlist') {
  return db.prepare(`
    UPDATE videos
    SET is_watchlist = 1,
        watchlist_category = 'Watchlist'
    WHERE id = ?
  `).run(id)
}

export function addToWatchlistExternal(item: any) {
  const stmt = db.prepare(`
    INSERT INTO watchlist (tmdb_id, title, type, poster_path, backdrop_path, overview, vote_average, release_year, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tmdb_id) DO UPDATE SET
      title = excluded.title,
      type = excluded.type,
      poster_path = excluded.poster_path,
      backdrop_path = excluded.backdrop_path,
      overview = excluded.overview,
      vote_average = excluded.vote_average,
      release_year = excluded.release_year,
      category = excluded.category
  `)
  return stmt.run(
    item.tmdb_id,
    item.title,
    item.type,
    item.poster_path,
    item.backdrop_path,
    item.overview,
    item.vote_average,
    item.release_year,
    'Watchlist'
  )
}

export function removeFromWatchlistExternal(tmdbId: number) {
  return db.prepare('DELETE FROM watchlist WHERE tmdb_id = ?').run(tmdbId)
}

export function getWatchlist() {
  const external = db.prepare('SELECT *, 1 as isExternal, 1 as is_watchlist FROM watchlist').all()
  const internal = db.prepare(`
    SELECT v.*, COALESCE(v.watchlist_category, 'Watchlist') as category, 0 as isExternal
    FROM videos v 
    WHERE v.is_watchlist = 1
  `).all()
  return [...external, ...internal].sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
}

export function getBackupData() {
  const folders = db.prepare(`
    SELECT path, added_at
    FROM watched_folders
    ORDER BY added_at ASC
  `).all()

  const externalWatchlist = db.prepare(`
    SELECT tmdb_id, title, type, poster_path, backdrop_path, overview, vote_average, release_year, category, added_at
    FROM watchlist
    ORDER BY added_at DESC
  `).all()

  const localWatchlist = db.prepare(`
    SELECT file_path, tmdb_id, title, type, series_name, season, episode, watchlist_category as category, added_at
    FROM videos
    WHERE is_watchlist = 1
    ORDER BY added_at DESC
  `).all()

  const favorites = db.prepare(`
    SELECT file_path, tmdb_id, title, type, series_name, season, episode, added_at
    FROM videos
    WHERE is_favorite = 1
    ORDER BY added_at DESC
  `).all()

  const streamProgress = db.prepare(`
    SELECT tmdb_id, media_type, season, episode, title, poster_path, backdrop_path,
           overview, release_year, position, duration, completed, source_magnet,
           file_index, updated_at
    FROM stream_progress
    ORDER BY updated_at DESC
  `).all()

  const followedSeries = db.prepare(`
    SELECT tmdb_id, title, poster_path, backdrop_path, overview,
           last_known_season, last_known_episode, has_unseen_new, last_checked, added_at
    FROM followed_series
    ORDER BY added_at DESC
  `).all()

  return {
    folders,
    watchlist: {
      external: externalWatchlist,
      local: localWatchlist
    },
    favorites,
    streamProgress,
    followedSeries
  }
}

export function restoreStreamProgressRow(item: any) {
  const tmdbId = Number(item?.tmdb_id)
  if (!tmdbId || (item.media_type !== 'movie' && item.media_type !== 'series')) return { changes: 0 }
  const id = buildStreamProgressId(tmdbId, item.media_type, item.season, item.episode)
  return db.prepare(`
    INSERT INTO stream_progress
      (id, tmdb_id, media_type, season, episode, title, poster_path, backdrop_path, overview,
       release_year, position, duration, completed, source_magnet, file_index, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    ON CONFLICT(id) DO NOTHING
  `).run(
    id, tmdbId, item.media_type,
    item.season ?? null, item.episode ?? null,
    item.title || 'Unknown Title',
    item.poster_path || null, item.backdrop_path || null, item.overview || null,
    item.release_year ?? null,
    Math.max(0, Number(item.position) || 0), Math.max(0, Number(item.duration) || 0),
    item.completed ? 1 : 0, item.source_magnet || null,
    Number.isFinite(Number(item.file_index)) ? Number(item.file_index) : null,
    item.updated_at || null
  )
}

export function restoreFollowedSeriesRow(item: any) {
  const tmdbId = Number(item?.tmdb_id)
  if (!tmdbId || !item.title) return { changes: 0 }
  return db.prepare(`
    INSERT INTO followed_series
      (tmdb_id, title, poster_path, backdrop_path, overview, last_known_season,
       last_known_episode, has_unseen_new, last_checked, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    ON CONFLICT(tmdb_id) DO NOTHING
  `).run(
    tmdbId, item.title,
    item.poster_path || null, item.backdrop_path || null, item.overview || null,
    item.last_known_season ?? null, item.last_known_episode ?? null,
    item.has_unseen_new ? 1 : 0, item.last_checked || null, item.added_at || null
  )
}

export function importExternalWatchlistItem(item: any) {
  const stmt = db.prepare(`
    INSERT INTO watchlist (tmdb_id, title, type, poster_path, backdrop_path, overview, vote_average, release_year, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tmdb_id) DO UPDATE SET
      title = excluded.title,
      type = excluded.type,
      poster_path = excluded.poster_path,
      backdrop_path = excluded.backdrop_path,
      overview = excluded.overview,
      vote_average = excluded.vote_average,
      release_year = excluded.release_year,
      category = excluded.category
  `)

  return stmt.run(
    item.tmdb_id,
    item.title,
    item.type,
    item.poster_path || null,
    item.backdrop_path || null,
    item.overview || null,
    item.vote_average || null,
    item.release_year || null,
    item.category || 'Watchlist'
  )
}

export function restoreLocalWatchlistItem(item: any) {
  if (item.file_path) {
    const byPath = db.prepare(`
      UPDATE videos
      SET is_watchlist = 1,
          watchlist_category = ?
      WHERE file_path = ?
    `).run(item.category || 'Watchlist', path.normalize(item.file_path))

    if (byPath.changes > 0) return byPath
  }

  if (item.tmdb_id) {
    const byTmdb = db.prepare(`
      UPDATE videos
      SET is_watchlist = 1,
          watchlist_category = ?
      WHERE tmdb_id = ?
    `).run(item.category || 'Watchlist', item.tmdb_id)

    if (byTmdb.changes > 0) return byTmdb
  }

  if (item.type === 'series' && item.series_name) {
    return db.prepare(`
      UPDATE videos
      SET is_watchlist = 1,
          watchlist_category = ?
      WHERE type = 'series'
        AND series_name = ?
        AND COALESCE(season, -1) = COALESCE(?, -1)
        AND COALESCE(episode, -1) = COALESCE(?, -1)
    `).run(item.category || 'Watchlist', item.series_name, item.season ?? null, item.episode ?? null)
  }

  if (item.title && item.type) {
    return db.prepare(`
      UPDATE videos
      SET is_watchlist = 1,
          watchlist_category = ?
      WHERE title = ?
        AND type = ?
    `).run(item.category || 'Watchlist', item.title, item.type)
  }

  return { changes: 0 }
}

export function restoreFavoriteItem(item: any) {
  if (item.file_path) {
    const byPath = db.prepare(`
      UPDATE videos
      SET is_favorite = 1
      WHERE file_path = ?
    `).run(path.normalize(item.file_path))

    if (byPath.changes > 0) return byPath
  }

  if (item.tmdb_id) {
    const byTmdb = db.prepare(`
      UPDATE videos
      SET is_favorite = 1
      WHERE tmdb_id = ?
    `).run(item.tmdb_id)

    if (byTmdb.changes > 0) return byTmdb
  }

  if (item.type === 'series' && item.series_name) {
    return db.prepare(`
      UPDATE videos
      SET is_favorite = 1
      WHERE type = 'series'
        AND series_name = ?
        AND COALESCE(season, -1) = COALESCE(?, -1)
        AND COALESCE(episode, -1) = COALESCE(?, -1)
    `).run(item.series_name, item.season ?? null, item.episode ?? null)
  }

  if (item.title && item.type) {
    return db.prepare(`
      UPDATE videos
      SET is_favorite = 1
      WHERE title = ?
        AND type = ?
    `).run(item.title, item.type)
  }

  return { changes: 0 }
}

export function getFavorites() {
  return db.prepare('SELECT * FROM videos WHERE is_favorite = 1 ORDER BY added_at DESC').all()
}

export function removeFolder(folderPath: string) {
  const normalizedFolderPath = path.normalize(folderPath)
  const folderPrefix = normalizedFolderPath.endsWith(path.sep)
    ? normalizedFolderPath
    : `${normalizedFolderPath}${path.sep}`

  // Delete only files in this exact folder tree. A plain prefix match would also
  // remove siblings such as "C:\Movies 2" when deleting "C:\Movies".
  db.prepare(`DELETE FROM videos WHERE file_path = ? OR file_path LIKE ?`).run(
    normalizedFolderPath,
    `${folderPrefix}%`
  )
  // Delete the folder record itself
  db.prepare(`DELETE FROM watched_folders WHERE path = ?`).run(folderPath)
}

export function addDownload(dl: any) {
  const stmt = db.prepare(`
    INSERT INTO downloads (id, title, name, magnet, progress, download_speed, time_remaining, status, size, downloaded, tmdb_id, media_type, season, episode, download_path, error_message, queue_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      name = excluded.name,
      progress = excluded.progress,
      download_speed = excluded.download_speed,
      time_remaining = excluded.time_remaining,
      status = excluded.status,
      size = excluded.size,
      downloaded = excluded.downloaded,
      tmdb_id = excluded.tmdb_id,
      media_type = excluded.media_type,
      season = excluded.season,
      episode = excluded.episode,
      download_path = excluded.download_path,
      error_message = excluded.error_message
  `)
  return stmt.run(
    dl.id, dl.title, dl.name || null, dl.magnet, dl.progress || 0, dl.downloadSpeed || '0 B/s', dl.timeRemaining || '—', dl.status || 'pending', dl.size || '—', dl.downloaded || '0 B', dl.tmdbId || null, dl.mediaType || null, dl.season || null, dl.episode || null, dl.downloadPath || null, dl.errorMessage || null, dl.queueOrder ?? getNextDownloadQueueOrder()
  )
}

// Next FIFO position for a newly queued download (back of the line).
export function getNextDownloadQueueOrder(): number {
  try {
    const row = db.prepare('SELECT COALESCE(MAX(queue_order), 0) AS maxOrder FROM downloads').get() as any
    return Number(row?.maxOrder || 0) + 1
  } catch {
    return Date.now()
  }
}

export function updateDownload(dl: any) {
  const stmt = db.prepare(`
    UPDATE downloads
    SET title = ?, name = ?, progress = ?, download_speed = ?, time_remaining = ?, status = ?, size = ?, downloaded = ?, tmdb_id = ?, error_message = ?
    WHERE id = ?
  `)
  return stmt.run(
    dl.title, dl.name || null, dl.progress, dl.downloadSpeed, dl.timeRemaining, dl.status, dl.size, dl.downloaded, dl.tmdbId || null, dl.errorMessage || null, dl.id
  )
}

export function getDownloads() {
  return db.prepare('SELECT * FROM downloads ORDER BY queue_order ASC, added_at ASC').all().map((row: any) => ({
    id: row.id,
    title: row.title,
    name: row.name,
    magnet: row.magnet,
    progress: row.progress,
    downloadSpeed: row.download_speed,
    timeRemaining: row.time_remaining,
    status: row.status,
    size: row.size,
    downloaded: row.downloaded,
    tmdbId: row.tmdb_id,
    mediaType: row.media_type,
    season: row.season,
    episode: row.episode,
    downloadPath: row.download_path,
    errorMessage: row.error_message,
    queueOrder: row.queue_order ?? null,
    addedAt: row.added_at
  }))
}

export function setDownloadQueueOrder(id: string, order: number) {
  return db.prepare('UPDATE downloads SET queue_order = ? WHERE id = ?').run(Number(order), id)
}

export function removeDownloadRow(id: string) {
  return db.prepare('DELETE FROM downloads WHERE id = ?').run(id)
}

export function removeVideosUnderPath(targetPath: string) {
  const normalizedTargetPath = path.normalize(targetPath)
  const targetPrefix = normalizedTargetPath.endsWith(path.sep)
    ? normalizedTargetPath
    : `${normalizedTargetPath}${path.sep}`

  const videos = db.prepare(`
    SELECT id FROM videos
    WHERE file_path = ? OR file_path LIKE ?
  `).all(normalizedTargetPath, `${targetPrefix}%`) as any[]

  const deleteProgress = db.prepare('DELETE FROM progress WHERE video_id = ?')
  const deleteVideo = db.prepare('DELETE FROM videos WHERE id = ?')

  const tx = db.transaction(() => {
    for (const video of videos) {
      deleteProgress.run(video.id)
      deleteVideo.run(video.id)
    }
  })

  tx()
  return videos.length
}

export function removeVideosByTmdbId(tmdbId: number) {
  const videos = db.prepare('SELECT id FROM videos WHERE tmdb_id = ?').all(tmdbId) as any[]
  const deleteProgress = db.prepare('DELETE FROM progress WHERE video_id = ?')
  const deleteVideo = db.prepare('DELETE FROM videos WHERE id = ?')

  const tx = db.transaction(() => {
    for (const video of videos) {
      deleteProgress.run(video.id)
      deleteVideo.run(video.id)
    }
  })

  tx()
  return videos.length
}

export function getDownloadByTorrentName(name: string) {
  return db.prepare('SELECT * FROM downloads WHERE name = ?').get(name) as any
}

export function getDownloadById(id: string) {
  return db.prepare('SELECT * FROM downloads WHERE id = ?').get(id) as any
}

export function findVideoByTmdbId(tmdbId: number) {
  return db.prepare(`
    SELECT v.*, p.last_watched_time, p.completed
    FROM videos v
    LEFT JOIN progress p ON v.id = p.video_id
    WHERE v.tmdb_id = ?
    LIMIT 1
  `).get(tmdbId) as any
}

export function getVideosToDelete(video: any): any[] {
  if (video.type === 'series') {
    if (video.series_name) {
      return db.prepare('SELECT id, file_path FROM videos WHERE series_name = ?').all(video.series_name) as any[]
    }
    return db.prepare('SELECT id, file_path FROM videos WHERE id = ?').all(video.id) as any[]
  } else {
    if (video.tmdb_id) {
      return db.prepare('SELECT id, file_path FROM videos WHERE tmdb_id = ? AND type = ?').all(video.tmdb_id, video.type) as any[]
    }
    return db.prepare('SELECT id, file_path FROM videos WHERE id = ?').all(video.id) as any[]
  }
}

export function deleteVideoAndProgress(id: number) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM progress WHERE video_id = ?').run(id)
    db.prepare('DELETE FROM videos WHERE id = ?').run(id)
  })
  tx()
}

// ─── Online stream resume (source-agnostic, TMDB-keyed) ──────────────────────
// id format: `${tmdb_id}:${media_type}:s${season ?? 0}:e${episode ?? 0}`
// Hero visibility: 10 days. Data retention: 30 days (purged lazily on read).
export function buildStreamProgressId(tmdbId: number, mediaType: string, season?: number | null, episode?: number | null) {
  return `${tmdbId}:${mediaType}:s${season ?? 0}:e${episode ?? 0}`
}

export function upsertStreamProgress(entry: any) {
  const tmdbId = Number(entry.tmdb_id)
  if (!tmdbId || (entry.media_type !== 'movie' && entry.media_type !== 'series')) return null
  const id = buildStreamProgressId(tmdbId, entry.media_type, entry.season, entry.episode)
  const position = Math.max(0, Number(entry.position) || 0)
  const duration = Math.max(0, Number(entry.duration) || 0)
  const completed = entry.completed ? 1 : 0
  // Positions under 10s carry no resume value (accidental tap, or rewound to
  // the start). Drop the row — unless it already marks the episode watched,
  // in which case the watched marker must survive (#2 next-episode needs it).
  if (!completed && position < 10) {
    const existing = db.prepare('SELECT completed FROM stream_progress WHERE id = ?').get(id) as any
    if (existing?.completed) return existing
    db.prepare('DELETE FROM stream_progress WHERE id = ?').run(id)
    return { deleted: true, id }
  }
  // Completed rows are KEPT (completed=1): excluded from Continue Watching but
  // used to derive "watched till E3 → next E4". Purged after 30 days like rest.
  const fileIndex = Number.isFinite(Number(entry.file_index)) ? Number(entry.file_index) : null
  return db.prepare(`
    INSERT INTO stream_progress
      (id, tmdb_id, media_type, season, episode, title, poster_path, backdrop_path, overview, release_year, position, duration, completed, source_magnet, file_index, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      poster_path = COALESCE(excluded.poster_path, stream_progress.poster_path),
      backdrop_path = COALESCE(excluded.backdrop_path, stream_progress.backdrop_path),
      overview = COALESCE(excluded.overview, stream_progress.overview),
      release_year = COALESCE(excluded.release_year, stream_progress.release_year),
      position = excluded.position,
      duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE stream_progress.duration END,
      completed = excluded.completed,
      source_magnet = COALESCE(excluded.source_magnet, stream_progress.source_magnet),
      file_index = excluded.file_index,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    id, tmdbId, entry.media_type,
    entry.season ?? null, entry.episode ?? null,
    entry.title || 'Unknown Title',
    entry.poster_path || null, entry.backdrop_path || null,
    entry.overview || null, entry.release_year ?? null,
    position, duration, completed, entry.source_magnet || null, fileIndex
  )
}

export function clearAllFollowedNewFlags() {
  return db.prepare('UPDATE followed_series SET has_unseen_new = 0').run()
}

export function getStreamProgress(tmdbId: number, mediaType: string, season?: number | null, episode?: number | null) {
  const id = buildStreamProgressId(Number(tmdbId), mediaType, season, episode)
  return db.prepare('SELECT * FROM stream_progress WHERE id = ?').get(id) as any
}

export function getStreamContinueWatching(limit: number = 10) {
  try {
    // Lazily purge rows older than 30 days on every read (cheap, indexed).
    db.prepare(`DELETE FROM stream_progress WHERE updated_at < datetime('now', '-30 days')`).run()
  } catch (err) {
    console.error('[DB] stream_progress purge failed:', err)
  }
  // Hero visibility window: 10 days of inactivity hides the card (per UX decision),
  // but DetailScreen can still resume via getStreamProgress until the 30-day purge.
  return db.prepare(`
    SELECT * FROM stream_progress
    WHERE completed = 0 AND position >= 10
      AND updated_at > datetime('now', '-10 days')
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit) as any[]
}

export function deleteStreamProgress(tmdbId: number, mediaType: string, season?: number | null, episode?: number | null) {
  const id = buildStreamProgressId(Number(tmdbId), mediaType, season, episode)
  return db.prepare('DELETE FROM stream_progress WHERE id = ?').run(id)
}

// ─── Followed series for new-episode alerts (#3) ─────────────────────────────
export function getFollowed(tmdbId: number) {
  return db.prepare('SELECT * FROM followed_series WHERE tmdb_id = ?').get(Number(tmdbId)) as any
}

export function getFollowedSeries() {
  return db.prepare('SELECT * FROM followed_series ORDER BY added_at DESC').all() as any[]
}

export function upsertFollowedSeries(meta: any) {
  const tmdbId = Number(meta.tmdb_id)
  if (!tmdbId) return null
  const prev = getFollowed(tmdbId)
  db.prepare(`
    INSERT INTO followed_series (tmdb_id, title, poster_path, backdrop_path, overview)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(tmdb_id) DO UPDATE SET
      title = excluded.title,
      poster_path = COALESCE(excluded.poster_path, followed_series.poster_path),
      backdrop_path = COALESCE(excluded.backdrop_path, followed_series.backdrop_path),
      overview = COALESCE(excluded.overview, followed_series.overview)
  `).run(
    tmdbId, meta.title || 'Unknown Title',
    meta.poster_path || null, meta.backdrop_path || null, meta.overview || null
  )
  return { isNew: !prev }
}

export function setFollowedBaseline(tmdbId: number, season?: number | null, episode?: number | null) {
  return db.prepare(`
    UPDATE followed_series
    SET last_known_season = ?, last_known_episode = ?,
        has_unseen_new = 0, last_checked = CURRENT_TIMESTAMP
    WHERE tmdb_id = ?
  `).run(season ?? null, episode ?? null, Number(tmdbId))
}

export function touchFollowedChecked(tmdbId: number, season?: number | null, episode?: number | null, hasNew: boolean = false) {
  return db.prepare(`
    UPDATE followed_series
    SET last_known_season = COALESCE(?, last_known_season),
        last_known_episode = COALESCE(?, last_known_episode),
        has_unseen_new = CASE WHEN ? = 1 THEN 1 ELSE has_unseen_new END,
        last_checked = CURRENT_TIMESTAMP
    WHERE tmdb_id = ?
  `).run(season ?? null, episode ?? null, hasNew ? 1 : 0, Number(tmdbId))
}

export function markFollowedSeen(tmdbId: number) {
  return db.prepare('UPDATE followed_series SET has_unseen_new = 0 WHERE tmdb_id = ?').run(Number(tmdbId))
}

export function unfollowSeries(tmdbId: number) {
  return db.prepare('DELETE FROM followed_series WHERE tmdb_id = ?').run(Number(tmdbId))
}

// Highest S/E with any stream row (watched or in-progress) for a series.
// Drives #3: a release newer than this is genuinely unwatched news.
export function getStreamMaxWatched(tmdbId: number) {
  return db.prepare(`
    SELECT season, episode FROM stream_progress
    WHERE tmdb_id = ? AND media_type = 'series'
    ORDER BY COALESCE(season, 0) DESC, COALESCE(episode, 0) DESC
    LIMIT 1
  `).get(Number(tmdbId)) as { season: number | null; episode: number | null } | undefined
}

// Latest stream activity for a series (any row). Drives the stale-follow rule:
// series nobody has touched in weeks stop alerting until watched again.
export function getStreamLatestActivity(tmdbId: number) {
  return db.prepare(`
    SELECT MAX(updated_at) AS latest FROM stream_progress
    WHERE tmdb_id = ?
  `).get(Number(tmdbId)) as { latest: string | null } | undefined
}

// Full recent history INCLUDING completed rows (powers #2 series grouping and
// Detail episode ticks). Continue Watching stays on getStreamContinueWatching.
export function getStreamHistory(limit: number = 100) {
  try {
    db.prepare(`DELETE FROM stream_progress WHERE updated_at < datetime('now', '-30 days')`).run()
  } catch (err) {
    console.error('[DB] stream_progress purge failed:', err)
  }
  return db.prepare(`
    SELECT * FROM stream_progress
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit) as any[]
}

export default db
