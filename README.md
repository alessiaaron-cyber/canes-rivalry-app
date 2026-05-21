# Canes Rivalry App

Canes Rivalry is a mobile-first Progressive Web App for tracking a two-player Carolina Hurricanes rivalry during the season. It supports Game Day picks, live scoring, season history, roster and schedule management, push notifications, and authenticated access through Supabase.

This branch is the **V2 release candidate**. The V2 frontend now lives at the repository root and is intended to deploy directly from GitHub Pages at `/canes-rivalry-app/`.

## Release Candidate Status

V2 is no longer a mock-only sandbox. The release-candidate frontend is connected to the shared Supabase backend for authentication, live Game Day data, history, Manage workflows, realtime refreshes, and push-notification registration.

Keep production stability in mind when making changes:

- Prefer small, tested commits over broad rewrites.
- Keep GitHub Pages routing, service-worker scope, and auth redirect paths aligned to `/canes-rivalry-app/`.
- Avoid moving PWA files unless the manifest, service worker registration, notification click URLs, and cache-busting references are updated together.
- Treat Supabase schema, edge functions, RLS, and notification behavior as shared production-sensitive infrastructure.

## Current Capabilities

### Game Day

- Selects the active/live/upcoming/final game from the active Supabase season.
- Reads games, players, picks, user profiles, and game scores from Supabase.
- Supports pregame, live, and final views.
- Handles carry-forward picks and current draft state.
- Refreshes from Supabase realtime changes to games, picks, and rivalry events.

### History

- Reads seasons, final games, players, picks, game scores, and season totals from Supabase.
- Shows normalized two-player rivalry history across seasons.
- Uses active user profile slots to map scores and winners.

### Manage

- Loads active season, schedule, roster, pick metadata, and app health from Supabase.
- Supports roster activation/deactivation and player updates.
- Supports game creation, editing, hiding, scoring-rule updates, NHL schedule import, and starting a new season through Supabase/edge functions.
- Includes notification/device status and test notification support.

### Auth, Realtime, and Notifications

- Uses Supabase email OTP authentication.
- Checks `is_allowed_user` before granting app access.
- Registers a scoped service worker at `./sw.js`.
- Stores push subscriptions in Supabase with `user_id`, `user_email`, endpoint keys, and activity heartbeat timestamps.
- Invokes the centralized `notify-rivalry-event` edge function for test notifications.
- Uses realtime subscriptions for `games`, `picks`, and inserted `rivalry_events`.

## App Structure

```text
/
├── index.html                  # GitHub Pages app shell and script/style entry point
├── manifest.webmanifest        # PWA manifest scoped to /canes-rivalry-app/
├── sw.js                       # Push notification service worker
├── assets/
│   └── app-icon.png            # Active app icon for browser/PWA/push
├── css/
│   ├── app-*.css               # Shared shell, foundation, semantics, icons
│   ├── auth.css                # Sign-in and boot UI
│   ├── gameday/                # Game Day styles, tokens, motion, overrides
│   ├── history/                # History styles
│   └── manage/                 # Manage styles
└── js/
    ├── app.js                  # App initialization
    ├── boot.js                 # Auth/session boot flow
    ├── supabase-client.js      # Supabase client helper
    ├── auth/                   # OTP auth, profile loading, allowed-user checks
    ├── gameday/                # Game Day data, state, rendering, events, save/edit flows
    ├── history/                # History data, model, render, events
    ├── manage/                 # Manage data, renderers, actions, events
    ├── notifications/          # Push subscription, active-device, rivalry event consumers
    ├── realtime/               # Supabase realtime service
    └── shared/                 # Shared profile score and settings utilities
```

## Deployment

The deployed GitHub Pages path is:

```text
/canes-rivalry-app/
```

Path-sensitive files and settings:

- `index.html` registers `./sw.js` with scope `./`.
- `manifest.webmanifest` uses `start_url` and `scope` of `/canes-rivalry-app/`.
- Auth redirect URL is built as `window.location.origin + '/canes-rivalry-app/'`.
- Push notification click fallbacks route to `/canes-rivalry-app/`.
- The active app icon is `assets/app-icon.png`.

## Supabase Dependencies

The frontend expects the shared Supabase project to provide:

### Tables / Views

- `seasons`
- `games`
- `players`
- `picks`
- `user_profiles`
- `game_user_scores`
- `season_user_totals`
- `rivalry_events`
- `push_subscriptions`

### RPC / Edge Functions

- `is_allowed_user`
- `import-nhl-schedule`
- `start-new-season`
- `notify-rivalry-event`

### Important Backend Expectations

- RLS must remain enabled and compatible with the authenticated frontend flows.
- Allowed-user checks must remain enforced through Supabase/backend policy, not just the UI.
- Push subscription rows should support endpoint-based upsert plus `user_id`, `user_email`, `last_seen_at`, and key fields.
- The active season is driven by `seasons.is_active`.

## Local Development

This app is a static frontend and does not currently require a build step.

Recommended local flow:

1. Check out the branch.

   ```bash
   git checkout v2
   ```

2. Serve the repository root with a local static server.

   ```bash
   python3 -m http.server 8000
   ```

3. Open the app from the local server.

   ```text
   http://localhost:8000/
   ```

Notes:

- Some PWA and push-notification behavior is path- and HTTPS-sensitive and should be verified on the deployed GitHub Pages URL.
- The committed Supabase anon/publishable key is expected for this public static frontend. Do not commit service-role keys or private secrets.
- Browser cache can hide stale script/style revisions; keep cache-busting query strings updated when changing deployed assets.

## Release Candidate Checklist

Before promoting V2:

- Sign in with an allowed user through email OTP.
- Verify unauthorized users are blocked.
- Confirm Game Day loads the correct active/live/upcoming/final game.
- Confirm picks, carry-forward state, scores, and draft metadata render correctly.
- Confirm History shows completed games and season totals correctly.
- Confirm Manage can load roster, schedule, active season, app health, and notification status.
- Test roster/game edits only against intended data.
- Test NHL schedule import and new-season flow intentionally.
- Verify realtime refresh after game, pick, or rivalry-event changes.
- Enable notifications on a supported device and send a Manage test notification.
- Confirm service worker scope, manifest start URL, installed PWA launch, and notification click routing all resolve to `/canes-rivalry-app/`.
- Check mobile Safari/iOS behavior, including standalone PWA mode.

## Development Guardrails

- Do not reintroduce a `/v2/` app folder for release-candidate work; the active V2 app is rooted at `/` for GitHub Pages deployment.
- Do not reference the removed root `icon.png`; use `assets/app-icon.png`.
- Keep frontend-only UI work isolated from backend/schema behavior unless the task explicitly requires Supabase changes.
- Avoid broad data-shape rewrites without testing Game Day, History, Manage, notifications, and realtime together.
- Preserve the centralized notification flow through `notify-rivalry-event`.
- Keep service-worker, manifest, auth redirect, and notification click paths synchronized.

## Branch Notes

- `v2` contains the release-candidate frontend at the repository root.
- Production `main` should remain the stable fallback until V2 is explicitly promoted.
- The shared Supabase backend means V2 testing can affect real app data; use Manage actions carefully.
