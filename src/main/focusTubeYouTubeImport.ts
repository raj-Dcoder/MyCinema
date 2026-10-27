import { app, safeStorage, shell } from 'electron'
import { createServer, type Server } from 'http'
import { randomBytes, createHash, timingSafeEqual } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'

const YOUTUBE_READ_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const SUBSCRIPTIONS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/subscriptions'
const OAUTH_TIMEOUT_MS = 5 * 60_000
const REQUEST_TIMEOUT_MS = 25_000
const CALLBACK_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Focus Tube</title></head><body style="font:16px system-ui;background:#111;color:#eee;display:grid;place-items:center;min-height:90vh"><main style="max-width:32rem;padding:2rem;text-align:center"><h1>Focus Tube</h1><p>You can close this browser tab and return to the app.</p></main></body></html>`

interface StoredTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
  clientId: string
}

interface GoogleTokenResponse {
  access_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
  error?: unknown
  error_description?: unknown
}

export interface YouTubeSubscriptionChannel {
  channelId: string
  title: string
  handle: null
  avatarUrl: string | null
}

export interface SubscriptionLoadResult {
  channels: YouTubeSubscriptionChannel[]
  complete: boolean
  pages: number
  error?: string
  cancelled?: boolean
}

export interface ImportProgress {
  stage: 'authorization' | 'subscriptions'
  page?: number
  found?: number
}

export interface ImportStatus {
  configured: boolean
  secureStorage: boolean
  connected: boolean
  hasSavedCredentials?: boolean
  error?: string
}

let cancelCurrent: (() => void) | null = null

function googleClientId(): string {
  return String(
    process.env.MAIN_VITE_FOCUS_TUBE_GOOGLE_CLIENT_ID
      || (import.meta as any).env?.MAIN_VITE_FOCUS_TUBE_GOOGLE_CLIENT_ID
      || '',
  ).trim()
}

function storageIsSecure(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform === 'linux') {
    const backend = (safeStorage as any).getSelectedStorageBackend?.()
    if (backend === 'basic_text') return false
  }
  return true
}

function credentialPath(): string {
  return join(app.getPath('userData'), 'focus-tube-google-credentials.bin')
}

async function readTokens(): Promise<StoredTokens | null> {
  try {
    if (!storageIsSecure()) throw new Error('Your system credential store is unavailable. Focus Tube will not store Google tokens without secure storage.')
    const encrypted = await fs.readFile(credentialPath())
    const value = JSON.parse(safeStorage.decryptString(encrypted)) as Partial<StoredTokens>
    if (
      typeof value.accessToken !== 'string'
      || typeof value.clientId !== 'string'
      || typeof value.expiresAt !== 'number'
    ) throw new Error('The saved Google connection could not be read. Disconnect and connect again.')
    return {
      accessToken: value.accessToken,
      refreshToken: typeof value.refreshToken === 'string' ? value.refreshToken : null,
      expiresAt: value.expiresAt,
      clientId: value.clientId,
    }
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function saveTokens(tokens: StoredTokens): Promise<void> {
  if (!storageIsSecure()) throw new Error('Your system credential store is unavailable. Focus Tube will not store Google tokens without secure storage.')
  const path = credentialPath()
  const temporaryPath = `${path}.tmp`
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  const encrypted = safeStorage.encryptString(JSON.stringify(tokens))
  await fs.writeFile(temporaryPath, encrypted, { mode: 0o600 })
  await fs.rename(temporaryPath, path)
}

function timingSafeStringEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  parentSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (parentSignal?.aborted) controller.abort()
  else parentSignal?.addEventListener('abort', onAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    parentSignal?.removeEventListener('abort', onAbort)
  }
}

function tokenErrorMessage(
  payload: GoogleTokenResponse,
  status: number,
  operation: 'exchange' | 'refresh',
): string {
  const code = String(payload.error || '')
  const description = String(payload.error_description || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  if (code === 'access_denied') return 'Google sign-in was canceled.'
  if (status === 429) return 'Google is temporarily rate-limiting requests. Wait a moment and retry.'
  if (code === 'invalid_client' || code === 'unauthorized_client' || code === 'deleted_client') {
    return 'Google rejected the OAuth client. Check that the configured client ID belongs to an active Desktop app client in the selected Google Cloud project.'
  }
  if (code === 'redirect_uri_mismatch') {
    return 'Google rejected the OAuth callback address. Check that the configured client ID belongs to a Desktop app OAuth client.'
  }
  if (code === 'invalid_grant') {
    return operation === 'refresh'
      ? 'Google authorization expired. Connect your account again.'
      : 'Google rejected the sign-in code. Retry, and confirm the configured client ID belongs to a Desktop app OAuth client.'
  }
  if (code === 'invalid_request') {
    const detail = description ? ` Google says: ${description}` : ''
    return `Google rejected the token request.${detail} Confirm the configured OAuth client is a Desktop app client, then retry.`
  }
  return code
    ? `Google OAuth token exchange failed (${code}).${description ? ` Google says: ${description}` : ''} Check the OAuth client setup and retry.`
    : `Google OAuth token exchange failed (HTTP ${status}). Check the OAuth client setup and retry.`
}

async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  redirectUri: string,
  clientId: string,
  signal: AbortSignal,
): Promise<StoredTokens> {
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })
  const response = await fetchWithTimeout(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  }, signal)
  const payload = await response.json().catch(() => ({})) as GoogleTokenResponse
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new Error(tokenErrorMessage(payload, response.status, 'exchange'))
  }
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
    expiresAt: Date.now() + Math.max(Number(payload.expires_in) || 3600, 60) * 1000,
    clientId,
  }
}

function authorizeInSystemBrowser(clientId: string, signal: AbortSignal): Promise<{ code: string; verifier: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    const state = randomBytes(32).toString('base64url')
    const verifier = randomBytes(48).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    let settled = false
    let server: Server | null = null
    let timer: NodeJS.Timeout | null = null
    let redirectUri = ''

    const cleanup = () => {
      if (timer) clearTimeout(timer)
      timer = null
      signal.removeEventListener('abort', onAbort)
      if (server?.listening) server.close()
      server = null
    }
    const finish = (error?: Error, result?: { code: string; verifier: string; redirectUri: string }) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else if (result) resolve(result)
      else reject(new Error('Google sign-in did not return an authorization code.'))
    }
    const onAbort = () => finish(new Error('Google sign-in was canceled.'))
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })

    server = createServer((request, response) => {
      let callbackUrl: URL
      try {
        callbackUrl = new URL(request.url || '/', 'http://127.0.0.1')
      } catch {
        response.writeHead(400).end('Invalid callback.')
        finish(new Error('Google returned an invalid sign-in callback.'))
        return
      }
      if (request.method !== 'GET' || callbackUrl.pathname !== '/') {
        response.writeHead(404).end('Not found.')
        return
      }

      const remoteAddress = request.socket.remoteAddress || ''
      if (remoteAddress !== '127.0.0.1' && remoteAddress !== '::1' && remoteAddress !== '::ffff:127.0.0.1') {
        response.writeHead(403).end('Local callback only.')
        finish(new Error('The OAuth callback did not come from this device.'))
        return
      }

      const receivedState = callbackUrl.searchParams.get('state') || ''
      if (!timingSafeStringEqual(receivedState, state)) {
        response.writeHead(400).end('The sign-in response could not be verified. Return to Focus Tube and retry.')
        finish(new Error('Google sign-in could not be verified. Please retry.'))
        return
      }
      const oauthError = callbackUrl.searchParams.get('error')
      if (oauthError) {
        response.writeHead(oauthError === 'access_denied' ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' })
          .end(CALLBACK_PAGE)
        finish(new Error(oauthError === 'access_denied' ? 'Google sign-in was canceled.' : 'Google sign-in could not be completed. Return to Focus Tube and retry.'))
        return
      }
      const code = callbackUrl.searchParams.get('code')
      if (!code) {
        response.writeHead(400).end('Google did not return an authorization code. Return to Focus Tube and retry.')
        finish(new Error('Google did not return an authorization code.'))
        return
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(CALLBACK_PAGE)
      finish(undefined, { code, verifier, redirectUri })
    })

    server.once('error', () => finish(new Error('Focus Tube could not start its local sign-in listener. Close other apps using localhost and retry.')))
    server.listen(0, '127.0.0.1', async () => {
      const address = server?.address()
      if (!address || typeof address === 'string') {
        finish(new Error('Focus Tube could not create a local sign-in callback.'))
        return
      }
      redirectUri = `http://127.0.0.1:${address.port}`
      const authorization = new URL(AUTH_ENDPOINT)
      authorization.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: YOUTUBE_READ_SCOPE,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
      }).toString()
      timer = setTimeout(() => finish(new Error('Google sign-in timed out. Return to Focus Tube and try again.')), OAUTH_TIMEOUT_MS)
      try {
        await shell.openExternal(authorization.toString())
      } catch {
        finish(new Error('Focus Tube could not open your system browser.'))
      }
    })
  })
}

