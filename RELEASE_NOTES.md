# MyCinema v1.29.1

Cleaner player controls with the removal of the Next Episode button.

### UI & UX Polish
- **Cleaner Player Controls**: Removed the "Next Episode" button from the player control bar, giving the playback buttons a more focused, streamlined layout with no distractions.

***

# MyCinema v1.29.0

Deep dive into movies and series with seamless external web integration.

### Web Integrations
- **Moctale Reviews & Google Search**: Instantly look up titles on Moctale or Google without ever leaving the app. Links open in a sleek, native popup window.
- **Smart Navigation**: Enjoy a lightning-fast, glassmorphic back button that dynamically appears when navigating within the popup, fully supporting Single Page Applications (SPAs).
- **Focus Mode**: The main app background smoothly dims and blurs when a popup is active, completely preventing accidental clicks behind the active window.

### Security & Privacy
- **Sandboxed Web Views**: External websites (Moctale/Google) load inside an isolated, secure context without access to node internals or the app's file system, protecting your local data.

***

# MyCinema v1.28.2

Patch release introducing smart caching and local persistence for movie and series vibe keywords.

### Performance & Caching
- **Persistent Local Keywords**: TMDB keywords for local library items are now saved directly to the database, ensuring they are instantly available across app restarts.
- **Smart Memory Caching**: Keywords for trending and watchlist items are now bound directly to the UI cards, instantly loading when you revisit them in the same session without hitting the API again.
- **Optimized API Usage**: Reduced unnecessary network calls to TMDB by intelligently skipping fetches when keyword data is already cached in memory or storage.

***

# MyCinema v1.28.1

Patch release focused on more accurate metadata tags and smoother transitions in the detail screen.

### UI & UX Polish
- **Better Vibe Tags**: TMDB keyword tags are now loaded seamlessly from cache, removing jumpy text placeholders.
- **Accurate Ratings**: Correctly relabeled the detail screen's movie and series ratings from IMDb to TMDB.
- **Trending Keyword Fix**: Fixed a bug where TMDB keywords weren't fetched when opening a movie or series directly from the Trending sections.

***

# MyCinema v1.28.0

Minor release focused on player stability, audio enhancements, and simpler onboarding.

### Player Experience
- **Overhauled Video Player**: Completely refactored the video player component for better performance, smoother playback, and cleaner code architecture.
- **Intro Skip**: Added support for automatically skipping TV show intros with a single click.
- **Audio Boost**: Integrated a new audio boost feature allowing users to increase volume for quiet videos natively.

### UI & UX Polish
- **Feature Guides**: Added interactive UI guides (`FeatureGuides.tsx`) to help users discover new features naturally.
- **Simplified What's New**: Replaced the cinematic onboarding slides with a clean, simple, and direct WhatsApp-style "What's New" modal dialog.

***

# MyCinema v1.27.0

Minor release focused on user personalization and premium visual upgrades across the app.

### Personalization
- **User Profile Avatars**: Added the ability to choose and display a custom profile picture in Settings and the Sidebar.

### UI & UX Polish
- **Premium Interface Upgrades**: Redesigned the Settings, Downloads, and History pages with modern glassmorphism, dynamic gradients, and refined layouts.
- **High-Resolution Artwork**: The Detail screen now utilizes higher-resolution backdrop images (1280px) for a more cinematic and immersive look.

***
# MyCinema v1.26.1

Patch release focused on fixing external audio playback rate issues, unsupported codec audio track selection, and removing the intrusive fullscreen helper tooltip.

### Video Player Experience
- **Preserved Playback Speed**: Fixed an issue where the audio playback rate would reset to normal (1.0x) speed whenever external audio tracks reloaded or seeked.
- **Better Codec Handling**: Fixed audio track selection state issues that occurred when attempting to play tracks with unsupported codecs.

### UI & UX Polish
- **Removed Intrusive Tooltip**: Removed the fullscreen helper tooltip that popped up persistently across empty spaces of the application window.

***

# MyCinema v1.26.0

Minor release focused on basic ux improvemnt. 

- **Double click to toggle fullscreen**: double click on non-content are to enter/exit full screen.
- **Compact Content Overview**: compact content overview in detailscreen page, with implementation of 'read more' button to see more.
- **Redesigned Detailscreen Page**: redesigned the detailscreen page, improved how season selection ui, download the each episode, and primary and secondary action button.


