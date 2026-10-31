/// <reference types="vite/client" />

import { electronAPI } from '@electron-toolkit/preload'

interface ImportMetaEnv {
  readonly VITE_MYCINEMA_SHARE_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Api {
  selectFolder: () => Promise<string | null>
  getVideos: () => Promise<any[]>
  deleteVideoFile: (video: any) => Promise<boolean>
  getVideoProgress: (videoId: number) => Promise<any>
  updateVideoProgress: (videoId: number, time: number, completed: boolean, isClosing?: boolean) => void
  scanFolder: (path: string) => Promise<void>
  getContinueWatching: () => Promise<any[]>
  playVideo: (videoId: number) => Promise<void>
  getSeriesInfo: (seriesName: string) => Promise<any[]>
  setPreferredVideoVersion: (videoId: number) => Promise<boolean>
  getSubtitlePath: (filePath: string) => Promise<string | null>
  getEmbeddedSubtitles: (filePath: string) => Promise<any[]>
  getEmbeddedAudio: (filePath: string) => Promise<any[]>
  preConvertSubtitle: (filePath: string, trackIndex: number, isExternal: boolean) => Promise<string | null>
  onOpenExternalFile: (callback: (filePath: string) => void) => () => void
  getPendingExternalFile: () => Promise<string | null>
  onLibraryUpdated: (callback: () => void) => () => void
  removeAllLibraryUpdateListeners: () => void
  getFolders: () => Promise<any[]>
  removeFolder: (folderPath: string) => Promise<boolean>
  exportUserBackup: () => Promise<{
    exported: boolean
    canceled?: boolean
    filePath?: string
    folders?: number
    externalWatchlist?: number
    localWatchlist?: number
    favorites?: number
    streamProgress?: number
    followedSeries?: number
    focusTubeCategories?: number
    focusTubeChannels?: number
    error?: string
  }>
  importUserBackup: () => Promise<{
    imported: boolean
    canceled?: boolean
    filePath?: string
    foldersAdded?: number
    foldersScanned?: number
    foldersMissing?: number
    externalWatchlistImported?: number
    localWatchlistRestored?: number
    favoritesRestored?: number
    streamProgressRestored?: number
    followedSeriesRestored?: number
    focusTubeCategoriesRestored?: number
    focusTubeChannelsRestored?: number
    error?: string
  }>
  clearAllData: () => Promise<boolean>
  fetchTrending: (type: 'movie' | 'series', forceRefresh?: boolean) => Promise<any[]>
  fetchTrendingIndia: (type?: 'movie' | 'series', forceRefresh?: boolean) => Promise<any[]>
  fetchTrendingKdrama: (forceRefresh?: boolean) => Promise<any[]>
  fetchTrendingAnime: (forceRefresh?: boolean) => Promise<any[]>
  fetchTrendingNetflix: (type: 'movie' | 'series', forceRefresh?: boolean) => Promise<any[]>
  fetchTrendingPrimeVideo: (type: 'movie' | 'series', forceRefresh?: boolean) => Promise<any[]>
  fetchTrendingJioHotstar: (type: 'movie' | 'series', forceRefresh?: boolean) => Promise<any[]>
  fetchTrendingAppleTv: (type: 'movie' | 'series', forceRefresh?: boolean) => Promise<any[]>
  getTmdbTitleLogo: (type: 'movie' | 'series', tmdbId: number) => Promise<string | null>
  getTmdbReleaseInfo: (id: number, type: 'movie' | 'series') => Promise<import('./types').TmdbReleaseInfo | null>
  getTmdbKeywords: (id: number, type: 'movie' | 'series') => Promise<string[]>
  saveVideoKeywords: (id: number, keywords: string[]) => Promise<any>
  getTmdbTrailer: (params: { tmdbId?: number | null; title: string; type: 'movie' | 'series'; year?: number | null; seasonNumber?: number | null; preferLatestSeason?: boolean }) => Promise<any | null>
  getTmdbSeriesCatalog: (tmdbId: number) => Promise<Array<{ seasonNumber: number; episodeNumber: number; name: string; overview: string | null; airDate: string | null; stillPath: string | null; released: boolean }>>
  getIntroDbSegments: (params: { imdbId?: string | null; tmdbId?: number | null; season?: number | null; episode?: number | null; filePath?: string | null; duration?: number | null }) => Promise<{
    imdbId: string | null
    season: number | null
    episode: number | null
    segments: Array<{
      type: 'intro' | 'recap' | 'outro'
      startSec: number
      endSec: number
      confidence: number | null
      submissionCount: number | null
      updatedAt: string | null
      source: 'theintrodb' | 'introdb' | 'chapters'
    }>
    sources: Array<'theintrodb' | 'introdb' | 'chapters'>
    error?: string
  }>
  getPendingSharedMediaTarget: () => Promise<{ type: 'movie' | 'series'; tmdbId: number; source?: any } | null>
  getPendingSharedCollectionTarget: () => Promise<any | null>
  getCollectionShareData: (collectionId: number) => Promise<{ encoded: string; items: number }>
  getCollectionShareFile: (collectionId: number) => Promise<{ filename?: string; json?: string; items?: number; error?: string }>
  openChatShare: (target: 'whatsapp', text: string) => Promise<{ opened: boolean; via?: string; error?: string }>
  importSharedCollection: (payload: any) => Promise<{ imported: boolean; id?: number; matched?: number; addedOnline?: number; total?: number; error?: string }>
  onOpenSharedCollection: (callback: (payload: any) => void) => () => void
  getSharedMediaByTmdbId: (type: 'movie' | 'series', tmdbId: number) => Promise<any | null>
  onOpenSharedMedia: (callback: (target: { type: 'movie' | 'series'; tmdbId: number; source?: any }) => void) => () => void
  toggleFavorite: (id: number) => Promise<number | null>
  toggleWatchlist: (id: number) => Promise<number | null>
  addLocalToWatchlist: (id: number, category: string, priority?: string) => Promise<any>
  addToWatchlistExternal: (item: any) => Promise<any>
  removeFromWatchlistExternal: (tmdbId: number) => Promise<any>
  setWatchlistPriority: (input: { videoId?: number | null; tmdbId?: number | null; isExternal?: boolean; priority: string }) => Promise<any>
  getWatchlist: () => Promise<any[]>
  getFavorites: () => Promise<any[]>
  getCollections: () => Promise<any[]>
  getCollectionMembers: (collectionId: number) => Promise<any[]>
  createCollection: (input: any) => Promise<any>
  updateCollection: (collectionId: number, patch: any) => Promise<any>
  deleteCollection: (collectionId: number) => Promise<boolean>
  reorderCollections: (ids: number[]) => Promise<boolean>
  pinCollectionVideo: (collectionId: number, videoId: number) => Promise<boolean>
  unpinCollectionVideo: (collectionId: number, videoId: number) => Promise<boolean>
  addCollectionExternal: (collectionId: number, item: any) => Promise<any>
  removeCollectionExternal: (externalId: number) => Promise<boolean>
  exportCollection: (collectionId: number) => Promise<{ exported: boolean; canceled?: boolean; filePath?: string; items?: number; error?: string }>
  importCollection: () => Promise<{ imported: boolean; canceled?: boolean; filePath?: string; id?: number; matched?: number; addedOnline?: number; total?: number; error?: string }>
  onUpdateAvailable: (callback: (info: { version: string }) => void) => void
  onUpdateProgress: (callback: (info: { percent: number }) => void) => void
  onUpdateDownloaded: (callback: () => void) => void
  startUpdateDownload: () => Promise<any>
  installUpdate: () => void
  // Torrent download APIs
  searchTMDB: (query: string) => Promise<any[]>
  searchTorrentSources: (title: string, year: string, mediaType: string, tmdbId: number, requestId?: string) => Promise<any[]>
  cancelTorrentSourceSearch: (requestId: string) => Promise<boolean>
  onTorrentSourcesProgress: (callback: (data: any) => void) => () => void
  startTorrentDownload: (magnetUrl: string, title: string, tmdbId?: number, name?: string, media?: { mediaType?: 'movie' | 'series'; season?: number; episode?: number }) => Promise<string | boolean>
  cancelTorrentDownload: (id: string) => Promise<boolean>
  removeDownload: (id: string, deleteFile?: boolean) => Promise<boolean>
  pauseResumeTorrent: (id: string) => Promise<boolean>
  retryTorrentDownload: (id: string) => Promise<boolean>
  getMaxConcurrentDownloads: () => Promise<number>
  setMaxConcurrentDownloads: (value: number) => Promise<number>
  getActiveDownloads: () => Promise<any[]>
  prepareTorrentStream: (id: string) => Promise<{ url?: string; fileName?: string; size?: number; error?: string }>
  startTempStream: (magnetUrl: string, title?: string, options?: { fileIndex?: number; season?: number; episode?: number }) => Promise<{ url?: string; fileName?: string; size?: number; streamId?: string; parsedSeason?: number | null; parsedEpisode?: number | null; error?: string }>
  stopTempStream: (id: string) => Promise<boolean>
  prioritizeTempFiles: (streamId: string, fileIndexes: number[]) => Promise<boolean>
  getTempStreamEpisodes: (streamId: string) => Promise<{ error?: string; episodes?: { index: number; fileName: string; size: number; season: number | null; episode: number | null; isSeasonPack: boolean }[] }>
  onDownloadsChanged: (callback: () => void) => () => void
  onTorrentProgress: (callback: (data: any) => void) => () => void
  // File utilities
  openFolder: (filePath: string) => Promise<boolean>
  getMediaInfo: (filePath: string) => Promise<any>
  getSeekPreviewThumbnail: (filePath: string, time: number) => Promise<string | null>
  openDownloadsFolder: () => Promise<void>
  getDownloadsStorage: () => Promise<{
    path: string
    free: number
    total: number
    used: number
    percentUsed: number
    error?: string
  }>
  getDownloadDir: () => Promise<{
    currentPath: string
    defaultPath: string
    isCustom: boolean
  }>
  setDownloadDir: (dirPath: string) => Promise<{
    currentPath: string
    defaultPath: string
    isCustom: boolean
  }>
  resetDownloadDir: () => Promise<{
    currentPath: string
    defaultPath: string
    isCustom: boolean
  }>
  onDownloadDirChanged?: (callback: (info: { currentPath: string; defaultPath: string; isCustom: boolean }) => void) => () => void
  // OpenSubtitles API
  searchOnlineSubtitles: (params: { query?: string; tmdbId?: number; season?: number; episode?: number; languages?: string; mediaType?: string; videoFilePath?: string }) => Promise<any>
  downloadOnlineSubtitle: (params: { fileId: number; videoFilePath: string; fileName?: string }) => Promise<any>
  minimizeWindow: () => Promise<void>
  restoreWindow: (opts?: { enterFullscreen?: boolean }) => Promise<void>
  setPipThumbar: (payload: { isPlaying: boolean; icons: { play: string; pause: string; back: string; fwd: string } }) => Promise<void>
  clearPipThumbar: () => Promise<void>
  onThumbarCommand: (callback: (command: string) => void) => () => void
  openWebPopup: (url: string, title?: string, autoSearch?: string) => Promise<boolean>
  getDownloadSites: () => Promise<Array<{
    id: string
    name: string
    shortLabel: string
    portalUrl: string
    accent: string
    domain: string | null
    updatedAt: string | null
    manual: boolean
    stale: boolean
  }>>
  resolveDownloadSiteUrl: (siteId: string, title: string, year?: string | number | null) => Promise<{
    siteId: string
    domain: string
    searchUrl: string
    source: 'portal' | 'portal-fallback' | 'manual' | 'cache' | 'remote'
    updatedAt: string | null
    stale: boolean
  }>
  setDownloadSiteDomain: (siteId: string, domain: string) => Promise<{ domain: string; updatedAt: string; manual: boolean }>
  resetDownloadSiteDomain: (siteId: string) => Promise<boolean>
  refreshDownloadSiteDomain: (siteId: string) => Promise<{
    siteId: string
    domain: string
    searchUrl: string
    source: 'portal' | 'portal-fallback' | 'manual' | 'cache' | 'remote'
    updatedAt: string | null
    stale: boolean
  }>
  toggleFullscreen: () => Promise<boolean>
  isFullscreen: () => Promise<boolean>
  closeWindow: () => Promise<void>
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => () => void
  getAppSettings: () => Promise<{ launchFullscreen: boolean; rememberOnlineProgress: boolean; notifyNewEpisodes: boolean; focusTubeEnabled: boolean; showDownloadTray?: boolean; downloadPath?: string; userName?: string; profileImage?: string | null }>
  setUserProfile: (profile: { userName?: string; profileImage?: string | null }) => Promise<{ launchFullscreen: boolean; rememberOnlineProgress: boolean; notifyNewEpisodes: boolean; focusTubeEnabled: boolean; showDownloadTray?: boolean; downloadPath?: string; userName?: string; profileImage?: string | null }>
  setLaunchFullscreen: (launchFullscreen: boolean) => Promise<{ launchFullscreen: boolean; rememberOnlineProgress: boolean; notifyNewEpisodes: boolean; focusTubeEnabled: boolean; showDownloadTray?: boolean; downloadPath?: string }>
  setRememberOnlineProgress: (enabled: boolean) => Promise<{ launchFullscreen: boolean; rememberOnlineProgress: boolean; notifyNewEpisodes: boolean; focusTubeEnabled: boolean; showDownloadTray?: boolean; downloadPath?: string }>
  setNotifyNewEpisodes: (enabled: boolean) => Promise<{ launchFullscreen: boolean; rememberOnlineProgress: boolean; notifyNewEpisodes: boolean; focusTubeEnabled: boolean; showDownloadTray?: boolean; downloadPath?: string }>
  setFocusTubeEnabled: (enabled: boolean) => Promise<{ launchFullscreen: boolean; rememberOnlineProgress: boolean; notifyNewEpisodes: boolean; focusTubeEnabled: boolean; showDownloadTray?: boolean; downloadPath?: string }>
  setShowDownloadTray: (enabled: boolean) => Promise<{ launchFullscreen: boolean; rememberOnlineProgress: boolean; notifyNewEpisodes: boolean; focusTubeEnabled: boolean; showDownloadTray?: boolean; downloadPath?: string }>
  followSeries: (input: { tmdb_id: number; title?: string; poster_path?: string | null; backdrop_path?: string | null; overview?: string | null; season?: number | null; episode?: number | null }) => Promise<{ followed: boolean; isNew?: boolean; hasNewDrop?: boolean; dropSeason?: number; dropEpisode?: number }>
  unfollowSeries: (tmdbId: number) => Promise<{ unfollowed: boolean }>
  getFollowedSeries: () => Promise<any[]>
  markFollowedSeen: (tmdbId: number) => Promise<{ seen: boolean }>
  checkFollowedUpdates: () => Promise<any[]>
  checkSeriesUpdates: (tmdbId: number) => Promise<{ checked: boolean; hasNew?: boolean; season?: number; episode?: number }>
  getStreamProgress: (tmdbId: number, mediaType: string, season?: number | null, episode?: number | null) => Promise<any>
  updateStreamProgress: (entry: any) => void
  getStreamContinueWatching: () => Promise<any[]>
  getStreamHistory: (limit?: number) => Promise<any[]>
  deleteStreamProgress: (tmdbId: number, mediaType: string, season?: number | null, episode?: number | null) => Promise<any>
  onAppSettingsChanged: (callback: (settings: { launchFullscreen: boolean; rememberOnlineProgress: boolean; notifyNewEpisodes: boolean; focusTubeEnabled: boolean; showDownloadTray?: boolean; downloadPath?: string; userName?: string; profileImage?: string | null }) => void) => () => void
  getTmdbReleaseInfo: (id: number, type: 'movie' | 'series') => Promise<import('./types').TmdbReleaseInfo | null>

  // ─── Focus Tube ────────────────────────────────────────────────────────────
  ftListCategories: () => Promise<import('./types').FtCategory[]>
  ftCreateCategory: (name: string, color?: string) => Promise<import('./types').FtCategory>
  ftUpdateCategory: (id: number, name: string, color?: string) => Promise<import('./types').FtCategory>
  ftDeleteCategory: (id: number) => Promise<boolean>
  ftReorderCategories: (ids: number[]) => Promise<boolean>
  ftListChannels: (categoryId?: number | null) => Promise<import('./types').FtChannel[]>
  ftUpsertChannel: (input: { channelId: string; title: string; handle?: string | null; avatarUrl?: string | null; url?: string | null }) => Promise<import('./types').FtChannel>
  ftDeleteChannel: (channelId: string) => Promise<boolean>
  ftSetChannelCategories: (channelId: string, categoryIds: number[]) => Promise<boolean>
  ftSetChannelHideShorts: (channelId: string, hideShorts: boolean) => Promise<boolean>
  ftGetFeed: (options?: import('./types').FtFeedOptions) => Promise<import('./types').FtVideo[]>
  ftGetVideo: (videoId: string) => Promise<import('./types').FtVideo | null>
  ftSetVideoSeen: (videoId: string, seen: boolean) => Promise<boolean>
  ftMarkAllSeen: (categoryId: number | null) => Promise<{ changed: number }>
  ftToggleSaved: (videoId: string, saved: boolean) => Promise<boolean>
  ftGetProgress: (videoId: string) => Promise<{ position: number }>
  ftUpdateProgress: (videoId: string, position: number) => Promise<boolean>
  ftGetCategorySummary: (categoryId: number | null) => Promise<{ unseen: number; latestPublished: string | null }>
  ftRefreshFeeds: (options?: { force?: boolean }) => Promise<{ added: number; channelIds: string[]; failed: string[] }>
  ftResolveChannel: (query: string) => Promise<{ channelId: string; title: string; handle: string | null; avatarUrl: string | null; url: string } | { error: string }>
  ftSearchChannels: (query: string) => Promise<Array<{ channelId: string; title: string; handle: string | null; avatarUrl: string | null; subscriberText: string | null; videoCountText: string | null; descriptionSnippet: string | null }> | { error: string }>
  ftSearchVideos: (query: string, limit?: number) => Promise<import('./types').FtVideo[]>
  ftGetVideoDetails: (videoId: string) => Promise<import('./types').FtVideoDetails>
  ftRefreshChannelAvatars: () => Promise<{ checked: number; updated: number } | { error: string }>
  ftSubscribeChannel: (channel: { channelId: string; title: string; handle?: string | null; avatarUrl?: string | null; url?: string | null }, categoryIds: number[]) => Promise<import('./types').FtChannel | { error: string }>
  ftAddChannel: (query: string, categoryIds: number[]) => Promise<import('./types').FtChannel | { error: string }>
  ftYouTubeImportStatus: () => Promise<import('./types').FtYouTubeImportStatus>
  ftYouTubeImportConnect: () => Promise<import('./types').FtYouTubeImportLoadResult | { error: string; cancelled?: boolean }>
  ftYouTubeImportCancel: () => Promise<boolean>
  ftYouTubeImportSave: (
    channels: import('./types').FtYouTubeImportChannel[],
    categoryAssignments: Record<string, number[]>,
  ) => Promise<{
    added: string[]
    alreadyPresent: string[]
    skipped: string[]
    createdMemberships: Array<{ channelId: string; categoryId: number }>
    undoId: string | null
  } | { error: string }>
  ftYouTubeImportRefresh: (channelIds: string[], requestId: string) => Promise<{ added: number; failed: string[] }>
  ftYouTubeImportDisconnect: () => Promise<{ disconnected: boolean; revoked: boolean }>
  ftYouTubeImportUndo: (undoId: string) => Promise<{
    removedChannels: number
    removedChannelIds: string[]
    removedMemberships: number
    retainedChannels: string[]
  } | { error: string }>
  onFtYouTubeImportProgress: (callback: (progress: { stage: 'authorization' | 'subscriptions'; page?: number; found?: number }) => void) => () => void
  onFtYouTubeImportRefreshProgress: (callback: (progress: import('./types').FtYouTubeImportRefreshProgress) => void) => () => void
  ftRecordPlayback: (videoId: string, observation: { duration?: number | null; ended?: boolean }) => Promise<{ ok: boolean }>
  ftMarkNotEmbeddable: (videoId: string) => Promise<{ ok: boolean }>
  ftGetSponsorSegments: (videoId: string) => Promise<{ segments: Array<{ category: string; start: number; end: number }> }>
  ftGetComments: (videoId: string, options?: { sortBy?: 'top' | 'new'; continuation?: string | null }) => Promise<{ comments: import('./types').FtComment[]; continuation: string | null; commentCount: number | null; disabled: boolean } | { error: string }>
  ftSetFrameQuality?: (quality: string) => Promise<{ ok: boolean; error?: string }>
  ftGetFrameQuality?: () => Promise<{ quality: string | null; available?: string[] }>
  ftSeekFrame?: (seconds: number, play?: boolean) => Promise<{ ok: boolean; error?: string }>
  ftGetAmbientFrame?: (bounds?: { x: number; y: number; width: number; height: number }) => Promise<{ dataUrl: string | null }>
  ftRequestImportAccess: (input: { name: string; email: string }) => Promise<{ ok?: boolean; message?: string; error?: string }>
  onFeedUpdated: (callback: (payload: { added: number; channelIds: string[] }) => void) => () => void
  ftOpenPip: (payload: any) => Promise<boolean>
  ftClosePip: () => Promise<void>
  ftRestorePip: (payload?: any) => Promise<void>
  ftGetPipState: () => Promise<any>
  ftSyncPipState: (state: any) => Promise<void>
  onFtPipInit: (callback: (payload: any) => void) => () => void
  onFtPipSync: (callback: (state: any) => void) => () => void
  onFtPipClosed: (callback: (state: any) => void) => () => void

}

declare global {
  interface Window {
    electron: typeof electronAPI
    api: Api
    controlsTimeout: any
  }
}
