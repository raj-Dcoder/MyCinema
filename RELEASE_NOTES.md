# MyCinema v1.21.0

Feature release focused on faster source discovery, a warmer home startup, and more reliable playback controls.

### Source Discovery
- **Progressive Source Search**: Download and detail-page source panels now update as providers finish instead of waiting for every torrent source to complete.
- **Broader Provider Coverage**: Source search now checks YTS or EZTV, Torrentio, MediaFusion, KnightCrawler, 1337x, APIBay, SolidTorrents, and Bitsearch with shared filtering and de-duplication.
- **Cached Source Results**: Recent source results can appear immediately while the app refreshes providers in the background.

### Home & Discovery
- **Instant Home Snapshot**: Home restores the last populated continue-watching, recent, trending, and featured rows from local storage while fresh data loads.
- **Scrollable Trending Rails**: Trending This Week and Trending in India now use horizontal rails so more titles remain browsable without crowding the page.
- **Stronger India Trending**: India discovery now mixes watchable movies and series, regional signals, daily trending, title logos, and stale cache fallback.

### Playback & Downloads
- **Safer Boost Rendering**: FPS and quality boost canvases only take over when they are actively rendering, so native video remains visible on render failures.
- **Cleaner Audio Track Startup**: Embedded audio loading waits for video metadata and keeps native and external tracks labeled more consistently.
- **Better Download Names**: Downloads preserve the selected source title, display added-time ordering, and show paused or pending states more clearly.

### Security & Privacy
- **Scoped IPC Listeners**: Library and torrent-source progress listeners now return cleanup callbacks so pages can unsubscribe without clearing unrelated listeners.
- **Network Timeout Guardrails**: TMDB and torrent provider requests use explicit timeouts and fallback paths, reducing stuck network work without exposing secrets.
- **Safer Media Ranges**: Local media range requests now reject invalid byte ranges with a proper 416 response instead of attempting unsafe reads.

***

# MyCinema v1.20.0

Feature release focused on more resilient downloads, better source picking, watchlist category flow, and cleaner fullscreen playback.

### Downloads
- **Retry Failed Downloads**: Failed torrent downloads now show a Retry action that clears the failed session and restarts from the saved magnet.
- **Storage Overview**: The Download page now displays free and total space for the MyCinema downloads folder with a refreshable usage bar.
- **Live Search Cache**: Download search now debounces TMDB lookups, reuses recent search results, and avoids clearing the interface with repeated requests.

### Source Selection
- **Health-Based Source Sorting**: Download and detail-page source lists now use shared seed, peer, and quality scoring so healthier sources appear first.
- **Episode Filters**: Series source browsing can now narrow results by season and episode, while season packs remain available separately.
- **Speed Labels**: Source rows now show FAST, GOOD, OK, or SLOW labels based on seed availability.

### Watchlist & Library
- **Save To Category From Details**: Detail pages now let users choose an existing watchlist category or create a new one before saving a title.
- **Watchlist Refresh Fix**: The Watchlist tab refreshes after detail-page changes, so newly saved or removed titles appear without reopening the app.
- **Sharper Remote Artwork**: TMDB posters and cards now request higher-resolution image sizes for cleaner browsing.

### Playback
- **Better Fullscreen Targeting**: The player now requests fullscreen on the player shell, keeping boosted renderers and controls aligned.
- **Aspect-Ratio Contain Fix**: Contain mode now sizes the video surface from the real video aspect ratio instead of stretching every file to the viewport.
- **Subtitle Position Polish**: Subtitles move higher when controls are visible and settle lower when controls are hidden.

### Security & Privacy
- **Safer Torrent Retry Cleanup**: Retrying a failed download destroys any previous active or duplicate torrent instance before restarting it.
- **Tracker Enrichment Without Extra User Data**: Magnets are enriched with public tracker announce URLs for reliability while keeping downloads in the local MyCinema downloads folder.
- **Storage Read Errors Stay Local**: Download storage checks return local status and error text through IPC without exposing paths outside the app UI.

***

# MyCinema v1.19.3

