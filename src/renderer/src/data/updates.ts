// =============================================================================
// MYCINEMA APP UPDATES & CHANGELOG
// =============================================================================
//
// HOW TO ADD A NEW UPDATE:
// Simply add a new release object to the TOP of the APP_UPDATES array below.
//
// Example:
// {
//   version: 'v1.46.0',
//   date: 'November 2026',
//   summary: 'Direct search improvements and playback fixes.',
//   updates: [
//     { title: 'Search Filter', description: 'Added direct search filter.', category: 'Focus Tube' },
//     // OR in simplest string format:
//     // 'Speed Boost: 2x faster queue loading'
//   ]
// },
// =============================================================================

export interface ReleaseUpdateItem {
  title: string
  description?: string
  category?: string
  type?: 'feature' | 'improvement' | 'fix' | 'security' | string
}

export type UpdateInput = string | ReleaseUpdateItem

export interface AppRelease {
  version: string
  date?: string
  summary?: string
  isLatest?: boolean
  updates: UpdateInput[]
}

export function normalizeUpdate(item: UpdateInput, defaultCategory = 'General'): ReleaseUpdateItem {
  if (typeof item === 'string') {
    const colonIdx = item.indexOf(':')
    if (colonIdx > 0 && colonIdx < 60) {
      return {
        title: item.slice(0, colonIdx).trim(),
        description: item.slice(colonIdx + 1).trim(),
        category: defaultCategory
      }
    }
    return {
      title: item.trim(),
      description: '',
      category: defaultCategory
    }
  }
  return item
}

