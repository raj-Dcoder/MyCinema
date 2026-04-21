import { app } from 'electron'
import { join } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const dbPath = join(app.getPath('userData'), 'mycinema.db')
const db = new Database(dbPath)

// Initialize database
export function initDb() {
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
}

export function addVideo(video: any) {
  const stmt = db.prepare(`
    INSERT INTO videos (
      title, file_path, type, series_name, season, episode, duration, poster_path, vote_average, release_year
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    video.release_year || null
  )
}

export function getVideos() {
  return db.prepare('SELECT * FROM videos ORDER BY added_at DESC').all()
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
      console.log(`[DB] Series ${currentVideo.series_name} completed. Cleared from Continue Watching.`)
      return
    }

    const nextEpisode = episodes[currentIndex + 1]
    console.log(`[DB] Queuing next episode: ${nextEpisode.title} (id=${nextEpisode.id})`)

    // Always reset the next episode to 0:00, completed=false
    db.prepare(`
      INSERT INTO progress (video_id, last_watched_time, completed, updated_at)
      VALUES (?, 0, 0, CURRENT_TIMESTAMP)
      ON CONFLICT(video_id) DO UPDATE SET
        last_watched_time = 0,
        completed = 0,
        updated_at = CURRENT_TIMESTAMP
    `).run(nextEpisode.id)

    console.log(`[DB] Successfully queued next episode id=${nextEpisode.id}`)
  } catch (err) {
    console.error('[DB] queueNextEpisode error:', err)
  }
}

export function updateProgress(videoId: number, time: number, completed: boolean) {
  try {
    db.prepare(`
      INSERT INTO progress (video_id, last_watched_time, completed, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(video_id) DO UPDATE SET
        last_watched_time = excluded.last_watched_time,
        completed = excluded.completed,
        updated_at = CURRENT_TIMESTAMP
    `).run(videoId, time, completed ? 1 : 0)

    if (completed) {
      queueNextEpisode(videoId)
    }
  } catch (err) {
    console.error('[DB] updateProgress error:', err)
  }
}

export function getProgress(videoId: number) {
  return db.prepare('SELECT * FROM progress WHERE video_id = ?').get(videoId)
}

export function getContinueWatching() {
  return db.prepare(`
    SELECT v.*, p.last_watched_time, p.completed
    FROM videos v
    JOIN progress p ON v.id = p.video_id
    WHERE p.completed = 0
    ORDER BY p.updated_at DESC
  `).all()
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

export function removeFolder(folderPath: string) {
  // Delete all videos under this folder path
  db.prepare(`DELETE FROM videos WHERE file_path LIKE ?`).run(`${folderPath}%`)
  // Delete the folder record itself
  db.prepare(`DELETE FROM watched_folders WHERE path = ?`).run(folderPath)
}

export function addDownload(dl: any) {
  const stmt = db.prepare(`
    INSERT INTO downloads (id, title, name, magnet, progress, download_speed, time_remaining, status, size, downloaded, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      name = excluded.name,
      progress = excluded.progress,
      download_speed = excluded.download_speed,
      time_remaining = excluded.time_remaining,
      status = excluded.status,
      size = excluded.size,
      downloaded = excluded.downloaded,
      error_message = excluded.error_message
  `)
  return stmt.run(
    dl.id, dl.title, dl.name || null, dl.magnet, dl.progress || 0, dl.downloadSpeed || '0 B/s', dl.timeRemaining || '—', dl.status || 'pending', dl.size || '—', dl.downloaded || '0 B', dl.errorMessage || null
  )
}

export function updateDownload(dl: any) {
  const stmt = db.prepare(`
    UPDATE downloads
    SET title = ?, name = ?, progress = ?, download_speed = ?, time_remaining = ?, status = ?, size = ?, downloaded = ?, error_message = ?
    WHERE id = ?
  `)
  return stmt.run(
    dl.title, dl.name || null, dl.progress, dl.downloadSpeed, dl.timeRemaining, dl.status, dl.size, dl.downloaded, dl.errorMessage || null, dl.id
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
    errorMessage: row.error_message
  }))
}

export function removeDownloadRow(id: string) {
  return db.prepare('DELETE FROM downloads WHERE id = ?').run(id)
}

export default db