Patch release focused on Watch Together stability and lower TMDB usage on app launch.

### Watch Together
- **Popup Dismissal Fix**: Host Party, Join, copy, disconnect, and room-code input clicks no longer bubble into the video player and close the Watch Together popup.
- **Safer Player Interaction**: Watch party controls now stay isolated from the player click handler that closes other player popups.

### Home Discovery
- **Persistent TMDB Cache**: Trending movies, trending series, India OTT rows, and India OTT provider IDs now cache to disk for 12 hours.
- **Lower Startup Traffic**: Reopening MyCinema from the shortcut reuses fresh cached TMDB lists instead of refetching them every launch.

### Security & Privacy
- **Local Cache Only**: TMDB list caches are stored in the app's local user data folder and refresh automatically after expiry or unreadable cache data.
- **Quota Protection**: Successful discovery responses are reused across restarts to reduce unnecessary TMDB API calls.

***

# MyCinema v1.19.2

Patch release focused on YouTube trailer reliability inside the desktop app.

### Trailer Playback
- **YouTube Error 153 Fix**: Trailer embeds now include a consistent app origin and referrer context to prevent the YouTube player configuration error screen.
- **Stuck Spinner Fix**: YouTube player API calls now keep their natural headers, preventing trailers from loading the correct title while staying stuck at `0:00`.
- **Cleaner Trailer Reloads**: The trailer iframe now remounts when the selected embed URL changes, avoiding stale player state after switching trailers.

### Security & Privacy
- **Scoped Embed Headers**: Only YouTube embed page requests get app `Origin` and `Referer` details; internal playback calls are no longer rewritten.
- **Safe External Fallback**: The existing YouTube button remains the external viewing path when a trailer cannot play in-app.

***

# MyCinema v1.19.0

Feature release focused on user data portability, a unified categorized watchlist, and a more compact settings experience.

### Backup & Restore
- **JSON Backup Export**: Users can export watched folders, watchlist entries, watchlist categories, and favorites to a local JSON backup file.
- **Backup Import**: Import restores saved folders, rescans existing paths, and brings back watchlist items, categories, and favorites after a reset.
- **Local-Only Control**: Backup files are written only to the location selected by the user.

### Unified Watchlist
- **One Watchlist System**: Download-page saved lists now migrate into the main Watchlist tab instead of living separately.
- **Category Rows**: The Watchlist tab now displays saved titles in category-based horizontal rows.
- **Save From Anywhere**: Home search, hero actions, Download search, and Watchlist search all save into the same categorized watchlist.

### Settings Polish
- **Compact Settings Layout**: Settings now uses smaller rows, buttons, folder entries, and headings for easier scanning.
- **Clear Backup Actions**: Import and export controls now use directionally correct icons and clearer status messages.

### Security & Privacy
- **Backup Validation**: Imports verify the MyCinema backup format before changing app data.
- **Path-Aware Restore**: Folder imports skip missing paths safely and report them instead of failing the whole restore.
- **No Media Copying**: Backups store app metadata only; movie and show files remain on the user’s drives.

***

# MyCinema v1.18.0

Focused feature and safety release for immersive fullscreen startup, cleaner source filtering, trailer reliability, and safer download cleanup.

### Immersive App
- **Launch Fullscreen Setting**: MyCinema can now start directly in fullscreen, with the preference saved in app settings.
- **Top-Edge Fullscreen Control**: A compact fullscreen control appears at the top edge when launch fullscreen is enabled.
- **Settings Toggle**: The Settings page now includes an Open in Fullscreen switch so users can change startup behavior without editing files.

### Source Browsing
- **Hindi Audio Filter**: Detail page source results can now be filtered to Hindi-only releases.
- **Season Filters**: Series source results can be narrowed to season packs or a specific season.
- **Seed Health Sorting**: Source results are sorted by seed health, and filtered empty states now explain when no source matches the active filters.

### Security & Privacy
- **Stricter YouTube Embed Posture**: Trailer embeds now use an explicit origin and strict referrer behavior for more predictable browser navigation.
- **Safer Download Cleanup**: Paused download deletion now normalizes paths, narrows file targets, and falls back to matching top-level download folders instead of broad removal.
- **Library Refresh After Delete**: Removing downloaded files refreshes local library entries so stale videos disappear more reliably.

