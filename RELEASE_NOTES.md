# MyCinema v1.5.0 🚀

A major update that brings an all-new metadata backend, massive reliability fixes, and enhanced hardware control.

### 🌟 Features
- **TMDB Migration**: Transitioned the primary metadata provider to TMDB (The Movie Database) for more reliable, accurate, and high-quality artwork and synopses.
- **Headphone Control**: Full integration with the MediaSession API to support play/pause from bluetooth headsets and keyboard media buttons.
- **Detail Screen Navigation**: Quick exit from the Cinematic Detail Screen utilizing standard mouse back/forward buttons.

### 🛠️ Improvements & Fixes
- **Flawless Thumbnails**: Resolved tricky Chromium caching race conditions that blocked image rendering. Now every video—including personal recordings and offline files—securely generates a preview snapshot without silently failing.
- **Improved Metadata Scanning**: Polished the metadata scanning logic and UI aesthetics to ensure a consistent, beautiful library.
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
