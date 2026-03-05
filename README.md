# 0G Compute Status

Production status page for 0G Compute providers.

- Live URL: `https://0g-status.vercel.app`
- Framework: Next.js App Router
- Runtime data: live provider checks + Vercel KV aggregates
- Deployment: Vercel (with scheduled cron checks)

## What This Project Does

This app continuously checks known 0G Compute service endpoints and exposes:

- current provider health (`/api/status`)
- historical uptime and latency series (`/api/history`)
- scheduled persistence pipeline (`/api/cron`)
- reset utility for aggregates (`/api/reset`)

The frontend renders:

- overall health summary
- per-provider state and latency
- period-aware uptime bars (`24h`, `7d`, `30d`, `All`)

## Architecture

### High-level data flow

1. Vercel Cron calls `/api/cron` every minute.
2. `/api/cron` pings each provider (`/v1/models`) and writes rollups into KV.
3. Frontend calls `/api/status` for real-time state.
4. Frontend calls `/api/history` for period series + aggregated stats.
5. UI updates every 60 seconds.

### Stack

- Next.js `16.1.4` (App Router)
- React `19`
- Tailwind CSS v4
- `@vercel/kv` for history storage
- Vercel Cron for scheduled checks

## Repository Structure

```txt
src/
  app/
    api/
      cron/route.ts      # scheduled checker + KV writer
      history/route.ts   # history + period stats API
      reset/route.ts     # reset endpoint for KV data
      status/route.ts    # live provider status API
    globals.css
    layout.tsx
    page.tsx             # main status dashboard UI
  lib/
    computeProviders.ts  # single source of truth for provider list

list-services.mjs        # on-chain service discovery helper
list-all-providers.mjs   # ABI probing helper
check-testnet-balance.mjs
send-tokens.mjs
vercel.json              # cron schedule config
```

## Frontend Deep Dive

File: `src/app/page.tsx`

### Core behavior

- Fetches in parallel:
  - `GET /api/status`
  - `GET /api/history?limit=24`
- Auto-refreshes every 60 seconds.
- Supports period toggles:
  - `24h` (hourly bars)
  - `7d` (daily bars)
  - `30d` (daily bars)
  - `All` (monthly bars)

### Rendering model

For each provider row:

- top-right status text from live data (`Up/Down/Timeout/Unknown`)
- live latency from `/api/status`
- historical bars from `/api/history.historyByPeriod[period]`
- period uptime and average latency from `/api/history.stats[period][provider]`

### Visual states

- green dot/bar: up
- red dot/bar: down
- yellow dot: unknown/timeout/ssl_error
- neutral gray bar: no data for that time bucket

## Backend Deep Dive

### `GET /api/status`

File: `src/app/api/status/route.ts`

Purpose:

- On-demand, real-time health check for every configured provider.

Mechanics:

- Checks `<provider.url>/v1/models`
- Timeout: 10s
- Treats response `<500` as reachable/up
- On SSL/TLS/fetch errors, retries HTTP fallback (`https -> http`) with 5s timeout

Response:

- `summary`: online/offline/unknown totals + health percent
- `providers[]`: per-provider state, latency, error, checked timestamp

Health calculation:

- `healthPercent = online / verified * 100`
- `verified = total - unknown`
- unknown states are excluded from denominator

### `GET /api/cron`

File: `src/app/api/cron/route.ts`

Purpose:

- Minute-by-minute background checker and aggregation writer.

KV writes:

- `status:history` (raw rolling points, max 90)
- `status:hourly:YYYY-MM-DD-HH` (TTL 2 days)
- `status:daily:YYYY-MM-DD` (TTL 35 days)
- `status:monthly:YYYY-MM` (TTL 400 days)
- `status:alltime` (lifetime cumulative counters)

For each aggregate key, stores:

- check count
- per-provider up count
- per-provider latency sum
- per-provider latency sample count

### `GET /api/history`

File: `src/app/api/history/route.ts`

Purpose:

- Returns historical point series and aggregate stats per period.

Returns:

- `history` (backward compatibility, same as `historyByPeriod["24h"]`)
- `historyByPeriod`
  - `24h`: hourly points
  - `7d`: daily points
  - `30d`: daily points
  - `allTime`: monthly points
- `stats`
  - period uptime + avg latency per provider
- `meta`
  - total checks
  - startedAt
  - points by period
  - granularity by period

Provider alias migration support:

- `deepseek-v3 -> glm-5-fp8`
- `flux-turbo -> z-image`

This prevents old historical data from appearing as false outages after provider/model renames.

### `GET /api/reset`

File: `src/app/api/reset/route.ts`

Purpose:

- Clears all status history and aggregate keys.

Safety:

- Requires `?confirm=yes`

## Provider Source of Truth

File: `src/lib/computeProviders.ts`

- Frontend and backend do not hardcode provider lists in multiple places.
- Both `/api/status` and `/api/cron` import this file.
- Current list includes `zai-org/GLM-5-FP8` and other active endpoints.

## Environment Variables

Required in Vercel/local for APIs that use KV:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Optional:

- `CRON_SECRET` (required for `/api/cron` and `/api/reset`)

Local utility scripts:

- `OG_PRIVATE_KEY` for `check-testnet-balance.mjs` and `send-tokens.mjs`

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deployment

### Vercel

This repo is configured with `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron", "schedule": "* * * * *" }]
}
```

Deploy command:

```bash
vercel deploy --prod
```

## API Quick Reference

### Status

```bash
curl -s https://0g-status.vercel.app/api/status | jq
```

### History

```bash
curl -s 'https://0g-status.vercel.app/api/history?limit=24' | jq
```

### Manual cron trigger

```bash
curl -s -H "authorization: Bearer $CRON_SECRET" https://0g-status.vercel.app/api/cron | jq
```

### Reset aggregates

```bash
curl -s -H "authorization: Bearer $CRON_SECRET" 'https://0g-status.vercel.app/api/reset?confirm=yes' | jq
```

## Operational Runbook

### A provider is green in live status but historical bars look wrong

- Cause: old provider key names in stored aggregates.
- Fix: ensure alias mapping in `history/route.ts` includes old->new names.

### Period changes but timeline does not shift

- Cause: UI bound to single history series.
- Fix: use `historyByPeriod[period]` and period-specific granularity.

### New model is missing from dashboard

- Update `src/lib/computeProviders.ts`.
- Deploy.
- Trigger `/api/cron` once to seed fresh points immediately.

## Team Notes

- This is a live status system, not mock data.
- Existing lint output may include legacy warnings in utility/API files; production build is the deployment gate used here.
- If provider contracts/endpoints change, refresh using `list-services.mjs` and update `computeProviders.ts`.
- `/api/cron` and `/api/reset` are intentionally fail-closed; they return `401` without bearer auth and `503` if `CRON_SECRET` is missing.
