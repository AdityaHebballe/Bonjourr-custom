import { displayGames, displayGamesError, displayGamesLoading, displayGamesSetup } from './display.ts'
import { requestGameReleaseItems } from './request.ts'
import { eventDebounce } from '../../utils/debounce.ts'
import { storage } from '../../storage.ts'

import type { GameReleaseItem, GamesPlatform, GamesQuery, GamesRange } from '../../../types/shared.ts'
import type { Games } from '../../../types/sync.ts'

type GamesEvent = {
    on?: boolean
    range?: string
    platform?: string
    minHypes?: number
}

const container = document.getElementById('games_container')
const list = document.getElementById('games_list')
const GAMES_PAGE_SIZE = 12
const GAMES_CACHE_REFRESH_AGE = 1000 * 60 * 60 * 24
let currentRender = 0
let activeQuery: GamesQuery | undefined
let renderedItems: GameReleaseItem[] = []
let currentOffset = 0
let hasMorePages = false
let loadingMore = false

export function games(init?: Games, event?: GamesEvent): void {
    if (event) {
        void updateGames(event)
        return
    }

    if (!init) {
        return
    }

    void renderGames(init)
}

queueMicrotask(() => {
    container?.addEventListener(
        'wheel',
        (event) => {
            if (!(event.target instanceof Node) || !list?.contains(event.target)) {
                return
            }

            const hasHorizontalOverflow = list.scrollWidth > list.clientWidth

            if (!hasHorizontalOverflow) {
                return
            }

            const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX

            if (delta === 0) {
                return
            }

            list.scrollLeft += delta
            event.preventDefault()

            if (list.scrollLeft + list.clientWidth >= list.scrollWidth - 160) {
                void loadMoreGames()
            }
        },
        { passive: false },
    )

    list?.addEventListener('scroll', () => {
        if (list.scrollLeft + list.clientWidth >= list.scrollWidth - 160) {
            void loadMoreGames()
        }
    })
})

async function updateGames(event: GamesEvent): Promise<void> {
    const games = (await storage.sync.get('games'))?.games

    if (!games) {
        return
    }

    if (typeof event.on === 'boolean') {
        games.on = event.on
    }

    if (isGamesRange(event.range)) {
        games.range = event.range
    }

    if (isGamesPlatform(event.platform)) {
        games.platform = event.platform
    }

    if (typeof event.minHypes === 'number') {
        games.minHypes = Math.max(0, Math.min(100, Math.round(event.minHypes)))
    }

    await renderGames(games)
    eventDebounce({ games })
}

async function renderGames(config: Games): Promise<void> {
    const renderId = ++currentRender

    handleToggle(config.on)

    if (!config.on) {
        return
    }

    const query: GamesQuery = {
        range: config.range,
        platform: config.platform,
        limit: GAMES_PAGE_SIZE,
        minHypes: config.minHypes,
    }

    activeQuery = query
    renderedItems = []
    currentOffset = 0
    hasMorePages = false
    loadingMore = false

    displayGamesLoading()

    try {
        const local = await storage.local.get([
            'gamesCache',
            'igdbClientId',
            'igdbClientSecret',
            'igdbAccessToken',
            'igdbAccessTokenExpiresAt',
        ])
        const hasCredentials = !!local.igdbClientId && !!local.igdbClientSecret
        const cacheMatches = doesCacheMatchQuery(local.gamesCache, query)
        const cacheIsDailyStale = cacheMatches &&
            Date.now() - (local.gamesCache?.fetchedAt ?? 0) > GAMES_CACHE_REFRESH_AGE

        if (!hasCredentials) {
            if (renderId !== currentRender) {
                return
            }

            displayGamesSetup()
            return
        }

        if (cacheMatches && local.gamesCache) {
            renderedItems = mergeGames([], local.gamesCache.items)
            currentOffset = Math.max(query.limit * 6, 24)
            hasMorePages = !!local.gamesCache.hasMore

            if (renderId === currentRender) {
                displayGames(renderedItems)
            }

            if (!cacheIsDailyStale) {
                return
            }
        }

        const { items, hasMore, local: localPatch } = await requestGameReleaseItems(query, local, 0, cacheIsDailyStale)

        if (Object.keys(localPatch).length > 0) {
            storage.local.set(localPatch)
        }

        if (renderId !== currentRender) {
            return
        }

        renderedItems = mergeGames([], items)
        currentOffset = Math.max(query.limit * 6, 24)
        hasMorePages = hasMore
        displayGames(renderedItems)
    } catch (_error) {
        if (renderId !== currentRender) {
            return
        }

        displayGamesError()
    }
}

function handleToggle(state: boolean): void {
    container?.classList.toggle('hidden', !state)
}

function isGamesRange(value = ''): value is GamesRange {
    return value === '7d' || value === '14d' || value === '30d'
}

function isGamesPlatform(value = ''): value is GamesPlatform {
    return value === 'all' || value === 'pc' || value === 'playstation' || value === 'xbox' || value === 'nintendo'
}

async function loadMoreGames(): Promise<void> {
    if (!activeQuery || loadingMore || !hasMorePages) {
        return
    }

    loadingMore = true

    try {
        const local = await storage.local.get([
            'gamesCache',
            'igdbClientId',
            'igdbClientSecret',
            'igdbAccessToken',
            'igdbAccessTokenExpiresAt',
        ])

        const { items, hasMore, local: localPatch } = await requestGameReleaseItems(activeQuery, local, currentOffset)

        if (Object.keys(localPatch).length > 0) {
            storage.local.set(localPatch)
        }

        renderedItems = mergeGames(renderedItems, items)
        currentOffset += Math.max(activeQuery.limit * 6, 24)
        hasMorePages = hasMore
        displayGames(renderedItems, true)
    } finally {
        loadingMore = false
    }
}

function mergeGames(current: GameReleaseItem[], incoming: GameReleaseItem[]): GameReleaseItem[] {
    const map = new Map(current.map((item) => [item.id, { ...item }]))

    for (const item of incoming) {
        const existing = map.get(item.id)

        if (!existing) {
            map.set(item.id, { ...item })
            continue
        }

        const platforms = new Set(
            `${existing.platform}, ${item.platform}`.split(',').map((value) => value.trim()).filter(Boolean),
        )

        existing.platform = [...platforms].sort(comparePlatformLabels).join(', ')
        existing.cover ??= item.cover
        existing.url ??= item.url
        if (item.releaseDate < existing.releaseDate) {
            existing.releaseDate = item.releaseDate
        }
    }

    return [...map.values()].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))
}

function comparePlatformLabels(a: string, b: string): number {
    const order = ['PC', 'PlayStation', 'Xbox', 'Nintendo']
    return order.indexOf(a) - order.indexOf(b)
}

function doesCacheMatchQuery(
    cache: Awaited<ReturnType<typeof storage.local.get>>['gamesCache'],
    query: GamesQuery,
): boolean {
    return !!cache &&
        cache.query.range === query.range &&
        cache.query.platform === query.platform &&
        cache.query.minHypes === query.minHypes &&
        cache.query.limit === query.limit
}
