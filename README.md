# Canes Rivalry App

Canes Rivalry is a mobile-first Progressive Web App for tracking a two-player Carolina Hurricanes rivalry during the season. It supports Game Day picks, live scoring, season history, roster and schedule management, push notifications, and authenticated access through Supabase.

The application now lives at the repository root and deploys directly from GitHub Pages at `/canes-rivalry-app/`.

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
├── index.html
├── manifest.webmanifest
├── sw.js
├── assets/
├── css/
└── js/
```

## Deployment

GitHub Pages is deployed from the repository root at:

```text
/canes-rivalry-app/
```

Key path-sensitive settings:

- `index.html` registers `./sw.js` with scope `./`.
- `manifest.webmanifest` uses `start_url` and `scope` of `/canes-rivalry-app/`.
- Auth redirect URL is built as `window.location.origin + '/canes-rivalry-app/'`.
- Push notification click fallbacks route to `/canes-rivalry-app/`.
- The active app icon is `assets/app-icon.png`.

## Supabase Dependencies

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

## Local Development

This app is a static frontend and does not require a build step.

```bash
git checkout main
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Development Guardrails

- Do not reference the removed root `icon.png`; use `assets/app-icon.png`.
- Keep frontend-only UI work isolated from backend/schema behavior unless the task explicitly requires Supabase changes.
- Avoid broad data-shape rewrites without testing Game Day, History, Manage, notifications, and realtime together.
- Preserve the centralized notification flow through `notify-rivalry-event`.
- Keep service-worker, manifest, auth redirect, and notification click paths synchronized.

## Branch Notes

- `main` is the active production branch.
- `main-backup-before-v2` contains the pre-promotion backup of the previous main branch.