***

# MyCinema v1.17.0 🚀

Focused feature release for faster discovery, smarter trailers, cleaner detail pages, and playback polish.

### 🔎 Faster Search
- **Live Home Search**: The Home search button now expands into a search bar and shows movie/series results while the user types.
- **Quick Detail Opening**: Search results already carry poster, overview, rating, year, and TMDB ID so detail pages open with useful information immediately.
- **Safer Dismissal**: Clicking outside the search panel now closes it first instead of accidentally opening the hero or a card behind it.

### 🎬 Better Detail Pages
- **Title Logos**: Detail pages now prefer official TMDB logo artwork instead of plain text titles when a logo exists.
- **Sharper Posters, Faster Load**: Posters use a high-quality but lighter TMDB image size, improving load time without changing the vertical poster layout.
- **Moctale Shortcut**: Added a Moctale button that opens the matching movie/series page in the browser for public reviews and discussion.
- **Cleaner Badges**: Removed hardcoded 4K and audio labels that were shown on every title.

### ▶️ Smarter Trailers
- **Season-Aware Trailers**: Series trailers can switch by season from the trailer player.
- **Wrong Video Protection**: Trailer picking now avoids blocked videos, unrelated YouTube results, vertical episode clips, and episode-specific trailers.
- **Faster Trailer Switching**: Trailer results are cached and the old YouTube player is removed immediately while a new season trailer loads.

### 🎧 Playback Fixes
- **Upside-Down Video Fix**: Corrected boosted rendering paths that could display some videos upside down.
- **Popup Click Fix**: Clicking outside player menus now closes the menu without toggling play/pause.
- **Subtitle Selection Fix**: Fixed a UI glitch where subtitle Off and an external subtitle could both appear selected.
- **Better Audio Boost**: Reworked audio boost into richer profiles with bass, dialogue, air, compression, and limiting.

### 🪟 Release UI
- **Compact What's New Popup**: The first-launch release popup is now smaller, centered, cleaner, and written in plain language.

***

# MyCinema v1.16.0 🚀

Feature release focused on a cinematic Home experience, cleaner update control, and stronger playback polish.

### 🎬 Home & Discovery
- **Cinematic Home Hero**: Rebuilt the Home hero into a full-bleed visual experience with tuned image framing and a more polished content layout.
- **Official TMDB Title Logos**: Hero titles now prefer TMDB logo artwork when available instead of plain text headings.
- **India OTT Trending Row**: Added a dedicated trending rail for popular India OTT releases.
- **Richer Continue Watching Cards**: Cards now surface more useful watch details by default while keeping quick actions clean.
- **Smarter Series Grouping**: Series cards now resolve around the most relevant in-progress episode state more consistently.

### 🔄 Update Experience
- **Manual Update Downloads**: New app updates are detected without auto-downloading, giving users explicit control over when downloads begin.
- **Collapsed Sidebar Update Signal**: Even with the sidebar collapsed, users now see a compact update icon that reflects available, downloading, and ready states.
- **Refined What's New Modal**: First launch after installing v1.16.0 now shows a cleaner, more polished release summary modal built specifically for this version.

### 🎥 Playback & Rendering
- **Aspect-Aware Boost Renderers**: FPS Boost and Quality Boost renderers now handle contain and cover modes more reliably across canvas sizing changes.
- **Improved External Audio Sync**: External audio tracks re-prime and re-sync more cleanly around seeks, resumes, and playback transitions.
- **Subtitle Refresh Stability**: Subtitle rendering now updates more consistently during active playback.

### 🛠️ UI Polish
- **Refined Media Cards**: Poster and library cards now expose stronger visual detail and action clarity.
- **Hero Search Simplification**: The oversized hero search field was reduced to a compact icon treatment to preserve visual space.

***

# MyCinema v1.15.4 🚀

Focused patch release for AI Boost control and player interaction polish.

