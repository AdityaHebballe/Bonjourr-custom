import { displayGames, displayGamesError, displayGamesLoading, displayGamesSetup } from './display.ts'
import { getGamesCacheEntry, requestGameReleaseItems } from './request.ts'
import { EXTENSION, IS_MOBILE, PLATFORM } from '../../defaults.ts'
import { eventDebounce } from '../../utils/debounce.ts'
import { storage } from '../../storage.ts'

import type { GameReleaseItem, GamesPlatform, GamesQuery, GamesRange, SearchEngines } from '../../../types/shared.ts'
import type { Games, Searchbar } from '../../../types/sync.ts'

type GamesEvent = {
    on?: boolean
    range?: string
    platform?: string
    minHypes?: number
    size?: number
}

const container = document.getElementById('games_container')
const list = document.getElementById('games_list')
const GAMES_WINDOW_LIMIT = 24
const GAMES_SCROLL_WINDOW = 1000 * 60 * 60 * 24 * 30
const GAMES_EMPTY_WINDOW_LOOKAHEAD = 6
let currentRender = 0
let activeQuery: GamesQuery | undefined
let renderedItems: GameReleaseItem[] = []
let hasMorePages = false
let loadingMore = false
let canSearchGames = false
let nextWindowStart = 0
let nextWindowEnd = 0
let renderController: AbortController | undefined
let loadMoreController: AbortController | undefined

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
    list?.addEventListener('click', (event) => {
        const item = (event.target as HTMLElement | null)?.closest<HTMLElement>('.games-item')
        const title = item?.dataset.title

        if (!canSearchGames || !title) {
            return
        }

        void openGameSearch(title)
    })

    list?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return
        }

        const item = (event.target as HTMLElement | null)?.closest<HTMLElement>('.games-item')
        const title = item?.dataset.title

        if (!canSearchGames || !title) {
            return
        }

        event.preventDefault()
        void openGameSearch(title)
    })

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

            list.scrollBy({ left: delta })
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

    if (typeof event.size === 'number') {
        games.size = Math.max(9, Math.min(16, event.size))
    }

    await renderGames(games)
    eventDebounce({ games })
}

async function renderGames(config: Games): Promise<void> {
    const renderId = ++currentRender
    renderController?.abort()
    loadMoreController?.abort()
    const controller = new AbortController()
    renderController = controller
    loadMoreController = undefined

    handleToggle(config.on)
    setGamesCardSize(config.size)

    if (!config.on) {
        return
    }

    const query: GamesQuery = {
        range: config.range,
        platform: config.platform,
        limit: GAMES_WINDOW_LIMIT,
        minHypes: config.minHypes,
    }
    const initialStart = Date.now()
    const initialEnd = initialStart + getRangeDuration(config.range)

    activeQuery = query
    renderedItems = []
    hasMorePages = true
    loadingMore = false
    nextWindowStart = initialEnd + 1000
    nextWindowEnd = nextWindowStart + GAMES_SCROLL_WINDOW

    displayGamesLoading()

    try {
        const local = await storage.local.get([
            'gamesCache',
            'igdbClientId',
            'igdbClientSecret',
            'igdbAccessToken',
            'igdbAccessTokenExpiresAt',
        ])
        const { searchbar } = await storage.sync.get('searchbar')
        const hasCredentials = !!local.igdbClientId && !!local.igdbClientSecret
        const cache = getGamesCacheEntry(local.gamesCache, query)
        canSearchGames = !!searchbar?.on

        if (!hasCredentials) {
            if (renderId !== currentRender) {
                return
            }

            displayGamesSetup()
            return
        }

        if (cache) {
            renderedItems = mergeGames([], cache.items)

            if (renderId === currentRender) {
                displayGames(renderedItems, false, canSearchGames, false)
            }

            if (Date.now() - cache.fetchedAt < 1000 * 60 * 60 * 24) {
                return
            }
        }

        const { items, local: localPatch } = await requestGameReleaseItems(
            activeQuery,
            local,
            !!cache,
            controller.signal,
        )

        if (Object.keys(localPatch).length > 0) {
            storage.local.set(localPatch)
        }

        if (renderId !== currentRender) {
            return
        }

        renderedItems = mergeGames([], items)
        hasMorePages = true
        displayGames(renderedItems, false, canSearchGames, false)
    } catch (_error) {
        if (renderId !== currentRender || controller.signal.aborted) {
            return
        }

        displayGamesError()
    }
}