***

# MyCinema v1.25.3

Patch release focused on making putting in fullscreen and exit from fullscreen seamless.

### Visibility
- **Persistent controls**: Persistent close, minimise, maximise and fullscreen buttons.

***

# MyCinema v1.25.2

Patch release focused on making title artwork fast, cached, and consistent across Home and detail pages.

### Title Artwork
- **Persistent Title Logos**: TMDB title logos are now saved locally, so reopening MyCinema no longer repeats the same slow artwork lookup.
- **Detail Screen Logos**: Movie and series detail pages now fetch and show the same official TMDB title art used by the hero carousel.
- **Readable While Loading**: Detail pages keep the written title visible while missing logo artwork resolves in the background.

### Reliability
- **Shared Logo Cache**: Hero, detail, and trending title artwork now reuse the same cache path instead of creating separate lookup behavior.
- **Correct Local Image Types**: Cached SVG and GIF logo assets are served as images, not as fallback video content.
- **Fewer Repeat Requests**: Titles without TMDB logo art are cached briefly, avoiding repeated slow network checks for the same title.

### Security & Privacy
- **Scoped Artwork Serving**: Cached artwork stays under the existing app user-data path and is served through the same safe local media protocol.
- **Validated Logo Lookups**: Logo requests still accept only a movie or series type plus a TMDB ID through the main-process boundary.

***

# MyCinema v1.25.1

Patch release focused on calmer fullscreen controls and more cinematic hero titles.

### Fullscreen Experience
- **One Reveal Per Visit**: The fullscreen control now appears only once when the pointer reaches the top center, instead of repeatedly popping out while the pointer stays there.
- **Stays Under The Cursor**: Once revealed, the fullscreen control remains visible while the pointer is over the top edge or the control itself.

### Hero Carousel
- **TMDB Title Logos First**: Continue Watching hero titles now use TMDB logo artwork whenever it is available.
- **Readable Fallback Titles**: Written movie and series titles appear only when TMDB has no logo or the logo image cannot load.
- **Cached Logo Lookups**: Title-logo results are cached so the carousel does not repeatedly request the same artwork.

### Security & Privacy
- **Scoped Logo Requests**: The new title-logo lookup accepts only a validated movie or series type plus a TMDB ID through the existing main-process boundary.

***

# MyCinema v1.25.0

Feature release focused on making the path from finding a title to watching it feel immediate.

### Home & Discovery
- **Continue Watching Leads Home**: Home now opens around titles already in progress, while recently added movies and series stay close behind.
- **One Search Across MyCinema**: Home search now combines local library, Watchlist, and online results so users do not need to search separate screens.
- **Folder Setup Where It Matters**: New libraries can add a media folder directly from Home instead of discovering the option later in Settings.
- **Clearer Content Sections**: Recently added and trending rails now say exactly whether they contain movies, series, global titles, or India trends.

### Downloads & Playback
- **Play While Downloading**: Active torrent downloads can open in the player before the file has finished downloading.
- **Detail Page Command Center**: Title details now show the right action for the current state, including Download Best, Choose Source, download progress, and Play While Downloading.
- **Downloads Stay Visible**: A compact global tray keeps active, paused, and failed downloads visible outside the Downloads screen, with a close action when it is not needed.
- **Useful Downloads Dashboard**: The Downloads screen now shows queue status, storage, completed items, failures, and a meaningful empty state.

### Library & History
- **Faster Library Browsing**: Movies, Series, and Videos now have compact search, filter, and sort controls for larger collections.
- **Real Viewing History**: History now includes titles that were started or completed instead of duplicating only Continue Watching.
- **Cleaner Watchlist Focus**: Duplicate search controls were removed so discovery starts from the unified Home search.

### Reliability & Polish
- **Removed Downloads Disappear Promptly**: Deleting a download now refreshes download indicators across Home and other screens.
- **Torrent Audio Starts Correctly**: Play While Downloading now resets the player to the torrent video's native audio track when playback begins.
- **Calmer Fullscreen Exit Control**: The top-edge fullscreen control waits for intentional pointer dwell and no longer keeps appearing during normal playback.
- **Sidebar Brand Stays Visible**: The MyCinema name no longer gets clipped in the expanded sidebar.

