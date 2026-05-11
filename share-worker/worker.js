const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'
const GITHUB_RELEASES_URL = 'https://github.com/raj-Dcoder/MyCinema/releases'
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="MyCinema logo">
  <defs>
    <linearGradient id="disc" x1="160" y1="120" x2="860" y2="900" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#171d2d"/>
      <stop offset="0.55" stop-color="#090d18"/>
      <stop offset="1" stop-color="#05070d"/>
    </linearGradient>
    <linearGradient id="blueMagenta" x1="262" y1="250" x2="685" y2="680" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#45a3ff"/>
      <stop offset="0.44" stop-color="#5534ef"/>
      <stop offset="1" stop-color="#e6338f"/>
    </linearGradient>
    <linearGradient id="pink" x1="562" y1="272" x2="775" y2="665" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ff565d"/>
      <stop offset="1" stop-color="#d82b86"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="#000000"/>
  <circle cx="512" cy="512" r="448" fill="url(#disc)" stroke="#23283a" stroke-width="4"/>
  <path d="M700 259c-18 0-35 6-49 17L462 419l196 148c19 15 48 1 48-23v-75l44-34c22-17 54-1 54 27v156c0 37-43 57-72 35L333 353c-29-22-73-1-73 35v224c0 37 30 67 67 67h86c16 0 29-13 29-29V429c0-17 20-27 34-17l167 126c10 8 10 24 0 32l-79 60c-24 18-11 56 19 56h117c37 0 67-30 67-67V326c0-37-30-67-67-67Z" fill="url(#pink)"/>
  <path d="M327 259c-37 0-67 30-67 67v286c0 37 30 67 67 67h86c16 0 29-13 29-29V429c0-17 20-27 34-17l264 199c27 20 66 1 66-33 0-13-6-26-17-34L367 272c-12-8-26-13-40-13Z" fill="url(#blueMagenta)" opacity="0.96"/>
  <rect x="294" y="339" width="39" height="39" rx="8" fill="#080b14"/>
  <rect x="294" y="411" width="39" height="39" rx="8" fill="#080b14"/>
  <rect x="294" y="484" width="39" height="39" rx="8" fill="#080b14"/>
  <rect x="294" y="557" width="39" height="39" rx="8" fill="#080b14"/>
  <path d="M461 412c0-17 20-27 34-17l167 126c21 16 21 48 0 64l-81 61c-22 17-54 1-54-27v-40l-52-39c-9-7-14-18-14-29V412Z" fill="#070a13"/>
</svg>`

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function parsePath(pathname) {
  const [rawType, rawId] = pathname.split('/').filter(Boolean)
  const type = rawType === 'tv' ? 'series' : rawType
  const tmdbId = Number.parseInt(rawId || '', 10)

  if ((type !== 'movie' && type !== 'series') || !Number.isFinite(tmdbId) || tmdbId <= 0) {
    return null
  }

  return { type, tmdbId }
}

function decodeSharedSource(encodedSource) {
  if (!encodedSource) return null
  try {
    const normalized = encodedSource.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const json = decodeURIComponent(escape(atob(padded)))
    const source = JSON.parse(json)
    if (!source || typeof source.title !== 'string' || typeof source.magnet !== 'string') return null
    return {
      title: source.title,
      quality: typeof source.quality === 'string' ? source.quality : '',
      size: typeof source.size === 'string' ? source.size : '',
      seeds: Number.isFinite(source.seeds) ? source.seeds : 0,
      peers: Number.isFinite(source.peers) ? source.peers : 0,
      isHindi: Boolean(source.isHindi)
    }
  } catch {
    return null
  }
}

async function fetchTmdbMedia(env, type, tmdbId) {
  if (!env.TMDB_API_KEY) return null

  const endpoint = type === 'series' ? 'tv' : 'movie'
  const response = await fetch(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${env.TMDB_API_KEY}&language=en-US`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MyCinema Share Worker'
    }
  })

  if (!response.ok) return null
  return response.json()
}

