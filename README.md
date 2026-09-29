# SteamHunt

SteamHunt is a browser-based Steam price calculator and deal finder. Calculations are stored locally, while search and pricing requests use same-origin serverless API proxies.

## Requirements

- Node.js and the Vercel CLI
- `RAWG_API_KEY` for game search
- `ITAD_API_KEY` for deal browsing

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `RAWG_API_KEY` and `ITAD_API_KEY` in `.env`.
3. Run `vercel dev`.
4. Open the local URL printed by Vercel.

The app cannot run correctly by double-clicking `index.html`, because it depends on the `/api/*` serverless routes.

## API routes

- `/api/rawg` searches the RAWG game database.
- `/api/steam-search` finds Steam titles and current prices.
- `/api/deals` returns paginated Steam deals from ITAD, with a CheapShark fallback.

## Features

- Tax calculation with presets and rates up to 100 percent
- Local calculation history
- Search suggestions and Steam price lookup
- Paginated deal browsing with 20 unique deals per page
- Light and dark themes
- Copy, print, and export tools

## Deployment

Configure `RAWG_API_KEY` and `ITAD_API_KEY` in the Vercel project environment settings, then deploy the project with Vercel.
