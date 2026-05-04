# Games IGDB Proxy

This document defines the backend work required for the `games` widget frontend already present in Bonjourr.

## Goal

Build a small server-side proxy that:

- authenticates with Twitch and IGDB
- fetches upcoming release data from IGDB
- normalizes it to the widget response shape
- avoids exposing IGDB credentials in the extension bundle

## Why A Proxy

IGDB is not a browser-friendly fit for a public extension frontend.

- IGDB requires Twitch app credentials
- IGDB uses a server-side client credentials flow
- IGDB documents browser CORS limitations

Reference:

- IGDB Getting Started: https://api-docs.igdb.com/#getting-started

## Frontend Contract

The extension now calls:

`GET https://services.bonjourr.fr/games/releases?range=14d&platform=pc&limit=5`

Query params:

- `range`: `7d` | `14d` | `30d`
- `platform`: `all` | `pc` | `playstation` | `xbox` | `nintendo`
- `limit`: `3` | `5` | `10`

Expected response:

```ts
{
    items: {
        id: string
        title: string
        releaseDate: string
        platform: string
        cover?: string
        url?: string
    }[]
}
```

## Twitch / IGDB Setup

From IGDB's official getting-started docs:

- create a Twitch developer application
- use a `Confidential` client type
- generate a client secret
- exchange `client_id` and `client_secret` for a bearer token

The backend should keep these in server-side environment variables, for example:

```txt
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
```

## Suggested Proxy Flow

1. Receive `range`, `platform`, and `limit`.
2. Convert them to IGDB filters.
3. Fetch or refresh a Twitch bearer token if needed.
4. Query IGDB `release_dates`.
5. Normalize and dedupe results.
6. Return only the fields needed by the widget.

## Platform Mapping

The frontend uses coarse platform filters. The proxy should expand them to IGDB platform ids.

Suggested mapping:

- `all`: no platform filter
- `pc`: PC-related ids
- `playstation`: PlayStation family ids
- `xbox`: Xbox family ids
- `nintendo`: Nintendo family ids

Keep the mapping server-side so the extension does not need IGDB-specific ids.

## Suggested IGDB Query

Start with `release_dates` rather than `games`. IGDB's own docs show upcoming release examples using `release_dates`.

Suggested APICalypse shape:

```txt
fields
    date,
    game.name,
    game.slug,
    game.cover.image_id,
    platform.name;
where
    date != null
    & game != null
    & category = (0,2,7,8)
    & date >= START_UNIX
    & date <= END_UNIX
    & game.version_parent = null;
sort date asc;
limit LIMIT;
```

Notes:

- `START_UNIX` and `END_UNIX` come from the selected `range`
- platform filtering should be appended when `platform !== all`
- `version_parent = null` helps avoid edition clutter
- category filtering may need adjustment after testing real results

## Response Normalization

Normalize each IGDB item to:

```ts
{
    id: string
    title: string
    releaseDate: string
    platform: string
    cover?: string
    url?: string
}
```

Suggested normalization rules:

- `id`: release-date id or a stable composite key
- `title`: `game.name`
- `releaseDate`: ISO string from `date`
- `platform`: short display label from the matched platform family
- `cover`: build from `image_id` if present
- `url`: optional public game URL if you decide to expose one

## Cover URLs

If `game.cover.image_id` is returned, construct the public IGDB image URL on the proxy.

Keep the final value as a plain absolute image URL so the frontend can use it directly in `<img>`.

## Caching

The extension already caches the last successful response for 6 hours per query.

The proxy should also cache:

- Twitch access token until expiry
- normalized query results for a short TTL, for example 1 to 6 hours

This reduces IGDB traffic and makes the widget more reliable.

## Error Handling

Proxy errors should return standard HTTP failures.

Suggested behavior:

- `400` for invalid query params
- `502` when IGDB/Twitch calls fail
- `503` when configuration is missing

The frontend already turns failed requests into a widget error state and can fall back to matching cached data.
