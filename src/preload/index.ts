import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getVideos: () => ipcRenderer.invoke('get-videos'),
  deleteVideoFile: (video: any) => ipcRenderer.invoke('delete-video-file', video),
  getVideoProgress: (videoId: number) => ipcRenderer.invoke('get-video-progress', videoId),
  updateVideoProgress: (videoId: number, time: number, completed: boolean, isClosing?: boolean) => 
    ipcRenderer.send('update-video-progress', videoId, time, completed, isClosing),
  scanFolder: (path: string) => ipcRenderer.invoke('scan-folder', path),
  getContinueWatching: () => ipcRenderer.invoke('get-continue-watching'),
  playVideo: (videoId: number) => ipcRenderer.invoke('play-video', videoId),
  getSeriesInfo: (seriesName: string) => ipcRenderer.invoke('get-series-info', seriesName),
  setPreferredVideoVersion: (videoId: number) => ipcRenderer.invoke('set-preferred-video-version', videoId),
  getSubtitlePath: (filePath: string) => ipcRenderer.invoke('get-subtitles', filePath),
  getEmbeddedSubtitles: (filePath: string) => ipcRenderer.invoke('get-embedded-subtitles', filePath),
  getEmbeddedAudio: (filePath: string) => ipcRenderer.invoke('get-embedded-audio', filePath),
  preConvertSubtitle: (filePath: string, trackIndex: number, isExternal: boolean) => ipcRenderer.invoke('pre-convert-subtitle', filePath, trackIndex, isExternal),
  onOpenExternalFile: (callback: (filePath: string) => void) => {
    const handler = (_e: any, filePath: string) => callback(filePath)
    ipcRenderer.on('open-external-file', handler)
    return () => ipcRenderer.removeListener('open-external-file', handler)
  },
  getPendingExternalFile: () => ipcRenderer.invoke('get-pending-external-file'),
  onLibraryUpdated: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('library-updated', handler)
    return () => ipcRenderer.removeListener('library-updated', handler)
  },
  removeAllLibraryUpdateListeners: () => ipcRenderer.removeAllListeners('library-updated'),
  getFolders: () => ipcRenderer.invoke('get-folders'),
  removeFolder: (folderPath: string) => ipcRenderer.invoke('remove-folder', folderPath),
  exportUserBackup: () => ipcRenderer.invoke('export-user-backup'),
  importUserBackup: () => ipcRenderer.invoke('import-user-backup'),
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
  fetchTrending: (type: 'movie' | 'series', forceRefresh?: boolean) => ipcRenderer.invoke('fetch-trending', type, forceRefresh),
  fetchTrendingIndia: (type: 'movie' | 'series' = 'movie', forceRefresh?: boolean) => ipcRenderer.invoke('fetch-trending-india', type, forceRefresh),
  fetchTrendingKdrama: (forceRefresh?: boolean) => ipcRenderer.invoke('fetch-trending-kdrama', forceRefresh),
  fetchTrendingAnime: (forceRefresh?: boolean) => ipcRenderer.invoke('fetch-trending-anime', forceRefresh),
  fetchTrendingNetflix: (type: 'movie' | 'series', forceRefresh?: boolean) => ipcRenderer.invoke('fetch-trending-netflix', type, forceRefresh),
  fetchTrendingPrimeVideo: (type: 'movie' | 'series', forceRefresh?: boolean) => ipcRenderer.invoke('fetch-trending-prime-video', type, forceRefresh),
  fetchTrendingJioHotstar: (type: 'movie' | 'series', forceRefresh?: boolean) => ipcRenderer.invoke('fetch-trending-jiohotstar', type, forceRefresh),
  fetchTrendingAppleTv: (type: 'movie' | 'series', forceRefresh?: boolean) => ipcRenderer.invoke('fetch-trending-apple-tv', type, forceRefresh),
  getTmdbTitleLogo: (type: 'movie' | 'series', tmdbId: number) => ipcRenderer.invoke('get-tmdb-title-logo', type, tmdbId),
  getTmdbKeywords: (id: number, type: 'movie' | 'series') => ipcRenderer.invoke('get-tmdb-keywords', id, type),
  saveVideoKeywords: (id: number, keywords: string[]) => ipcRenderer.invoke('save-video-keywords', id, keywords),
  getTmdbReleaseInfo: (id: number, type: 'movie' | 'series') => ipcRenderer.invoke('get-tmdb-release-info', id, type),
  getTmdbTrailer: (params: { tmdbId?: number | null; title: string; type: 'movie' | 'series'; year?: number | null; seasonNumber?: number | null; preferLatestSeason?: boolean }) =>
    ipcRenderer.invoke('get-tmdb-trailer', params),
  getTmdbSeriesCatalog: (tmdbId: number) => ipcRenderer.invoke('get-tmdb-series-catalog', tmdbId),
  getIntroDbSegments: (params: { imdbId?: string | null; tmdbId?: number | null; season?: number | null; episode?: number | null; filePath?: string | null; duration?: number | null }) =>
    ipcRenderer.invoke('get-introdb-segments', params),
  getPendingSharedMediaTarget: () => ipcRenderer.invoke('get-pending-shared-media-target'),
  getPendingSharedCollectionTarget: () => ipcRenderer.invoke('get-pending-shared-collection-target'),
  getCollectionShareData: (collectionId: number) => ipcRenderer.invoke('get-collection-share-data', collectionId),
  getCollectionShareFile: (collectionId: number) => ipcRenderer.invoke('get-collection-share-file', collectionId),
  openChatShare: (target: 'whatsapp', text: string) => ipcRenderer.invoke('open-chat-share', target, text),
  importSharedCollection: (payload: any) => ipcRenderer.invoke('import-shared-collection', payload),
  onOpenSharedCollection: (callback: (payload: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload)
    ipcRenderer.on('open-shared-collection', handler)
    return () => ipcRenderer.removeListener('open-shared-collection', handler)
  },
  getSharedMediaByTmdbId: (type: 'movie' | 'series', tmdbId: number) => ipcRenderer.invoke('get-shared-media-by-tmdb-id', type, tmdbId),
  onOpenSharedMedia: (callback: (target: { type: 'movie' | 'series'; tmdbId: number; source?: any }) => void) => {
    const handler = (_event: any, target: { type: 'movie' | 'series'; tmdbId: number; source?: any }) => callback(target)
    ipcRenderer.on('open-shared-media', handler)
    return () => ipcRenderer.removeListener('open-shared-media', handler)
  },
  toggleFavorite: (id: number) => ipcRenderer.invoke('toggle-favorite', id),
  toggleWatchlist: (id: number) => ipcRenderer.invoke('toggle-watchlist', id),
  addLocalToWatchlist: (id: number, category: string) => ipcRenderer.invoke('add-local-to-watchlist', id, category),
  addToWatchlistExternal: (item: any) => ipcRenderer.invoke('add-to-watchlist-external', item),
  removeFromWatchlistExternal: (tmdbId: number) => ipcRenderer.invoke('remove-from-watchlist-external', tmdbId),
  getWatchlist: () => ipcRenderer.invoke('get-watchlist'),
  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  // Collections Auto-Curator
  getCollections: () => ipcRenderer.invoke('get-collections'),
  getCollectionMembers: (collectionId: number) => ipcRenderer.invoke('get-collection-members', collectionId),
  createCollection: (input: any) => ipcRenderer.invoke('create-collection', input),
  updateCollection: (collectionId: number, patch: any) => ipcRenderer.invoke('update-collection', collectionId, patch),
  deleteCollection: (collectionId: number) => ipcRenderer.invoke('delete-collection', collectionId),
  reorderCollections: (ids: number[]) => ipcRenderer.invoke('reorder-collections', ids),
  pinCollectionVideo: (collectionId: number, videoId: number) => ipcRenderer.invoke('pin-collection-video', collectionId, videoId),
  unpinCollectionVideo: (collectionId: number, videoId: number) => ipcRenderer.invoke('unpin-collection-video', collectionId, videoId),
  addCollectionExternal: (collectionId: number, item: any) => ipcRenderer.invoke('add-collection-external', collectionId, item),
  removeCollectionExternal: (externalId: number) => ipcRenderer.invoke('remove-collection-external', externalId),
  exportCollection: (collectionId: number) => ipcRenderer.invoke('export-collection', collectionId),
  importCollection: () => ipcRenderer.invoke('import-collection'),
  // Auto-update
  onUpdateAvailable: (callback: (info: { version: string }) => void) => ipcRenderer.on('update-available', (_e, info) => callback(info)),
  onUpdateProgress: (callback: (info: { percent: number }) => void) => ipcRenderer.on('update-progress', (_e, info) => callback(info)),
  onUpdateDownloaded: (callback: () => void) => ipcRenderer.on('update-downloaded', () => callback()),
  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  installUpdate: () => ipcRenderer.send('install-update'),
  // Torrent download APIs
  searchTMDB: (query: string) => ipcRenderer.invoke('search-tmdb', query),
  searchTorrentSources: (title: string, year: string, mediaType: string, tmdbId: number, requestId?: string) =>
    ipcRenderer.invoke('search-torrent-sources', title, year, mediaType, tmdbId, requestId),
  cancelTorrentSourceSearch: (requestId: string) =>
    ipcRenderer.invoke('cancel-torrent-source-search', requestId),
  onTorrentSourcesProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('torrent-sources-progress', handler)
    return () => ipcRenderer.removeListener('torrent-sources-progress', handler)
  },
  startTorrentDownload: (magnetUrl: string, title: string, tmdbId?: number, name?: string, media?: { mediaType?: 'movie' | 'series'; season?: number; episode?: number }) =>
    ipcRenderer.invoke('start-torrent-download', magnetUrl, title, tmdbId, name, media),
  cancelTorrentDownload: (id: string) => 
    ipcRenderer.invoke('cancel-torrent-download', id),
  removeDownload: (id: string, deleteFile?: boolean) => 
    ipcRenderer.invoke('remove-download', id, deleteFile),
  pauseResumeTorrent: (id: string) => 
    ipcRenderer.invoke('pause-resume-torrent', id),
  retryTorrentDownload: (id: string) =>
    ipcRenderer.invoke('retry-torrent-download', id),
  getMaxConcurrentDownloads: () =>
    ipcRenderer.invoke('get-max-concurrent-downloads'),
  setMaxConcurrentDownloads: (value: number) =>
    ipcRenderer.invoke('set-max-concurrent-downloads', value),
  getActiveDownloads: () => 
    ipcRenderer.invoke('get-active-downloads'),
  prepareTorrentStream: (id: string) =>
    ipcRenderer.invoke('prepare-torrent-stream', id),
  startTempStream: (magnetUrl: string, title?: string, options?: { fileIndex?: number; season?: number; episode?: number }) =>
    ipcRenderer.invoke('start-temp-stream', magnetUrl, title, options),
  stopTempStream: (id: string) =>
    ipcRenderer.invoke('stop-temp-stream', id),
  prioritizeTempFiles: (streamId: string, fileIndexes: number[]) =>
    ipcRenderer.invoke('prioritize-temp-files', streamId, fileIndexes).catch(() => false),
  getTempStreamEpisodes: (streamId: string) =>
    ipcRenderer.invoke('get-temp-stream-episodes', streamId),
  onDownloadsChanged: (callback: () => void) => {
    ipcRenderer.on('downloads-changed', callback)
    return () => ipcRenderer.removeListener('downloads-changed', callback)
  },
  onTorrentProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('torrent-progress', handler)
    return () => ipcRenderer.removeListener('torrent-progress', handler)
  },
  // File utilities
  openFolder: (filePath: string) => ipcRenderer.invoke('open-folder', filePath),
  getMediaInfo: (filePath: string) => ipcRenderer.invoke('get-media-info', filePath),
  getSeekPreviewThumbnail: (filePath: string, time: number) => ipcRenderer.invoke('get-seek-preview-thumbnail', filePath, time),
  openDownloadsFolder: () => ipcRenderer.invoke('open-downloads-folder'),
  getDownloadsStorage: () => ipcRenderer.invoke('get-downloads-storage'),
  // OpenSubtitles API
  searchOnlineSubtitles: (params: { query?: string; tmdbId?: number; season?: number; episode?: number; languages?: string; mediaType?: string; videoFilePath?: string }) =>
    ipcRenderer.invoke('search-opensubtitles', params),
  downloadOnlineSubtitle: (params: { fileId: number; videoFilePath: string; fileName?: string }) =>
    ipcRenderer.invoke('download-opensubtitle', params),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  restoreWindow: (opts?: { enterFullscreen?: boolean }) => ipcRenderer.invoke('window-restore', opts),
  setPipThumbar: (payload: { isPlaying: boolean; icons: { play: string; pause: string; back: string; fwd: string } }) =>
    ipcRenderer.invoke('pip-thumbar-update', payload),
  clearPipThumbar: () => ipcRenderer.invoke('pip-thumbar-clear'),
  onThumbarCommand: (callback: (command: string) => void) => {
    const handler = (_event: any, command: string) => callback(command)
    ipcRenderer.on('thumbar-command', handler)
    return () => ipcRenderer.removeListener('thumbar-command', handler)
  },
  openWebPopup: (url: string, title?: string) => ipcRenderer.invoke('open-web-popup', url, title),
  toggleFullscreen: () => ipcRenderer.invoke('window-toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window-is-fullscreen'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => {
    const handler = (_event: any, isFullscreen: boolean) => callback(isFullscreen)
    ipcRenderer.on('window-fullscreen-changed', handler)
    return () => ipcRenderer.removeListener('window-fullscreen-changed', handler)
  },
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  setLaunchFullscreen: (launchFullscreen: boolean) => ipcRenderer.invoke('set-launch-fullscreen', launchFullscreen),
  setRememberOnlineProgress: (enabled: boolean) => ipcRenderer.invoke('set-remember-online-progress', enabled),
  getStreamProgress: (tmdbId: number, mediaType: string, season?: number | null, episode?: number | null) =>
    ipcRenderer.invoke('get-stream-progress', tmdbId, mediaType, season ?? null, episode ?? null),
  updateStreamProgress: (entry: any) => ipcRenderer.send('update-stream-progress', entry),
  getStreamContinueWatching: () => ipcRenderer.invoke('get-stream-continue-watching'),
  getStreamHistory: (limit?: number) => ipcRenderer.invoke('get-stream-history', limit ?? 100),
  setNotifyNewEpisodes: (enabled: boolean) => ipcRenderer.invoke('set-notify-new-episodes', enabled),
  followSeries: (input: { tmdb_id: number; title?: string; poster_path?: string | null; backdrop_path?: string | null; overview?: string | null; season?: number | null; episode?: number | null }) =>
    ipcRenderer.invoke('follow-series', input),
  unfollowSeries: (tmdbId: number) => ipcRenderer.invoke('unfollow-series', tmdbId),
  getFollowedSeries: () => ipcRenderer.invoke('get-followed-series'),
  markFollowedSeen: (tmdbId: number) => ipcRenderer.invoke('mark-followed-seen', tmdbId),
  checkFollowedUpdates: () => ipcRenderer.invoke('check-followed-updates'),
  checkSeriesUpdates: (tmdbId: number) => ipcRenderer.invoke('check-series-updates', tmdbId),
  deleteStreamProgress: (tmdbId: number, mediaType: string, season?: number | null, episode?: number | null) =>
    ipcRenderer.invoke('delete-stream-progress', tmdbId, mediaType, season ?? null, episode ?? null),
  onAppSettingsChanged: (callback: (settings: { launchFullscreen: boolean; rememberOnlineProgress: boolean; notifyNewEpisodes: boolean }) => void) => {
    const handler = (_event: any, settings: { launchFullscreen: boolean; rememberOnlineProgress: boolean; notifyNewEpisodes: boolean }) => callback(settings)
    ipcRenderer.on('app-settings-changed', handler)
    return () => ipcRenderer.removeListener('app-settings-changed', handler)
  },
  // ─── Focus Tube ────────────────────────────────────────────────────────────
  ftListCategories: () => ipcRenderer.invoke('ft-list-categories'),
  ftCreateCategory: (name: string, color?: string) => ipcRenderer.invoke('ft-create-category', { name, color }),
  ftUpdateCategory: (id: number, name: string, color?: string) => ipcRenderer.invoke('ft-update-category', { id, name, color }),
  ftDeleteCategory: (id: number) => ipcRenderer.invoke('ft-delete-category', id),
  ftReorderCategories: (ids: number[]) => ipcRenderer.invoke('ft-reorder-categories', ids),
  ftListChannels: (categoryId?: number | null) => ipcRenderer.invoke('ft-list-channels', categoryId ?? null),
  ftUpsertChannel: (input: { channelId: string; title: string; handle?: string | null; avatarUrl?: string | null; url?: string | null }) =>
    ipcRenderer.invoke('ft-upsert-channel', input),
  ftDeleteChannel: (channelId: string) => ipcRenderer.invoke('ft-delete-channel', channelId),
  ftSetChannelCategories: (channelId: string, categoryIds: number[]) =>
    ipcRenderer.invoke('ft-set-channel-categories', { channelId, categoryIds }),
  ftSetChannelHideShorts: (channelId: string, hideShorts: boolean) =>
    ipcRenderer.invoke('ft-set-channel-hide-shorts', { channelId, hideShorts }),
  ftGetFeed: (options?: {
    categoryId?: number | null
    includeSeen?: boolean
    includeSavedOnly?: boolean
    hideShorts?: boolean
    limit?: number
    search?: string | null
  }) => ipcRenderer.invoke('ft-get-feed', options ?? {}),
  ftGetVideo: (videoId: string) => ipcRenderer.invoke('ft-get-video', videoId),
  ftSetVideoSeen: (videoId: string, seen: boolean) => ipcRenderer.invoke('ft-set-video-seen', { videoId, seen }),
  ftMarkAllSeen: (categoryId: number | null) => ipcRenderer.invoke('ft-mark-all-seen', categoryId),
  ftToggleSaved: (videoId: string, saved: boolean) => ipcRenderer.invoke('ft-toggle-saved', { videoId, saved }),
  ftGetProgress: (videoId: string) => ipcRenderer.invoke('ft-get-progress', videoId),
  ftUpdateProgress: (videoId: string, position: number) => ipcRenderer.invoke('ft-update-progress', { videoId, position }),
  ftGetCategorySummary: (categoryId: number | null) => ipcRenderer.invoke('ft-get-category-summary', categoryId),
  ftRefreshFeeds: (options?: { force?: boolean }) => ipcRenderer.invoke('ft-refresh-feeds', options ?? { force: true }),
  ftResolveChannel: (query: string) => ipcRenderer.invoke('ft-resolve-channel', query),
  ftAddChannel: (query: string, categoryIds: number[]) => ipcRenderer.invoke('ft-add-channel', { query, categoryIds }),
  ftRecordPlayback: (videoId: string, observation: { duration?: number | null; ended?: boolean }) =>
    ipcRenderer.invoke('ft-record-playback', { videoId, ...observation }),
  ftMarkNotEmbeddable: (videoId: string) => ipcRenderer.invoke('ft-mark-not-embeddable', videoId),
  onFeedUpdated: (callback: (payload: { added: number; channelIds: string[] }) => void) => {
    const handler = (_event: any, payload: { added: number; channelIds: string[] }) => callback(payload)
    ipcRenderer.on('ft-feed-updated', handler)
    return () => ipcRenderer.removeListener('ft-feed-updated', handler)
  },
  log: (message: string) => ipcRenderer.send('log-to-main', message),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in d.ts)
  window.electron = electronAPI
  // @ts-ignore (define in d.ts)
  window.api = api
}