### Security & Privacy
- **Active Download Streams Only**: Play While Downloading resolves an active download ID in the main process instead of accepting arbitrary renderer file paths.
- **Folder Access Remains Explicit**: The new Home setup action still uses the existing folder picker, so MyCinema scans only the media folder the user selects.

### Developer & Release Workflow
- **Documented Delivery Handoff**: The repository now documents the implementation-to-release workflow and its gate-by-gate handoff.

***

# MyCinema v1.24.0

Feature release focused on smoother fullscreen control, a tighter Watchlist, and cleaner download-source cancellation.

### Fullscreen Experience
- **Top-Center Fullscreen Control**: The fullscreen exit control now appears from the top center when the pointer reaches the top edge, matching familiar streaming and browser patterns.
- **Faster Exit Feedback**: The fullscreen control reveals more quickly and hides after use so switching fullscreen modes no longer shows the opposite action immediately under the cursor.
- **Cleaner Profile Chrome**: Premium labels were removed from the sidebar and settings profile area so the account block feels quieter and less promotional.

### Watchlist & Typography
- **Compact Watchlist Layout**: Watchlist search, category rows, and saved-title cards now use less empty space while keeping poster art visible.
- **No Cropped Cards**: Compact horizontal rows now keep enough vertical padding for badges and hover states, so ratings and poster tops are not clipped.
- **Cleaner Category Headers**: Saved-list headers no longer repeat the same bookmark icon for every category, making custom lists easier to scan.
- **Poppins App Font**: The renderer now loads Poppins locally and applies it across the app, including controls, subtitles, and player overlays.

### Download Source Reliability
- **Canceled Searches Really Stop**: Closing a movie detail screen or download-source panel now cancels the active source search instead of letting provider lookups continue in the background.
- **Abort-Aware Provider Timeouts**: Torrent-source providers now abort their in-flight network work when a search is canceled or times out.
- **Quieter DNS Fallbacks**: DNS fallback logs are hidden during normal use and only appear when `MYCINEMA_DEBUG_DNS=1` is enabled.

### Security & Privacy
- **Scoped Source Search IPC**: Torrent-source progress is tied to the active request ID, and stale or canceled source results are ignored instead of updating closed screens.
- **Network Work Ends On Cancel**: DNS fallback and HTTPS helper paths now honor cancellation signals so abandoned searches stop touching external providers.

***

# MyCinema v1.23.1

Patch release focused on making downloaded series subtitles follow every episode correctly.

### Series Subtitles
- **Whole-Series Subtitle Downloads**: Downloading an online subtitle for one series episode now checks the rest of the local series and downloads matching subtitles where available.
- **Correct Episode Loading**: Changing episodes now loads that episode's own downloaded subtitle instead of reusing the previous or last episode's subtitle.
- **Visible Download Progress**: The player now shows series subtitle progress while episodes are checked, downloaded, skipped, or missing.

### Reliability
- **Episode-Safe Subtitle Matching**: External subtitle lookup rejects mismatched episode sidecars and keeps OpenSubtitles downloads tied to the video basename they were saved for.
- **Source-Specific Subtitle Cache**: Converted subtitle files are cached by their real subtitle path, preventing `External SRT` from pointing at another episode's cached cues.

### Security & Privacy
- **Scoped Subtitle File Use**: Subtitle matching remains local and safe-path gated, with downloaded OpenSubtitles sidecars restricted to their matching episode filename.

***

# MyCinema v1.23.0

Feature release focused on smarter episode skipping, calmer player controls, and a safer signed-release path.

### Smart Episode Skipping
- **Intro, Recap, And Credits Detection**: Series episodes can now load skip ranges from TheIntroDB, IntroDB, or embedded local chapters.
- **Auto Skip For Intros And Credits**: The player can automatically jump past intros and credits while keeping recaps as a manual viewer choice.
- **Timeline Segment Markers**: Detected intro, recap, and credits sections now appear as subtle markers on the playback bar.

