# MyCinema - Offline OTT Platform

An offline-first desktop application for locally stored movies and TV series, built with Electron, React, Tailwind CSS, and SQLite.

## Features

- **Folder Scanning**: Recursively scan local folders for video files.
- **Auto-Parsing**: Detects movies and TV shows (S01E01 pattern).
- **Metadata Fetching**: Automatically fetches poster and info from OMDb API.
- **Internal Player**: Smooth playback with seek, fullscreen, and subtitle support.
- **Progress Tracking**: Automatically resumes where you left off.
- **Continue Watching**: Netflix-inspired dashboard for active content.
- **Series Handling**: Group episodes by season and auto-play next.

## Tech Stack

- **Framework**: Electron + React (Vite)
- **Styling**: Tailwind CSS
- **Database**: SQLite (better-sqlite3)
- **Metadata**: OMDb API
- **Icons**: Lucide React

## Setup Instructions

1. **Clone/Download** the project.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Configure API Key**:
   - Create a `.env` file from `.env.example`.
   - Add your OMDb API Key from [omdbapi.com](http://www.omdbapi.com/).
4. **Development**:
   ```bash
   npm run dev
   ```
5. **Build Executable**:
   ```bash
   npm run build
   npm run dist:local
   ```

For public Windows releases, configure code signing first and use `npm run dist` or `npm run release:publish`. See `docs/WINDOWS_CODE_SIGNING.md`.
If signing credentials are unavailable and the project owner explicitly approves an unsigned GitHub release, use `npm run release:publish:unsigned` and expect Windows publisher warnings.

## Project Workflow

When reporting a problem, bug, issue, or feature, use `docs/DELIVERY_WORKFLOW.md`. It defines the gate-by-gate process for analysis, branch setup, implementation, verification, user acceptance, and the handoff to release.

For deployment or release, start with `docs/release/00-release-map.md` after all implementation items are accepted.

## Folder Structure

- `src/main/`: Electron main process (database, scanner, API logic).
- `src/preload/`: Bridge between main and renderer processes.
- `src/renderer/`: React frontend application.
- `src/renderer/src/components/`: Reusable UI components.
- `src/renderer/src/pages/`: Main application views.

## Usage

1. Click "Add Folder" in the sidebar.
2. Select your root directory containing movies and TV shows.
3. Wait for the background indexing to complete.
4. Enjoy your offline media library!
