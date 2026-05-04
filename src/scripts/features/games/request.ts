import type { GamesCache } from '../../../types/local.ts'
import type { GameReleaseItem, GamesQuery } from '../../../types/shared.ts'

const GAMES_CACHE_MAX_AGE = 1000 * 60 * 60 * 6
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const IGDB_RELEASE_DATES_URL = 'https://api.igdb.com/v4/release_dates'
const IGDB_COVER_BASE_URL = 'https://images.igdb.com/igdb/image/upload/t_cover_big'

type GamesLocalState = {
    gamesCache?: GamesCache
    igdbClientId?: string
    igdbClientSecret?: string
    igdbAccessToken?: string
    igdbAccessTokenExpiresAt?: number
}

export async function requestGameReleaseItems(
    query: GamesQuery,
    local: GamesLocalState,
): Promise<{ items: GameReleaseItem[]; local: Partial<GamesLocalState> }> {
    if (!hasIgdbCredentials(local)) {
        return { items: [], local: {} }
    }

    if (local.gamesCache && isFreshCache(query, local.gamesCache)) {
        return { items: local.gamesCache.items, local: {} }
    }

    try {
        const auth = await getValidIgdbAccessToken(local)
        const response = await fetchIgdbReleaseDates(query, local.igdbClientId, auth.accessToken)

        if (!response || response.status !== 200) {
            throw new Error('Cannot get games')
        }

        const json = await response.json() as unknown
        const items = sanitizeGameReleaseItems(json, query)
        const nextCache: GamesCache = {
            fetchedAt: Date.now(),
            query,
            items,
        }

        return {
            items,
            local: {
                gamesCache: nextCache,
                igdbAccessToken: auth.accessToken,
                igdbAccessTokenExpiresAt: auth.expiresAt,
            },
        }
    } catch (_error) {
        const staleCache = local.gamesCache

        if (
            staleCache &&
            staleCache.query.range === query.range &&
            staleCache.query.platform === query.platform &&
            staleCache.query.limit === query.limit
        ) {
            return { items: staleCache.items, local: {} }
        }

        throw new Error('Cannot get games')
    }
}

function isFreshCache(query: GamesQuery, cache: GamesCache): boolean {
    return cacheMatchesQuery(query, cache) && Date.now() - cache.fetchedAt < GAMES_CACHE_MAX_AGE
}

function cacheMatchesQuery(query: GamesQuery, cache: GamesCache): boolean {
    return cache.query.range === query.range &&
        cache.query.platform === query.platform &&
        cache.query.limit === query.limit
}

function hasIgdbCredentials(local: GamesLocalState): local is GamesLocalState & {
    igdbClientId: string
    igdbClientSecret: string
} {
    return !!local.igdbClientId && !!local.igdbClientSecret
}

async function getValidIgdbAccessToken(
    local: GamesLocalState & { igdbClientId: string; igdbClientSecret: string },
): Promise<{ accessToken: string; expiresAt: number }> {
    if (local.igdbAccessToken && (local.igdbAccessTokenExpiresAt ?? 0) > Date.now() + 60000) {
        return {
            accessToken: local.igdbAccessToken,
            expiresAt: local.igdbAccessTokenExpiresAt ?? 0,
        }
    }

    const url = new URL(TWITCH_TOKEN_URL)

    url.searchParams.set('client_id', local.igdbClientId)
    url.searchParams.set('client_secret', local.igdbClientSecret)
    url.searchParams.set('grant_type', 'client_credentials')

    try {
        const response = await fetch(url, { method: 'POST' })

        if (!response || response.status !== 200) {
            throw new Error('Cannot get IGDB token')
        }

        const json = await response.json() as {
            access_token?: string
            expires_in?: number
        }

        const accessToken = typeof json.access_token === 'string' ? json.access_token : ''
        const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 0

        if (!accessToken || !expiresIn) {
            throw new Error('Cannot get IGDB token')
        }

        return {
            accessToken,
            expiresAt: Date.now() + (expiresIn * 1000),
        }
    } catch (_error) {
        throw new Error('Cannot get IGDB token')
    }
}