### Player Experience
- **OTT-Style Skip Controls**: Skip prompts now use compact bottom-right `Watch` and `Skip` actions instead of heavy centered dialogs.
- **Smoother Auto Skip Feedback**: Automatic skips use a short progress wipe and tiny confirmation receipt so the transition feels intentional.
- **Quieter Recap Prompting**: Recap controls appear briefly near the start of a recap, then get out of the way if ignored.
- **Cleaner Watch Together Controls**: Push-to-talk controls are more compact, and guests are guarded from locally overriding host playback.

### Release & Installation
- **Signed-Ready Release Workflow**: Public Windows packaging now has a signed path plus an explicit owner-approved unsigned fallback.
- **Signature Verification Script**: Signed release packaging can now check the installer and unpacked app executable signatures before publishing.
- **Safer Install Guidance**: Installation docs now direct users to official GitHub releases and explain Windows publisher warnings more clearly.

### Security & Privacy
- **Scoped Skip Metadata Lookups**: Intro and credits lookups use episode identifiers, while local chapter fallback stays behind safe file-path checks.
- **Credential Handling Stays External**: GitHub tokens and code-signing certificate secrets remain environment variables and are not stored in the repo.

***

# MyCinema v1.22.3

Patch release focused on reducing UI lag while keeping player enhancements sharp and responsive.

### Player Experience
- **Stackable Visual Enhancements**: FPS Boost, AI Sharpness, and AI Vibrance can now stay enabled together instead of one mode turning another off.
- **Sharper AI Sharpness**: Sharpness now renders at full quality when quality boosts are active, samples the current frame directly, and uses a stronger edge pass so the toggle is visibly effective.
- **Less Intrusive Buffering UI**: The buffering spinner now waits briefly before appearing, preventing tiny playback hiccups from flashing a loading indicator over the movie.
- **Fullscreen Exit Fix**: The player fullscreen/minimize button now exits the active fullscreen state in one click instead of sometimes requiring a second press.

### Performance & Responsiveness
- **Lighter Home Rendering**: Home snapshots are written after a short debounce, reducing repeated storage work during rapid row updates.
- **Lean Artwork Loading**: Hero and card images now use smaller TMDB sizes and lazy/async loading for offscreen artwork.
- **Calmer Video Rails**: Video clip previews now load metadata instead of preloading full video content in browsing views.
- **Throttled Seek Preview Work**: Seek thumbnail generation is capped so preview requests cannot pile up too aggressively.

### Library Reliability
- **Debounced Library Refreshes**: Folder scans now batch library-updated notifications instead of broadcasting after every processed file.
- **Cleaner Missing-File Pruning**: Missing local files are pruned during scanner work instead of every library read, keeping normal browsing calls lighter.

### Security & Privacy
- **Local File Work Stays Scoped**: Library pruning and seek-preview generation remain local main-process work, with preview generation limited to a small number of concurrent jobs.

***

# MyCinema v1.22.2

Patch release focused on making the in-app What's New experience accurately describe the latest release.

### What's New Popup
- **Accurate Release Story**: The first-launch popup now lists the actual v1.22 changes and v1.22.1 performance-release work instead of generic launch copy.
- **Real User-Facing Sections**: Slides now cover share links, Watch Together talk flow, source and download responsiveness, safety fixes, and player polish.
- **New Release Marker**: The popup version is now `1.22.2`, so users who already saw v1.22.1 will see the corrected release notes once.

### Release Integrity
- **Version Alignment**: Package metadata, lockfile metadata, release notes, and the in-app release key now all point to v1.22.2.
- **Experiment Branch Still Excluded**: This release continues from `master` and does not merge the separate experiment/watch-party branch.

***

# MyCinema v1.22.1

Patch release that ships the performance-improvement build as a new version after v1.22.0, keeping the experimental Watch Party branch out of this release.

### Release Focus
- **Performance Branch Release**: Merged the performance-improvement branch into `master` and released it as the new v1.22.1 build.
- **Watch Together Voice Polish**: Includes the push-to-talk Watch Together flow, isolated two-client dev profiles, and conversation pause/resume behavior from the performance branch.
- **Player & Source Responsiveness**: Ships the unified AI enhancement renderer, richer audio boost controls, throttled source progress updates, and safer media cleanup in the packaged build.

***

# MyCinema v1.22.0

Feature release focused on shareable MyCinema links, exact source handoff, smarter local libraries, seek previews, and sturdier download controls.

