# foulPLAY

A fantasy foul-card game for live football matches. Players join a lobby, lock three picks, and score from fouls, yellow cards, red cards, and role multipliers.

## Run Locally

Prerequisite: Node.js.

```bash
npm install
npm run dev
```

The app runs at:

```txt
http://localhost:3000
```

If port 3000 is busy:

```bash
PORT=3100 DISABLE_HMR=true npm run dev
```

## Match Data

By default, the app uses the built-in mock match provider.

To use SportMonks Football API 3.0, set:

```bash
SPORTMONKS_API_TOKEN=your_token_here
```

You can put it in `.env.local` or `.env`. When the token is present, the backend uses SportMonks for:

- `GET /api/matches/upcoming`
- `GET /api/match-sync?matchId=...`
- leaderboard scoring from live fixture player stats

Without `SPORTMONKS_API_TOKEN`, the mock provider remains active.

When `SPORTMONKS_API_TOKEN` is set, numeric match IDs are treated as SportMonks fixture IDs. Mock IDs such as `mock`, `mock2`, and `mock3` still use the local mock provider so old development links keep working.

Upcoming fixtures default to the SportMonks fixtures-by-date endpoint:

```txt
/v3/football/fixtures/date/{YYYY-MM-DD}
```

If your plan has access to date ranges, you can switch to:

```bash
SPORTMONKS_UPCOMING_MODE=between
```

which uses:

```txt
/v3/football/fixtures/between/{start_date}/{end_date}
```

For a tournament-specific World Cup mode, set:

```bash
SPORTMONKS_UPCOMING_MODE=world-cup
SPORTMONKS_WORLD_CUP_SEASON_ID=your_world_cup_season_id
SPORTMONKS_WORLD_CUP_LEAGUE_ID=optional_world_cup_league_id
SPORTMONKS_WORLD_CUP_NAME='FIFA World Cup'
```

World Cup mode uses the SportMonks season schedule endpoint:

```txt
/v3/football/schedules/seasons/{season_id}
```

It flattens the schedule's stages and rounds into fixtures, filters to upcoming matches, and optionally filters by `SPORTMONKS_WORLD_CUP_LEAGUE_ID`.

SportMonks responses are cached in memory per server instance with endpoint-aware TTLs:

```txt
pre-match fixture detail: 15 minutes when far from kickoff, 60 seconds near kickoff, 15 seconds inside 5 minutes
live/full fixture detail: 15 seconds
fixture date/between lists: 6 hours
World Cup season schedule: 24 hours
World Cup team squads: 24 hours
```

The default fixture detail include list is:

```txt
scores;events;participants;lineups;state
```

Before kickoff, the app uses a lighter fixture include list:

```txt
participants;lineups;state
```

Override it with:

```bash
SPORTMONKS_PREMATCH_FIXTURE_INCLUDE='participants;lineups;state'
```

In World Cup mode, the app also uses announced team squads as the pre-match player-pool fallback:

```txt
/v3/football/squads/seasons/{season_id}/teams/{team_id}
```

If that endpoint is unavailable for your SportMonks plan/route shape, the provider also tries:

```txt
/v3/football/squads/teams/{team_id}/seasons/{season_id}
```

Fixture lineups still take precedence when available; squad players fill in the rest of the picker so it is usable before official lineups are published. Override the squad include list with:

```bash
SPORTMONKS_SQUAD_INCLUDE='player;position'
```

Override it only if your SportMonks plan supports the requested nested includes:

```bash
SPORTMONKS_FIXTURE_INCLUDE='scores;events;participants;lineups.details.type;state'
```

## Persistence

Lobby entries are persisted to:

```txt
.data/lobbies.json
```

Override this path with:

```bash
LOBBY_STORE_PATH=/path/to/lobbies.json
```

This is suitable for local development and demos. For production, replace `FileLobbyStore` with Postgres, Supabase, Firestore, or another durable multi-instance store.

## Checks

```bash
npm run lint
npm run build
```
