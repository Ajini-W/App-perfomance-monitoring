# Replay Console — local setup (MySQL)

rrweb session replay + OpenTelemetry traces, stored in MySQL.

## Requirements
- Node.js 20.12+ (22 LTS recommended) and npm
- MySQL 8.x running locally

## 1. Create the database
```bash
mysql -u root -p < database/mysql-schema.sql
```
This creates the `replay_console` database, the tables the app uses
(`websites`, `visits`, `replay_chunks`, `telemetry_spans`) and the built-in
"Demo Shop" website (`site_key = demo-site-key`).
If you use a different database name, edit the first two lines of the file.

## 2. Configure
```bash
cp .env.example .env      # Windows: copy .env.example .env
```
Fill in `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`.
`.env` is read by `vite.config.ts` at startup — restart the dev server after editing it.

## 3. Install and run
```bash
npm install
npm run dev
```
Open http://localhost:8080 (Vite picks the next free port if 8080 is busy — check the terminal).

- `/demo` — sample website that loads `public/sdk/recorder.js` (rrweb + OpenTelemetry)
- `/dashboard` — recordings list (local single-admin mode, see `src/hooks/useAuth.ts`)
- `/replay/<visitId>` — replay on the left, traces on the right; traces highlight while
  their time range (±0.5 s) contains the current playback time.

## Tests
```bash
npm test
```

## Optional: retention cleanup
Set `CRON_SECRET` in `.env`, then call:
```bash
curl -X POST http://localhost:8080/api/public/purge -H "Authorization: Bearer <CRON_SECRET>"
```

## Notes
- `.npmrc` sets `legacy-peer-deps=true`: the pinned OpenTelemetry packages declare
  overlapping-but-conflicting peer ranges for `@opentelemetry/api`; without it `npm install` fails.
- `public/sdk/otel-web.min.js` is a prebuilt bundle of `src/sdk/otel-tracer.ts`.
- `drizzle/` holds the old PostgreSQL (Supabase) migrations for reference only; MySQL uses
  `database/mysql-schema.sql`.