function handleToggle(state: boolean): void {
    container?.classList.toggle('hidden', !state)
}

function setGamesCardSize(size = 11.5): void {
    document.documentElement.style.setProperty('--games-card-width', `${size.toString()}em`)
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

    loadMoreController?.abort()
    const controller = new AbortController()
    loadMoreController = controller
    loadingMore = true
    displayGames(renderedItems, true, canSearchGames, true)

    try {
        let collected: GameReleaseItem[] = []
        let windowsTried = 0
        const localState = await storage.local.get([
            'gamesCache',
            'igdbClientId',
            'igdbClientSecret',
            'igdbAccessToken',
            'igdbAccessTokenExpiresAt',
        ])
        const localPatch: Partial<Awaited<ReturnType<typeof storage.local.get>>> = {}

        while (windowsTried < GAMES_EMPTY_WINDOW_LOOKAHEAD && collected.length === 0) {
            const windowQuery: GamesQuery = {
                ...activeQuery,
                startAt: nextWindowStart,
                endAt: nextWindowEnd,
            }
            const { items, local: requestLocalPatch } = await requestGameReleaseItems(
                windowQuery,
                localState,
                false,
                controller.signal,
            )

            if (Object.keys(requestLocalPatch).length > 0) {
                Object.assign(localState, requestLocalPatch)
                Object.assign(localPatch, requestLocalPatch)
            }

            collected = mergeGames(collected, items)
            nextWindowStart = nextWindowEnd + 1000
            nextWindowEnd = nextWindowStart + GAMES_SCROLL_WINDOW
            windowsTried += 1
        }

        if (Object.keys(localPatch).length > 0) {
            storage.local.set(localPatch)
        }

        renderedItems = mergeGames(renderedItems, collected)
        hasMorePages = collected.length > 0
        displayGames(renderedItems, true, canSearchGames, false)
    } catch (_error) {
        if (controller.signal.aborted) {
            return
        }

        displayGames(renderedItems, true, canSearchGames, false)
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

async function openGameSearch(title: string): Promise<void> {
    const { searchbar } = await storage.sync.get('searchbar')
    const engine = searchbar?.engine ?? 'default'
    const request = searchbar?.request ?? ''
    const newtab = searchbar?.newtab ?? false
    const canUseDefault = !IS_MOBILE && (PLATFORM === 'chrome' || PLATFORM === 'firefox')

    if (canUseDefault && engine === 'default') {
        ;(EXTENSION as typeof chrome)?.search.query({
            disposition: newtab ? 'NEW_TAB' : 'CURRENT_TAB',
            text: title,
        })
        return
    }

    globalThis.open(createSearchUrl(title, engine, request), newtab ? '_blank' : '_self')
}

function createSearchUrl(query: string, engine: Searchbar['engine'], request: Searchbar['request']): string {
    const urls: Record<SearchEngines, string> = {
        default: '',
        google: 'https://www.google.com/search?q=%s',
        ddg: 'https://duckduckgo.com/?q=%s',
        startpage: 'https://www.startpage.com/do/search?query=%s',
        qwant: 'https://www.qwant.com/?q=%s',
        yahoo: 'https://search.yahoo.com/search?q=%s',
        bing: 'https://www.bing.com/search?q=%s',
        brave: 'https://search.brave.com/search?q=%s',
        ecosia: 'https://www.ecosia.org/search?q=%s',
        lilo: 'https://search.lilo.org/?q=%s',
        baidu: 'https://www.baidu.com/s?wd=%s',
        custom: request,
    }

    const safeEngine = isValidEngine(engine) ? engine : 'google'
    const template = safeEngine === 'custom' && !request ? urls.google : urls[safeEngine]
    return template.replace('%s', encodeURIComponent(query))
}

function isValidEngine(str = ''): str is SearchEngines {
    return [
        'default',
        'google',
        'ddg',
        'startpage',
        'qwant',
        'yahoo',
        'bing',
        'brave',
        'ecosia',
        'lilo',
        'baidu',
        'custom',
    ].includes(str as SearchEngines)
}

function getRangeDuration(range: GamesRange): number {
    if (range === '7d') {
        return 7 * 24 * 60 * 60 * 1000
    }

    if (range === '14d') {
        return 14 * 24 * 60 * 60 * 1000
    }

    return 30 * 24 * 60 * 60 * 1000
}