async function fetchIgdbReleaseDates(
    query: GamesQuery,
    clientId: string,
    accessToken: string,
): Promise<Response | undefined> {
    const body = createReleaseDatesQuery(query)

    try {
        return await fetch(IGDB_RELEASE_DATES_URL, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Client-ID': clientId,
                Authorization: `Bearer ${accessToken}`,
            },
            body,
        })
    } catch (_error) {
        // ...
    }
}

function createReleaseDatesQuery(query: GamesQuery): string {
    const now = Date.now()
    const start = Math.floor(now / 1000)
    const end = Math.floor((now + getRangeDuration(query.range)) / 1000)
    const platformFilter = getPlatformFilter(query.platform)
    const fetchLimit = Math.max(query.limit * 3, 15)

    return [
        'fields date,game.name,game.slug,game.cover.image_id,platform.name;',
        `where date >= ${start} & date <= ${end} & game != null & game.version_parent = null${platformFilter};`,
        'sort date asc;',
        `limit ${fetchLimit};`,
    ].join(' ')
}

function sanitizeGameReleaseItems(value: unknown, query: GamesQuery): GameReleaseItem[] {
    if (!Array.isArray(value)) {
        return []
    }

    return value.flatMap((item): GameReleaseItem[] => {
        if (!item || typeof item !== 'object') {
            return []
        }

        const id = getString(item, 'id')
        const releaseDate = getNumber(item, 'date')
        const game = getObject(item, 'game')
        const title = game ? getString(game, 'name') : undefined
        const cover = game ? getObject(game, 'cover') : undefined
        const imageId = cover ? getString(cover, 'image_id') : undefined
        const platformInfo = getObject(item, 'platform')
        const platformName = platformInfo ? getString(platformInfo, 'name') : undefined

        if (!id || !title || !releaseDate || !platformName) {
            return []
        }

        return [{
            id,
            title,
            releaseDate: new Date(releaseDate * 1000).toISOString(),
            platform: simplifyPlatformLabel(platformName, query.platform),
            cover: imageId ? `${IGDB_COVER_BASE_URL}/${imageId}.jpg` : undefined,
            url: undefined,
        }]
    }).slice(0, query.limit)
}

function getString(value: object, key: string): string | undefined {
    const entry = Reflect.get(value, key)
    return typeof entry === 'string' && entry.length > 0 ? entry : undefined
}

function getNumber(value: object, key: string): number | undefined {
    const entry = Reflect.get(value, key)
    return typeof entry === 'number' ? entry : undefined
}

function getObject(value: object, key: string): object | undefined {
    const entry = Reflect.get(value, key)
    return entry && typeof entry === 'object' ? entry as object : undefined
}

function getRangeDuration(range: GamesQuery['range']): number {
    if (range === '7d') {
        return 7 * 24 * 60 * 60 * 1000
    }

    if (range === '14d') {
        return 14 * 24 * 60 * 60 * 1000
    }

    return 30 * 24 * 60 * 60 * 1000
}

function getPlatformFilter(platform: GamesQuery['platform']): string {
    const ids = PLATFORM_FILTERS[platform]

    if (!ids || ids.length === 0) {
        return ''
    }

    return ` & game.platforms = (${ids.join(',')})`
}

function simplifyPlatformLabel(name: string, fallback: GamesQuery['platform']): string {
    const lower = name.toLowerCase()

    if (lower.includes('playstation')) {
        return 'PlayStation'
    }
    if (lower.includes('xbox')) {
        return 'Xbox'
    }
    if (lower.includes('nintendo') || lower.includes('switch') || lower.includes('wii')) {
        return 'Nintendo'
    }
    if (
        lower.includes('pc') || lower.includes('windows') || lower.includes('mac') || lower.includes('linux') ||
        lower.includes('steam')
    ) {
        return 'PC'
    }

    if (fallback === 'playstation') {
        return 'PlayStation'
    }
    if (fallback === 'xbox') {
        return 'Xbox'
    }
    if (fallback === 'nintendo') {
        return 'Nintendo'
    }
    if (fallback === 'pc') {
        return 'PC'
    }

    return name
}

const PLATFORM_FILTERS: Record<GamesQuery['platform'], number[]> = {
    all: [],
    pc: [6, 14],
    playstation: [48, 167, 169],
    xbox: [49, 169, 12],
    nintendo: [130, 41, 137],
}
