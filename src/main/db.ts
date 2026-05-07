import { app } from 'electron'
import { join } from 'path'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const dbPath = join(app.getPath('userData'), 'mycinema.db')
const db = new Database(dbPath, { 
  timeout: 10000 // 10 seconds timeout for busy/locked database
})

// Initialize database
export function initDb() {
  db.pragma('journal_mode = WAL') // Write-Ahead Logging for better concurrency
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      file_path TEXT UNIQUE NOT NULL,
      type TEXT CHECK(type IN ('movie', 'series')) NOT NULL,
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
      type TEXT CHECK(type IN ('movie', 'series')) NOT NULL,
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

  const watchlistColumns = db.prepare("PRAGMA table_info(watchlist)").all()
  const watchlistColumnNames = watchlistColumns.map((c: any) => c.name)
  if (!watchlistColumnNames.includes('category')) {
    db.exec("ALTER TABLE watchlist ADD COLUMN category TEXT DEFAULT 'Watchlist'")
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
      error_message TEXT,
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
}

export function addVideo(video: any) {
  const stmt = db.prepare(`
    INSERT INTO videos (
      title, file_path, type, series_name, season, episode, duration, poster_path, vote_average, release_year, tmdb_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      duration = excluded.duration
    WHERE duration = 0 OR duration IS NULL
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
  return db.prepare(`
    SELECT v.*, p.last_watched_time, p.completed, p.updated_at
    FROM videos v
    LEFT JOIN progress p ON v.id = p.video_id
    ORDER BY v.added_at DESC
  `).all()
}

export function deleteVideo(id: number) {
  const stmt = db.prepare('DELETE FROM videos WHERE id = ?')
  return stmt.run(id)
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

    const episodes = db.prepare(`
      SELECT * FROM videos 
      WHERE series_name = ? 
      ORDER BY season ASC, episode ASC
    `).all(currentVideo.series_name) as any[]

    const currentIndex = episodes.findIndex((e: any) => e.id === videoId)
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
    ORDER BY season ASC, episode ASC
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

export function addLocalVideoToWatchlist(id: number, category: string = 'Watchlist') {
  return db.prepare(`
    UPDATE videos
    SET is_watchlist = 1,
        watchlist_category = ?
    WHERE id = ?
  `).run(category || 'Watchlist', id)
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
    item.category || 'Watchlist'
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

  return {
    folders,
    watchlist: {
      external: externalWatchlist,
      local: localWatchlist
    },
    favorites
  }
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
    INSERT INTO downloads (id, title, name, magnet, progress, download_speed, time_remaining, status, size, downloaded, tmdb_id, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      error_message = excluded.error_message
  `)
  return stmt.run(
    dl.id, dl.title, dl.name || null, dl.magnet, dl.progress || 0, dl.downloadSpeed || '0 B/s', dl.timeRemaining || '—', dl.status || 'pending', dl.size || '—', dl.downloaded || '0 B', dl.tmdbId || null, dl.errorMessage || null
  )
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
  return db.prepare('SELECT * FROM downloads ORDER BY added_at DESC').all().map((row: any) => ({
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
    errorMessage: row.error_message
  }))
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

export function findVideoByTmdbId(tmdbId: number) {
  return db.prepare(`
    SELECT v.*, p.last_watched_time, p.completed
    FROM videos v
    LEFT JOIN progress p ON v.id = p.video_id
    WHERE v.tmdb_id = ?
    LIMIT 1
  `).get(tmdbId) as any
}

export default db