function renderSharePage(request, target, media) {
  const isSeries = target.type === 'series'
  const title = media?.title || media?.name || (isSeries ? 'MyCinema series' : 'MyCinema movie')
  const releaseDate = media?.release_date || media?.first_air_date || ''
  const releaseYear = releaseDate ? String(releaseDate).slice(0, 4) : ''
  const overview = media?.overview || 'Open this title in MyCinema.'
  const posterUrl = media?.poster_path ? `${TMDB_IMAGE_BASE}/w780${media.poster_path}` : ''
  const backdropUrl = media?.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${media.backdrop_path}` : posterUrl
  const pageTitle = `${title}${releaseYear ? ` (${releaseYear})` : ''} - MyCinema`
  const appUrl = `mycinema://${target.type}/${target.tmdbId}`
  const sourceParam = new URL(request.url).searchParams.get('source')
  const appUrlWithSource = sourceParam ? `${appUrl}?source=${encodeURIComponent(sourceParam)}` : appUrl
  const sharedSource = decodeSharedSource(sourceParam)
  const canonicalUrl = new URL(request.url)
  canonicalUrl.search = ''

  const safeTitle = escapeHtml(title)
  const safePageTitle = escapeHtml(pageTitle)
  const safeOverview = escapeHtml(overview)
  const safePosterUrl = escapeHtml(posterUrl)
  const safeBackdropUrl = escapeHtml(backdropUrl || posterUrl)
  const safeCanonicalUrl = escapeHtml(canonicalUrl.toString())
  const safeAppUrl = escapeHtml(appUrlWithSource)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safePageTitle}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="shortcut icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/favicon.svg">
  <meta name="theme-color" content="#05080d">
  <meta name="description" content="${safeOverview}">
  <link rel="canonical" href="${safeCanonicalUrl}">
  <meta property="og:type" content="video.movie">
  <meta property="og:site_name" content="MyCinema">
  <meta property="og:title" content="${safePageTitle}">
  <meta property="og:description" content="${safeOverview}">
  <meta property="og:url" content="${safeCanonicalUrl}">
  ${posterUrl ? `<meta property="og:image" content="${safePosterUrl}">` : ''}
  ${posterUrl ? `<meta property="og:image:secure_url" content="${safePosterUrl}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safePageTitle}">
  <meta name="twitter:description" content="${safeOverview}">
  ${posterUrl ? `<meta name="twitter:image" content="${safePosterUrl}">` : ''}
  <style>
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #05080d;
      color: #f8fafc;
    }

    * { box-sizing: border-box; }

    body {
      min-height: 100vh;
      margin: 0;
      background:
        linear-gradient(90deg, rgba(5, 8, 13, 0.82), rgba(5, 8, 13, 0.58)),
        ${backdropUrl ? `url("${safeBackdropUrl}") center / cover no-repeat,` : ''}
        #05080d;
    }

    main {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
      gap: 48px;
      align-items: center;
      width: min(1120px, calc(100% - 40px));
      margin: 0 auto;
      padding: 48px 0;
    }

    .poster {
      width: min(100%, 380px);
      aspect-ratio: 2 / 3;
      border-radius: 8px;
      object-fit: cover;
      background: rgba(255, 255, 255, 0.08);
      box-shadow: 0 28px 90px rgba(0, 0, 0, 0.62);
    }

    .fallback-poster {
      display: grid;
      place-items: center;
      width: min(100%, 380px);
      aspect-ratio: 2 / 3;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.62);
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .eyebrow {
      margin: 0 0 14px;
      color: #ef4444;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    h1 {
      max-width: 720px;
      margin: 0;
      font-size: clamp(42px, 7vw, 92px);
      line-height: 0.92;
      letter-spacing: 0;
      text-transform: uppercase;
      font-style: italic;
    }

    .overview {
      max-width: 680px;
      margin: 24px 0 0;
      color: rgba(248, 250, 252, 0.78);
      font-size: 17px;
      line-height: 1.65;
      font-weight: 500;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 34px;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      border-radius: 8px;
      padding: 0 18px;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
    }

    .button:hover { transform: translateY(-1px); }
    .primary { background: #dc2626; color: white; }
    .secondary { border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.82); }

    .hint {
      max-width: 600px;
      margin: 16px 0 0;
      color: rgba(255, 255, 255, 0.48);
      font-size: 13px;
      line-height: 1.5;
    }

    @media (max-width: 760px) {
      body {
        background:
          linear-gradient(180deg, rgba(5, 8, 13, 0.36), #05080d 42%),
          ${backdropUrl ? `url("${safeBackdropUrl}") top center / 100% auto no-repeat,` : ''}
          #05080d;
      }

      main {
        grid-template-columns: 1fr;
        gap: 28px;
        align-items: start;
        width: min(100% - 28px, 480px);
        padding: 32px 0;
      }

      .poster, .fallback-poster {
        width: min(68vw, 260px);
        margin: 0 auto;
      }

      h1 {
        font-size: clamp(34px, 12vw, 56px);
      }

      .overview {
        font-size: 15px;
      }

      .button {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <main>
    ${posterUrl ? `<img class="poster" src="${safePosterUrl}" alt="${safeTitle} poster">` : '<div class="fallback-poster">MyCinema</div>'}
    <section>
      <p class="eyebrow">Shared on MyCinema${releaseYear ? ` / ${escapeHtml(releaseYear)}` : ''}</p>
      <h1>${safeTitle}</h1>
      <p class="overview">${safeOverview}</p>
      ${sharedSource ? `<div class="source-box">
        <p class="source-eyebrow">Exact source shared</p>
        <p class="source-title">${escapeHtml(sharedSource.title)}</p>
        <div class="source-meta">
          ${sharedSource.quality ? `<span>${escapeHtml(sharedSource.quality)}</span>` : ''}
          ${sharedSource.size ? `<span>${escapeHtml(sharedSource.size)}</span>` : ''}
          ${sharedSource.isHindi ? '<span>Hindi</span>' : ''}
          ${sharedSource.seeds ? `<span>${escapeHtml(sharedSource.seeds)} seeds</span>` : ''}
        </div>
      </div>` : ''}
      <div class="actions">
        <a class="button primary" href="${safeAppUrl}" id="open-app">Open in MyCinema</a>
        <a class="button secondary" href="${GITHUB_RELEASES_URL}">Get MyCinema</a>
      </div>
      <p class="hint">If the app does not open, install MyCinema first and then press Open in MyCinema again.</p>
    </section>
  </main>
  <script>
    const appUrl = ${JSON.stringify(appUrlWithSource)};
    document.getElementById('open-app').addEventListener('click', () => {
      window.location.href = appUrl;
    });
  </script>
</body>
</html>`
}

function renderNotFound() {
  return new Response('Not found. Use /movie/{tmdbId} or /series/{tmdbId}.', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/favicon.svg') {
      return new Response(FAVICON_SVG, {
        headers: {
          'content-type': 'image/svg+xml; charset=utf-8',
          'cache-control': 'public, max-age=604800'
        }
      })
    }

    const target = parsePath(url.pathname)

    if (!target) return renderNotFound()

    const media = await fetchTmdbMedia(env, target.type, target.tmdbId).catch(() => null)
    const html = renderSharePage(request, target, media)

    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300, s-maxage=86400'
      }
    })
  }
}
