# duee

A calm Apple-platform app for tracking due-date tasks with a compact floating UI.

## Why duee

`duee` is intentionally narrow and lightweight:

- quick add flow: optional due date + task text
- closest due dates first
- one-click completion
- optional minimal mode to hide completed tasks
- persistent local storage with SwiftData
- iCloud-backed SwiftData sync when CloudKit capability is enabled
- translucent, always-on-top utility window

## Features

- Native SwiftUI + SwiftData app for macOS and iOS
- macOS can sync tasks directly with the web API (`/api`) via a configurable base URL in Settings
- Compact overlay-style window with custom minimize behavior
- Keyboard-friendly input (`Return` to add)
- Status-aware due labels (for active tasks):
  - `due 4/10 • today`
  - `due 4/10 • in 3 days`
  - `due 4/10 • 2 days late`
- Completed tasks show plain due date only
- Right-click task menu with delete
- Settings for:
  - Minimal mode
  - Unfocused transparency (macOS)
  - Appearance (`System`, `Light`, `Dark`)

## Tech Stack

- Swift 6
- SwiftUI
- SwiftData
- CloudKit (for cross-device sync)
- AppKit interop for window behavior

## Project Structure

- `Sources/Duee/App`:
  app entry point, window lifecycle, appearance/transparency handling
- `Sources/Duee/Models`:
  `DueeTask` SwiftData model
- `Sources/Duee/Views`:
  root view, settings view, task composer, task row
- `Sources/Duee/Settings`:
  settings keys and appearance mode enum
- `Sources/Duee/Preview`:
  in-memory preview seed data

## Run Locally

```bash
swift build
open Package.swift
```

Then run the `Duee` target from Xcode.

## Build macOS Release Artifacts

Use the provided release script to package a distributable app bundle from the Swift package executable:

```bash
./scripts/release-macos.sh
```

Artifacts are written to `release/`:

- `Duee.app`
- `Duee-macOS-<version>.zip`
- `Duee-macOS-<version>.dmg`
- `Duee-macOS-<version>.sha256`

Optional environment variables:

- `ICON_SOURCE` (default: `./logo.png`)
- `VERSION` (default: latest git tag/commit)
- `BUNDLE_ID` (default: `com.duee.app`)
- `CODESIGN_IDENTITY` (default: ad-hoc `-`)
- `SKIP_CODESIGN=1` to skip signing

## Use From Mobile

To view and edit the same tasks from your iPhone:

1. Open `Package.swift` in Xcode.
2. Install iOS platform components in Xcode if prompted.
3. Enable iCloud + CloudKit capability for the `Duee` target.
4. Run the app on your iPhone (or iOS Simulator) with the same Apple ID.

If CloudKit is not enabled, `duee` falls back to local-only storage on that device.

## Mobile Web App (Docker + MySQL)

`duee` also includes a mobile web app with:

- `Express` API (`server.js`)
- MySQL persistence (`tasks` table auto-created at startup)
- email/password auth with secure cookie sessions
- email verification and password reset flows (token links via email)
- CSRF protection for cookie-auth mutating requests
- auth/task mutation rate limiting and login brute-force throttling
- combined welcome + email verification emails via Resend (single email on signup)
- password reset emails via Resend
- email verification required before first sign-in/task access
- daily cleanup of stale unverified accounts (configurable retention window)
- optional reminder email before unverified account deletion
- self-serve account data export (`JSON`) and account deletion
- per-user task isolation (each account gets its own synced task list)
- mobile-friendly PWA frontend (`index.html`, `app.js`, `app.css`)
- Home Screen install support in Safari

### Deploy on VPS

1. Copy this repo to `/opt/apps/duee`.
2. Copy env template:

```bash
cp /opt/apps/duee/.env.example /opt/stacks/apps/duee/.env
```

