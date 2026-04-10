# MyCinema v1.6.0 🚀

A monumental update that introduces true P2P downloading capabilities, completely overhauls the security model, and levels up the cinematic experience.

### 🌟 Features
- **P2P Download Engine**: Integrated WebTorrent with a beautiful side-panel UI for searching, streaming, and downloading movies and TV series effortlessly. Includes a brand-new introductory guide.
- **TMDB Migration**: Transitioned the primary metadata provider to TMDB (The Movie Database) for more reliable, accurate, and high-quality artwork and synopses.
- **Headphone Control & Navigation**: Full integration with the MediaSession API to support play/pause from bluetooth headsets/media buttons, and quick exit from the Detail Screen utilizing standard mouse back/forward buttons.

### 🛡️ Security & Privacy Audit
- **Strict Protocol Containment**: Removed `bypassCSP` loopholes from custom media protocols to completely mitigate cross-site scripting (XSS) risks.
- **Path Traversal Protection**: Implemented rigorous whitelisting for all renderer-to-main file handlers, strictly limiting read access to user-selected libraries and application paths.
- **Safe External Links**: Validated and secured UI external links to prevent `javascript:` or `file:` URL payloads.
- **Local Network Obfuscation**: Disabled DHT and LSD in the WebTorrent configuration by default. Your IP and local network activity are completely hidden during downloads.

### 🛠️ Improvements & Fixes
- **Flawless Thumbnails**: Resolved tricky Chromium caching race conditions that blocked image rendering. Now every video securely generates a preview snapshot without silently failing.
- **Real-Time Video Scrubbing**: Removed CSS translation lag, delivering instant 1:1 timeline scrubbing while dragging the seekbar.
- **Optimized P2P Connections**: Reduced router overload by capping WebTorrent conns while injecting high-speed public trackers to maximize speed.

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