export const APP_UPDATES: AppRelease[] = [
  {
    "version": "v1.48.0",
    "summary": "Atmospheric Lighting & Signature Accent Studio with live interactive preview, in-player theater ambilight modes, auto-repaired download file paths, and bundled onboarding feature demo video.",
    "updates": [
      {
        "title": "Atmospheric Studio with Live Preview",
        "description": "Fine-tune dynamic ambient halo glow, diffusion spread, and saturation chroma with real-time reactive feedback in Settings > Appearance.",
        "category": "Atmospheric Lighting & Accent Studio"
      },
      {
        "title": "Signature Color Accents",
        "description": "Personalize your cinema interface with bespoke color tones including Voltage Amber, Crimson, Cyber Teal, Neon Emerald, and Midnight Violet.",
        "category": "Atmospheric Lighting & Accent Studio"
      },
      {
        "title": "Decoupled Interactive Controls",
        "description": "Style buttons adaptively or assign independent signature colors so controls stay sharp and legible across all themes.",
        "category": "Atmospheric Lighting & Accent Studio"
      },
      {
        "title": "In-Player Theater Ambilight",
        "description": "Choose your preferred immersion level during video playback between Blackout, Soft Halo, or dramatic Pause Aura.",
        "category": "Atmospheric Lighting & Accent Studio"
      },
      {
        "title": "Organic Breathing & Ambient Details",
        "description": "Optional gentle organic breathing pulse for ambient backdrops, plus matching ambient color wash on detail pages.",
        "category": "Atmospheric Lighting & Accent Studio"
      },
      {
        "title": "Embedded Feature Demo Video",
        "description": "What's New modal now features a high-definition 16:9 demo video with instant playback, custom scrubber controls, audio toggle, and fullscreen support.",
        "category": "Onboarding Feature Demo Video"
      },
      {
        "title": "Optimized Video Footprint",
        "description": "Demo media is compressed with fast-start streaming headers, loading instantly with zero buffering or memory drag.",
        "category": "Onboarding Feature Demo Video"
      },
      {
        "title": "FocusTube Native Ambilight Sampling",
        "description": "Ambient glow for web video player now captures native page frames with low-overhead throttles and timeout guards.",
        "category": "Player & Streaming Polish"
      },
      {
        "title": "High-Resolution 1.5x Streaming",
        "description": "Optimized buffer cushions and TCP socket management prevent hitching and audio-video drift at higher playback speeds.",
        "category": "Player & Streaming Polish"
      },
      {
        "title": "FocusTube Backup Integrity",
        "description": "User backup and restore routines now fully safeguard session history and channel metadata across devices.",
        "category": "Player & Streaming Polish"
      },
      {
        "title": "Incomplete Path Auto-Repair",
        "description": "Database and file system automatically detect and heal `.part` file extensions for completed downloads.",
        "category": "Download Engine & Library Reliability"
      },
      {
        "title": "Scanner Pre-Filter",
        "description": "Scanner ignores unfinished download fragments (`.part`, `.crdownload`, `.!ut`) until downloads are completely finalized on disk.",
        "category": "Download Engine & Library Reliability"
      },
      {
        "title": "Strict Media Protocol Boundaries",
        "description": "Content Security Policy now explicitly secures media scheme endpoints (`media:`, `blob:`, `data:`) to prevent untrusted resource injection.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.47.0",
    "summary": "All-new high-contrast Light Theme alongside classic Dark Mode, clickable hero carousel navigation, smart next-episode queueing, and monotonic download progress engine.",
    "updates": [
      {
        "title": "Light & Dark Theme Toggle",
        "description": "Easily switch between a calm, warm paper Light Theme and the deep cinematic Dark Theme under Settings > Appearance.",
        "category": "Theme & Visual Experience"
      },
      {
        "title": "Universal Theme Harmony",
        "description": "Refined colors, typography, badges, and card contrast across Home, Details, Collections, Downloads, Updates, and Settings in both themes.",
        "category": "Theme & Visual Experience"
      },
      {
        "title": "Cinema Immersion Preservation",
        "description": "Video playback and theater surfaces remain locked to pure cinema dark for maximum contrast and zero distraction during viewing.",
        "category": "Theme & Visual Experience"
      },
      {
        "title": "Floating Controls Polish",
        "description": "Window controls and dialogs adapt seamlessly to light and dark backgrounds with crisp contrast.",
        "category": "Theme & Visual Experience"
      },
      {
        "title": "Clickable Carousel Navigation",
        "description": "Tap any navigation dot in the Hero Carousel to jump straight to that featured title.",
        "category": "Home & Carousel Polish"
      },
      {
        "title": "Smart Next Episode Queuing",
        "description": "Series now automatically queue the next unwatched episode in Continue Watching with distinct \"Next Episode\" badges and direct play actions.",
        "category": "Home & Carousel Polish"
      },
      {
        "title": "Prioritized Resume Ordering",
        "description": "Recently watched content and newly dropped episodes are sorted with higher prominence so you never lose your spot.",
        "category": "Home & Carousel Polish"
      },
      {
        "title": "Monotonic Progress Tracking",
        "description": "Download progress calculation now uses authoritative HTTP byte-range and content-length headers, eliminating fluctuating percentages and erroneous size jumps.",
        "category": "Download Engine Reliability"
      },
      {
        "title": "Real-Time Memory Cache",
        "description": "Active download state syncs instantly from memory cache to UI components without waiting on database write throttles.",
        "category": "Download Engine Reliability"
      },
      {
        "title": "Smooth Progress Bars",
        "description": "Download cards and trays feature monotonic clamped progress animations that transition smoothly from 0% to 100%.",
        "category": "Download Engine Reliability"
      },
      {
        "title": "Secure Download Cache Eviction",
        "description": "Cancelling or removing downloads immediately evicts in-memory stream records and disk handles, preventing memory leaks and orphaned file fragments.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.46.0",
    "summary": "Dedicated in-app updates and changelog tab, smart torrent title parsing with modular download queue, real-time download and library cleanup synchronization, and refined Focus Tube cards.",
    "updates": [
      {
        "title": "Dedicated Updates Tab",
        "description": "Added an Updates tab directly above Settings to browse the complete release history, search changes, filter by version, and view category tags.",
        "category": "In-App Updates & Changelog"
      },
      {
        "title": "What's New Integration",
        "description": "Jump directly from the What's New dialog to the full changelog at any time with a single click.",
        "category": "In-App Updates & Changelog"
      },
      {
        "title": "Automated Changelog Synchronization",
        "description": "Built an automated parser to keep in-app release logs permanently synchronized with official release notes.",
        "category": "In-App Updates & Changelog"
      },
      {
        "title": "Intelligent Title Parsing",
        "description": "Torrent and download names are automatically parsed into clean media titles, release years, season/episode numbers, quality, source, and audio tags.",
        "category": "Download Queue & Smart Parsing"
      },
      {
        "title": "Modular Download Queue",
        "description": "Revamped the active downloads interface with real-time progress indicators, search filtering, and storage usage breakdowns.",
        "category": "Download Queue & Smart Parsing"
      },
      {
        "title": "Clean State Synchronization",
        "description": "Deleting downloaded files or library entries automatically purges corresponding download records so the downloads view stays clean.",
        "category": "Download Queue & Smart Parsing"
      },
      {
        "title": "Reliable Download Retries",
        "description": "Retrying a failed download completely resets transfer progress and speed before queuing for a fresh start.",
        "category": "Download Queue & Smart Parsing"
      },
      {
        "title": "Enhanced Video Cards",
        "description": "Video cards now display creator channel avatars, formatted view counts, relative timestamps, and a 3-dot context menu for quick actions.",
        "category": "Focus Tube & Theater Enhancements"
      },
      {
        "title": "Quick Card Actions",
        "description": "Mark videos as watched or unwatched, copy video links, or open on YouTube directly from any card.",
        "category": "Focus Tube & Theater Enhancements"
      },
      {
        "title": "Smooth Theater Panel Transitions",
        "description": "Eased sidebar collapse and expand animations to 500ms for a seamless widescreen viewing experience.",
        "category": "Focus Tube & Theater Enhancements"
      },
      {
        "title": "Series Metadata Caching",
        "description": "Scanner caches TMDB show metadata across multi-episode folders, dramatically speeding up library scans and avoiding redundant requests.",
        "category": "Library Scanning & Metadata Reliability"
      },
      {
        "title": "High-Quality Poster Selection",
        "description": "Series cards prioritize official TMDB artwork over generic video snapshots.",
        "category": "Library Scanning & Metadata Reliability"
      },
      {
        "title": "Reliable Database ID Resolution",
        "description": "Database operations now use transactional ID resolution to ensure robust video tracking during library updates.",
        "category": "Library Scanning & Metadata Reliability"
      },
      {
        "title": "Focused Sidebar",
        "description": "Streamlined sidebar navigation by retiring legacy History and Favorites tabs in favor of unified Watchlist and Collections.",
        "category": "Navigation Streamline"
      },
      {
        "title": "Orphaned Metadata Cleanup",
        "description": "Deleting video files purges associated download records and cache entries from local SQLite databases without retaining lingering tracker data.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.45.0",
    "summary": "Seamless Focus Tube YouTube search, automatic video description and native chapter extraction, subtle 1-click channel subscription popovers, expanded ambient glow, and bug-free fullscreen transitions.",
    "updates": [
      {
        "title": "Direct YouTube Video Search",
        "description": "Search directly for any YouTube video right within Focus Tube, with instant feed loading, direct watch page parsing, and automatic Invidious failover.",
        "category": "Focus Tube Search & Playback"
      },
      {
        "title": "Full Video Descriptions & Chapters",
        "description": "Player now extracts full video descriptions and native YouTube chapter markers, populating interactive timestamp chapters in both the sidebar and collapsible sections below the player.",
        "category": "Focus Tube Search & Playback"
      },
      {
        "title": "Subtle 1-Click Channel Subscription",
        "description": "Tapping Subscribe opens a lightweight, clean category picker anchored directly over the button, allowing instant 1-click channel categorization without full-screen blur or disruptions.",
        "category": "Focus Tube Search & Playback"
      },
      {
        "title": "Search Queue Playback",
        "description": "Playing a search result automatically enqueues the search feed so you can seamlessly play through all results without interruption.",
        "category": "Focus Tube Search & Playback"
      },
      {
        "title": "Extended Ambient Lighting",
        "description": "Deepened the vertical atmospheric glow around the theater player (`-inset-y-50 sm:-inset-y-60`) for an even richer cinematic immersion.",
        "category": "Theater UI & Visual Polish"
      },
      {
        "title": "Isolated Control Stacking",
        "description": "Cleaned up CSS stacking contexts so the category popover sits completely above the player controls without any visual clipping or overlap.",
        "category": "Theater UI & Visual Polish"
      },
      {
        "title": "Fluid Fullscreen & Miniplayer Exits",
        "description": "Fixed FLIP transition glitches when returning from fullscreen or closing the miniplayer, delivering stable, jitter-free animations.",
        "category": "Theater UI & Visual Polish"
      },
      {
        "title": "Streamlined Video Cards",
        "description": "Removed unnecessary subscribe buttons and tags from cards to keep the Focus Tube browsing grid clean and distraction-free.",
        "category": "Theater UI & Visual Polish"
      },
      {
        "title": "Encrypted Local Storage",
        "description": "Enriched metadata and category associations are stored strictly on-device in local SQLite databases without external tracking or telemetry.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.44.0",
    "summary": "Ultra-smooth Focus Tube theater experience with collapsible sidepanels, calm atmospheric ambient glow, instant queue progression on mark watched, and buttery 60FPS transitions.",
    "updates": [
      {
        "title": "Collapsible Theater Sidepanel",
        "description": "Collapse the queue, chapters, and comments panel into a minimal edge tab with a single click, unlocking an ultra-wide cinematic view for immersive viewing.",
        "category": "Focus Tube Theater Polish"
      },
      {
        "title": "Calm Atmospheric Glow",
        "description": "Restructured ambient mode lighting with widened lateral spread and soft bottom feathering, keeping scene glow vibrant while preserving text legibility.",
        "category": "Focus Tube Theater Polish"
      },
      {
        "title": "Snappy Mark-Watched Auto-Advance",
        "description": "Tapping \"Mark Watched\" immediately jumps to the next queue item with zero latency while synchronizing watch history and counts in the background.",
        "category": "Focus Tube Theater Polish"
      },
      {
        "title": "Fluid Dock & Restore Transitions",
        "description": "Rebuilt mini-player minimize and restore animations with synchronized 60FPS coordinate tracking and opacity cross-fades, eliminating visual cut-offs.",
        "category": "Focus Tube Theater Polish"
      },
      {
        "title": "Decluttered Interface & Clean Layout",
        "description": "Removed redundant buttons, eliminated horizontal scroll overflow, and removed category dots for a cleaner, focused feed.",
        "category": "Focus Tube Theater Polish"
      },
      {
        "title": "Media Protocol Query Sanitization",
        "description": "Strips URL query parameters and hashes before resolving local file requests, ensuring reliable playback of stored media.",
        "category": "Core & Stability"
      },
      {
        "title": "Development Database Isolation",
        "description": "Scoped custom database override directories strictly to unpacked development runs to guarantee production builds access standard application data.",
        "category": "Core & Stability"
      },
      {
        "title": "Safe Protocol Resolution",
        "description": "Strict URL path decoding and normalization safeguards prevent path traversal attacks across custom media protocols.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.43.1",
    "summary": "Persistent user profile synchronization across dev and production, disk-backed settings storage, and background process lifecycle reliability.",
    "updates": [
      {
        "title": "Disk-Backed User Profiles",
        "description": "Profile name and avatar changes now save directly to disk settings through the main process, ensuring your customized name and picture persist reliably across app updates, cache clears, and dev/production switches.",
        "category": "Profile & Settings Persistence"
      },
      {
        "title": "Smart Profile Migration",
        "description": "Automatically restores saved profiles from earlier sessions and whitelist registrations so the app never falls back to a blank user state.",
        "category": "Profile & Settings Persistence"
      },
      {
        "title": "Real-Time Cross-Window Sync",
        "description": "Updating your username or avatar reflects instantly across all open windows, the navigation sidebar, and the home greeting without needing an app restart.",
        "category": "Profile & Settings Persistence"
      },
      {
        "title": "Clean Single-Instance Lifecycle",
        "description": "Enhanced main-process shutdown handling to ensure no zombie or background processes remain active to hold database locks when the app window closes.",
        "category": "Stability & Process Lifecycle"
      },
      {
        "title": "Secure Avatar Storage",
        "description": "Custom uploaded avatars are validated and stored locally within the protected user data directory, served via privileged media protocol with directory traversal protections.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.43.0",
    "summary": "Immersive ambient mode with dynamic color glow and glossy finish, stream-adaptive video quality filtering, upload date sorting for feeds and queues, smooth bi-directional FLIP transitions, and smart playback continuity.",
    "updates": [
      {
        "title": "Dynamic Ambient Lighting",
        "description": "Soft-colored ambient light bleeds outward from the active video player onto the theater background, dynamically matching real-time scene colors.",
        "category": "Ambient Mode & Glossy Finish"
      },
      {
        "title": "Glossy Specular Sheen",
        "description": "Layered frosted glass highlight for a premium, cinema-grade reflective finish around the video frame.",
        "category": "Ambient Mode & Glossy Finish"
      },
      {
        "title": "Temporal Color Smoothing",
        "description": "Live frames blend continuously with temporal alpha interpolation, creating cinematic cross-fades across scene changes without flickering.",
        "category": "Ambient Mode & Glossy Finish"
      },
      {
        "title": "Ambient Mode Toggle",
        "description": "Dedicated switch in the player settings popup to easily toggle ambient glow on or off with persistent preference.",
        "category": "Ambient Mode & Glossy Finish"
      },
      {
        "title": "Accurate Quality Filtering",
        "description": "The quality selector now detects the active stream's real capabilities and only displays resolutions the video actually supports (e.g. 1080p-capped videos show up to 1080p, 4K videos show up to 4K).",
        "category": "Stream-Adaptive Video Quality"
      },
      {
        "title": "Graceful Capping Indicators",
        "description": "When your global quality target exceeds a video's ceiling, the player automatically activates the highest available stream and badges it clearly.",
        "category": "Stream-Adaptive Video Quality"
      },
      {
        "title": "Upload Date Ordering",
        "description": "Switch between \"Newest first\" and \"Oldest first\" directly on the subscription feed and in-player queue to binge multi-part series or daily news in proper chronological order.",
        "category": "Feed & Queue Chronological Sorting"
      },
      {
        "title": "Persistent Preferences",
        "description": "Your selected sorting order is saved across sessions and applied to database queries automatically.",
        "category": "Feed & Queue Chronological Sorting"
      },
      {
        "title": "Bi-Directional Continuity",
        "description": "Entering and exiting fullscreen or docking into the corner mini-player now follows an exact, reversible FLIP animation curve with zero clipping or jitter.",
        "category": "Symmetrical FLIP Transitions & Fullscreen Polish"
      },
      {
        "title": "Clean Fullscreen Takeover",
        "description": "Elevated fullscreen player layer to strictly cover the main navigation sidebar, ensuring edge-to-edge immersion without sidebar overlap.",
        "category": "Symmetrical FLIP Transitions & Fullscreen Polish"
      },
      {
        "title": "Persistent Playback Speed",
        "description": "Your custom playback speed (1.25x, 1.5x, 2x, etc.) persists seamlessly across auto-advancing queue videos.",
        "category": "Playback Continuity & Smart Filters"
      },
      {
        "title": "Strict Shorts Filtering",
        "description": "When shorts are hidden via the feed toggle, they are completely excluded from queue auto-advance and stopped immediately.",
        "category": "Playback Continuity & Smart Filters"
      },
      {
        "title": "In-App Test Access Whitelist",
        "description": "Frictionless in-app request form for YouTube subscription import access with developer mail forwarding and instant copy fallback.",
        "category": "Playback Continuity & Smart Filters"
      },
      {
        "title": "Isolated Ambient Sampling",
        "description": "Frame color analysis executes within an ephemeral in-memory canvas inside the embed frame, transmitting only lightweight low-resolution color buffers without exposing video data.",
        "category": "Security & Privacy"
      },
      {
        "title": "Protected Request Handlers",
        "description": "Whitelist request submissions are strictly validated and dispatched through a dedicated mailer gateway without persisting user credentials or tokens.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.42.0",
    "summary": "FocusTube redesign with a focused cinema watch theater, symmetrical bento video cards, authentic creator avatars, an ultra-slim category carousel, and in-browser loading progress.",
    "updates": [
      {
        "title": "Focused Watch Theater",
        "description": "Embedded 16:9 widescreen cinema player with custom timeline controls and dedicated room context.",
        "category": "FocusTube Redesign & Watch Theater"
      },
      {
        "title": "Chronological Up-Next Queue",
        "description": "A distraction-free right-hand queue strictly showing upcoming subscriptions from the active category — zero algorithmic recommendations.",
        "category": "FocusTube Redesign & Watch Theater"
      },
      {
        "title": "Persistent Playback On Completion",
        "description": "The theater stays in place when a video finishes or autoplay is off, giving you full control to pick what to watch next.",
        "category": "FocusTube Redesign & Watch Theater"
      },
      {
        "title": "Seamless Tab Switching",
        "description": "Main sidebar stays accessible in windowed theater mode, and switching tabs automatically docks playback into a floating corner mini-player.",
        "category": "FocusTube Redesign & Watch Theater"
      },
      {
        "title": "Flawless Grid Symmetry",
        "description": "Replaced off-axis side buttons with a serene, balanced card layout so every video in the grid shares the same height and alignment.",
        "category": "Symmetrical Bento Video Cards"
      },
      {
        "title": "Centered Hover Quick Actions",
        "description": "Hovering over any card reveals sleek frosted-glass `▶ Play` and `✓ Watched` pill buttons centered on the thumbnail.",
        "category": "Symmetrical Bento Video Cards"
      },
      {
        "title": "Authentic Creator Avatars",
        "description": "Expanded image security policies to display true creator channel profile pictures across your entire subscription library.",
        "category": "Symmetrical Bento Video Cards"
      },
      {
        "title": "Single-Line Truncated Titles",
        "description": "Clean typography with single-line titles and unified channel, view-count, and release-time metadata.",
        "category": "Symmetrical Bento Video Cards"
      },
      {
        "title": "Ultra-Slim Header",
        "description": "Compact single-tier navigation bar with smooth horizontal category scrolling and edge gradient fade masks.",
        "category": "Feed & Navigation Polish"
      },
      {
        "title": "Clean Filter Toggles",
        "description": "High-contrast macOS-style toggle switches for \"Shorts\" and \"Watched\" with instant feed filtering.",
        "category": "Feed & Navigation Polish"
      },
      {
        "title": "Popup Browser Progress Bar",
        "description": "Instant 0ms visual feedback on clicks and a sleek top progress bar for web catalogs and download mirrors.",
        "category": "Feed & Navigation Polish"
      },
      {
        "title": "Detail Screen Alignment",
        "description": "Movie and series detail pages now start cleanly to the right of the sidebar with smooth sliding transitions on sidebar expand/collapse.",
        "category": "Feed & Navigation Polish"
      },
      {
        "title": "Google User Content Whitelist",
        "description": "Explicitly scoped `https://*.googleusercontent.com` and `https://*.ggpht.com` in the renderer Content-Security-Policy to safely load creator channel media without weakening general script isolation.",
        "category": "Security & Privacy"
      },
      {
        "title": "Isolated Browser Popup Scripting",
        "description": "Progress bar and popup interaction handlers execute entirely within the dedicated web popup partition without touching main window credentials or media storage.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.41.1",
    "summary": "Download sites that open instantly: mirrors are checked faster, blocked DNS is bypassed, and known-good links are pre-warmed at startup.",
    "updates": [
      {
        "title": "Instant Open From Cache",
        "description": "A recently verified mirror is used immediately with zero waiting, and refreshes silently in the background so nothing blocks your click.",
        "category": "Faster, More Reliable Site Links"
      },
      {
        "title": "Pre-Warmed At Launch",
        "description": "The app quietly checks both download sites a few seconds after startup, so the first click of the session already has a working link.",
        "category": "Faster, More Reliable Site Links"
      },
      {
        "title": "Pre-Warmed Links Shared",
        "description": "Simultaneous requests for the same site now reuse one lookup instead of repeating the same network work.",
        "category": "Faster, More Reliable Site Links"
      },
      {
        "title": "Last-Resort Mirrors",
        "description": "If a site publishes no working mirror right now, the app falls back to a last known good address instead of opening a dead page.",
        "category": "Faster, More Reliable Site Links"
      },
      {
        "title": "Longer Link Trust",
        "description": "Verified site links stay usable for a week instead of a few hours, which cuts down repeated re-checking on slow connections.",
        "category": "Faster, More Reliable Site Links"
      },
      {
        "title": "Works On Blocked DNS",
        "description": "Site lookups query Google's and Cloudflare's DNS directly, so mirrors keep resolving on networks that block or hijack the default resolver.",
        "category": "Network Reliability"
      },
      {
        "title": "Encrypted DNS In The App Window",
        "description": "The in-app browser uses DNS-over-HTTPS, so pages inside MyCinema resolve the same way the link checker does.",
        "category": "Network Reliability"
      },
      {
        "title": "Faster Timeout Chain",
        "description": "Mirrors that hang no longer stall the button — checks time out in about 2.5 seconds and move straight to the next candidate.",
        "category": "Network Reliability"
      },
      {
        "title": "Bot-Wall Friendly Checks",
        "description": "Mirrors behind Cloudflare-style challenges are treated as reachable, because the in-app browser can still load them.",
        "category": "Network Reliability"
      },
      {
        "title": "Popups Always Appear",
        "description": "In-app browser windows now reveal themselves even if the page never signals readiness, so a lookup window no longer fails to show.",
        "category": "Reliability"
      },
      {
        "title": "Fresher Shared Link File",
        "description": "The published link list now accepts entries up to seven days old, so portals that rotate slowly stay usable.",
        "category": "Reliability"
      },
      {
        "title": "Known Domains Only",
        "description": "Every resolved mirror is matched against each site's expected domain patterns, and app-download or promo hosts can never be chosen as a mirror.",
        "category": "Security & Privacy"
      },
      {
        "title": "Strict HTTPS Mirror Checks",
        "description": "Mirror and redirect checks connect only over HTTPS with a verified hostname, so a hijacked path cannot silently redirect the lookup.",
        "category": "Security & Privacy"
      },
      {
        "title": "Local-Only Lookups",
        "description": "Link checking talks only to the download portals and public DNS resolvers named in the app, and your settings override is still always honored.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.41.0",
    "summary": "Browse curated download sites with built-in ad blocking, download direct media files to custom folders, navigate instantly with zero background lag, and sync downloads directly into your library.",
    "updates": [
      {
        "title": "Browse Inside MyCinema",
        "description": "Access popular media catalogs including HDHub4u and KatMovieHD directly within the app without leaving for external browsers.",
        "category": "Curated Web Download Sites"
      },
      {
        "title": "Live Mirror Health Checking",
        "description": "Verified, multi-mirror health checker automatically tests and routes to working live domain mirrors.",
        "category": "Curated Web Download Sites"
      },
      {
        "title": "Built-in Ad & Pop-up Blocker",
        "description": "Powered by the EasyList engine and deep DOM popup interception, automatically eliminating deceptive redirect tabs, ad overlays, and malicious scripts.",
        "category": "Curated Web Download Sites"
      },
      {
        "title": "Streamlined Navigation Bar",
        "description": "Integrated navigation controls with back/forward, reload, home, external-browser fallback, and live URL inspection.",
        "category": "Curated Web Download Sites"
      },
      {
        "title": "Automatic Download Interceptor",
        "description": "Catches direct video and archive downloads (.mp4, .mkv, .avi, .zip, etc.) directly into MyCinema's download manager with progress tracking, speed calculation, and pause/resume support.",
        "category": "Direct File Downloads & Custom Storage"
      },
      {
        "title": "Custom Download Folder",
        "description": "Choose any drive or directory on your system with write-permission verification, default path resets, and real-time disk storage gauges.",
        "category": "Direct File Downloads & Custom Storage"
      },
      {
        "title": "Show In Folder",
        "description": "Reveal downloaded files directly in your operating system's file explorer from the 3-dot download menu.",
        "category": "Direct File Downloads & Custom Storage"
      },
      {
        "title": "Automatic Library Detection",
        "description": "Monitors your download destination and automatically scans and indexes completed movies and episodes into your local library.",
        "category": "Direct File Downloads & Custom Storage"
      },
      {
        "title": "Unified Download Queue",
        "description": "Concurrency controls now coordinate both HTTP direct downloads and torrent transfers seamlessly.",
        "category": "Direct File Downloads & Custom Storage"
      },
      {
        "title": "Persistent Home Mounting",
        "description": "The Home screen stays mounted and ready in memory instead of constantly unmounting, eliminating reload flashes and redundant network requests.",
        "category": "Zero-Lag Engine & Instant Home Navigation"
      },
      {
        "title": "Smart Discovery Cache",
        "description": "Caches TMDB discovery rows for 20 minutes so switching back and forth between tabs is instantaneous.",
        "category": "Zero-Lag Engine & Instant Home Navigation"
      },
      {
        "title": "Carousel & Background Power Management",
        "description": "Pauses auto-advancing hero carousels and background timers when tabs are hidden to conserve GPU and CPU.",
        "category": "Zero-Lag Engine & Instant Home Navigation"
      },
      {
        "title": "Throttled SQLite Disk Writes",
        "description": "Replaced per-chunk disk writes and full-table scans with an in-memory state cache and 5-second throttled flushes, preventing UI freezing during high-speed downloads.",
        "category": "Zero-Lag Engine & Instant Home Navigation"
      },
      {
        "title": "Component Memoization",
        "description": "Isolated high-frequency download progress events so browsing your library, movies, series, and watchlist remains silky smooth.",
        "category": "Zero-Lag Engine & Instant Home Navigation"
      },
      {
        "title": "Queue Pump On HTTP Events",
        "description": "Completing, pausing, or removing HTTP downloads automatically advances the queue so queued downloads start immediately.",
        "category": "Reliability & Performance"
      },
      {
        "title": "Watchers On Path Changes",
        "description": "Changing or resetting your download directory immediately updates file-system watchers to follow the new location.",
        "category": "Reliability & Performance"
      },
      {
        "title": "Ad & Popup Shield",
        "description": "In-app webviews block third-party advertising networks, cryptominers, tracking scripts, and unwanted pop-up tabs automatically.",
        "category": "Security & Privacy"
      },
      {
        "title": "Strict Path Traversal Guard",
        "description": "Download directories and shell reveal operations validate paths against safe library roots.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.40.0",
    "summary": "Bring your YouTube subscriptions into Focus Tube, dock the movie player while you browse, and enjoy a tidier Focus Tube.",
    "updates": [
      {
        "title": "Import From Google",
        "description": "The Channels manager has an Import YouTube button that opens the system browser to connect a Google account and lists every subscribed channel.",
        "category": "YouTube Subscription Import"
      },
      {
        "title": "Review Before Saving",
        "description": "The import screen shows logos, search, 50-per-page paging, and checkboxes — nothing is added until you confirm the selection.",
        "category": "YouTube Subscription Import"
      },
      {
        "title": "File Into Categories",
        "description": "Assign channels to categories before saving, or bulk-file the whole selection at once.",
        "category": "YouTube Subscription Import"
      },
      {
        "title": "Undo Keeps You Safe",
        "description": "The summary screen offers Undo for the last import, removing only channels and memberships that import created while keeping anything you watched or re-filed since.",
        "category": "YouTube Subscription Import"
      },
      {
        "title": "Refresh With Progress",
        "description": "Newly saved channels pull their latest uploads with per-channel progress, and failures stay in place with a retry instead of blocking the rest.",
        "category": "YouTube Subscription Import"
      },
      {
        "title": "Setup Guide Included",
        "description": "`docs/FOCUS_TUBE_GOOGLE_OAUTH.md` documents the Desktop-app client ID (`MAIN_VITE_FOCUS_TUBE_GOOGLE_CLIENT_ID`), test-user, quota, and secure-storage troubleshooting.",
        "category": "YouTube Subscription Import"
      },
      {
        "title": "Dock And Keep Browsing",
        "description": "The player toolbar has a mini-player button that shrinks the same video into a bottom-right corner dock so playback continues while you browse MyCinema.",
        "category": "Mini Player For Movies & Shows"
      },
      {
        "title": "Quiet While Playing",
        "description": "The dock controls fade after ~2.5s idle while playing and return on hover or tap, with a slim seek strip that stays visible for glanceable progress.",
        "category": "Mini Player For Movies & Shows"
      },
      {
        "title": "Escape Restores",
        "description": "Pressing Escape in the dock expands back to the full player; the top bar stays hidden in dock mode since the dock has its own title and close controls.",
        "category": "Mini Player For Movies & Shows"
      },
      {
        "title": "Calmer Header",
        "description": "The Focus Tube header is rebuilt with a compact title block, live unseen count, and responsive search, Channels, and Refresh controls.",
        "category": "Focus Tube Polish"
      },
      {
        "title": "One Card For Controls",
        "description": "Categories and stack filters (Shorts, seen, mark-all-seen) now live in a single card with a unified stack count line.",
        "category": "Focus Tube Polish"
      },
      {
        "title": "Comments That Never Break",
        "description": "Comment avatars fall back to a stable colored initial when a photo is missing or fails to load, instead of a broken image icon.",
        "category": "Focus Tube Polish"
      },
      {
        "title": "Tidy Sidebar",
        "description": "Description, Chapters, and sponsor-segment panels collapse individually with counts, so long pages stay scannable.",
        "category": "Focus Tube Polish"
      },
      {
        "title": "Single Close Control",
        "description": "The Focus Tube player keeps one close button on the right; the duplicate back arrow and top mini-player button are removed.",
        "category": "Focus Tube Polish"
      },
      {
        "title": "Mouse-Back Closes",
        "description": "Pressing the mouse side/back button closes the Focus Tube player, matching VideoPlayer and DetailScreen.",
        "category": "Focus Tube Polish"
      },
      {
        "title": "Queue Pump On HTTP Events",
        "description": "Completing, pausing, or removing HTTP downloads automatically advances the queue so queued downloads start immediately.",
        "category": "Reliability & Performance"
      },
      {
        "title": "Shared Feed Refresh",
        "description": "Polling, imports, and retries use one feed-plus-Shorts upsert path with bounded concurrency, so one dead feed records its error without stalling the others.",
        "category": "Reliability & Performance"
      },
      {
        "title": "Safe Local Saves",
        "description": "Imports run in one local transaction, validate channel IDs, add memberships without replacing existing ones, and leave existing channel rows untouched.",
        "category": "Reliability & Performance"
      },
      {
        "title": "Read-Only Google Access",
        "description": "Focus Tube requests only the `youtube.readonly` scope through a Desktop-app OAuth flow with PKCE, loopback callback, and state validation — no write scope and no client secret in the app.",
        "category": "Security & Privacy"
      },
      {
        "title": "Tokens Stay In Main",
        "description": "Google credentials are encrypted with Electron `safeStorage` in the app user-data folder and never cross the context bridge; only reviewed channel metadata and progress counts reach the UI, and import refuses to save when no secure store is available.",
        "category": "Security & Privacy"
      },
      {
        "title": "Disconnect Revokes",
        "description": "Disconnecting removes the saved credentials and attempts a Google revocation.",
        "category": "Security & Privacy"
      },
      {
        "title": "Local-Only Library Data",
        "description": "Imported channels, memberships, and feed history live in the app's own local database exactly like manually added channels.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.39.0",
    "summary": "File it your way: watchlist lanes, collections from any title page, and a mini player that stays put.",
    "updates": [
      {
        "title": "ASAP, Weekend, Someday",
        "description": "The bookmark on any title page now files it into a lane — tonight, the weekend, or the rainy-day stash — instead of one flat list.",
        "category": "Watchlist Lanes"
      },
      {
        "title": "Filter The List",
        "description": "The Watchlist tab filters by lane with live counts and groups everything into Up-next, Weekend, and Someday sections.",
        "category": "Watchlist Lanes"
      },
      {
        "title": "Old Saves Have A Home",
        "description": "Everything saved before this update rests in Someday, so nothing is lost or re-sorted behind your back. Open any title to re-file it into another lane.",
        "category": "Watchlist Lanes"
      },
      {
        "title": "Backups Keep Lanes",
        "description": "Export and import carry each title's lane along with it.",
        "category": "Watchlist Lanes"
      },
      {
        "title": "File Without Leaving",
        "description": "A new collections button on every title page lists your collections with covers and counts — tap to add or remove, and create a new collection inline without switching tabs.",
        "category": "Collections From Any Title"
      },
      {
        "title": "Streamed Titles Included",
        "description": "Continue Watching and trending titles file into collections by their catalog identity, not just downloaded files.",
        "category": "Collections From Any Title"
      },
      {
        "title": "Tick For Watched",
        "description": "Each card's bookmark is now a tick that marks the video watched (tap again to undo). Unseen-only feeds drop the card right away and update the counts.",
        "category": "Focus Tube"
      },
      {
        "title": "Mini Player Survives Home",
        "description": "A docked Focus Tube video keeps playing when you visit the Home tab, the way movies already did.",
        "category": "Focus Tube"
      },
      {
        "title": "Hero Saves Stick",
        "description": "Titles saved to the watchlist from Continue Watching now land there with the lane you picked, and the title page reflects what is actually saved.",
        "category": "Reliability"
      },
      {
        "title": "No More Stray Zero",
        "description": "Downloaded titles no longer show a stray \"0\" around the bookmark button.",
        "category": "Reliability"
      },
      {
        "title": "Local-Only Lanes",
        "description": "Lane data lives in the app's own local database and travels with backups. This update adds no network requests, no permissions, and no data sharing.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.38.0",
    "summary": "YouTube on your terms: a new Focus Tube tab built around channels you pick, with a short guided tour on first launch.",
    "updates": [
      {
        "title": "A New Tab, No Algorithm",
        "description": "A Focus Tube tab in the sidebar shows uploads only from channels you subscribe to, newest-first and unseen-only. Nothing is recommended and nothing autoplays.",
        "category": "Focus Tube (Beta)"
      },
      {
        "title": "Subscribe In Seconds",
        "description": "The Channels manager finds channels as you type by name, @handle, ID, or pasted URL, with logos and one-tap subscribe into the category you are viewing.",
        "category": "Focus Tube (Beta)"
      },
      {
        "title": "Categories You Organize",
        "description": "File channels into rooms you name, with unseen badges, double-click rename, drag-to-reorder, and two-step delete confirmation.",
        "category": "Focus Tube (Beta)"
      },
      {
        "title": "A Player That Respects The Stack",
        "description": "The cinema player resumes where you left off, can autoplay the next unseen video, reads chapters from descriptions, shows comments, and skips sponsor segments automatically.",
        "category": "Focus Tube (Beta)"
      },
      {
        "title": "Opt Out Anytime",
        "description": "A switch under Settings > Features hides the tab and stops all background refreshing. Categories, channels, and progress are kept for when you switch it back on.",
        "category": "Focus Tube (Beta)"
      },
      {
        "title": "A Tour On First Launch",
        "description": "After the What's New card, a 5-step spotlight tour walks you from the new tab through setup to the off-switch.",
        "category": "Focus Tube (Beta)"
      },
      {
        "title": "Scroll The Seek Bar",
        "description": "Rolling the mouse wheel over the player's progress bar now jumps in small steps, with trackpad-friendly smoothing.",
        "category": "Player & Discovery"
      },
      {
        "title": "Letterboxd Lookup",
        "description": "Title pages now offer a one-tap Letterboxd lookup that opens in the in-app window.",
        "category": "Player & Discovery"
      },
      {
        "title": "Your Library, Named Clearly",
        "description": "Home rails now read Continue Watching and Your Library so local titles are never confused with trending rows.",
        "category": "Player & Discovery"
      },
      {
        "title": "Focus Tube Joins Backups",
        "description": "Categories, channels, watched state, and resume positions now export and restore with the rest of your library.",
        "category": "Reliability"
      },
      {
        "title": "Feeds That Retry",
        "description": "Channel polling retries failed requests and refreshes missing channel logos once, so the stack fills in instead of stalling.",
        "category": "Reliability"
      },
      {
        "title": "No Account, No API Key",
        "description": "Focus Tube reads public channel feeds and plays through the official YouTube embed — no stream extraction and no credentials anywhere.",
        "category": "Security & Privacy"
      },
      {
        "title": "Minimal Lookups",
        "description": "Sponsor data is fetched per video ID only, and channel search runs only when you type in the Channels manager.",
        "category": "Security & Privacy"
      },
      {
        "title": "Local-Only Data",
        "description": "Subscriptions, categories, and watch progress live in the app's own local database. Switching Focus Tube off stops every background request.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.37.0",
    "summary": "Take control of your download queue, and get accurate sizes, honest new-episode alerts, and audio that finally stays in sync.",
    "updates": [
      {
        "title": "Choose How Many Run At Once",
        "description": "Set a limit in the Download tab (1, 2, 3, 5, or Unlimited). Extra downloads wait their turn instead of all fighting for your bandwidth at the same time.",
        "category": "Download Queue Control"
      },
      {
        "title": "A Real Queue, In Order",
        "description": "Waiting downloads are listed oldest-first and labelled Queued #1, #2, #3, so the next one to start is always the one you added first - never a reshuffled stack.",
        "category": "Download Queue Control"
      },
      {
        "title": "Starts Itself",
        "description": "When a download finishes, fails, is paused, or is removed, the next in line starts automatically. Pausing a queued item takes it out of the line; resuming puts it back.",
        "category": "Download Queue Control"
      },
      {
        "title": "Keeps Your Setting",
        "description": "Your choice is remembered, respected when the app restarts, and applied to downloads started from a title's page too. Streaming while downloading never eats a download slot.",
        "category": "Download Queue Control"
      },
      {
        "title": "Season Packs Show The Whole Season",
        "description": "Pack listings that advertise per-episode sizes are now added up, so a full season reads as one honest total instead of a single episode's size.",
        "category": "Sizes You Can Trust"
      },
      {
        "title": "No More Raw Numbers",
        "description": "Some trackers report sizes as unformatted byte counts; they now display as normal sizes (3.6 GB) like everywhere else.",
        "category": "Sizes You Can Trust"
      },
      {
        "title": "Real Totals Override Estimates",
        "description": "Once the app has seen a release's true size, it stops trusting the tracker's guess - so the number you see before streaming matches what actually downloads.",
        "category": "Sizes You Can Trust"
      },
      {
        "title": "No More False Alerts",
        "description": "Following a series no longer instantly flags episodes that were already out. You are told about an episode only when it actually drops after you started watching.",
        "category": "New Episode Alerts That Earn It"
      },
      {
        "title": "Only When It's Watchable",
        "description": "A new-episode banner appears only once a real source for that episode (or its season pack) can be found - no more banners that open to an empty list. If nothing is available yet, the alert waits quietly instead of disappearing forever.",
        "category": "New Episode Alerts That Earn It"
      },
      {
        "title": "Starting Mid-Season Is Fine",
        "description": "Whether you began at episode one, binge four episodes, or stop halfway, silence is the default. The banner appears when the next episode genuinely lands.",
        "category": "New Episode Alerts That Earn It"
      },
      {
        "title": "Sample-Accurate External Audio",
        "description": "Non-native audio tracks (EAC3, AC3, DTS and similar) now start at the exact requested moment, fixing dialogue that ran early or late against the picture.",
        "category": "Audio & Playback Reliability"
      },
      {
        "title": "No More Audio Reload Storms",
        "description": "Long streams no longer stutter through repeated audio restarts. Sync correction now escalates gradually, rides through brief buffering hitches, and stops rebuilding when restarts aren't helping.",
        "category": "Audio & Playback Reliability"
      },
      {
        "title": "Steady Audio Under Load",
        "description": "If audio falls behind during a busy scene, the heaviest on-screen enhancement eases itself off until sound catches up, then switches back on its own.",
        "category": "Audio & Playback Reliability"
      },
      {
        "title": "Cold Streams Start Clean",
        "description": "Opening a brand-new slow stream no longer leaves audio racing ahead of a video that hasn't rendered yet, and the visual enhancer recovers by itself if the graphics driver hiccups on startup.",
        "category": "Audio & Playback Reliability"
      },
      {
        "title": "Fewer Simultaneous Connections",
        "description": "The download limit caps how many torrents connect at once, so the app opens no more swarm connections than you asked for.",
        "category": "Security & Privacy"
      },
      {
        "title": "Less Background Lookups",
        "description": "New-episode source checks now run only for a genuinely new episode instead of on every followed series, reducing routine network requests to trackers and metadata services.",
        "category": "Security & Privacy"
      },
      {
        "title": "Local-Only Settings",
        "description": "Your download limit and queue order are stored in the app's own local database. No new permissions, no new data sharing, and nothing about your queue leaves your machine.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.36.0",
    "summary": "Streamed shows now remember you: online resume, next-episode tracking, new-episode alerts, and whole-season binge mode.",
    "updates": [
      {
        "title": "Streamed Titles Join Continue Watching",
        "description": "Movies and episodes you stream (not download) now appear in Hero with your exact position, badge-labeled Online — no more re-searching and scrubbing to find your place.",
        "category": "Online Resume"
      },
      {
        "title": "One-Click Resume, Fresh Sources",
        "description": "Resume reuses your last working source instantly, or quietly re-finds the healthiest one in the background while the button shows a loading state.",
        "category": "Online Resume"
      },
      {
        "title": "Resume Receipts",
        "description": "The player confirms where you picked up (\"Resuming from 42:15 · Source refreshed\"), and title pages show a resume pill plus per-episode progress ticks.",
        "category": "Online Resume"
      },
      {
        "title": "One Card Per Series",
        "description": "Watched-till progress collapses into a single card that points at the next released episode (\"Watched till S1 E3 · S1 E4 up next\").",
        "category": "Next Up, Automatically"
      },
      {
        "title": "Drops Jump The Queue",
        "description": "Unseen new episodes take hero position one with a NEW EPISODE badge and a Watch S2 E3 button; the hero stays lean at five cards max.",
        "category": "Next Up, Automatically"
      },
      {
        "title": "Quieter Badges, Louder Meaning",
        "description": "NEW EPISODE, NEXT EPISODE, and ONLINE pills share one visual family so fresh drops grab your eye first.",
        "category": "Next Up, Automatically"
      },
      {
        "title": "Follow Bell",
        "description": "Tap the bell on any series page to track it — or just keep watching, and meaningful watches follow automatically with a confirmation toast.",
        "category": "Follow Your Shows"
      },
      {
        "title": "New-Episode Alerts",
        "description": "A throttled daily check flags genuinely unwatched drops (never old episodes, never abandoned shows), with a \"just dropped\" strip right above the episode list.",
        "category": "Follow Your Shows"
      },
      {
        "title": "Your Switches",
        "description": "Separate Settings toggles for remembering online progress and for alerts — turning alerts off also clears pending flags.",
        "category": "Follow Your Shows"
      },
      {
        "title": "One Timeline For The Whole Pack",
        "description": "A season pack plays as a single virtual video with a combined duration (like /4:34:23) — seek bar, arrows, slider scrub, and PiP controls all ride across episodes.",
        "category": "Season-Pack Binge Mode"
      },
      {
        "title": "No Dead Air Between Episodes",
        "description": "The next file stays buffered while you watch, and playback auto-advances with a brief crossfade.",
        "category": "Season-Pack Binge Mode"
      },
      {
        "title": "Unparseable Packs Still Work",
        "description": "When filenames carry no episode tags, the player advances in torrent order, pins resume to the exact file, and starts at the first file instead of the largest.",
        "category": "Season-Pack Binge Mode"
      },
      {
        "title": "Downloads Still Win",
        "description": "If you own an episode locally, picking it leaves the stream for your file.",
        "category": "Season-Pack Binge Mode"
      },
      {
        "title": "Smarter Source Matching",
        "description": "Torrent filename parsing now handles folder-structured packs, bare episode tokens, and multi-episode files, while sample/proof stubs can no longer hijack playback.",
        "category": "Reliability"
      },
      {
        "title": "Stale-Session Safe",
        "description": "New bridge calls degrade gracefully if the dev preload is out of sync, instead of crashing the screen.",
        "category": "Reliability"
      },
      {
        "title": "Online State In Backups",
        "description": "Stream positions and followed series now export and restore with the rest of your library.",
        "category": "Reliability"
      },
      {
        "title": "Off Means Zero Writes",
        "description": "Disabling online progress blocks all stream-position storage in both renderer and main process; disabling alerts stops all follow checks.",
        "category": "Security & Privacy"
      },
      {
        "title": "Local-First Data",
        "description": "Positions, follows, and alert flags live only in your local database — the only network calls are the existing TMDB lookups (throttled) and torrent providers you explicitly use.",
        "category": "Security & Privacy"
      },
      {
        "title": "Validated Restores",
        "description": "Imported backup rows are type-checked before touching your library, and existing rows are never overwritten by a restore.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.35.0",
    "summary": "Sources got a full makeover, PiP finally gets out of your way, and scrolling feels silkier.",
    "updates": [
      {
        "title": "Same Panel Everywhere",
        "description": "The Download tab sources panel now looks and works exactly like the title-page one — same header, same filters, same cards.",
        "category": "Sources, Redesigned"
      },
      {
        "title": "Filters With Counts",
        "description": "Language (All/Hindi), Quality (4K/1080p/720p), Season, Pack, and Episode filters are pills with live counts — no more blind dropdowns.",
        "category": "Sources, Redesigned"
      },
      {
        "title": "Compact Cards",
        "description": "Best-match star, quality badge, seed health, HEVC/Hindi tags, and one-tap Stream or Download in half the space, with shimmer skeletons while scanning.",
        "category": "Sources, Redesigned"
      },
      {
        "title": "Minimizes With You",
        "description": "Hitting PiP opens the floating window and minimizes MyCinema; Back to tab (or closing PiP) restores the app straight into fullscreen.",
        "category": "Picture-in-Picture That Respects You"
      },
      {
        "title": "Skip From The Taskbar",
        "description": "While PiP floats, hovering the taskbar icon gives −10s, play/pause, and +10s buttons.",
        "category": "Picture-in-Picture That Respects You"
      },
      {
        "title": "Media Keys Too",
        "description": "Play/pause, ±10s, next episode, and scrubbing work through OS media controls.",
        "category": "Picture-in-Picture That Respects You"
      },
      {
        "title": "Hidden Until Needed",
        "description": "The top-right minimize/fullscreen/close capsule only appears when your cursor lingers in the corner — smaller, tighter, and never covering panel buttons.",
        "category": "Calmer Window Controls"
      },
      {
        "title": "Only The Active Page Renders",
        "description": "Background tabs no longer keep timers, images, and scroll listeners alive behind your current view.",
        "category": "Smoother Scrolling"
      },
      {
        "title": "Lighter Cards",
        "description": "Heavy blurs, clip-paths, and oversized shadows were removed from cards and collections — same look, far less GPU work.",
        "category": "Smoother Scrolling"
      },
      {
        "title": "PiP-Only Popups",
        "description": "The popup guard now allows only the video PiP window; every other popup type stays denied, and external links remain https-only.",
        "category": "Security & Privacy"
      },
      {
        "title": "Same Safe Pipelines",
        "description": "Downloads, shares, and media serving are unchanged — only how windows restore changed, not what files can be served.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.34.0",
    "summary": "Collections arrive: hand-built lists with file-only sharing, and a watchlist that is finally just one inbox.",
    "updates": [
      {
        "title": "Hand-Built Lists",
        "description": "New Collections tab — create a list, pin titles from your library, and add any movie or show online via TMDB search. Hold a card to pick it up and drag it anywhere to reorder.",
        "category": "Collections"
      },
      {
        "title": "Online Titles Stay Complete",
        "description": "Titles you don't own arrive as online entries that stay playable via source search, with ratings, posters, and one-tap remove.",
        "category": "Collections"
      },
      {
        "title": "Old Lists Preserved",
        "description": "Existing custom watchlist categories migrate into Collections automatically, and leftover smart collections convert to manual ones — nothing you saved is lost.",
        "category": "Collections"
      },
      {
        "title": "Save, Then Send",
        "description": "Sharing is a guided 2-step flow — save the collection as a `.json` file (Downloads preselected), then send it from step 2. No links, ever.",
        "category": "File-Only Sharing"
      },
      {
        "title": "WhatsApp Opens Directly",
        "description": "With WhatsApp installed, the chat picker opens straight in the app with your message pre-written — no browser detour. Otherwise it falls back to WhatsApp Web.",
        "category": "File-Only Sharing"
      },
      {
        "title": "Telegram Via Web",
        "description": "Telegram opens Telegram Web with one tap from the dialog, plus a copy-message button for pasting into any chat.",
        "category": "File-Only Sharing"
      },
      {
        "title": "Receiver Imports In One Tap",
        "description": "Shared files open through IMPORT in Collections — library matches pin automatically, unknown titles arrive as online entries.",
        "category": "File-Only Sharing"
      },
      {
        "title": "One Inbox Everywhere",
        "description": "Removed the category picker from Home search, title pages, the Watchlist page, and Downloads — saving is now one tap into a single Watchlist.",
        "category": "Simpler Watchlist"
      },
      {
        "title": "Dialogs Stay Visible",
        "description": "File dialogs are now parented to the app window, so save/open popups can no longer hide behind MyCinema on Windows.",
        "category": "Simpler Watchlist"
      },
      {
        "title": "Validated Imports",
        "description": "Shared collection files are validated (app, type, and name) before anything touches your library — invalid files are rejected with an error, never half-imported.",
        "category": "Security & Privacy"
      },
      {
        "title": "No Surprise Downloads",
        "description": "Importing never downloads files; unmatched titles become online-only entries you explicitly choose to play.",
        "category": "Security & Privacy"
      },
      {
        "title": "Constrained App Opening",
        "description": "The renderer can only open `https` links externally; launching the WhatsApp app goes through a dedicated main-process channel that first verifies the OS protocol registration.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.33.1",
    "summary": "Correct audio language on every track switch, plus a cleaner update badge in the collapsed sidebar.",
    "updates": [
      {
        "title": "Right Language, Every Track",
        "description": "Switching audio tracks (e.g. English to Korean) now actually plays the selected language. Track positions and ffmpeg mapping were using two different numbering systems, so the wrong stream could play while the UI showed the right one — both now use one consistent system.",
        "category": "Bug Fixes"
      },
      {
        "title": "Collapsed Sidebar Update Badge",
        "description": "The update indicator above the profile in the collapsed sidebar is now a compact icon button — a dot badge for new updates, a progress ring while downloading, and a green badge when ready — instead of cramped text that wrapped and clipped.",
        "category": "Bug Fixes"
      },
      {
        "title": "Same Safe Audio Pipeline",
        "description": "External audio still extracts through the sandboxed audio protocol with path-traversal checks — only the stream addressing changed, not what files can be served.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.33.0",
    "summary": "Subtitles you can style mid-movie, search that starts fresh, and an end to the play-buffer-repeat loop on second audio tracks.",
    "updates": [
      {
        "title": "Style Without Leaving",
        "description": "Change subtitle style (Default, Clean, OTT), size, and position from the new Appearance section inside Audio & Subtitles — every tap previews live on the video, no trip to Settings.",
        "category": "Subtitle Appearance In Player"
      },
      {
        "title": "Matching Sync Panel",
        "description": "The subtitle Sync controls (offset, ±0.25s nudge, custom ms) now share the same clean pill-and-stepper look as Appearance.",
        "category": "Subtitle Appearance In Player"
      },
      {
        "title": "Second Audio Tracks Play Smoothly",
        "description": "Switching to a non-native audio track (or starting a movie whose saved track routes through the audio pipeline) no longer falls into a 1-second-play / 1-second-buffer loop on streams and downloaded files alike.",
        "category": "Buffering Loop Fixed"
      },
      {
        "title": "No More Nested Resyncs",
        "description": "Programmatic seeks from track switches no longer re-trigger the external-audio sync — the player syncs once and plays.",
        "category": "Buffering Loop Fixed"
      },
      {
        "title": "Clean Search Every Time",
        "description": "Opening a result from Home search clears the query, so coming back and tapping search always gives a fresh box instead of the old results.",
        "category": "Search That Starts Fresh"
      },
      {
        "title": "Same Safe Audio Pipeline",
        "description": "External audio still extracts through the sandboxed audio protocol with path-traversal checks — only the sync triggering changed, not what files can be served.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.32.0",
    "summary": "Instant streaming — press play on any source and start watching in seconds, while downloads keep working quietly in the background.",
    "updates": [
      {
        "title": "Play Magnets Instantly",
        "description": "Any torrent source now starts a lightweight temp stream that plays in seconds — no waiting for the full download to finish.",
        "category": "Instant Streaming"
      },
      {
        "title": "Episodes Play While Downloading",
        "description": "Jump into any episode of an active download mid-way; playback starts from already-downloaded parts while the rest keeps fetching.",
        "category": "Instant Streaming"
      },
      {
        "title": "Torrent Loading Screen",
        "description": "A live progress overlay with logo reveal keeps you oriented while the stream buffers, then fades away cleanly.",
        "category": "Instant Streaming"
      },
      {
        "title": "Magnets Panel In Player",
        "description": "Browse and switch magnets without leaving the player, with season and episode filters for packs.",
        "category": "Instant Streaming"
      },
      {
        "title": "HEVC-Aware Ranking",
        "description": "Sources now rank by health, quality, and codec — efficient HEVC/x265 picks float to the top.",
        "category": "Smarter Sources"
      },
      {
        "title": "Pause-Then-Sync Engine",
        "description": "Track switches and seeks pause the picture, prepare the new audio, then resume both together for near-zero desync.",
        "category": "Audio That Stays In Sync"
      },
      {
        "title": "Drift Correction",
        "description": "Small drift is smoothed live; large drift triggers a clean resync automatically.",
        "category": "Audio That Stays In Sync"
      },
      {
        "title": "Cleaner Audio Routing",
        "description": "Native tracks play natively while external tracks route strictly through the enhancement pipeline — no more double audio.",
        "category": "Audio That Stays In Sync"
      },
      {
        "title": "Faster Seeking",
        "description": "Audio streams now seek from the nearest point instead of decoding from zero, so switches feel instant.",
        "category": "Audio That Stays In Sync"
      },
      {
        "title": "Steadier Detail Page",
        "description": "Movie capsules and vibe tags now show shimmer placeholders while loading — the Choose Source button never jumps under your cursor again.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Cleaner Player Controls",
        "description": "Removed the rarely-used bookmark button and timeline dots for a calmer control bar.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Smoother Subtitles",
        "description": "The subtitle renderer now follows playback events instead of running constantly — subtitles stay glued to dialogue with less overhead.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Robust Temp Cleanup",
        "description": "Switching streams or closing the player stops the old torrent and deletes temp files with automatic retries — no leftover files or piled-up torrents.",
        "category": "Reliability"
      },
      {
        "title": "No Lingering Torrents",
        "description": "Temp streams are destroyed and their files removed when you switch or close — torrent handles are never left running in the background.",
        "category": "Security & Privacy"
      },
      {
        "title": "Safe Local Playback",
        "description": "Audio extraction blocks path traversal and only serves files that exist on disk.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.31.1",
    "summary": "JioHotstar sections now load.",
    "updates": [
      {
        "title": "JioHotstar Sections Fixed",
        "description": "JioHotstar Movies and JioHotstar Series were stuck loading because the app was querying an outdated Hotstar provider ID that TMDB no longer serves. Updated to the current JioHotstar provider ID — both sections now load their latest popular content normally.",
        "category": "Bug Fixes"
      }
    ]
  },
  {
    "version": "v1.31.0",
    "summary": "Curated discovery — regional and OTT sections now show exactly the right content, ranked by what's hot right now.",
    "updates": [
      {
        "title": "Regional Trending",
        "description": "Dedicated Indian Movies, Indian Series, Trending Kdramas, and Trending Animes sections — each filtered by country of origin so you always see authentic content.",
        "category": "New Discovery Sections"
      },
      {
        "title": "OTT Platform Sections",
        "description": "Netflix, Prime Video, JioHotstar, and Apple TV sections (Movies + Series) that list only titles actually available on that platform — no random cross-platform filler.",
        "category": "New Discovery Sections"
      },
      {
        "title": "Accurate Content",
        "description": "Every section is strictly filtered — Indian sections show Indian titles, Kdramas are Korean, Animes are Japanese animation, and OTT sections show only what's streamable on that platform. Unreleased or unavailable titles never appear.",
        "category": "Smarter Content Filtering"
      },
      {
        "title": "Latest Trending Logic",
        "description": "OTT sections now rank the newest popular releases (last 3 months) instead of decade-old classics — fresh, currently-hyped movies and shows first.",
        "category": "Smarter Content Filtering"
      },
      {
        "title": "One-Click Section Refresh",
        "description": "Every section header button now re-fetches its own latest content instantly with a single click.",
        "category": "Performance & UX"
      },
      {
        "title": "Smoother Loading",
        "description": "Content loads in staggered waves instead of all at once — faster startup, no more lag, and fewer API hiccups.",
        "category": "Performance & UX"
      }
    ]
  },
  {
    "version": "v1.30.0",
    "summary": "Smooth episode transitions with Netflix-style cards and a perimeter progress ring.",
    "updates": [
      {
        "title": "Cinematic Episode Transition",
        "description": "Episode switching now uses a cross-fade — the video fades out, the next episode loads, then fades back in.",
        "category": "Features"
      },
      {
        "title": "Next-Episode Card",
        "description": "Replaced the old skip button with a compact Netflix-style card (thumbnail + TMDB episode name + S·E info) that appears before the outro credits.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Perimeter Progress Ring",
        "description": "A sleek progress line traces around the card's border, starting from bottom-center and completing a full lap in 12 seconds.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Smarter Auto-Skip",
        "description": "Card shows 11s before credits start; auto-skip fires 1s into the credits. When auto-skip is off, the card stays visible through the full segment.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Cleaner Episode Title",
        "description": "When TMDB doesn't return an episode name, the card now shows \"Episode N\" instead of a raw filename.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Auto-Skip Actually Fires",
        "description": "Fixed a race condition where the card segment went inactive at the exact same moment the skip should trigger — the skip now always fires.",
        "category": "Bug Fixes"
      },
      {
        "title": "No More Double Skips",
        "description": "Added a guard ref that prevents `playNextEpisode` from being called twice during a transition.",
        "category": "Bug Fixes"
      },
      {
        "title": "Increased HTTP Timeouts",
        "description": "Raised timeout from 10s to 30s for TMDB and network requests to reduce failures on slow connections.",
        "category": "Reliability"
      }
    ]
  },
  {
    "version": "v1.29.3",
    "summary": "Gen Z minimal — cleaner, faster, no fluff.",
    "updates": [
      {
        "title": "Minimal What's New",
        "description": "Stripped the dialog down to bare essentials — gradient accent bar, staggered icon list, and a gradient \"Got it\" button. Made for the scroll, not the slideshow.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Removed Dead Props",
        "description": "Cleaned up unused slide-navigation props from the What's New component — less code, less debt.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Full Subtitle Overhaul (merged)",
        "description": "Font size & vertical position controls, OTT-style (Netflix/Prime) option, style selection (default/clean), redesigned inline sync panel with compact single-row nudge bar, removed floating HUD pill.",
        "category": "Subtitle Experience"
      },
      {
        "title": "Real Names",
        "description": "Participants now show actual profile names instead of \"Guest 1/2\". Host gets a `(Host)` badge. Join/leave notifications with 4s auto-dismiss.",
        "category": "Watch Together"
      },
      {
        "title": "Delete That Actually Works",
        "description": "Stops WebTorrent before deleting (fixes Windows file locking), deletes entire torrent directory, removes DB record only on success. Fixed race condition crash from concurrent `torrent.destroy()` calls.",
        "category": "Delete Fixes"
      }
    ]
  },
  {
    "version": "v1.29.2",
    "summary": "Polished update experience and a cleaner What's New dialog.",
    "updates": [
      {
        "title": "Compact Update Button",
        "description": "The update button in the sidebar is now smaller, shows text labels (Update / % / Install), and uses cleaner status indicators — no more guessing what state your update is in.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Professional Update Cards",
        "description": "Expanded update panels (available, downloading, ready) are redesigned with a subtle, professional look — clear status, version info, and a single action button.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Simpler What's New Dialog",
        "description": "Replaced the full-screen cinematic onboarding with a compact modal that groups changes into Fixed / Improved / New categories for faster reading.",
        "category": "UI & UX Polish"
      }
    ]
  },
  {
    "version": "v1.29.0",
    "summary": "Deep dive into movies and series with seamless external web integration.",
    "updates": [
      {
        "title": "Moctale Reviews & Google Search",
        "description": "Instantly look up titles on Moctale or Google without ever leaving the app. Links open in a sleek, native popup window.",
        "category": "Web Integrations"
      },
      {
        "title": "Smart Navigation",
        "description": "Enjoy a lightning-fast, glassmorphic back button that dynamically appears when navigating within the popup, fully supporting Single Page Applications (SPAs).",
        "category": "Web Integrations"
      },
      {
        "title": "Focus Mode",
        "description": "The main app background smoothly dims and blurs when a popup is active, completely preventing accidental clicks behind the active window.",
        "category": "Web Integrations"
      },
      {
        "title": "Sandboxed Web Views",
        "description": "External websites (Moctale/Google) load inside an isolated, secure context without access to node internals or the app's file system, protecting your local data.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.28.2",
    "summary": "Patch release introducing smart caching and local persistence for movie and series vibe keywords.",
    "updates": [
      {
        "title": "Persistent Local Keywords",
        "description": "TMDB keywords for local library items are now saved directly to the database, ensuring they are instantly available across app restarts.",
        "category": "Performance & Caching"
      },
      {
        "title": "Smart Memory Caching",
        "description": "Keywords for trending and watchlist items are now bound directly to the UI cards, instantly loading when you revisit them in the same session without hitting the API again.",
        "category": "Performance & Caching"
      },
      {
        "title": "Optimized API Usage",
        "description": "Reduced unnecessary network calls to TMDB by intelligently skipping fetches when keyword data is already cached in memory or storage.",
        "category": "Performance & Caching"
      }
    ]
  },
  {
    "version": "v1.28.1",
    "summary": "Patch release focused on more accurate metadata tags and smoother transitions in the detail screen.",
    "updates": [
      {
        "title": "Better Vibe Tags",
        "description": "TMDB keyword tags are now loaded seamlessly from cache, removing jumpy text placeholders.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Accurate Ratings",
        "description": "Correctly relabeled the detail screen's movie and series ratings from IMDb to TMDB.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Trending Keyword Fix",
        "description": "Fixed a bug where TMDB keywords weren't fetched when opening a movie or series directly from the Trending sections.",
        "category": "UI & UX Polish"
      }
    ]
  },
  {
    "version": "v1.28.0",
    "summary": "Minor release focused on player stability, audio enhancements, and simpler onboarding.",
    "updates": [
      {
        "title": "Overhauled Video Player",
        "description": "Completely refactored the video player component for better performance, smoother playback, and cleaner code architecture.",
        "category": "Player Experience"
      },
      {
        "title": "Intro Skip",
        "description": "Added support for automatically skipping TV show intros with a single click.",
        "category": "Player Experience"
      },
      {
        "title": "Audio Boost",
        "description": "Integrated a new audio boost feature allowing users to increase volume for quiet videos natively.",
        "category": "Player Experience"
      },
      {
        "title": "Feature Guides",
        "description": "Added interactive UI guides (`FeatureGuides.tsx`) to help users discover new features naturally.",
        "category": "UI & UX Polish"
      },
      {
        "title": "Simplified What's New",
        "description": "Replaced the cinematic onboarding slides with a clean, simple, and direct WhatsApp-style \"What's New\" modal dialog.",
        "category": "UI & UX Polish"
      }
    ]
  },
  {
    "version": "v1.27.0",
    "summary": "Minor release focused on user personalization and premium visual upgrades across the app.",
    "updates": [
      {
        "title": "User Profile Avatars",
        "description": "Added the ability to choose and display a custom profile picture in Settings and the Sidebar.",
        "category": "Personalization"
      },
      {
        "title": "Premium Interface Upgrades",
        "description": "Redesigned the Settings, Downloads, and History pages with modern glassmorphism, dynamic gradients, and refined layouts.",
        "category": "UI & UX Polish"
      },
      {
        "title": "High-Resolution Artwork",
        "description": "The Detail screen now utilizes higher-resolution backdrop images (1280px) for a more cinematic and immersive look.",
        "category": "UI & UX Polish"
      }
    ]
  },
  {
    "version": "v1.26.1",
    "summary": "Patch release focused on fixing external audio playback rate issues, unsupported codec audio track selection, and removing the intrusive fullscreen helper tooltip.",
    "updates": [
      {
        "title": "Preserved Playback Speed",
        "description": "Fixed an issue where the audio playback rate would reset to normal (1.0x) speed whenever external audio tracks reloaded or seeked.",
        "category": "Video Player Experience"
      },
      {
        "title": "Better Codec Handling",
        "description": "Fixed audio track selection state issues that occurred when attempting to play tracks with unsupported codecs.",
        "category": "Video Player Experience"
      },
      {
        "title": "Removed Intrusive Tooltip",
        "description": "Removed the fullscreen helper tooltip that popped up persistently across empty spaces of the application window.",
        "category": "UI & UX Polish"
      }
    ]
  },
  {
    "version": "v1.26.0",
    "summary": "Minor release focused on basic ux improvemnt.",
    "updates": [
      {
        "title": "Double click to toggle fullscreen",
        "description": "double click on non-content are to enter/exit full screen.",
        "category": "General"
      },
      {
        "title": "Compact Content Overview",
        "description": "compact content overview in detailscreen page, with implementation of 'read more' button to see more.",
        "category": "General"
      },
      {
        "title": "Redesigned Detailscreen Page",
        "description": "redesigned the detailscreen page, improved how season selection ui, download the each episode, and primary and secondary action button.",
        "category": "General"
      }
    ]
  },
  {
    "version": "v1.25.3",
    "summary": "Patch release focused on making putting in fullscreen and exit from fullscreen seamless.",
    "updates": [
      {
        "title": "Persistent controls",
        "description": "Persistent close, minimise, maximise and fullscreen buttons.",
        "category": "Visibility"
      }
    ]
  },
  {
    "version": "v1.25.2",
    "summary": "Patch release focused on making title artwork fast, cached, and consistent across Home and detail pages.",
    "updates": [
      {
        "title": "Persistent Title Logos",
        "description": "TMDB title logos are now saved locally, so reopening MyCinema no longer repeats the same slow artwork lookup.",
        "category": "Title Artwork"
      },
      {
        "title": "Detail Screen Logos",
        "description": "Movie and series detail pages now fetch and show the same official TMDB title art used by the hero carousel.",
        "category": "Title Artwork"
      },
      {
        "title": "Readable While Loading",
        "description": "Detail pages keep the written title visible while missing logo artwork resolves in the background.",
        "category": "Title Artwork"
      },
      {
        "title": "Shared Logo Cache",
        "description": "Hero, detail, and trending title artwork now reuse the same cache path instead of creating separate lookup behavior.",
        "category": "Reliability"
      },
      {
        "title": "Correct Local Image Types",
        "description": "Cached SVG and GIF logo assets are served as images, not as fallback video content.",
        "category": "Reliability"
      },
      {
        "title": "Fewer Repeat Requests",
        "description": "Titles without TMDB logo art are cached briefly, avoiding repeated slow network checks for the same title.",
        "category": "Reliability"
      },
      {
        "title": "Scoped Artwork Serving",
        "description": "Cached artwork stays under the existing app user-data path and is served through the same safe local media protocol.",
        "category": "Security & Privacy"
      },
      {
        "title": "Validated Logo Lookups",
        "description": "Logo requests still accept only a movie or series type plus a TMDB ID through the main-process boundary.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.25.1",
    "summary": "Patch release focused on calmer fullscreen controls and more cinematic hero titles.",
    "updates": [
      {
        "title": "One Reveal Per Visit",
        "description": "The fullscreen control now appears only once when the pointer reaches the top center, instead of repeatedly popping out while the pointer stays there.",
        "category": "Fullscreen Experience"
      },
      {
        "title": "Stays Under The Cursor",
        "description": "Once revealed, the fullscreen control remains visible while the pointer is over the top edge or the control itself.",
        "category": "Fullscreen Experience"
      },
      {
        "title": "TMDB Title Logos First",
        "description": "Continue Watching hero titles now use TMDB logo artwork whenever it is available.",
        "category": "Hero Carousel"
      },
      {
        "title": "Readable Fallback Titles",
        "description": "Written movie and series titles appear only when TMDB has no logo or the logo image cannot load.",
        "category": "Hero Carousel"
      },
      {
        "title": "Cached Logo Lookups",
        "description": "Title-logo results are cached so the carousel does not repeatedly request the same artwork.",
        "category": "Hero Carousel"
      },
      {
        "title": "Scoped Logo Requests",
        "description": "The new title-logo lookup accepts only a validated movie or series type plus a TMDB ID through the existing main-process boundary.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.25.0",
    "summary": "Feature release focused on making the path from finding a title to watching it feel immediate.",
    "updates": [
      {
        "title": "Continue Watching Leads Home",
        "description": "Home now opens around titles already in progress, while recently added movies and series stay close behind.",
        "category": "Home & Discovery"
      },
      {
        "title": "One Search Across MyCinema",
        "description": "Home search now combines local library, Watchlist, and online results so users do not need to search separate screens.",
        "category": "Home & Discovery"
      },
      {
        "title": "Folder Setup Where It Matters",
        "description": "New libraries can add a media folder directly from Home instead of discovering the option later in Settings.",
        "category": "Home & Discovery"
      },
      {
        "title": "Clearer Content Sections",
        "description": "Recently added and trending rails now say exactly whether they contain movies, series, global titles, or India trends.",
        "category": "Home & Discovery"
      },
      {
        "title": "Play While Downloading",
        "description": "Active torrent downloads can open in the player before the file has finished downloading.",
        "category": "Downloads & Playback"
      },
      {
        "title": "Detail Page Command Center",
        "description": "Title details now show the right action for the current state, including Download Best, Choose Source, download progress, and Play While Downloading.",
        "category": "Downloads & Playback"
      },
      {
        "title": "Downloads Stay Visible",
        "description": "A compact global tray keeps active, paused, and failed downloads visible outside the Downloads screen, with a close action when it is not needed.",
        "category": "Downloads & Playback"
      },
      {
        "title": "Useful Downloads Dashboard",
        "description": "The Downloads screen now shows queue status, storage, completed items, failures, and a meaningful empty state.",
        "category": "Downloads & Playback"
      },
      {
        "title": "Faster Library Browsing",
        "description": "Movies, Series, and Videos now have compact search, filter, and sort controls for larger collections.",
        "category": "Library & History"
      },
      {
        "title": "Real Viewing History",
        "description": "History now includes titles that were started or completed instead of duplicating only Continue Watching.",
        "category": "Library & History"
      },
      {
        "title": "Cleaner Watchlist Focus",
        "description": "Duplicate search controls were removed so discovery starts from the unified Home search.",
        "category": "Library & History"
      },
      {
        "title": "Removed Downloads Disappear Promptly",
        "description": "Deleting a download now refreshes download indicators across Home and other screens.",
        "category": "Reliability & Polish"
      },
      {
        "title": "Torrent Audio Starts Correctly",
        "description": "Play While Downloading now resets the player to the torrent video's native audio track when playback begins.",
        "category": "Reliability & Polish"
      },
      {
        "title": "Calmer Fullscreen Exit Control",
        "description": "The top-edge fullscreen control waits for intentional pointer dwell and no longer keeps appearing during normal playback.",
        "category": "Reliability & Polish"
      },
      {
        "title": "Sidebar Brand Stays Visible",
        "description": "The MyCinema name no longer gets clipped in the expanded sidebar.",
        "category": "Reliability & Polish"
      },
      {
        "title": "Active Download Streams Only",
        "description": "Play While Downloading resolves an active download ID in the main process instead of accepting arbitrary renderer file paths.",
        "category": "Security & Privacy"
      },
      {
        "title": "Folder Access Remains Explicit",
        "description": "The new Home setup action still uses the existing folder picker, so MyCinema scans only the media folder the user selects.",
        "category": "Security & Privacy"
      },
      {
        "title": "Documented Delivery Handoff",
        "description": "The repository now documents the implementation-to-release workflow and its gate-by-gate handoff.",
        "category": "Developer & Release Workflow"
      }
    ]
  },
  {
    "version": "v1.24.0",
    "summary": "Feature release focused on smoother fullscreen control, a tighter Watchlist, and cleaner download-source cancellation.",
    "updates": [
      {
        "title": "Top-Center Fullscreen Control",
        "description": "The fullscreen exit control now appears from the top center when the pointer reaches the top edge, matching familiar streaming and browser patterns.",
        "category": "Fullscreen Experience"
      },
      {
        "title": "Faster Exit Feedback",
        "description": "The fullscreen control reveals more quickly and hides after use so switching fullscreen modes no longer shows the opposite action immediately under the cursor.",
        "category": "Fullscreen Experience"
      },
      {
        "title": "Cleaner Profile Chrome",
        "description": "Premium labels were removed from the sidebar and settings profile area so the account block feels quieter and less promotional.",
        "category": "Fullscreen Experience"
      },
      {
        "title": "Compact Watchlist Layout",
        "description": "Watchlist search, category rows, and saved-title cards now use less empty space while keeping poster art visible.",
        "category": "Watchlist & Typography"
      },
      {
        "title": "No Cropped Cards",
        "description": "Compact horizontal rows now keep enough vertical padding for badges and hover states, so ratings and poster tops are not clipped.",
        "category": "Watchlist & Typography"
      },
      {
        "title": "Cleaner Category Headers",
        "description": "Saved-list headers no longer repeat the same bookmark icon for every category, making custom lists easier to scan.",
        "category": "Watchlist & Typography"
      },
      {
        "title": "Poppins App Font",
        "description": "The renderer now loads Poppins locally and applies it across the app, including controls, subtitles, and player overlays.",
        "category": "Watchlist & Typography"
      },
      {
        "title": "Canceled Searches Really Stop",
        "description": "Closing a movie detail screen or download-source panel now cancels the active source search instead of letting provider lookups continue in the background.",
        "category": "Download Source Reliability"
      },
      {
        "title": "Abort-Aware Provider Timeouts",
        "description": "Torrent-source providers now abort their in-flight network work when a search is canceled or times out.",
        "category": "Download Source Reliability"
      },
      {
        "title": "Quieter DNS Fallbacks",
        "description": "DNS fallback logs are hidden during normal use and only appear when `MYCINEMA_DEBUG_DNS=1` is enabled.",
        "category": "Download Source Reliability"
      },
      {
        "title": "Scoped Source Search IPC",
        "description": "Torrent-source progress is tied to the active request ID, and stale or canceled source results are ignored instead of updating closed screens.",
        "category": "Security & Privacy"
      },
      {
        "title": "Network Work Ends On Cancel",
        "description": "DNS fallback and HTTPS helper paths now honor cancellation signals so abandoned searches stop touching external providers.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.23.1",
    "summary": "Patch release focused on making downloaded series subtitles follow every episode correctly.",
    "updates": [
      {
        "title": "Whole-Series Subtitle Downloads",
        "description": "Downloading an online subtitle for one series episode now checks the rest of the local series and downloads matching subtitles where available.",
        "category": "Series Subtitles"
      },
      {
        "title": "Correct Episode Loading",
        "description": "Changing episodes now loads that episode's own downloaded subtitle instead of reusing the previous or last episode's subtitle.",
        "category": "Series Subtitles"
      },
      {
        "title": "Visible Download Progress",
        "description": "The player now shows series subtitle progress while episodes are checked, downloaded, skipped, or missing.",
        "category": "Series Subtitles"
      },
      {
        "title": "Episode-Safe Subtitle Matching",
        "description": "External subtitle lookup rejects mismatched episode sidecars and keeps OpenSubtitles downloads tied to the video basename they were saved for.",
        "category": "Reliability"
      },
      {
        "title": "Source-Specific Subtitle Cache",
        "description": "Converted subtitle files are cached by their real subtitle path, preventing `External SRT` from pointing at another episode's cached cues.",
        "category": "Reliability"
      },
      {
        "title": "Scoped Subtitle File Use",
        "description": "Subtitle matching remains local and safe-path gated, with downloaded OpenSubtitles sidecars restricted to their matching episode filename.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.23.0",
    "summary": "Feature release focused on smarter episode skipping, calmer player controls, and a safer signed-release path.",
    "updates": [
      {
        "title": "Intro, Recap, And Credits Detection",
        "description": "Series episodes can now load skip ranges from TheIntroDB, IntroDB, or embedded local chapters.",
        "category": "Smart Episode Skipping"
      },
      {
        "title": "Auto Skip For Intros And Credits",
        "description": "The player can automatically jump past intros and credits while keeping recaps as a manual viewer choice.",
        "category": "Smart Episode Skipping"
      },
      {
        "title": "Timeline Segment Markers",
        "description": "Detected intro, recap, and credits sections now appear as subtle markers on the playback bar.",
        "category": "Smart Episode Skipping"
      },
      {
        "title": "OTT-Style Skip Controls",
        "description": "Skip prompts now use compact bottom-right `Watch` and `Skip` actions instead of heavy centered dialogs.",
        "category": "Player Experience"
      },
      {
        "title": "Smoother Auto Skip Feedback",
        "description": "Automatic skips use a short progress wipe and tiny confirmation receipt so the transition feels intentional.",
        "category": "Player Experience"
      },
      {
        "title": "Quieter Recap Prompting",
        "description": "Recap controls appear briefly near the start of a recap, then get out of the way if ignored.",
        "category": "Player Experience"
      },
      {
        "title": "Cleaner Watch Together Controls",
        "description": "Push-to-talk controls are more compact, and guests are guarded from locally overriding host playback.",
        "category": "Player Experience"
      },
      {
        "title": "Signed-Ready Release Workflow",
        "description": "Public Windows packaging now has a signed path plus an explicit owner-approved unsigned fallback.",
        "category": "Release & Installation"
      },
      {
        "title": "Signature Verification Script",
        "description": "Signed release packaging can now check the installer and unpacked app executable signatures before publishing.",
        "category": "Release & Installation"
      },
      {
        "title": "Safer Install Guidance",
        "description": "Installation docs now direct users to official GitHub releases and explain Windows publisher warnings more clearly.",
        "category": "Release & Installation"
      },
      {
        "title": "Scoped Skip Metadata Lookups",
        "description": "Intro and credits lookups use episode identifiers, while local chapter fallback stays behind safe file-path checks.",
        "category": "Security & Privacy"
      },
      {
        "title": "Credential Handling Stays External",
        "description": "GitHub tokens and code-signing certificate secrets remain environment variables and are not stored in the repo.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.22.3",
    "summary": "Patch release focused on reducing UI lag while keeping player enhancements sharp and responsive.",
    "updates": [
      {
        "title": "Stackable Visual Enhancements",
        "description": "FPS Boost, AI Sharpness, and AI Vibrance can now stay enabled together instead of one mode turning another off.",
        "category": "Player Experience"
      },
      {
        "title": "Sharper AI Sharpness",
        "description": "Sharpness now renders at full quality when quality boosts are active, samples the current frame directly, and uses a stronger edge pass so the toggle is visibly effective.",
        "category": "Player Experience"
      },
      {
        "title": "Less Intrusive Buffering UI",
        "description": "The buffering spinner now waits briefly before appearing, preventing tiny playback hiccups from flashing a loading indicator over the movie.",
        "category": "Player Experience"
      },
      {
        "title": "Fullscreen Exit Fix",
        "description": "The player fullscreen/minimize button now exits the active fullscreen state in one click instead of sometimes requiring a second press.",
        "category": "Player Experience"
      },
      {
        "title": "Lighter Home Rendering",
        "description": "Home snapshots are written after a short debounce, reducing repeated storage work during rapid row updates.",
        "category": "Performance & Responsiveness"
      },
      {
        "title": "Lean Artwork Loading",
        "description": "Hero and card images now use smaller TMDB sizes and lazy/async loading for offscreen artwork.",
        "category": "Performance & Responsiveness"
      },
      {
        "title": "Calmer Video Rails",
        "description": "Video clip previews now load metadata instead of preloading full video content in browsing views.",
        "category": "Performance & Responsiveness"
      },
      {
        "title": "Throttled Seek Preview Work",
        "description": "Seek thumbnail generation is capped so preview requests cannot pile up too aggressively.",
        "category": "Performance & Responsiveness"
      },
      {
        "title": "Debounced Library Refreshes",
        "description": "Folder scans now batch library-updated notifications instead of broadcasting after every processed file.",
        "category": "Library Reliability"
      },
      {
        "title": "Cleaner Missing-File Pruning",
        "description": "Missing local files are pruned during scanner work instead of every library read, keeping normal browsing calls lighter.",
        "category": "Library Reliability"
      },
      {
        "title": "Local File Work Stays Scoped",
        "description": "Library pruning and seek-preview generation remain local main-process work, with preview generation limited to a small number of concurrent jobs.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.22.2",
    "summary": "Patch release focused on making the in-app What's New experience accurately describe the latest release.",
    "updates": [
      {
        "title": "Accurate Release Story",
        "description": "The first-launch popup now lists the actual v1.22 changes and v1.22.1 performance-release work instead of generic launch copy.",
        "category": "What's New Popup"
      },
      {
        "title": "Real User-Facing Sections",
        "description": "Slides now cover share links, Watch Together talk flow, source and download responsiveness, safety fixes, and player polish.",
        "category": "What's New Popup"
      },
      {
        "title": "New Release Marker",
        "description": "The popup version is now `1.22.2`, so users who already saw v1.22.1 will see the corrected release notes once.",
        "category": "What's New Popup"
      },
      {
        "title": "Version Alignment",
        "description": "Package metadata, lockfile metadata, release notes, and the in-app release key now all point to v1.22.2.",
        "category": "Release Integrity"
      },
      {
        "title": "Experiment Branch Still Excluded",
        "description": "This release continues from `master` and does not merge the separate experiment/watch-party branch.",
        "category": "Release Integrity"
      }
    ]
  },
  {
    "version": "v1.22.1",
    "summary": "Patch release that ships the performance-improvement build as a new version after v1.22.0, keeping the experimental Watch Party branch out of this release.",
    "updates": [
      {
        "title": "Performance Branch Release",
        "description": "Merged the performance-improvement branch into `master` and released it as the new v1.22.1 build.",
        "category": "Release Focus"
      },
      {
        "title": "Watch Together Voice Polish",
        "description": "Includes the push-to-talk Watch Together flow, isolated two-client dev profiles, and conversation pause/resume behavior from the performance branch.",
        "category": "Release Focus"
      },
      {
        "title": "Player & Source Responsiveness",
        "description": "Ships the unified AI enhancement renderer, richer audio boost controls, throttled source progress updates, and safer media cleanup in the packaged build.",
        "category": "Release Focus"
      }
    ]
  },
  {
    "version": "v1.22.0",
    "summary": "Feature release focused on shareable MyCinema links, exact source handoff, smarter local libraries, seek previews, and sturdier download controls.",
    "updates": [
      {
        "title": "MyCinema Share Links",
        "description": "Movie and series detail pages now create share links with WhatsApp, Telegram, copy-link, and copy-message actions.",
        "category": "Sharing & Deep Links"
      },
      {
        "title": "Desktop Deep-Link Opening",
        "description": "The app now registers the `mycinema://` protocol so shared movie and series links can open directly in MyCinema.",
        "category": "Sharing & Deep Links"
      },
      {
        "title": "Exact Source Handoff",
        "description": "Shared links can carry the selected source metadata, letting the receiver open the same title with the shared source pinned at the top while fresh providers refresh.",
        "category": "Sharing & Deep Links"
      },
      {
        "title": "Public Share Worker",
        "description": "Added a Cloudflare Worker share page with Open Graph metadata, poster/backdrop previews, favicon branding, and an app handoff button.",
        "category": "Sharing & Deep Links"
      },
      {
        "title": "Share Exact Download Mirror",
        "description": "Download history can now share the exact magnet/source used for a title when TMDB context is available.",
        "category": "Downloads & Source Picking"
      },
      {
        "title": "Season Pack Filtering",
        "description": "Download and detail source panels now separate season packs from episode results and add a dedicated season-pack selector.",
        "category": "Downloads & Source Picking"
      },
      {
        "title": "Hindi Source Signals",
        "description": "Source search has stronger Hindi and dual-audio detection, Hindi provider coverage, and visible Hindi result counts in the Download panel.",
        "category": "Downloads & Source Picking"
      },
      {
        "title": "More Provider Coverage",
        "description": "Source discovery adds or strengthens Torrentio Hindi, Torrentio Dual Audio, Annatar, Comet, Jackettio, Shluflix, Peerflix, Stremify, Nyaa, TorrentGalaxy, LimeTorrents, GloTorrents, 1337x Hindi, and BTDig paths.",
        "category": "Downloads & Source Picking"
      },
      {
        "title": "Pause/Resume Stability",
        "description": "Download pause and resume now use pending-state guards so stale progress events do not immediately flip the UI back.",
        "category": "Downloads & Source Picking"
      },
      {
        "title": "Watch Together Push-To-Talk",
        "description": "Watch Together rooms now support microphone-based push-to-talk that pauses the movie while someone speaks, shares the speaker state, and resumes playback after the conversation pause.",
        "category": "Player & Local Library"
      },
      {
        "title": "Unified AI Enhancement Renderer",
        "description": "FPS boost, sharpness, and vibrance now share one WebGL enhancement renderer with safer canvas cleanup and native-video fallback behavior.",
        "category": "Player & Local Library"
      },
      {
        "title": "Richer Audio Boost Profiles",
        "description": "Audio Boost now includes Auto, Dialogue, Night, Laptop, and Cinema profiles with intensity controls for clearer voice and loudness tuning.",
        "category": "Player & Local Library"
      },
      {
        "title": "Seek Thumbnail Preview",
        "description": "Hovering the playback progress bar now asks the main process for cached ffmpeg thumbnails instead of loading a second hidden video preview.",
        "category": "Player & Local Library"
      },
      {
        "title": "Videos Stay Videos",
        "description": "The scanner now classifies personal clips, recordings, lectures, short files, and other non-release media as Videos instead of forcing them into Movies.",
        "category": "Player & Local Library"
      },
      {
        "title": "Metadata Refresh Fixes",
        "description": "Rescans can refresh changed titles, types, series fields, TMDB IDs, and stale cached poster matches instead of only filling duration.",
        "category": "Player & Local Library"
      },
      {
        "title": "Backup Restore Coverage",
        "description": "Backup import now accepts saved local `video` items in watchlist and favorites data.",
        "category": "Player & Local Library"
      },
      {
        "title": "Separate India Rails",
        "description": "Home now has separate India movie and India series rows, each backed by type-specific cache snapshots.",
        "category": "Home & Detail Polish"
      },
      {
        "title": "Fresher India OTT Discovery",
        "description": "India trending now uses a stricter recent OTT window, origin-country filtering, and popularity sorting for movies and series separately.",
        "category": "Home & Detail Polish"
      },
      {
        "title": "Detail Vibe Tags",
        "description": "Detail pages now derive concise vibe tags from genre, title, tagline, and overview context instead of only listing raw genres.",
        "category": "Home & Detail Polish"
      },
      {
        "title": "External Title Handling",
        "description": "Shared or TMDB-backed external titles can open details, trailers, source search, watchlist, and favorite actions without requiring a local file.",
        "category": "Home & Detail Polish"
      },
      {
        "title": "Validated Share Payloads",
        "description": "Deep links validate media type, TMDB ID, and magnet-based source payloads before opening shared source data.",
        "category": "Security & Privacy"
      },
      {
        "title": "Safe Share Rendering",
        "description": "The share Worker escapes rendered metadata, keeps TMDB access server-side through a Worker secret, and avoids putting the API key in shared URLs.",
        "category": "Security & Privacy"
      },
      {
        "title": "Scoped Seek Preview IPC",
        "description": "Seek thumbnails use the existing safe-path check before ffmpeg touches local files.",
        "category": "Security & Privacy"
      },
      {
        "title": "Cleaner Torrent Shutdown",
        "description": "Quit handling clears torrent progress timers, paused IDs, active torrents, and the WebTorrent client to reduce shutdown noise.",
        "category": "Security & Privacy"
      },
      {
        "title": "Expected Close-Abort Handling",
        "description": "Known Electron close-abort errors from pending async work are logged as expected shutdown events instead of crashing the main process.",
        "category": "Security & Privacy"
      },
      {
        "title": "Two-Client Watch Party Dev Scripts",
        "description": "Added separate host and guest development scripts with isolated temporary profiles for local Watch Together testing.",
        "category": "Developer & Release"
      },
      {
        "title": "Immersive What's New Onboarding",
        "description": "The release popup now uses a dedicated full-screen onboarding component with slide navigation, keyboard controls, and v1.22 messaging.",
        "category": "Developer & Release"
      },
      {
        "title": "Protocol Packaging",
        "description": "Windows builds now declare the MyCinema Link protocol in `electron-builder.yml`.",
        "category": "Developer & Release"
      },
      {
        "title": "Share Worker Project",
        "description": "Added a deployable `share-worker` project with Worker code, Wrangler config, and setup notes for the share domain.",
        "category": "Developer & Release"
      },
      {
        "title": "Local Worker Temp Ignore",
        "description": "Local `.wrangler` output is ignored so deploy cache files do not enter release commits.",
        "category": "Developer & Release"
      }
    ]
  },
  {
    "version": "v1.21.0",
    "summary": "Feature release focused on faster source discovery, a warmer home startup, and more reliable playback controls.",
    "updates": [
      {
        "title": "Progressive Source Search",
        "description": "Download and detail-page source panels now update as providers finish instead of waiting for every torrent source to complete.",
        "category": "Source Discovery"
      },
      {
        "title": "Broader Provider Coverage",
        "description": "Source search now checks YTS or EZTV, Torrentio, MediaFusion, KnightCrawler, 1337x, APIBay, SolidTorrents, and Bitsearch with shared filtering and de-duplication.",
        "category": "Source Discovery"
      },
      {
        "title": "Cached Source Results",
        "description": "Recent source results can appear immediately while the app refreshes providers in the background.",
        "category": "Source Discovery"
      },
      {
        "title": "Instant Home Snapshot",
        "description": "Home restores the last populated continue-watching, recent, trending, and featured rows from local storage while fresh data loads.",
        "category": "Home & Discovery"
      },
      {
        "title": "Scrollable Trending Rails",
        "description": "Trending This Week and Trending in India now use horizontal rails so more titles remain browsable without crowding the page.",
        "category": "Home & Discovery"
      },
      {
        "title": "Stronger India Trending",
        "description": "India discovery now mixes watchable movies and series, regional signals, daily trending, title logos, and stale cache fallback.",
        "category": "Home & Discovery"
      },
      {
        "title": "Safer Boost Rendering",
        "description": "FPS and quality boost canvases only take over when they are actively rendering, so native video remains visible on render failures.",
        "category": "Playback & Downloads"
      },
      {
        "title": "Cleaner Audio Track Startup",
        "description": "Embedded audio loading waits for video metadata and keeps native and external tracks labeled more consistently.",
        "category": "Playback & Downloads"
      },
      {
        "title": "Better Download Names",
        "description": "Downloads preserve the selected source title, display added-time ordering, and show paused or pending states more clearly.",
        "category": "Playback & Downloads"
      },
      {
        "title": "Scoped IPC Listeners",
        "description": "Library and torrent-source progress listeners now return cleanup callbacks so pages can unsubscribe without clearing unrelated listeners.",
        "category": "Security & Privacy"
      },
      {
        "title": "Network Timeout Guardrails",
        "description": "TMDB and torrent provider requests use explicit timeouts and fallback paths, reducing stuck network work without exposing secrets.",
        "category": "Security & Privacy"
      },
      {
        "title": "Safer Media Ranges",
        "description": "Local media range requests now reject invalid byte ranges with a proper 416 response instead of attempting unsafe reads.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.20.0",
    "summary": "Feature release focused on more resilient downloads, better source picking, watchlist category flow, and cleaner fullscreen playback.",
    "updates": [
      {
        "title": "Retry Failed Downloads",
        "description": "Failed torrent downloads now show a Retry action that clears the failed session and restarts from the saved magnet.",
        "category": "Downloads"
      },
      {
        "title": "Storage Overview",
        "description": "The Download page now displays free and total space for the MyCinema downloads folder with a refreshable usage bar.",
        "category": "Downloads"
      },
      {
        "title": "Live Search Cache",
        "description": "Download search now debounces TMDB lookups, reuses recent search results, and avoids clearing the interface with repeated requests.",
        "category": "Downloads"
      },
      {
        "title": "Health-Based Source Sorting",
        "description": "Download and detail-page source lists now use shared seed, peer, and quality scoring so healthier sources appear first.",
        "category": "Source Selection"
      },
      {
        "title": "Episode Filters",
        "description": "Series source browsing can now narrow results by season and episode, while season packs remain available separately.",
        "category": "Source Selection"
      },
      {
        "title": "Speed Labels",
        "description": "Source rows now show FAST, GOOD, OK, or SLOW labels based on seed availability.",
        "category": "Source Selection"
      },
      {
        "title": "Save To Category From Details",
        "description": "Detail pages now let users choose an existing watchlist category or create a new one before saving a title.",
        "category": "Watchlist & Library"
      },
      {
        "title": "Watchlist Refresh Fix",
        "description": "The Watchlist tab refreshes after detail-page changes, so newly saved or removed titles appear without reopening the app.",
        "category": "Watchlist & Library"
      },
      {
        "title": "Sharper Remote Artwork",
        "description": "TMDB posters and cards now request higher-resolution image sizes for cleaner browsing.",
        "category": "Watchlist & Library"
      },
      {
        "title": "Better Fullscreen Targeting",
        "description": "The player now requests fullscreen on the player shell, keeping boosted renderers and controls aligned.",
        "category": "Playback"
      },
      {
        "title": "Aspect-Ratio Contain Fix",
        "description": "Contain mode now sizes the video surface from the real video aspect ratio instead of stretching every file to the viewport.",
        "category": "Playback"
      },
      {
        "title": "Subtitle Position Polish",
        "description": "Subtitles move higher when controls are visible and settle lower when controls are hidden.",
        "category": "Playback"
      },
      {
        "title": "Safer Torrent Retry Cleanup",
        "description": "Retrying a failed download destroys any previous active or duplicate torrent instance before restarting it.",
        "category": "Security & Privacy"
      },
      {
        "title": "Tracker Enrichment Without Extra User Data",
        "description": "Magnets are enriched with public tracker announce URLs for reliability while keeping downloads in the local MyCinema downloads folder.",
        "category": "Security & Privacy"
      },
      {
        "title": "Storage Read Errors Stay Local",
        "description": "Download storage checks return local status and error text through IPC without exposing paths outside the app UI.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.19.3",
    "summary": "Patch release focused on Watch Together stability and lower TMDB usage on app launch.",
    "updates": [
      {
        "title": "Popup Dismissal Fix",
        "description": "Host Party, Join, copy, disconnect, and room-code input clicks no longer bubble into the video player and close the Watch Together popup.",
        "category": "Watch Together"
      },
      {
        "title": "Safer Player Interaction",
        "description": "Watch party controls now stay isolated from the player click handler that closes other player popups.",
        "category": "Watch Together"
      },
      {
        "title": "Persistent TMDB Cache",
        "description": "Trending movies, trending series, India OTT rows, and India OTT provider IDs now cache to disk for 12 hours.",
        "category": "Home Discovery"
      },
      {
        "title": "Lower Startup Traffic",
        "description": "Reopening MyCinema from the shortcut reuses fresh cached TMDB lists instead of refetching them every launch.",
        "category": "Home Discovery"
      },
      {
        "title": "Local Cache Only",
        "description": "TMDB list caches are stored in the app's local user data folder and refresh automatically after expiry or unreadable cache data.",
        "category": "Security & Privacy"
      },
      {
        "title": "Quota Protection",
        "description": "Successful discovery responses are reused across restarts to reduce unnecessary TMDB API calls.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.19.2",
    "summary": "Patch release focused on YouTube trailer reliability inside the desktop app.",
    "updates": [
      {
        "title": "YouTube Error 153 Fix",
        "description": "Trailer embeds now include a consistent app origin and referrer context to prevent the YouTube player configuration error screen.",
        "category": "Trailer Playback"
      },
      {
        "title": "Stuck Spinner Fix",
        "description": "YouTube player API calls now keep their natural headers, preventing trailers from loading the correct title while staying stuck at `0:00`.",
        "category": "Trailer Playback"
      },
      {
        "title": "Cleaner Trailer Reloads",
        "description": "The trailer iframe now remounts when the selected embed URL changes, avoiding stale player state after switching trailers.",
        "category": "Trailer Playback"
      },
      {
        "title": "Scoped Embed Headers",
        "description": "Only YouTube embed page requests get app `Origin` and `Referer` details; internal playback calls are no longer rewritten.",
        "category": "Security & Privacy"
      },
      {
        "title": "Safe External Fallback",
        "description": "The existing YouTube button remains the external viewing path when a trailer cannot play in-app.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.19.0",
    "summary": "Feature release focused on user data portability, a unified categorized watchlist, and a more compact settings experience.",
    "updates": [
      {
        "title": "JSON Backup Export",
        "description": "Users can export watched folders, watchlist entries, watchlist categories, and favorites to a local JSON backup file.",
        "category": "Backup & Restore"
      },
      {
        "title": "Backup Import",
        "description": "Import restores saved folders, rescans existing paths, and brings back watchlist items, categories, and favorites after a reset.",
        "category": "Backup & Restore"
      },
      {
        "title": "Local-Only Control",
        "description": "Backup files are written only to the location selected by the user.",
        "category": "Backup & Restore"
      },
      {
        "title": "One Watchlist System",
        "description": "Download-page saved lists now migrate into the main Watchlist tab instead of living separately.",
        "category": "Unified Watchlist"
      },
      {
        "title": "Category Rows",
        "description": "The Watchlist tab now displays saved titles in category-based horizontal rows.",
        "category": "Unified Watchlist"
      },
      {
        "title": "Save From Anywhere",
        "description": "Home search, hero actions, Download search, and Watchlist search all save into the same categorized watchlist.",
        "category": "Unified Watchlist"
      },
      {
        "title": "Compact Settings Layout",
        "description": "Settings now uses smaller rows, buttons, folder entries, and headings for easier scanning.",
        "category": "Settings Polish"
      },
      {
        "title": "Clear Backup Actions",
        "description": "Import and export controls now use directionally correct icons and clearer status messages.",
        "category": "Settings Polish"
      },
      {
        "title": "Backup Validation",
        "description": "Imports verify the MyCinema backup format before changing app data.",
        "category": "Security & Privacy"
      },
      {
        "title": "Path-Aware Restore",
        "description": "Folder imports skip missing paths safely and report them instead of failing the whole restore.",
        "category": "Security & Privacy"
      },
      {
        "title": "No Media Copying",
        "description": "Backups store app metadata only; movie and show files remain on the userâ€™s drives.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.18.0",
    "summary": "Focused feature and safety release for immersive fullscreen startup, cleaner source filtering, trailer reliability, and safer download cleanup.",
    "updates": [
      {
        "title": "Launch Fullscreen Setting",
        "description": "MyCinema can now start directly in fullscreen, with the preference saved in app settings.",
        "category": "Immersive App"
      },
      {
        "title": "Top-Edge Fullscreen Control",
        "description": "A compact fullscreen control appears at the top edge when launch fullscreen is enabled.",
        "category": "Immersive App"
      },
      {
        "title": "Settings Toggle",
        "description": "The Settings page now includes an Open in Fullscreen switch so users can change startup behavior without editing files.",
        "category": "Immersive App"
      },
      {
        "title": "Hindi Audio Filter",
        "description": "Detail page source results can now be filtered to Hindi-only releases.",
        "category": "Source Browsing"
      },
      {
        "title": "Season Filters",
        "description": "Series source results can be narrowed to season packs or a specific season.",
        "category": "Source Browsing"
      },
      {
        "title": "Seed Health Sorting",
        "description": "Source results are sorted by seed health, and filtered empty states now explain when no source matches the active filters.",
        "category": "Source Browsing"
      },
      {
        "title": "Stricter YouTube Embed Posture",
        "description": "Trailer embeds now use an explicit origin and strict referrer behavior for more predictable browser navigation.",
        "category": "Security & Privacy"
      },
      {
        "title": "Safer Download Cleanup",
        "description": "Paused download deletion now normalizes paths, narrows file targets, and falls back to matching top-level download folders instead of broad removal.",
        "category": "Security & Privacy"
      },
      {
        "title": "Library Refresh After Delete",
        "description": "Removing downloaded files refreshes local library entries so stale videos disappear more reliably.",
        "category": "Security & Privacy"
      }
    ]
  },
  {
    "version": "v1.17.0",
    "summary": "Focused feature release for faster discovery, smarter trailers, cleaner detail pages, and playback polish.",
    "updates": [
      {
        "title": "Live Home Search",
        "description": "The Home search button now expands into a search bar and shows movie/series results while the user types.",
        "category": "ðŸ”Ž Faster Search"
      },
      {
        "title": "Quick Detail Opening",
        "description": "Search results already carry poster, overview, rating, year, and TMDB ID so detail pages open with useful information immediately.",
        "category": "ðŸ”Ž Faster Search"
      },
      {
        "title": "Safer Dismissal",
        "description": "Clicking outside the search panel now closes it first instead of accidentally opening the hero or a card behind it.",
        "category": "ðŸ”Ž Faster Search"
      },
      {
        "title": "Title Logos",
        "description": "Detail pages now prefer official TMDB logo artwork instead of plain text titles when a logo exists.",
        "category": "ðŸŽ¬ Better Detail Pages"
      },
      {
        "title": "Sharper Posters, Faster Load",
        "description": "Posters use a high-quality but lighter TMDB image size, improving load time without changing the vertical poster layout.",
        "category": "ðŸŽ¬ Better Detail Pages"
      },
      {
        "title": "Moctale Shortcut",
        "description": "Added a Moctale button that opens the matching movie/series page in the browser for public reviews and discussion.",
        "category": "ðŸŽ¬ Better Detail Pages"
      },
      {
        "title": "Cleaner Badges",
        "description": "Removed hardcoded 4K and audio labels that were shown on every title.",
        "category": "ðŸŽ¬ Better Detail Pages"
      },
      {
        "title": "Season-Aware Trailers",
        "description": "Series trailers can switch by season from the trailer player.",
        "category": "â–¶ï¸ Smarter Trailers"
      },
      {
        "title": "Wrong Video Protection",
        "description": "Trailer picking now avoids blocked videos, unrelated YouTube results, vertical episode clips, and episode-specific trailers.",
        "category": "â–¶ï¸ Smarter Trailers"
      },
      {
        "title": "Faster Trailer Switching",
        "description": "Trailer results are cached and the old YouTube player is removed immediately while a new season trailer loads.",
        "category": "â–¶ï¸ Smarter Trailers"
      },
      {
        "title": "Upside-Down Video Fix",
        "description": "Corrected boosted rendering paths that could display some videos upside down.",
        "category": "ðŸŽ§ Playback Fixes"
      },
      {
        "title": "Popup Click Fix",
        "description": "Clicking outside player menus now closes the menu without toggling play/pause.",
        "category": "ðŸŽ§ Playback Fixes"
      },
      {
        "title": "Subtitle Selection Fix",
        "description": "Fixed a UI glitch where subtitle Off and an external subtitle could both appear selected.",
        "category": "ðŸŽ§ Playback Fixes"
      },
      {
        "title": "Better Audio Boost",
        "description": "Reworked audio boost into richer profiles with bass, dialogue, air, compression, and limiting.",
        "category": "ðŸŽ§ Playback Fixes"
      },
      {
        "title": "Compact What's New Popup",
        "description": "The first-launch release popup is now smaller, centered, cleaner, and written in plain language.",
        "category": "ðŸªŸ Release UI"
      }
    ]
  },
  {
    "version": "v1.16.0",
    "summary": "Feature release focused on a cinematic Home experience, cleaner update control, and stronger playback polish.",
    "updates": [
      {
        "title": "Cinematic Home Hero",
        "description": "Rebuilt the Home hero into a full-bleed visual experience with tuned image framing and a more polished content layout.",
        "category": "ðŸŽ¬ Home & Discovery"
      },
      {
        "title": "Official TMDB Title Logos",
        "description": "Hero titles now prefer TMDB logo artwork when available instead of plain text headings.",
        "category": "ðŸŽ¬ Home & Discovery"
      },
      {
        "title": "India OTT Trending Row",
        "description": "Added a dedicated trending rail for popular India OTT releases.",
        "category": "ðŸŽ¬ Home & Discovery"
      },
      {
        "title": "Richer Continue Watching Cards",
        "description": "Cards now surface more useful watch details by default while keeping quick actions clean.",
        "category": "ðŸŽ¬ Home & Discovery"
      },
      {
        "title": "Smarter Series Grouping",
        "description": "Series cards now resolve around the most relevant in-progress episode state more consistently.",
        "category": "ðŸŽ¬ Home & Discovery"
      },
      {
        "title": "Manual Update Downloads",
        "description": "New app updates are detected without auto-downloading, giving users explicit control over when downloads begin.",
        "category": "ðŸ”„ Update Experience"
      },
      {
        "title": "Collapsed Sidebar Update Signal",
        "description": "Even with the sidebar collapsed, users now see a compact update icon that reflects available, downloading, and ready states.",
        "category": "ðŸ”„ Update Experience"
      },
      {
        "title": "Refined What's New Modal",
        "description": "First launch after installing v1.16.0 now shows a cleaner, more polished release summary modal built specifically for this version.",
        "category": "ðŸ”„ Update Experience"
      },
      {
        "title": "Aspect-Aware Boost Renderers",
        "description": "FPS Boost and Quality Boost renderers now handle contain and cover modes more reliably across canvas sizing changes.",
        "category": "ðŸŽ¥ Playback & Rendering"
      },
      {
        "title": "Improved External Audio Sync",
        "description": "External audio tracks re-prime and re-sync more cleanly around seeks, resumes, and playback transitions.",
        "category": "ðŸŽ¥ Playback & Rendering"
      },
      {
        "title": "Subtitle Refresh Stability",
        "description": "Subtitle rendering now updates more consistently during active playback.",
        "category": "ðŸŽ¥ Playback & Rendering"
      },
      {
        "title": "Refined Media Cards",
        "description": "Poster and library cards now expose stronger visual detail and action clarity.",
        "category": "ðŸ› ï¸ UI Polish"
      },
      {
        "title": "Hero Search Simplification",
        "description": "The oversized hero search field was reduced to a compact icon treatment to preserve visual space.",
        "category": "ðŸ› ï¸ UI Polish"
      }
    ]
  },
  {
    "version": "v1.15.4",
    "summary": "Focused patch release for AI Boost control and player interaction polish.",
    "updates": [
      {
        "title": "Separate Sharpness & Vibrance Controls",
        "description": "AI Boost now lets users turn sharpness and vibrance on independently for different video situations.",
        "category": "ðŸŽ¥ AI Boost"
      },
      {
        "title": "Persisted Individual Preferences",
        "description": "Sharpness and vibrance each save their own setting, with a clean migration from the older combined AI Enhance preference.",
        "category": "ðŸŽ¥ AI Boost"
      },
      {
        "title": "Shader-Level Control",
        "description": "The quality renderer now passes separate uniforms for sharpening and vibrance/color processing while preserving the existing enhancement strength.",
        "category": "ðŸŽ¥ AI Boost"
      },
      {
        "title": "AI Boost Menu No Longer Toggles Playback",
        "description": "Opening the AI Boost pop-up or tapping its controls no longer pauses a playing video or starts a paused one.",
        "category": "ðŸ› ï¸ Player Fixes"
      },
      {
        "title": "Updated What's New Pop-up",
        "description": "First launch after installing v1.15.4 shows a one-time summary of these AI Boost and playback improvements.",
        "category": "ðŸ› ï¸ Player Fixes"
      }
    ]
  },
  {
    "version": "v1.15.3",
    "summary": "Focused patch release for refreshed app branding.",
    "updates": [
      {
        "title": "New App Logo",
        "description": "Updated the in-app MyCinema logo to the supplied gradient film-mark artwork.",
        "category": "ðŸŽ¬ Branding"
      },
      {
        "title": "New Windows App Icon",
        "description": "Regenerated the packaged `.ico` app icon from the same source image for installer, desktop, and taskbar usage.",
        "category": "ðŸŽ¬ Branding"
      },
      {
        "title": "Consistent Release Assets",
        "description": "Aligned renderer, favicon, and build resource images so the app presents one consistent identity.",
        "category": "ðŸŽ¬ Branding"
      }
    ]
  },
  {
    "version": "v1.15.2",
    "summary": "Focused patch release for updater visibility and install reliability.",
    "updates": [
      {
        "title": "Visible Update Progress Restored",
        "description": "The in-app update panel now clearly shows when a new version is available, when it is downloading, and when it is ready to install.",
        "category": "ðŸ”„ Auto Update Fixes"
      },
      {
        "title": "Explicit Restart & Install Flow",
        "description": "Updates no longer silently try to install on app quit. Users now get a clear restart-and-install action after download completes.",
        "category": "ðŸ”„ Auto Update Fixes"
      },
      {
        "title": "Safer Update Relaunch",
        "description": "The install path now avoids getting blocked by unrelated quit prompts during the final restart step.",
        "category": "ðŸ”„ Auto Update Fixes"
      }
    ]
  },
  {
    "version": "v1.15.1",
    "summary": "A massive performance and feature update focused on playback fidelity and system integration.",
    "updates": [
      {
        "title": "External Playback Support",
        "description": "You can now open any video file directly with MyCinema from your File Explorer. The app handles single-instance locking and transitions seamlessly to the player.",
        "category": "ðŸ“‚ Native System Integration"
      },
      {
        "title": "Smart Path Guard",
        "description": "Improved security whitelisting for external files and ad-hoc media loading.",
        "category": "ðŸ“‚ Native System Integration"
      },
      {
        "title": "FPS Boost & AI Enhance",
        "description": "Experience smoother motion and sharper details with integrated real-time frame interpolation and quality boost renderers.",
        "category": "ðŸŽ¥ AI & Hardware Enhancements"
      },
      {
        "title": "GPU-Accelerated Audio",
        "description": "Faster and smoother playback for videos with external audio tracks using D3D11 hardware acceleration.",
        "category": "ðŸŽ¥ AI & Hardware Enhancements"
      },
      {
        "title": "Online Subtitle Search",
        "description": "Directly search and download subtitles from OpenSubtitles within the player interface.",
        "category": "ðŸ•’ Pro Subtitle Suite"
      },
      {
        "title": "Precise Subtitle Sync",
        "description": "New timing controls to fix out-of-sync subtitles with millisecond precision (Â±ms).",
        "category": "ðŸ•’ Pro Subtitle Suite"
      },
      {
        "title": "Chunked Media Protocol",
        "description": "Optimized 5MB chunk-based streaming for zero-lag seeking and improved I/O performance.",
        "category": "ðŸ› ï¸ Performance & Maintenance"
      },
      {
        "title": "Library Auto-Pruning",
        "description": "Automatically cleans up library entries for files that have been moved or deleted from your system.",
        "category": "ðŸ› ï¸ Performance & Maintenance"
      },
      {
        "title": "Hindi Content Detection",
        "description": "Improved heuristics for detecting and tagging Hindi language content in the library.",
        "category": "ðŸ› ï¸ Performance & Maintenance"
      }
    ]
  },
  {
    "version": "v1.14.0",
    "summary": "A massive update introducing collaborative watching, real-time trends, and high-fidelity audio processing.",
    "updates": [
      {
        "title": "Synchronized Playback",
        "description": "Host a room and invite friends to watch the same video in perfect sync. Controls (play/pause/seek) are shared across all participants in real-time.",
        "category": "ðŸ¤ Watch Together (BETA)"
      },
      {
        "title": "Room Discovery",
        "description": "Simple room ID system for quick connections without complex setup.",
        "category": "ðŸ¤ Watch Together (BETA)"
      },
      {
        "title": "YouTube Deep Linking",
        "description": "Integrated native URI schemes to automatically open and resume YouTube content in the official application.",
        "category": "ðŸŽ¥ Enhanced YouTube & Media Engine"
      },
      {
        "title": "Audio Boost Engine",
        "description": "Professional-grade Web Audio API implementation with Bass Boost, Clarity Filters, and Dynamic Compression for a cinematic soundstage.",
        "category": "ðŸŽ¥ Enhanced YouTube & Media Engine"
      },
      {
        "title": "TMDB Integration",
        "description": "The Home screen now features real-time \"Trending This Week\" sections for both Movies and Web Series.",
        "category": "ðŸ“ˆ Smart Dashboard & Trends"
      },
      {
        "title": "Rich Metadata",
        "description": "High-fidelity posters, ratings, and genre tags automatically fetched for your entire library.",
        "category": "ðŸ“ˆ Smart Dashboard & Trends"
      },
      {
        "title": "Subtitle Sync",
        "description": "Added precise timing controls (Â±ms) to fix out-of-sync subtitles on the fly.",
        "category": "ðŸ•’ Pro Navigation"
      },
      {
        "title": "Online Subtitle Search",
        "description": "Directly search and download subtitles from OpenSubtitles within the player.",
        "category": "ðŸ•’ Pro Navigation"
      }
    ]
  },
  {
    "version": "v1.13.1",
    "summary": "",
    "updates": [
      {
        "title": "Magnet Discovery Fixed",
        "description": "Restored stable magnet fetching logic for high reliability.",
        "category": "General"
      },
      {
        "title": "Download Stability",
        "description": "Enabled DHT for faster peer discovery and improved download speeds.",
        "category": "General"
      }
    ]
  },
  {
    "version": "v1.6.0",
    "summary": "A monumental update that introduces true P2P downloading capabilities, completely overhauls the security model, and levels up the cinematic experience.",
    "updates": [
      {
        "title": "P2P Download Engine",
        "description": "Integrated WebTorrent with a beautiful side-panel UI for searching, streaming, and downloading movies and TV series effortlessly. Includes a brand-new introductory Grand Showcase tour.",
        "category": "ðŸŒŸ Features"
      },
      {
        "title": "Advanced Torrent Aggregation",
        "description": "Dynamic search and filtering for High-Def releases across multiple high-performance trackers (YTS, EZTV) with node-based DNS-over-HTTPS fallback to bypass ISP blocks.",
        "category": "ðŸŒŸ Features"
      },
      {
        "title": "Persistent Download Management",
        "description": "Your active, paused, and failed downloads are beautifully tracked and persist across app restarts automatically.",
        "category": "ðŸŒŸ Features"
      },
      {
        "title": "Strict Protocol Containment",
        "description": "Removed `bypassCSP` loopholes from custom media protocols to completely mitigate cross-site scripting (XSS) risks.",
        "category": "ðŸ›¡ï¸ Security & Privacy Audit"
      },
      {
        "title": "Path Traversal Protection",
        "description": "Implemented rigorous whitelisting for all renderer-to-main file handlers, strictly limiting read access to user-selected libraries and application paths.",
        "category": "ðŸ›¡ï¸ Security & Privacy Audit"
      },
      {
        "title": "Safe External Links",
        "description": "Validated and secured UI external links to prevent `javascript:` or `file:` URL payloads.",
        "category": "ðŸ›¡ï¸ Security & Privacy Audit"
      },
      {
        "title": "Local Network Obfuscation",
        "description": "Disabled DHT and LSD in the WebTorrent configuration by default. Your IP and local network activity are completely hidden during downloads.",
        "category": "ðŸ›¡ï¸ Security & Privacy Audit"
      },
      {
        "title": "Optimized P2P Connections",
        "description": "Reduced router overload by capping WebTorrent conns while injecting high-speed public trackers to maximize speed.",
        "category": "ðŸ›¡ï¸ Security & Privacy Audit"
      }
    ]
  },
  {
    "version": "v1.5.0",
    "summary": "A major update that brings an all-new metadata backend, massive reliability fixes, and enhanced hardware control.",
    "updates": [
      {
        "title": "TMDB Migration",
        "description": "Transitioned the primary metadata provider to TMDB (The Movie Database) for more reliable, accurate, and high-quality artwork and synopses.",
        "category": "ðŸŒŸ Features"
      },
      {
        "title": "Headphone Control & Navigation",
        "description": "Full integration with the MediaSession API to support play/pause from bluetooth headsets/media buttons.",
        "category": "ðŸŒŸ Features"
      },
      {
        "title": "Detail Screen Navigation",
        "description": "Quick exit from the Cinematic Detail Screen utilizing standard mouse back/forward buttons.",
        "category": "ðŸŒŸ Features"
      },
      {
        "title": "Flawless Thumbnails",
        "description": "Resolved tricky Chromium caching race conditions that blocked image rendering. Now every video securely generates a preview snapshot without silently failing.",
        "category": "ðŸ› ï¸ Improvements & Fixes"
      },
      {
        "title": "Real-Time Video Scrubbing",
        "description": "Removed CSS translation lag, delivering instant 1:1 timeline scrubbing while dragging the seekbar.",
        "category": "ðŸ› ï¸ Improvements & Fixes"
      }
    ]
  },
  {
    "version": "v1.4.0",
    "summary": "A major update bringing a cinematic experience to your desktop.",
    "updates": [
      {
        "title": "Cinematic Detail Screen",
        "description": "Immersive backdrop gradients, glassmorphism, and full series episode management.",
        "category": "ðŸŒŸ Features"
      },
      {
        "title": "Redesigned Video Player",
        "description": "Premium side panel for audio/subtitle selection and modernized controls.",
        "category": "ðŸŒŸ Features"
      },
      {
        "title": "Intelligent Navigation",
        "description": "Context-aware clicks (Detail Screen for discovery, Direct Play for resume).",
        "category": "ðŸŒŸ Features"
      },
      {
        "title": "Pro Player Controls",
        "description": "Precise 0.10x speed increments, 5X fast-forward, and remapped shortcuts.",
        "category": "ðŸŒŸ Features"
      },
      {
        "title": "Mouse Navigation",
        "description": "Added support for mouse \"back\" buttons to quickly exit the player.",
        "category": "ðŸŒŸ Features"
      },
      {
        "title": "ISP-Agnostic Metadata",
        "description": "Integrated DNS-over-HTTPS (DoH) to bypass ISP filtering.",
        "category": "ðŸ› ï¸ Improvements & Fixes"
      },
      {
        "title": "Ultra-Fast Library",
        "description": "Enhanced 3-layer caching (Database, Metadata Sidecar, Disk Image) for instant loading.",
        "category": "ðŸ› ï¸ Improvements & Fixes"
      },
      {
        "title": "Smart Scanner",
        "description": "Improved heuristics for movie sequel detection and series identification.",
        "category": "ðŸ› ï¸ Improvements & Fixes"
      },
      {
        "title": "UI Refinements",
        "description": "Fixed home screen cropping, improved blur effects, and \"genzy\" finish-time estimates.",
        "category": "ðŸ› ï¸ Improvements & Fixes"
      },
      {
        "title": "Aspect Ratio Magic",
        "description": "Robust `object-fit` logic ensuring perfect playback for all content formats.",
        "category": "ðŸ› ï¸ Improvements & Fixes"
      },
      {
        "title": "Added \"Clear Data\" utility to reset application state.",
        "description": "",
        "category": "ðŸ§¹ Maintenance"
      },
      {
        "title": "Codebase cleanup and removal of legacy components.",
        "description": "",
        "category": "ðŸ§¹ Maintenance"
      }
    ]
  }
];