async function refreshTokens(tokens: StoredTokens, signal: AbortSignal): Promise<StoredTokens> {
  if (!tokens.refreshToken) throw new Error('Google authorization expired. Connect your account again.')
  const body = new URLSearchParams({
    client_id: tokens.clientId,
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token',
  })
  const response = await fetchWithTimeout(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  }, signal)
  const payload = await response.json().catch(() => ({})) as GoogleTokenResponse
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new Error(tokenErrorMessage(payload, response.status, 'refresh'))
  }
  const refreshed: StoredTokens = {
    ...tokens,
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max(Number(payload.expires_in) || 3600, 60) * 1000,
  }
  await saveTokens(refreshed)
  return refreshed
}

function apiErrorMessage(status: number, payload: any): string {
  const reason = String(payload?.error?.errors?.[0]?.reason || payload?.error?.status || '')
  if (status === 401) return 'Google authorization expired. Reconnect your account and try again.'
  if (status === 429 || /rateLimitExceeded|userRateLimitExceeded/i.test(reason)) {
    return 'Google is rate-limiting requests. Wait a moment, then retry the import.'
  }
  if (status === 403 && /quotaExceeded|dailyLimitExceeded/i.test(reason)) {
    return 'The YouTube Data API quota is exhausted. Try again after the quota resets or review the project quota in Google Cloud.'
  }
  if (status === 403) return 'Google denied access to subscriptions. Reconnect and grant YouTube read access.'
  if (status >= 500) return 'YouTube is temporarily unavailable. Retry the subscription load.'
  if (/aborted/i.test(String(payload?.message || ''))) return 'The subscription request timed out. Check your connection and retry.'
  return 'Could not load YouTube subscriptions. Check your connection and retry.'
}