### 🎥 AI Boost
- **Separate Sharpness & Vibrance Controls**: AI Boost now lets users turn sharpness and vibrance on independently for different video situations.
- **Persisted Individual Preferences**: Sharpness and vibrance each save their own setting, with a clean migration from the older combined AI Enhance preference.
- **Shader-Level Control**: The quality renderer now passes separate uniforms for sharpening and vibrance/color processing while preserving the existing enhancement strength.

### 🛠️ Player Fixes
- **AI Boost Menu No Longer Toggles Playback**: Opening the AI Boost pop-up or tapping its controls no longer pauses a playing video or starts a paused one.
- **Updated What's New Pop-up**: First launch after installing v1.15.4 shows a one-time summary of these AI Boost and playback improvements.

***

# MyCinema v1.15.3 🚀

Focused patch release for refreshed app branding.

### 🎬 Branding
- **New App Logo**: Updated the in-app MyCinema logo to the supplied gradient film-mark artwork.
- **New Windows App Icon**: Regenerated the packaged `.ico` app icon from the same source image for installer, desktop, and taskbar usage.
- **Consistent Release Assets**: Aligned renderer, favicon, and build resource images so the app presents one consistent identity.

***

# MyCinema v1.15.2 🚀

Focused patch release for updater visibility and install reliability.

### 🔄 Auto Update Fixes
- **Visible Update Progress Restored**: The in-app update panel now clearly shows when a new version is available, when it is downloading, and when it is ready to install.
- **Explicit Restart & Install Flow**: Updates no longer silently try to install on app quit. Users now get a clear restart-and-install action after download completes.
- **Safer Update Relaunch**: The install path now avoids getting blocked by unrelated quit prompts during the final restart step.

***

# MyCinema v1.15.1 🚀

A massive performance and feature update focused on playback fidelity and system integration.

### 📂 Native System Integration
- **External Playback Support**: You can now open any video file directly with MyCinema from your File Explorer. The app handles single-instance locking and transitions seamlessly to the player.
- **Smart Path Guard**: Improved security whitelisting for external files and ad-hoc media loading.

### 🎥 AI & Hardware Enhancements
- **FPS Boost & AI Enhance**: Experience smoother motion and sharper details with integrated real-time frame interpolation and quality boost renderers.
- **GPU-Accelerated Audio**: Faster and smoother playback for videos with external audio tracks using D3D11 hardware acceleration.

### 🕒 Pro Subtitle Suite
- **Online Subtitle Search**: Directly search and download subtitles from OpenSubtitles within the player interface.
- **Precise Subtitle Sync**: New timing controls to fix out-of-sync subtitles with millisecond precision (±ms).

### 🛠️ Performance & Maintenance
- **Chunked Media Protocol**: Optimized 5MB chunk-based streaming for zero-lag seeking and improved I/O performance.
- **Library Auto-Pruning**: Automatically cleans up library entries for files that have been moved or deleted from your system.
- **Hindi Content Detection**: Improved heuristics for detecting and tagging Hindi language content in the library.

***

# MyCinema v1.14.0 🚀

A massive update introducing collaborative watching, real-time trends, and high-fidelity audio processing.

### 🤝 Watch Together (BETA)
- **Synchronized Playback**: Host a room and invite friends to watch the same video in perfect sync. Controls (play/pause/seek) are shared across all participants in real-time.
- **Room Discovery**: Simple room ID system for quick connections without complex setup.

### 🎥 Enhanced YouTube & Media Engine
- **YouTube Deep Linking**: Integrated native URI schemes to automatically open and resume YouTube content in the official application.
- **Audio Boost Engine**: Professional-grade Web Audio API implementation with Bass Boost, Clarity Filters, and Dynamic Compression for a cinematic soundstage.

### 📈 Smart Dashboard & Trends
- **TMDB Integration**: The Home screen now features real-time "Trending This Week" sections for both Movies and Web Series.
- **Rich Metadata**: High-fidelity posters, ratings, and genre tags automatically fetched for your entire library.

