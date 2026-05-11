# MyCinema Share Links

This Cloudflare Worker powers public links like:

```text
https://your-share-domain.com/movie/1226863
https://your-share-domain.com/series/1399
```

The worker renders a small share page with Open Graph metadata so WhatsApp,
Telegram, Instagram, and browsers can show a clickable preview. The page's
primary button opens the installed desktop app with:

```text
mycinema://movie/1226863
mycinema://series/1399
```

## Deploy

1. Install or use Wrangler.

```bash
npm create cloudflare@latest
```

or:

```bash
npx wrangler deploy
```

2. Add the TMDB API key as a Worker secret.

```bash
npx wrangler secret put TMDB_API_KEY
```

3. Deploy from this folder.

```bash
cd share-worker
npx wrangler deploy
```

4. In Cloudflare, attach the worker to your domain or use the generated
`workers.dev` URL for testing.

5. Set the app's share URL before building MyCinema.

```bash
VITE_MYCINEMA_SHARE_BASE_URL=https://your-share-domain.com npm run build
```

On Windows PowerShell:

```powershell
$env:VITE_MYCINEMA_SHARE_BASE_URL="https://your-share-domain.com"; npm run build
```

After that, the Share button in MyCinema can send one normal HTTPS link, and
the page will hand off to the installed desktop app.

If `VITE_MYCINEMA_SHARE_BASE_URL` is not set, MyCinema falls back to sharing the
direct `mycinema://...` app link. That is useful inside browsers and Windows,
but many chat apps will not make it clickable.