async function listSubscriptions(
  initialTokens: StoredTokens,
  signal: AbortSignal,
  onProgress?: (progress: ImportProgress) => void,
): Promise<SubscriptionLoadResult> {
  const channels = new Map<string, YouTubeSubscriptionChannel>()
  const seenPageTokens = new Set<string>()
  let pageToken = ''
  let pages = 0
  let tokens = initialTokens

  while (true) {
    if (signal.aborted) return { channels: [...channels.values()], complete: false, pages, cancelled: true }
    const url = new URL(SUBSCRIPTIONS_ENDPOINT)
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('mine', 'true')
    url.searchParams.set('maxResults', '50')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    let response: Response
    try {
      response = await fetchWithTimeout(url.toString(), {
        headers: { authorization: `Bearer ${tokens.accessToken}`, accept: 'application/json' },
      }, signal)
    } catch (error: any) {
      const message = signal.aborted
        ? 'Loading stopped. Review the channels already received, or load the subscriptions again.'
        : /abort|timeout/i.test(String(error?.message || error))
          ? 'The YouTube request timed out. Check your connection and retry.'
          : 'Could not reach YouTube. Check your connection and retry.'
      return { channels: [...channels.values()], complete: false, pages, error: message, cancelled: signal.aborted }
    }

    let payload: any = await response.json().catch(() => ({}))
    if (response.status === 401 && tokens.refreshToken) {
      try {
        tokens = await refreshTokens(tokens, signal)
        response = await fetchWithTimeout(url.toString(), {
          headers: { authorization: `Bearer ${tokens.accessToken}`, accept: 'application/json' },
        }, signal)
        payload = await response.json().catch(() => ({}))
      } catch (error: any) {
        const message = error?.message || 'Google authorization expired. Reconnect and try again.'
        return { channels: [...channels.values()], complete: false, pages, error: message }
      }
    }
    if (!response.ok) {
      const message = apiErrorMessage(response.status, payload)
      return { channels: [...channels.values()], complete: false, pages, error: message }
    }

    pages += 1
    for (const item of Array.isArray(payload?.items) ? payload.items : []) {
      const channelId = String(item?.snippet?.resourceId?.channelId || '').trim()
      const title = String(item?.snippet?.title || '').trim()
      if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId) || !title || channels.has(channelId)) continue
      const thumbnails = item?.snippet?.thumbnails || {}
      const thumbnail = thumbnails.maxres || thumbnails.high || thumbnails.medium || thumbnails.default
      const candidate = typeof thumbnail?.url === 'string' ? thumbnail.url : ''
      channels.set(channelId, {
        channelId,
        title: title.slice(0, 300),
        handle: null,
        avatarUrl: candidate.startsWith('https://') ? candidate : null,
      })
    }
    onProgress?.({ stage: 'subscriptions', page: pages, found: channels.size })

    const nextPageToken = typeof payload?.nextPageToken === 'string' ? payload.nextPageToken : ''
    if (!nextPageToken) return { channels: [...channels.values()], complete: true, pages }
    if (seenPageTokens.has(nextPageToken)) {
      return {
        channels: [...channels.values()],
        complete: false,
        pages,
        error: 'YouTube returned a repeated page token. Review these partial results or try loading again.',
      }
    }
    seenPageTokens.add(nextPageToken)
    pageToken = nextPageToken
  }
}

