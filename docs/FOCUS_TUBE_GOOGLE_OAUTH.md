# Focus Tube: Google OAuth setup

The YouTube subscription importer uses Google's installed desktop app OAuth flow. It opens the system browser, receives the authorization response through a temporary loopback listener, validates OAuth state, and uses PKCE. Google credentials remain in the Electron main process and are encrypted with Electron `safeStorage` in the app's user-data directory. The importer refuses to save tokens when a secure system credential store is unavailable.

## Google Cloud setup

1. Create or choose a Google Cloud project.
2. Enable **YouTube Data API v3** for that project.
3. Configure the OAuth consent screen. While the app is in testing, add the Google accounts that should be allowed to connect as test users.
4. Create an OAuth 2.0 client ID with application type **Desktop app**.
5. Add only the `https://www.googleapis.com/auth/youtube.readonly` scope for this feature. Focus Tube does not request a YouTube write scope or account identity scope.
6. Set the resulting client ID in the environment used to build or run the desktop app:

   ```dotenv
   MAIN_VITE_FOCUS_TUBE_GOOGLE_CLIENT_ID=your-desktop-client-id.apps.googleusercontent.com
   ```

   For local development, place the client ID in the repository's ignored `.env` file and restart Electron Vite. The client ID is public application configuration. This installed-app flow uses PKCE and does not include a client secret in the app. If Google reports that a client secret is required, verify that the configured ID belongs to a **Desktop app** OAuth client; do not embed a secret in a distributable.

For a public release, complete Google's applicable OAuth consent-screen verification and YouTube API compliance requirements. User subscription data is read directly by the app and is not uploaded to a Focus Tube service.

## Troubleshooting

- **Import is not configured:** set the client ID above, then restart or rebuild the app.
- **Google says `client_secret is missing`:** confirm that the configured ID is a Desktop app OAuth client. Focus Tube intentionally does not send a client secret.
- **Other users cannot connect while the app is in Testing:** only accounts listed as test users can authorize the app. Public access requires production status and Google's applicable OAuth verification.
- **Google denied access:** check that YouTube Data API v3 is enabled, the OAuth consent screen includes the account as a test user when in testing, and the user granted YouTube read access.
- **Quota or rate limit:** `subscriptions.list` is paginated in pages of up to 50. A quota or rate-limit failure preserves channels from completed pages and offers them as partial results.
- **Secure storage unavailable:** connect a supported OS credential store. Focus Tube intentionally does not fall back to plain-text token storage.
- **Reconnect:** disconnect the saved account in the import screen, then start the connection again.

References: [Google OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app), [YouTube subscriptions.list](https://developers.google.com/youtube/v3/docs/subscriptions/list), [YouTube OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes), and [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).
