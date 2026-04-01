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
      tmdb_id INTEGER,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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
  `)
}

export function addVideo(video: any) {
  const stmt = db.prepare(`
    INSERT INTO videos (
      title, file_path, type, series_name, season, episode, duration, poster_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
    video.poster_path || null
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
    SET poster_path = ?, overview = ?, tmdb_id = ?
    WHERE id = ?
  `)
  return stmt.run(metadata.poster_path, metadata.overview, metadata.tmdb_id, id)
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

export default db
