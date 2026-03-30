import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as db from './db'
import { scanFolder } from './scanner'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

// Register custom protocol as privileged
// This MUST be called before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false // Allow local video playback
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Custom Protocol Handler to serve local media files with seeking support
function registerMediaProtocol(): void {
  protocol.handle('media', (request) => {
    try {
      const prefix = 'media://file/'
      const encodedPath = request.url.startsWith(prefix) 
        ? request.url.slice(prefix.length) 
        : request.url.slice('media://'.length)
      
      let normalizedPath = decodeURIComponent(encodedPath)
      if (normalizedPath.startsWith('/') && normalizedPath.includes(':')) {
        normalizedPath = normalizedPath.slice(1)
      }

      if (!fs.existsSync(normalizedPath)) {
        return new Response('Not Found', { status: 404 })
      }

      const stat = fs.statSync(normalizedPath)
      const fileSize = stat.size
      const range = request.headers.get('range')

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-")
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
        const chunksize = (end - start) + 1
        
        const fileStream = fs.createReadStream(normalizedPath, { start, end })
        
        return new Response(fileStream as any, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': 'video/mp4', // Most common, browser will sniff if different
          }
        })
      } else {
        const fileStream = fs.createReadStream(normalizedPath)
        return new Response(fileStream as any, {
          headers: {
            'Content-Length': fileSize.toString(),
            'Accept-Ranges': 'bytes',
            'Content-Type': 'video/mp4',
          }
        })
      }
    } catch (error) {
      console.error('Failed to fetch media:', error)
      return new Response('Error', { status: 500 })
    }
  })
}

app.whenReady().then(() => {
  // Register media protocol
  registerMediaProtocol()
  
  db.initDb()
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('get-videos', () => {
  return db.getVideos()
})

ipcMain.handle('get-video-progress', (_, videoId) => {
  return db.getProgress(videoId)
})

ipcMain.on('update-video-progress', (_, videoId, time, completed) => {
  db.updateProgress(videoId, time, completed)
})

ipcMain.handle('get-continue-watching', () => {
  return db.getContinueWatching()
})

ipcMain.handle('get-series-info', (_, seriesName) => {
  return db.getSeriesInfo(seriesName)
})

ipcMain.handle('scan-folder', async (_, path) => {
  return await scanFolder(path)
})

ipcMain.handle('get-subtitles', async (_, filePath) => {
  try {
    const dir = path.dirname(filePath)
    const baseName = path.basename(filePath, path.extname(filePath))
    
    // 1. Check for exact match or common naming conventions
    const possibleSrts = [
      path.join(dir, `${baseName}.srt`),
      path.join(dir, `${baseName}.en.srt`),
      path.join(dir, `${baseName}.eng.srt`),
      path.join(dir, 'English.srt'),
      path.join(dir, 'english.srt'),
      path.join(dir, 'subs', `${baseName}.srt`),
      path.join(dir, 'Subtitles', `${baseName}.srt`)
    ]

    for (const srt of possibleSrts) {
      if (fs.existsSync(srt)) return srt
    }

    // 2. Fallback: Search for ANY .srt file in the same directory
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
      const anySrt = files.find(f => f.toLowerCase().endsWith('.srt'))
      if (anySrt) return path.join(dir, anySrt)
    }

    return null
  } catch (error) {
    console.error('Failed to get subtitles:', error)
    return null
  }
})