### Sharing & Deep Links
- **MyCinema Share Links**: Movie and series detail pages now create share links with WhatsApp, Telegram, copy-link, and copy-message actions.
- **Desktop Deep-Link Opening**: The app now registers the `mycinema://` protocol so shared movie and series links can open directly in MyCinema.
- **Exact Source Handoff**: Shared links can carry the selected source metadata, letting the receiver open the same title with the shared source pinned at the top while fresh providers refresh.
- **Public Share Worker**: Added a Cloudflare Worker share page with Open Graph metadata, poster/backdrop previews, favicon branding, and an app handoff button.

### Downloads & Source Picking
- **Share Exact Download Mirror**: Download history can now share the exact magnet/source used for a title when TMDB context is available.
- **Season Pack Filtering**: Download and detail source panels now separate season packs from episode results and add a dedicated season-pack selector.
- **Hindi Source Signals**: Source search has stronger Hindi and dual-audio detection, Hindi provider coverage, and visible Hindi result counts in the Download panel.
- **More Provider Coverage**: Source discovery adds or strengthens Torrentio Hindi, Torrentio Dual Audio, Annatar, Comet, Jackettio, Shluflix, Peerflix, Stremify, Nyaa, TorrentGalaxy, LimeTorrents, GloTorrents, 1337x Hindi, and BTDig paths.
- **Pause/Resume Stability**: Download pause and resume now use pending-state guards so stale progress events do not immediately flip the UI back.

### Player & Local Library
- **Watch Together Push-To-Talk**: Watch Together rooms now support microphone-based push-to-talk that pauses the movie while someone speaks, shares the speaker state, and resumes playback after the conversation pause.
- **Unified AI Enhancement Renderer**: FPS boost, sharpness, and vibrance now share one WebGL enhancement renderer with safer canvas cleanup and native-video fallback behavior.
- **Richer Audio Boost Profiles**: Audio Boost now includes Auto, Dialogue, Night, Laptop, and Cinema profiles with intensity controls for clearer voice and loudness tuning.
- **Seek Thumbnail Preview**: Hovering the playback progress bar now asks the main process for cached ffmpeg thumbnails instead of loading a second hidden video preview.
- **Videos Stay Videos**: The scanner now classifies personal clips, recordings, lectures, short files, and other non-release media as Videos instead of forcing them into Movies.
- **Metadata Refresh Fixes**: Rescans can refresh changed titles, types, series fields, TMDB IDs, and stale cached poster matches instead of only filling duration.
- **Backup Restore Coverage**: Backup import now accepts saved local `video` items in watchlist and favorites data.

### Home & Detail Polish
- **Separate India Rails**: Home now has separate India movie and India series rows, each backed by type-specific cache snapshots.
- **Fresher India OTT Discovery**: India trending now uses a stricter recent OTT window, origin-country filtering, and popularity sorting for movies and series separately.
- **Detail Vibe Tags**: Detail pages now derive concise vibe tags from genre, title, tagline, and overview context instead of only listing raw genres.
- **External Title Handling**: Shared or TMDB-backed external titles can open details, trailers, source search, watchlist, and favorite actions without requiring a local file.

### Security & Privacy
- **Validated Share Payloads**: Deep links validate media type, TMDB ID, and magnet-based source payloads before opening shared source data.
- **Safe Share Rendering**: The share Worker escapes rendered metadata, keeps TMDB access server-side through a Worker secret, and avoids putting the API key in shared URLs.
- **Scoped Seek Preview IPC**: Seek thumbnails use the existing safe-path check before ffmpeg touches local files.
- **Cleaner Torrent Shutdown**: Quit handling clears torrent progress timers, paused IDs, active torrents, and the WebTorrent client to reduce shutdown noise.
- **Expected Close-Abort Handling**: Known Electron close-abort errors from pending async work are logged as expected shutdown events instead of crashing the main process.

### Developer & Release
- **Two-Client Watch Party Dev Scripts**: Added separate host and guest development scripts with isolated temporary profiles for local Watch Together testing.
- **Immersive What's New Onboarding**: The release popup now uses a dedicated full-screen onboarding component with slide navigation, keyboard controls, and v1.22 messaging.
- **Protocol Packaging**: Windows builds now declare the MyCinema Link protocol in `electron-builder.yml`.
- **Share Worker Project**: Added a deployable `share-worker` project with Worker code, Wrangler config, and setup notes for the share domain.
- **Local Worker Temp Ignore**: Local `.wrangler` output is ignored so deploy cache files do not enter release commits.