export async function getStatus(): Promise<ImportStatus> {
  const configured = Boolean(googleClientId())
  const secureStorage = storageIsSecure()
  let hasSavedCredentials = false
  try {
    await fs.access(credentialPath())
    hasSavedCredentials = true
  } catch {
    hasSavedCredentials = false
  }
  if (!configured) {
    return {
      configured: false,
      secureStorage,
      connected: false,
      hasSavedCredentials,
      error: 'Google import is not configured. Set MAIN_VITE_FOCUS_TUBE_GOOGLE_CLIENT_ID to a Desktop OAuth client ID and enable YouTube Data API v3.',
    }
  }
  if (!secureStorage) {
    return {
      configured: true,
      secureStorage: false,
      connected: false,
      hasSavedCredentials,
      error: 'A secure system credential store is unavailable. Focus Tube will not save Google tokens in plain text.',
    }
  }
  try {
    const tokens = await readTokens()
    if (tokens && tokens.clientId !== googleClientId()) {
      return { configured, secureStorage, connected: false, hasSavedCredentials: true, error: 'Google OAuth configuration changed. Remove the saved connection and connect again.' }
    }
    return { configured, secureStorage, connected: Boolean(tokens), hasSavedCredentials: Boolean(tokens) }
  } catch (error: any) {
    return { configured, secureStorage, connected: false, hasSavedCredentials, error: error?.message || 'Could not read the saved Google connection.' }
  }
}

export async function connectAndList(
  onProgress?: (progress: ImportProgress) => void,
): Promise<SubscriptionLoadResult | { error: string; cancelled?: boolean }> {
  if (cancelCurrent) return { error: 'A YouTube import is already in progress.' }
  const clientId = googleClientId()
  if (!clientId) return { error: 'Google import is not configured. Set MAIN_VITE_FOCUS_TUBE_GOOGLE_CLIENT_ID to a Desktop OAuth client ID and enable YouTube Data API v3.' }
  if (!storageIsSecure()) return { error: 'A secure system credential store is unavailable. Focus Tube will not save Google tokens in plain text.' }

  const controller = new AbortController()
  cancelCurrent = () => controller.abort()
  let channels: YouTubeSubscriptionChannel[] = []
  let pages = 0
  try {
    let tokens = await readTokens()
    if (tokens && tokens.clientId !== clientId) throw new Error('Google OAuth configuration changed. Disconnect the old connection and connect again.')
    if (!tokens || tokens.expiresAt <= Date.now() + 60_000) {
      if (tokens?.refreshToken) {
        tokens = await refreshTokens(tokens, controller.signal)
      } else {
        onProgress?.({ stage: 'authorization' })
        const { code, verifier, redirectUri } = await authorizeInSystemBrowser(clientId, controller.signal)
        tokens = await exchangeAuthorizationCode(code, verifier, redirectUri, clientId, controller.signal)
        await saveTokens(tokens)
      }
    }

    const result = await listSubscriptions(tokens, controller.signal, onProgress)
    channels = result.channels
    pages = result.pages
    return result
  } catch (error: any) {
    return { error: controller.signal.aborted ? 'Google sign-in was canceled.' : error?.message || 'Could not connect to Google.' , cancelled: controller.signal.aborted }
  } finally {
    cancelCurrent = null
  }
}

export function cancel(): boolean {
  if (!cancelCurrent) return false
  cancelCurrent()
  return true
}

export async function disconnect(): Promise<{ disconnected: boolean; revoked: boolean }> {
  cancel()
  let tokens: StoredTokens | null = null
  try {
    tokens = await readTokens()
  } catch {
    // Remove unreadable/corrupt credentials too; never keep them as a fallback.
  }
  let revoked = false
  const revocableToken = tokens?.refreshToken || tokens?.accessToken
  if (revocableToken) {
    try {
      const response = await fetchWithTimeout(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: revocableToken }),
      })
      revoked = response.ok
    } catch {
      revoked = false
    }
  }
  await fs.rm(credentialPath(), { force: true })
  await fs.rm(`${credentialPath()}.tmp`, { force: true })
  return { disconnected: true, revoked }
}