### 🕒 Pro Navigation
- **Subtitle Sync**: Added precise timing controls (±ms) to fix out-of-sync subtitles on the fly.
- **Online Subtitle Search**: Directly search and download subtitles from OpenSubtitles within the player.

***

# MyCinema v1.13.1 🚀

- **Magnet Discovery Fixed**: Restored stable magnet fetching logic for high reliability.
- **Download Stability**: Enabled DHT for faster peer discovery and improved download speeds.

***

# MyCinema v1.6.0 🚀

A monumental update that introduces true P2P downloading capabilities, completely overhauls the security model, and levels up the cinematic experience.

### 🌟 Features
- **P2P Download Engine**: Integrated WebTorrent with a beautiful side-panel UI for searching, streaming, and downloading movies and TV series effortlessly. Includes a brand-new introductory Grand Showcase tour.
- **Advanced Torrent Aggregation**: Dynamic search and filtering for High-Def releases across multiple high-performance trackers (YTS, EZTV) with node-based DNS-over-HTTPS fallback to bypass ISP blocks.
- **Persistent Download Management**: Your active, paused, and failed downloads are beautifully tracked and persist across app restarts automatically.

### 🛡️ Security & Privacy Audit
- **Strict Protocol Containment**: Removed `bypassCSP` loopholes from custom media protocols to completely mitigate cross-site scripting (XSS) risks.
- **Path Traversal Protection**: Implemented rigorous whitelisting for all renderer-to-main file handlers, strictly limiting read access to user-selected libraries and application paths.
- **Safe External Links**: Validated and secured UI external links to prevent `javascript:` or `file:` URL payloads.
- **Local Network Obfuscation**: Disabled DHT and LSD in the WebTorrent configuration by default. Your IP and local network activity are completely hidden during downloads.
- **Optimized P2P Connections**: Reduced router overload by capping WebTorrent conns while injecting high-speed public trackers to maximize speed.

***

# MyCinema v1.5.0 🚀

A major update that brings an all-new metadata backend, massive reliability fixes, and enhanced hardware control.

### 🌟 Features
- **TMDB Migration**: Transitioned the primary metadata provider to TMDB (The Movie Database) for more reliable, accurate, and high-quality artwork and synopses.
- **Headphone Control & Navigation**: Full integration with the MediaSession API to support play/pause from bluetooth headsets/media buttons.
- **Detail Screen Navigation**: Quick exit from the Cinematic Detail Screen utilizing standard mouse back/forward buttons.

### 🛠️ Improvements & Fixes
- **Flawless Thumbnails**: Resolved tricky Chromium caching race conditions that blocked image rendering. Now every video securely generates a preview snapshot without silently failing.
- **Real-Time Video Scrubbing**: Removed CSS translation lag, delivering instant 1:1 timeline scrubbing while dragging the seekbar.

***

# MyCinema v1.4.0 🚀

A major update bringing a cinematic experience to your desktop.

### 🌟 Features
- **Cinematic Detail Screen**: Immersive backdrop gradients, glassmorphism, and full series episode management.
- **Redesigned Video Player**: Premium side panel for audio/subtitle selection and modernized controls.
- **Intelligent Navigation**: Context-aware clicks (Detail Screen for discovery, Direct Play for resume).
- **Pro Player Controls**: Precise 0.10x speed increments, 5X fast-forward, and remapped shortcuts.
- **Mouse Navigation**: Added support for mouse "back" buttons to quickly exit the player.

### 🛠️ Improvements & Fixes
- **ISP-Agnostic Metadata**: Integrated DNS-over-HTTPS (DoH) to bypass ISP filtering.
- **Ultra-Fast Library**: Enhanced 3-layer caching (Database, Metadata Sidecar, Disk Image) for instant loading.
- **Smart Scanner**: Improved heuristics for movie sequel detection and series identification.
- **UI Refinements**: Fixed home screen cropping, improved blur effects, and "genzy" finish-time estimates.
- **Aspect Ratio Magic**: Robust `object-fit` logic ensuring perfect playback for all content formats.

### 🧹 Maintenance
- Added "Clear Data" utility to reset application state.
- Codebase cleanup and removal of legacy components.