***

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
- **No Media Copying**: Backups store app metadata only; movie and show files remain on the userâ€™s drives.

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

# MyCinema v1.17.0 ðŸš€

Focused feature release for faster discovery, smarter trailers, cleaner detail pages, and playback polish.

### ðŸ”Ž Faster Search
- **Live Home Search**: The Home search button now expands into a search bar and shows movie/series results while the user types.
- **Quick Detail Opening**: Search results already carry poster, overview, rating, year, and TMDB ID so detail pages open with useful information immediately.
- **Safer Dismissal**: Clicking outside the search panel now closes it first instead of accidentally opening the hero or a card behind it.

### ðŸŽ¬ Better Detail Pages
- **Title Logos**: Detail pages now prefer official TMDB logo artwork instead of plain text titles when a logo exists.
- **Sharper Posters, Faster Load**: Posters use a high-quality but lighter TMDB image size, improving load time without changing the vertical poster layout.
- **Moctale Shortcut**: Added a Moctale button that opens the matching movie/series page in the browser for public reviews and discussion.
- **Cleaner Badges**: Removed hardcoded 4K and audio labels that were shown on every title.

### â–¶ï¸ Smarter Trailers
- **Season-Aware Trailers**: Series trailers can switch by season from the trailer player.
- **Wrong Video Protection**: Trailer picking now avoids blocked videos, unrelated YouTube results, vertical episode clips, and episode-specific trailers.
- **Faster Trailer Switching**: Trailer results are cached and the old YouTube player is removed immediately while a new season trailer loads.

### ðŸŽ§ Playback Fixes
- **Upside-Down Video Fix**: Corrected boosted rendering paths that could display some videos upside down.
- **Popup Click Fix**: Clicking outside player menus now closes the menu without toggling play/pause.
- **Subtitle Selection Fix**: Fixed a UI glitch where subtitle Off and an external subtitle could both appear selected.
- **Better Audio Boost**: Reworked audio boost into richer profiles with bass, dialogue, air, compression, and limiting.

### ðŸªŸ Release UI
- **Compact What's New Popup**: The first-launch release popup is now smaller, centered, cleaner, and written in plain language.

***

# MyCinema v1.16.0 ðŸš€

Feature release focused on a cinematic Home experience, cleaner update control, and stronger playback polish.

### ðŸŽ¬ Home & Discovery
- **Cinematic Home Hero**: Rebuilt the Home hero into a full-bleed visual experience with tuned image framing and a more polished content layout.
- **Official TMDB Title Logos**: Hero titles now prefer TMDB logo artwork when available instead of plain text headings.
- **India OTT Trending Row**: Added a dedicated trending rail for popular India OTT releases.
- **Richer Continue Watching Cards**: Cards now surface more useful watch details by default while keeping quick actions clean.
- **Smarter Series Grouping**: Series cards now resolve around the most relevant in-progress episode state more consistently.

### ðŸ”„ Update Experience
- **Manual Update Downloads**: New app updates are detected without auto-downloading, giving users explicit control over when downloads begin.
- **Collapsed Sidebar Update Signal**: Even with the sidebar collapsed, users now see a compact update icon that reflects available, downloading, and ready states.
- **Refined What's New Modal**: First launch after installing v1.16.0 now shows a cleaner, more polished release summary modal built specifically for this version.

### ðŸŽ¥ Playback & Rendering
- **Aspect-Aware Boost Renderers**: FPS Boost and Quality Boost renderers now handle contain and cover modes more reliably across canvas sizing changes.
- **Improved External Audio Sync**: External audio tracks re-prime and re-sync more cleanly around seeks, resumes, and playback transitions.
- **Subtitle Refresh Stability**: Subtitle rendering now updates more consistently during active playback.

### ðŸ› ï¸ UI Polish
- **Refined Media Cards**: Poster and library cards now expose stronger visual detail and action clarity.
- **Hero Search Simplification**: The oversized hero search field was reduced to a compact icon treatment to preserve visual space.

***

# MyCinema v1.15.4 ðŸš€

