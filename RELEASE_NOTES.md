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