3. Update `.env`:
   - `HOSTNAME=your.domain`
   - `DEBUG_LOCAL_STORAGE=0` (set to `1` to use browser localStorage debug mode and skip DB)
   - `SESSION_SECRET=<long-random-secret>`
   - optional: `SESSION_TTL_DAYS=30`
   - optional: `SESSION_TOUCH_INTERVAL_SECONDS=300` (throttle session write updates)
   - optional: `COOKIE_SECURE=1` (recommended for HTTPS)
   - optional: `PUBLIC_APP_ORIGIN=https://your.domain` (used for email action links)
   - `RESEND_API_KEY=<resend-api-key>`
   - `RESEND_FROM_EMAIL=<sender@hexagon.one>` (must be on your verified Resend domain)
   - optional: `AUTH_EMAIL_DELIVERY_MODE=resend` (`console` logs verification/reset links to server logs instead of sending email)
   - optional: `RESEND_WELCOME_EMAILS=1` (`0` removes welcome copy from the verification email)
   - optional: `RESEND_AUTH_EMAILS=1` (`0` disables verification/reset emails)
   - optional: `EMAIL_VERIFICATION_TOKEN_TTL_MINUTES=1440`
   - optional: `PASSWORD_RESET_TOKEN_TTL_MINUTES=60`
   - optional: `UNVERIFIED_ACCOUNT_RETENTION_DAYS=30` (delete unverified accounts older than this)
   - optional: `UNVERIFIED_ACCOUNT_REMINDER_DAYS_BEFORE_DELETE=7` (`0` disables reminder email)
   - optional: `UNVERIFIED_ACCOUNT_CLEANUP_INTERVAL_HOURS=24`
   - optional: `UNVERIFIED_ACCOUNT_CLEANUP_BATCH_SIZE=250`
   - `DB_HOST=mysql-mysql-1` (or your MySQL container DNS name)
   - `DB_USER`, `DB_PASSWORD`
   - optional: `DB_NAME` (default `duee`)
4. Put [`docker-compose.yml`](docker-compose.yml) in your stack directory (it uses Traefik labels + external `web` and `internal` networks).
5. Start:

```bash
cd /opt/stacks/apps/duee
docker compose up -d --build
docker compose logs -f app
```

6. Verify:

```bash
curl -fsS https://your.domain/api/health
```

### Install on iPhone

1. Open `https://your.domain` in Safari.
2. Tap **Share → Add to Home Screen**.

The web app then runs like an installed app and reads/writes tasks from MySQL through the API.

On first launch, create an account, then sign in on each device/browser to sync that account's tasks.

### Debug Local Storage Mode

If you set `DEBUG_LOCAL_STORAGE=1` in `.env`:

- backend still serves the web app
- `/api/config` reports debug mode
- frontend stores tasks in browser `localStorage` instead of MySQL
- DB credentials are not required for startup

You can also force local mode for a single browser session using:

`https://your.domain/?debug_storage=local`

### Run Locally Before VPS

Use local compose file:

```bash
cd /path/to/duee
docker compose -f docker-compose.local.yml up -d --build
```

Open:

`http://localhost:8000`

Health check:

```bash
curl -fsS http://localhost:8000/api/health
```

Switch mode locally:

- MySQL mode (default): `DEBUG_LOCAL_STORAGE=0 docker compose -f docker-compose.local.yml up -d --build`
- Debug localStorage mode: `DEBUG_LOCAL_STORAGE=1 docker compose -f docker-compose.local.yml up -d --build`

Test auth email flows locally without Resend:

- Set `AUTH_EMAIL_DELIVERY_MODE=console` (default in `docker-compose.local.yml`).
- Trigger register / resend verification / forgot password from the app.
- Read links from app logs: `docker compose -f docker-compose.local.yml logs -f app`.
- Open the logged `action_url` in your browser to complete verification/reset end to end.

Stop local stack:

```bash
docker compose -f docker-compose.local.yml down
```

## License

MIT. See [LICENSE](LICENSE).