Focused patch release for AI Boost control and player interaction polish.

### ðŸŽ¥ AI Boost
- **Separate Sharpness & Vibrance Controls**: AI Boost now lets users turn sharpness and vibrance on independently for different video situations.
- **Persisted Individual Preferences**: Sharpness and vibrance each save their own setting, with a clean migration from the older combined AI Enhance preference.
- **Shader-Level Control**: The quality renderer now passes separate uniforms for sharpening and vibrance/color processing while preserving the existing enhancement strength.

### ðŸ› ï¸ Player Fixes
- **AI Boost Menu No Longer Toggles Playback**: Opening the AI Boost pop-up or tapping its controls no longer pauses a playing video or starts a paused one.
- **Updated What's New Pop-up**: First launch after installing v1.15.4 shows a one-time summary of these AI Boost and playback improvements.

***

# MyCinema v1.15.3 ðŸš€

Focused patch release for refreshed app branding.

### ðŸŽ¬ Branding
- **New App Logo**: Updated the in-app MyCinema logo to the supplied gradient film-mark artwork.
- **New Windows App Icon**: Regenerated the packaged `.ico` app icon from the same source image for installer, desktop, and taskbar usage.
- **Consistent Release Assets**: Aligned renderer, favicon, and build resource images so the app presents one consistent identity.

***

# MyCinema v1.15.2 ðŸš€

Focused patch release for updater visibility and install reliability.

### ðŸ”„ Auto Update Fixes
- **Visible Update Progress Restored**: The in-app update panel now clearly shows when a new version is available, when it is downloading, and when it is ready to install.
- **Explicit Restart & Install Flow**: Updates no longer silently try to install on app quit. Users now get a clear restart-and-install action after download completes.
- **Safer Update Relaunch**: The install path now avoids getting blocked by unrelated quit prompts during the final restart step.

***

# MyCinema v1.15.1 ðŸš€

A massive performance and feature update focused on playback fidelity and system integration.

### ðŸ“‚ Native System Integration
- **External Playback Support**: You can now open any video file directly with MyCinema from your File Explorer. The app handles single-instance locking and transitions seamlessly to the player.
- **Smart Path Guard**: Improved security whitelisting for external files and ad-hoc media loading.

### ðŸŽ¥ AI & Hardware Enhancements
- **FPS Boost & AI Enhance**: Experience smoother motion and sharper details with integrated real-time frame interpolation and quality boost renderers.
- **GPU-Accelerated Audio**: Faster and smoother playback for videos with external audio tracks using D3D11 hardware acceleration.

### ðŸ•’ Pro Subtitle Suite
- **Online Subtitle Search**: Directly search and download subtitles from OpenSubtitles within the player interface.
- **Precise Subtitle Sync**: New timing controls to fix out-of-sync subtitles with millisecond precision (Â±ms).

### ðŸ› ï¸ Performance & Maintenance
- **Chunked Media Protocol**: Optimized 5MB chunk-based streaming for zero-lag seeking and improved I/O performance.
- **Library Auto-Pruning**: Automatically cleans up library entries for files that have been moved or deleted from your system.
- **Hindi Content Detection**: Improved heuristics for detecting and tagging Hindi language content in the library.

***

# MyCinema v1.14.0 ðŸš€

A massive update introducing collaborative watching, real-time trends, and high-fidelity audio processing.

### ðŸ¤ Watch Together (BETA)
- **Synchronized Playback**: Host a room and invite friends to watch the same video in perfect sync. Controls (play/pause/seek) are shared across all participants in real-time.
- **Room Discovery**: Simple room ID system for quick connections without complex setup.

### ðŸŽ¥ Enhanced YouTube & Media Engine
- **YouTube Deep Linking**: Integrated native URI schemes to automatically open and resume YouTube content in the official application.
- **Audio Boost Engine**: Professional-grade Web Audio API implementation with Bass Boost, Clarity Filters, and Dynamic Compression for a cinematic soundstage.

### ðŸ“ˆ Smart Dashboard & Trends
- **TMDB Integration**: The Home screen now features real-time "Trending This Week" sections for both Movies and Web Series.
- **Rich Metadata**: High-fidelity posters, ratings, and genre tags automatically fetched for your entire library.

### ðŸ•’ Pro Navigation
- **Subtitle Sync**: Added precise timing controls (Â±ms) to fix out-of-sync subtitles on the fly.
- **Online Subtitle Search**: Directly search and download subtitles from OpenSubtitles within the player.

***

# MyCinema v1.13.1 ðŸš€

- **Magnet Discovery Fixed**: Restored stable magnet fetching logic for high reliability.
- **Download Stability**: Enabled DHT for faster peer discovery and improved download speeds.

***

# MyCinema v1.6.0 ðŸš€

A monumental update that introduces true P2P downloading capabilities, completely overhauls the security model, and levels up the cinematic experience.

### ðŸŒŸ Features
- **P2P Download Engine**: Integrated WebTorrent with a beautiful side-panel UI for searching, streaming, and downloading movies and TV series effortlessly. Includes a brand-new introductory Grand Showcase tour.
- **Advanced Torrent Aggregation**: Dynamic search and filtering for High-Def releases across multiple high-performance trackers (YTS, EZTV) with node-based DNS-over-HTTPS fallback to bypass ISP blocks.
- **Persistent Download Management**: Your active, paused, and failed downloads are beautifully tracked and persist across app restarts automatically.

### ðŸ›¡ï¸ Security & Privacy Audit
- **Strict Protocol Containment**: Removed `bypassCSP` loopholes from custom media protocols to completely mitigate cross-site scripting (XSS) risks.
- **Path Traversal Protection**: Implemented rigorous whitelisting for all renderer-to-main file handlers, strictly limiting read access to user-selected libraries and application paths.
- **Safe External Links**: Validated and secured UI external links to prevent `javascript:` or `file:` URL payloads.
- **Local Network Obfuscation**: Disabled DHT and LSD in the WebTorrent configuration by default. Your IP and local network activity are completely hidden during downloads.
- **Optimized P2P Connections**: Reduced router overload by capping WebTorrent conns while injecting high-speed public trackers to maximize speed.

***

# MyCinema v1.5.0 ðŸš€

A major update that brings an all-new metadata backend, massive reliability fixes, and enhanced hardware control.

### ðŸŒŸ Features
- **TMDB Migration**: Transitioned the primary metadata provider to TMDB (The Movie Database) for more reliable, accurate, and high-quality artwork and synopses.
- **Headphone Control & Navigation**: Full integration with the MediaSession API to support play/pause from bluetooth headsets/media buttons.
- **Detail Screen Navigation**: Quick exit from the Cinematic Detail Screen utilizing standard mouse back/forward buttons.

### ðŸ› ï¸ Improvements & Fixes
- **Flawless Thumbnails**: Resolved tricky Chromium caching race conditions that blocked image rendering. Now every video securely generates a preview snapshot without silently failing.
- **Real-Time Video Scrubbing**: Removed CSS translation lag, delivering instant 1:1 timeline scrubbing while dragging the seekbar.

***

# MyCinema v1.4.0 ðŸš€

A major update bringing a cinematic experience to your desktop.

### ðŸŒŸ Features
- **Cinematic Detail Screen**: Immersive backdrop gradients, glassmorphism, and full series episode management.
- **Redesigned Video Player**: Premium side panel for audio/subtitle selection and modernized controls.
- **Intelligent Navigation**: Context-aware clicks (Detail Screen for discovery, Direct Play for resume).
- **Pro Player Controls**: Precise 0.10x speed increments, 5X fast-forward, and remapped shortcuts.
- **Mouse Navigation**: Added support for mouse "back" buttons to quickly exit the player.

### ðŸ› ï¸ Improvements & Fixes
- **ISP-Agnostic Metadata**: Integrated DNS-over-HTTPS (DoH) to bypass ISP filtering.
- **Ultra-Fast Library**: Enhanced 3-layer caching (Database, Metadata Sidecar, Disk Image) for instant loading.
- **Smart Scanner**: Improved heuristics for movie sequel detection and series identification.
- **UI Refinements**: Fixed home screen cropping, improved blur effects, and "genzy" finish-time estimates.
- **Aspect Ratio Magic**: Robust `object-fit` logic ensuring perfect playback for all content formats.

### ðŸ§¹ Maintenance
- Added "Clear Data" utility to reset application state.
- Codebase cleanup and removal of legacy components.

